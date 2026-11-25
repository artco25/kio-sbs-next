import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:sqflite/sqflite.dart';

import '../data/local_db.dart';
import '../data/tables.g.dart';
import 'graphql.dart';
import 'session.dart';

/// Intervalo de sincronización con actividad: cada 1,5 minutos.
const kSyncInterval = Duration(seconds: 90);
/// Sin actividad del usuario por este tiempo: se pausa el sync para no gastar peticiones Cloudflare.
const kIdleTimeout = Duration(minutes: 5);

const _pullQuery = r'''
query($since:Int!,$limit:Int,$device:DeviceInput){
  pull(since:$since, limit:$limit, device:$device){ cursor head hasMore reset serverTime changes{ table rows } }
}''';

const _pushMutation = r'''
mutation($changes:[ChangeInput!]!){ push(changes:$changes){ accepted rejected{ table id reason } head serverTime } }''';

enum SyncState { idle, syncing, offline, error, paused }

/// Sincronización offline-first:
///  1. PUSH: filas locales con dirty=1 en lotes de ≤40 (límite del servidor).
///  2. PULL: cambios del servidor desde el último cursor, paginados.
/// Conflictos: gana el updated_at más reciente (igual que en el servidor).
class SyncService extends ChangeNotifier {
  SyncService(this.db, this.session);
  final LocalDb db;
  final Session session;

  Timer? _timer;
  Timer? _idleTimer;
  SyncState state = SyncState.idle;
  String? lastError;
  DateTime? lastSync;
  int pending = 0;
  int cursor = 0;
  int head = 0;
  int lastPushed = 0;
  int lastPulled = 0;
  Duration? clockSkew;
  bool _running = false;
  bool _started = false;
  bool _pausedByLifecycle = false;
  int maxPush = 40;

  bool get online => state != SyncState.offline;
  bool get hibernating => state == SyncState.paused;

  Future<void> start() async {
    cursor = int.tryParse(await db.getMeta('sync:cursor') ?? '') ?? 0;
    final last = await db.getMeta('sync:last');
    lastSync = last == null ? null : DateTime.tryParse(last);
    pending = await db.pendingCount();
    db.addListener(_onLocalChange);
    _started = true;
    _pausedByLifecycle = false;
    _armIdle();
    _startTimer();
    unawaited(syncNow());
  }

  void stop() {
    _started = false;
    _timer?.cancel();
    _timer = null;
    _idleTimer?.cancel();
    _idleTimer = null;
    db.removeListener(_onLocalChange);
  }

  void _startTimer() {
    _timer?.cancel();
    if (!_started || hibernating || _pausedByLifecycle) return;
    _timer = Timer.periodic(kSyncInterval, (_) => syncNow());
  }

  void _armIdle() {
    _idleTimer?.cancel();
    if (!_started) return;
    _idleTimer = Timer(kIdleTimeout, _hibernate);
  }

  /// Marca actividad del usuario: si estaba hibernando, retoma el sync.
  void noteActivity() {
    if (!_started) return;
    _armIdle();
    if (state == SyncState.paused && !_pausedByLifecycle) {
      state = SyncState.idle;
      _startTimer();
      unawaited(syncNow());
      notifyListeners();
    }
  }

  /// App en segundo plano / inactiva: pausa para no gastar peticiones.
  void onLifecycle(AppLifecycleState life) {
    if (!_started) return;
    if (life == AppLifecycleState.paused || life == AppLifecycleState.inactive || life == AppLifecycleState.hidden) {
      _pausedByLifecycle = true;
      _hibernate();
    } else if (life == AppLifecycleState.resumed) {
      _pausedByLifecycle = false;
      noteActivity();
    }
  }

  void _hibernate() {
    _timer?.cancel();
    _timer = null;
    if (!_started || state == SyncState.syncing) return;
    if (state == SyncState.paused) return;
    state = SyncState.paused;
    notifyListeners();
  }

  Timer? _debounce;
  void _onLocalChange() {
    // Actualiza el contador de pendientes en la barra superior sin esperar al ciclo de 90 s.
    // Un cambio local cuenta como actividad (ej. venta en POS).
    noteActivity();
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () async {
      pending = await db.pendingCount();
      notifyListeners();
    });
  }

  /// Si cambió el usuario o su rol en este equipo, el cursor anterior no sirve: tablas que antes
  /// no podía leer quedaron atrás. Se purgan las no legibles y se descarga todo desde 0.
  Future<void> _checkScope() async {
    // Incluye las tablas legibles: si el rol personalizado cambia, se vuelve a descargar lo que ahora puede ver.
    final scope = '${session.userId}:${session.role}:${kTables.keys.where(session.canRead).join(',')}';
    final previous = await db.getMeta('sync:scope');
    if (previous == scope) return;
    await db.db.transaction((tx) async {
      for (final t in kTables.keys) {
        if (!session.canRead(t)) await tx.delete(t, where: 'dirty <> ?', whereArgs: [Dirty.pending]);
      }
    });
    cursor = 0;
    await db.setMeta('sync:cursor', '0');
    await db.setMeta('sync:scope', scope);
    db.changed();
  }

  Future<void> syncNow() async {
    if (_running || !session.loggedIn || session.expired) return;
    _running = true;
    state = SyncState.syncing;
    lastError = null;
    notifyListeners();
    try {
      await _checkScope();
      lastPushed = await _push();
      lastPulled = await _pull();
      lastSync = DateTime.now();
      await db.setMeta('sync:last', lastSync!.toIso8601String());
      state = SyncState.idle;
    } on GqlException catch (e) {
      lastError = e.message;
      if (e.unauthenticated) {
        session.markExpired();
        state = SyncState.error;
      } else {
        state = e.offline ? SyncState.offline : SyncState.error;
      }
    } catch (e) {
      lastError = '$e';
      state = SyncState.error;
    } finally {
      pending = await db.pendingCount();
      _running = false;
      notifyListeners();
    }
  }

  // ------------------------------------------------------------------ push

  Map<String, Object?> _wire(String table, DbRow r) {
    final spec = kTables[table]!;
    return {
      'id': r['id'],
      'created_at': r['created_at'],
      'updated_at': r['updated_at'],
      'deleted': r['deleted'],
      for (final c in spec.columns.keys) c: r[c],
    };
  }

  Future<int> _push() async {
    final batch = <(String, DbRow)>[];
    for (final t in kTables.keys) {
      if (!session.canWrite(t)) continue;
      // Padres antes que hijos: el orden de kTables ya es partners → products → sales → sale_lines...
      for (final r in await db.db.query(t, where: 'dirty = ?', whereArgs: [Dirty.pending], orderBy: 'updated_at')) {
        batch.add((t, r));
      }
    }
    // Los borrados lógicos viajan primero (ej. líneas viejas de un borrador antes de confirmar la venta:
    // si la venta llega antes ya confirmada, el servidor bloquea a cajero/vendedor modificar sus líneas).
    final ordered = [...batch.where((e) => e.$2['deleted'] == 1), ...batch.where((e) => e.$2['deleted'] != 1)];
    batch
      ..clear()
      ..addAll(ordered);
    var sent = 0;
    for (var i = 0; i < batch.length; i += maxPush) {
      final chunk = batch.sublist(i, (i + maxPush).clamp(0, batch.length));
      final data = await session.sync.run(_pushMutation, {
        'changes': [for (final (t, r) in chunk) {'table': t, 'row': _wire(t, r)}],
      });
      final res = data['push'] as Map<String, dynamic>;
      head = (res['head'] as num).toInt();
      _measureSkew(res['serverTime'] as String?);
      final rejected = {
        for (final x in (res['rejected'] as List).cast<Map<String, dynamic>>()) '${x['table']}:${x['id']}': x['reason'] as String,
      };
      await db.db.transaction((tx) async {
        for (final (t, r) in chunk) {
          final key = '$t:${r['id']}';
          if (rejected.containsKey(key)) {
            await tx.update(t, {'dirty': Dirty.rejected}, where: 'id = ? AND updated_at = ?', whereArgs: [r['id'], r['updated_at']]);
            await tx.insert('meta', {'key': 'reject:$key', 'value': rejected[key]}, conflictAlgorithm: ConflictAlgorithm.replace);
          } else {
            // Sólo se limpia si nadie la editó mientras viajaba.
            await tx.update(t, {'dirty': Dirty.clean}, where: 'id = ? AND updated_at = ?', whereArgs: [r['id'], r['updated_at']]);
          }
        }
      });
      sent += chunk.length - rejected.length;
    }
    // Si se permitieron tablas que no se pueden escribir (cambio de rol), se marcan rechazadas.
    for (final t in kTables.keys) {
      if (session.canWrite(t)) continue;
      await db.db.update(t, {'dirty': Dirty.rejected}, where: 'dirty = ?', whereArgs: [Dirty.pending]);
    }
    return sent;
  }

  void _measureSkew(String? serverTime) {
    final s = serverTime == null ? null : DateTime.tryParse(serverTime);
    if (s != null) clockSkew = DateTime.now().toUtc().difference(s);
  }

  // ------------------------------------------------------------------ pull

  Future<int> _pull() async {
    var received = 0;
    for (var page = 0; page < 200; page++) {
      final pendingNow = await db.pendingCount();
      final data = await session.sync.run(_pullQuery, {
        'since': cursor,
        'limit': 500,
        'device': {
          'id': session.deviceId,
          'name': session.deviceName,
          'platform': session.platform,
          'appVersion': kAppVersion,
          'pending': pendingNow,
          'cursor': cursor,
        },
      });
      final res = data['pull'] as Map<String, dynamic>;
      head = (res['head'] as num).toInt();
      _measureSkew(res['serverTime'] as String?);
      if (res['reset'] == true) {
        // La BD del servidor se restauró: se vuelve a descargar todo (lo local pendiente se conserva).
        cursor = 0;
        await db.setMeta('sync:cursor', '0');
        continue;
      }
      final changes = (res['changes'] as List).cast<Map<String, dynamic>>();
      final next = (res['cursor'] as num).toInt();
      await db.db.transaction((tx) async {
        for (final ch in changes) {
          final table = ch['table'] as String;
          final spec = kTables[table];
          if (spec == null) continue;
          for (final raw in (ch['rows'] as List)) {
            final row = (raw as Map).cast<String, Object?>();
            received++;
            final local = await tx.query(table, columns: ['dirty', 'updated_at'], where: 'id = ?', whereArgs: [row['id']]);
            if (local.isNotEmpty &&
                local.first['dirty'] == Dirty.pending &&
                ((local.first['updated_at'] as String?) ?? '').compareTo((row['updated_at'] as String?) ?? '') > 0) {
              continue; // la edición local es más reciente: se enviará en el próximo push
            }
            final clean = <String, Object?>{
              for (final k in ['id', 'company_id', 'created_at', 'updated_at', 'updated_by', 'deleted', 'rev', ...spec.columns.keys])
                k: row[k],
              'dirty': Dirty.clean,
            };
            await tx.insert(table, clean, conflictAlgorithm: ConflictAlgorithm.replace);
          }
        }
        await tx.insert('meta', {'key': 'sync:cursor', 'value': '$next'}, conflictAlgorithm: ConflictAlgorithm.replace);
      });
      cursor = next;
      if (changes.isNotEmpty) db.changed();
      if (res['hasMore'] != true) break;
    }
    return received;
  }

  /// Descarta una fila rechazada por el servidor (vuelve a la versión del servidor en el próximo pull completo).
  Future<void> discardRejected(String table, String id) async {
    await db.db.delete(table, where: 'id = ? AND dirty = ?', whereArgs: [id, Dirty.rejected]);
    await db.setMeta('reject:$table:$id', null);
    db.changed();
  }

  /// Fuerza descargar todo de nuevo (conserva pendientes locales).
  Future<void> resync() async {
    cursor = 0;
    await db.setMeta('sync:cursor', '0');
    await syncNow();
  }

  String debugState() => jsonEncode({'state': state.name, 'cursor': cursor, 'head': head, 'pending': pending});

  @override
  void dispose() {
    stop();
    super.dispose();
  }
}
