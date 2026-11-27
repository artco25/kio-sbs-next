import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'session.dart';

/// Estado visible de las actualizaciones automáticas de escritorio.
enum UpdateState { idle, checking, available, downloading, ready, upToDate, error }

class UpdateRelease {
  UpdateRelease(this.version, this.notes, this.url, this.file, this.sha256);
  final String version;
  final String? notes;
  final String url;
  final String file;
  final String? sha256;
}

/// Notificación mostrada en el campanito cuando hay una versión nueva.
class UpdateNotice {
  const UpdateNotice({required this.title, this.body});
  final String title;
  final String? body;
}

/// Busca `downloads/release.json` en el admin, descarga el paquete de la
/// plataforma y deja un script que reemplaza la app al reiniciar.
/// La base SQLite vive en Application Support, así que no se toca.
class UpdateService extends ChangeNotifier {
  UpdateService(this.session);
  final Session session;

  Timer? _timer;
  bool _checking = false;
  bool _downloading = false;
  bool _autoInstallOnReady = false;
  UpdateRelease? _release;
  String? _script;

  UpdateState state = UpdateState.idle;
  String? error;
  String? stagedPath;
  bool cashOpen = false;

  bool get supported => !kIsWeb && (Platform.isLinux || Platform.isWindows);
  String get platformKey => Platform.isLinux ? 'linux' : 'windows';
  String get currentVersion => kAppVersion;
  String? get latestVersion => _release?.version;
  String? get notes => _release?.notes;
  bool get blockedByCash => state == UpdateState.ready && cashOpen;
  bool get canInstall => state == UpdateState.ready && _script != null && !cashOpen;

  /// Una notificación por versión publicada, mientras no esté instalada.
  List<UpdateNotice> get notices {
    final version = latestVersion;
    if (!supported || version == null || state == UpdateState.upToDate || state == UpdateState.error) {
      return const [];
    }
    return [
      UpdateNotice(
        title: 'Actualización $version disponible',
        body: notes?.trim().isNotEmpty == true ? notes : 'Hay una nueva versión del POS. Tócala para instalarla.',
      ),
    ];
  }

  bool get hasNotifications => notices.isNotEmpty;

  void start() {
    if (!supported) return;
    unawaited(_start());
  }

  Future<void> _start() async {
    await refreshCashState();
    final deferred = await session.db.getMeta('update:deferred');
    if (deferred != null && deferred.isNotEmpty && _compare(deferred, kAppVersion) <= 0) {
      // La versión diferida ya está instalada.
      await session.db.setMeta('update:deferred', null);
    } else {
      _autoInstallOnReady = deferred != null && deferred.isNotEmpty;
    }
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(hours: 1), (_) => unawaited(check()));
    unawaited(check());
  }

  /// No instalamos mientras haya caja abierta: se guarda la intención y se
  /// aplica al abrir la app de nuevo con la caja cerrada.
  Future<void> refreshCashState() async {
    if (session.userId.isEmpty) {
      if (cashOpen) {
        cashOpen = false;
        notifyListeners();
      }
      return;
    }
    final n = await session.db.scalar(
      "SELECT COUNT(*) FROM pos_sessions WHERE deleted = 0 AND status = 'abierta' AND user_id = ?",
      [session.userId],
    );
    final open = n.toInt() > 0;
    if (open != cashOpen) {
      cashOpen = open;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _set(UpdateState next, {String? message, bool clearError = false}) {
    state = next;
    if (clearError) error = null;
    if (message != null) error = message;
    notifyListeners();
  }

  static int _compare(String a, String b) {
    final pa = a.split(RegExp(r'[.+\-]')).map((x) => int.tryParse(x) ?? 0).toList();
    final pb = b.split(RegExp(r'[.+\-]')).map((x) => int.tryParse(x) ?? 0).toList();
    final n = pa.length > pb.length ? pa.length : pb.length;
    for (var i = 0; i < n; i++) {
      final x = i < pa.length ? pa[i] : 0;
      final y = i < pb.length ? pb[i] : 0;
      if (x != y) return x > y ? 1 : -1;
    }
    return 0;
  }

  Future<void> check() async {
    if (!supported || _checking || _downloading) return;
    _checking = true;
    _set(UpdateState.checking, clearError: true);
    try {
      // Si el equipo tiene guardada una URL de administración vieja o local,
      // se prueba también el endpoint de producción antes de dar por fallado.
      final bases = <String>{
        session.adminUrl.replaceAll(RegExp(r'/+$'), ''),
        'https://kio-sbs.rmolina1529.workers.dev',
      };
      String? usedBase;
      Map<String, dynamic>? data;
      for (final base in bases) {
        try {
          final r = await http.get(Uri.parse('$base/downloads/release.json')).timeout(const Duration(seconds: 12));
          if (r.statusCode != 200) continue;
          final decoded = jsonDecode(r.body);
          if (decoded is! Map<String, dynamic>) continue;
          data = decoded;
          usedBase = base;
          break;
        } catch (_) {
          continue;
        }
      }
      if (data == null || usedBase == null) throw Exception('No se pudo consultar el servidor de actualizaciones');
      final version = (data['version'] as String?)?.trim() ?? '';
      final platforms = data['platforms'] as Map?;
      final raw = platforms?[platformKey] as Map?;
      final url = raw?['url']?.toString().trim() ?? '';
      if (version.isEmpty || url.isEmpty) {
        await session.db.setMeta('update:deferred', null);
        _set(UpdateState.upToDate);
        return;
      }
      final file = raw?['file']?.toString() ?? url.split('/').last;
      _release = UpdateRelease(
        version,
        data['notes']?.toString(),
        url.startsWith('http') ? url : '$usedBase$url',
        file,
        raw?['sha256']?.toString(),
      );
      if (_compare(version, kAppVersion) <= 0) {
        await session.db.setMeta('update:deferred', null);
        _set(UpdateState.upToDate);
        return;
      }
      await refreshCashState();
      if (cashOpen) {
        // Descargamos ahora, pero no interrumpimos la caja abierta.
        await session.db.setMeta('update:deferred', version);
      }
      _set(UpdateState.available);
      // Descarga automática en segundo plano: el usuario sólo decide cuándo reiniciar.
      unawaited(download());
    } catch (e) {
      _set(UpdateState.error, message: 'No se pudo consultar la actualización: $e');
    } finally {
      _checking = false;
    }
  }

  Future<void> download() async {
    if (!supported || _downloading) return;
    final release = _release;
    if (release == null) return;
    _downloading = true;
    _set(UpdateState.downloading, clearError: true);
    try {
      final tmp = await getTemporaryDirectory();
      final dir = Directory(p.join(tmp.path, 'kio-updates', release.version));
      if (await dir.exists()) await dir.delete(recursive: true);
      await dir.create(recursive: true);

      final archive = File(p.join(dir.path, release.file));
      final res = await http.get(Uri.parse(release.url)).timeout(const Duration(seconds: 180));
      if (res.statusCode != 200) throw Exception('HTTP ${res.statusCode} al descargar el paquete');
      await archive.writeAsBytes(res.bodyBytes);

      if (release.sha256 != null && release.sha256!.isNotEmpty) {
        final got = sha256.convert(res.bodyBytes).toString();
        if (got.toLowerCase() != release.sha256!.toLowerCase()) {
          throw Exception('El archivo descargado no coincide con la firma publicada');
        }
      }

      final stage = Directory(p.join(dir.path, 'bundle'));
      await stage.create(recursive: true);
      final extract = Platform.isLinux
          ? await Process.run('tar', ['-xzf', archive.path, '-C', stage.path])
          : await Process.run('tar', ['-xf', archive.path, '-C', stage.path], runInShell: true);
      if (extract.exitCode != 0) throw Exception('No se pudo extraer el paquete: ${extract.stderr}');

      final exe = Platform.isLinux ? 'kio_sbs' : 'kio_sbs.exe';
      if (!File(p.join(stage.path, exe)).existsSync()) throw Exception('El paquete no contiene $exe');

      stagedPath = stage.path;
      _script = await _writeApplyScript(dir, stage);
      _set(UpdateState.ready);
      if (_autoInstallOnReady) {
        _autoInstallOnReady = false;
        await refreshCashState();
        if (!cashOpen) {
          await session.db.setMeta('update:deferred', null);
          await Future.delayed(const Duration(seconds: 2));
          await installAndRestart();
        }
      }
    } catch (e) {
      _set(UpdateState.error, message: 'No se pudo descargar la actualización: $e');
    } finally {
      _downloading = false;
    }
  }

  String _sh(String v) => "'${v.replaceAll("'", "'\\''")}'";
  String _ps(String v) => "'${v.replaceAll("'", "''")}'";

  Future<String> _writeApplyScript(Directory dir, Directory stage) async {
    final installDir = p.dirname(File(Platform.resolvedExecutable).absolute.path);
    final log = p.join(dir.path, 'install.log');

    if (Platform.isLinux) {
      final script = File(p.join(dir.path, 'apply_update.sh'));
      await script.writeAsString([
        '#!/bin/sh',
        'APP_PID=$pid',
        'OLD=${_sh(installDir)}',
        'STAGE=${_sh(stage.path)}',
        'LOG=${_sh(log)}',
        r'exec >"$LOG" 2>&1',
        r'while kill -0 "$APP_PID" 2>/dev/null; do sleep 0.5; done',
        r'sleep 1',
        r'if [ -d "$OLD.old" ]; then rm -rf "$OLD.old"; fi',
        r'mv "$OLD" "$OLD.old"',
        r'if ! mv "$STAGE" "$OLD"; then mv "$OLD.old" "$OLD"; exit 1; fi',
        r'chmod +x "$OLD/kio_sbs"',
        r'cd "$OLD"',
        r'nohup ./kio_sbs >/dev/null 2>&1 &',
        r'rm -f "$0"',
        '',
      ].join('\n'));
      await Process.run('chmod', ['+x', script.path]);
      return script.path;
    }

    final script = File(p.join(dir.path, 'apply_update.ps1'));
    await script.writeAsString([
      r'$appPid = $pid',
      '\$old = ${_ps(installDir)}',
      '\$stage = ${_ps(stage.path)}',
      r'while (Get-Process -Id $appPid -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 500 }',
      r'Start-Sleep -Seconds 1',
      r'$backup = "$old.old"',
      r'if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }',
      r'Move-Item -LiteralPath $old -Destination $backup',
      r'try { Move-Item -LiteralPath $stage -Destination $old } catch { Move-Item -LiteralPath $backup -Destination $old; throw }',
      r'Start-Process -FilePath "$old\kio_sbs.exe" -WorkingDirectory $old',
      r'Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force',
      '',
    ].join('\n'));
    return script.path;
  }

  /// Lanza el script separado y termina esta instancia; el script espera a que
  /// el proceso salga, reemplaza el bundle y vuelve a abrir la app.
  Future<void> installAndRestart() async {
    await refreshCashState();
    final script = _script;
    if (!canInstall || script == null) return;
    if (Platform.isLinux) {
      await Process.start('sh', [script], mode: ProcessStartMode.detached);
    } else {
      await Process.start(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
        mode: ProcessStartMode.detached,
      );
    }
    exit(0);
  }
}
