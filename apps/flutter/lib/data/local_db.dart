import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:uuid/uuid.dart';

import 'tables.g.dart';

typedef DbRow = Map<String, Object?>;

const _uuid = Uuid();
String newId() => _uuid.v4();

/// Marca UTC con milisegundos: el mismo formato que usa el servidor para comparar (LWW).
String isoNow() => DateTime.fromMillisecondsSinceEpoch(DateTime.now().millisecondsSinceEpoch, isUtc: true).toIso8601String();

/// Fecha y hora local del documento (Colombia), sin zona: 'YYYY-MM-DDTHH:MM:SS'.
String localNow() => DateTime.now().toIso8601String().substring(0, 19);
String localToday() => DateTime.now().toIso8601String().substring(0, 10);

/// Estado de sincronización de una fila local.
class Dirty {
  static const clean = 0;
  static const pending = 1;
  static const rejected = -1;
}

/// SQLite local de KIO SBS. Se crea al primer arranque (instalación) y se auto-migra:
/// cualquier tabla o columna nueva de `tables.g.dart` se agrega sin perder datos.
class LocalDb extends ChangeNotifier {
  LocalDb._(this.db);
  final Database db;

  static late LocalDb instance;

  /// [path] sólo para pruebas; en la app se usa la carpeta de soporte del sistema operativo.
  static Future<LocalDb> open({String? path}) async {
    if (!kIsWeb && (Platform.isWindows || Platform.isLinux || Platform.isMacOS)) {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    }
    var file = path;
    if (file == null) {
      final dir = await getApplicationSupportDirectory();
      await dir.create(recursive: true);
      file = p.join(dir.path, 'kio_sbs.db');
    }
    final db = await openDatabase(file);
    await db.execute('PRAGMA journal_mode = WAL').catchError((_) {});
    final local = LocalDb._(db);
    await local._migrate();
    instance = local;
    return local;
  }

  String get path => db.path;

  static String _sqlType(ColType t) => switch (t) {
        ColType.text => 'TEXT',
        ColType.int => 'INTEGER NOT NULL DEFAULT 0',
        ColType.real => 'REAL NOT NULL DEFAULT 0',
        ColType.bool => 'INTEGER NOT NULL DEFAULT 0',
      };

  Future<void> _migrate() async {
    await db.execute('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
    for (final t in kTables.values) {
      await db.execute('''
        CREATE TABLE IF NOT EXISTS ${t.name} (
          id TEXT PRIMARY KEY,
          company_id TEXT,
          created_at TEXT,
          updated_at TEXT,
          updated_by TEXT,
          deleted INTEGER NOT NULL DEFAULT 0,
          rev INTEGER NOT NULL DEFAULT 0,
          dirty INTEGER NOT NULL DEFAULT 0
        )''');
      final existing = (await db.rawQuery('PRAGMA table_info(${t.name})')).map((r) => r['name'] as String).toSet();
      for (final e in t.columns.entries) {
        if (!existing.contains(e.key)) await db.execute('ALTER TABLE ${t.name} ADD COLUMN ${e.key} ${_sqlType(e.value)}');
      }
      await db.execute('CREATE INDEX IF NOT EXISTS ix_${t.name}_dirty ON ${t.name}(dirty)');
      for (final ix in t.indexes) {
        await db.execute('CREATE INDEX IF NOT EXISTS ix_${t.name}_${ix.join('_')} ON ${t.name}(${ix.join(', ')})');
      }
    }
  }

  // ------------------------------------------------------------------ meta (config, sesión, cursor)

  Future<String?> getMeta(String key) async {
    final r = await db.query('meta', where: 'key = ?', whereArgs: [key]);
    return r.isEmpty ? null : r.first['value'] as String?;
  }

  Future<void> setMeta(String key, String? value) async {
    if (value == null) {
      await db.delete('meta', where: 'key = ?', whereArgs: [key]);
    } else {
      await db.insert('meta', {'key': key, 'value': value}, conflictAlgorithm: ConflictAlgorithm.replace);
    }
  }

  /// Consecutivo local por tipo de documento (POS, PED, RC, CM, NOM...).
  Future<String> nextNumber(String type, String terminal) async {
    return db.transaction((tx) async {
      final key = 'seq:$type';
      final r = await tx.query('meta', where: 'key = ?', whereArgs: [key]);
      final n = (r.isEmpty ? 0 : int.tryParse(r.first['value'] as String? ?? '') ?? 0) + 1;
      await tx.insert('meta', {'key': key, 'value': '$n'}, conflictAlgorithm: ConflictAlgorithm.replace);
      return '$type-$terminal-${n.toString().padLeft(5, '0')}';
    });
  }

  // ------------------------------------------------------------------ lectura

  Future<List<DbRow>> all(String table, {String? where, List<Object?>? args, String? orderBy, int? limit}) {
    final w = where == null ? 'deleted = 0' : 'deleted = 0 AND ($where)';
    return db.query(table, where: w, whereArgs: args, orderBy: orderBy, limit: limit);
  }

  Future<DbRow?> byId(String table, String? id) async {
    if (id == null) return null;
    final r = await db.query(table, where: 'id = ?', whereArgs: [id], limit: 1);
    return r.isEmpty ? null : r.first;
  }

  Future<List<DbRow>> raw(String sql, [List<Object?>? args]) => db.rawQuery(sql, args);

  Future<num> scalar(String sql, [List<Object?>? args]) async {
    final r = await db.rawQuery(sql, args);
    if (r.isEmpty) return 0;
    return (r.first.values.first as num?) ?? 0;
  }

  // ------------------------------------------------------------------ escritura (siempre local → luego sync)

  DbRow _stamp(String table, DbRow row, {required String companyId, required String userId, bool isNew = false}) {
    final spec = kTables[table]!;
    final now = isoNow();
    final out = <String, Object?>{
      'id': row['id'] ?? newId(),
      'company_id': companyId,
      'updated_at': now,
      'updated_by': userId,
      'deleted': row['deleted'] ?? 0,
      'dirty': Dirty.pending,
    };
    if (isNew) out['created_at'] = row['created_at'] ?? now;
    for (final c in spec.columns.keys) {
      if (row.containsKey(c)) {
        final v = row[c];
        out[c] = v is bool ? (v ? 1 : 0) : v;
      }
    }
    return out;
  }

  /// Inserta o actualiza en SQLite y marca la fila como pendiente de enviar.
  Future<DbRow> save(String table, DbRow row, {required String companyId, required String userId, Transaction? tx}) async {
    final exec = tx ?? db;
    final id = row['id'] as String?;
    final exists = id != null && (await exec.query(table, columns: ['id'], where: 'id = ?', whereArgs: [id])).isNotEmpty;
    final data = _stamp(table, row, companyId: companyId, userId: userId, isNew: !exists);
    if (exists) {
      await exec.update(table, data, where: 'id = ?', whereArgs: [id]);
    } else {
      await exec.insert(table, data);
    }
    if (tx == null) notifyListeners();
    return data;
  }

  /// Varias escrituras atómicas (ej. venta + líneas + pagos + movimientos de inventario).
  Future<void> saveAll(List<(String, DbRow)> rows, {required String companyId, required String userId}) async {
    await db.transaction((tx) async {
      for (final (t, r) in rows) {
        await save(t, r, companyId: companyId, userId: userId, tx: tx);
      }
    });
    notifyListeners();
  }

  Future<void> remove(String table, String id, {required String companyId, required String userId}) =>
      save(table, {'id': id, 'deleted': 1}, companyId: companyId, userId: userId);

  Future<int> pendingCount() async {
    var n = 0;
    for (final t in kTables.keys) {
      n += (await scalar('SELECT COUNT(*) FROM $t WHERE dirty = ?', [Dirty.pending])).toInt();
    }
    return n;
  }

  Future<List<DbRow>> rejectedRows() async {
    final out = <DbRow>[];
    for (final t in kTables.keys) {
      for (final r in await db.query(t, where: 'dirty = ?', whereArgs: [Dirty.rejected])) {
        out.add({...r, '_table': t});
      }
    }
    return out;
  }

  /// Borra todos los datos de negocio (al cambiar de empresa en el mismo equipo).
  Future<void> wipeData() async {
    await db.transaction((tx) async {
      for (final t in kTables.keys) {
        await tx.delete(t);
      }
      await tx.delete('meta', where: "key LIKE 'sync:%' OR key LIKE 'reject:%'");
    });
    notifyListeners();
  }

  void changed() => notifyListeners();
}
