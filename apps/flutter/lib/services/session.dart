import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import '../data/local_db.dart';
import '../data/tables.g.dart';
import 'graphql.dart';

const kAppVersion = '1.2.2';

/// URLs por defecto: se pueden fijar al compilar
///   flutter build windows --dart-define=KIO_API_URL=https://kio-sbs-api.`cuenta`.workers.dev \
///                         --dart-define=KIO_SYNC_URL=https://kio-sbs-sync.`cuenta`.workers.dev \
///                         --dart-define=KIO_ADMIN_URL=https://kio-sbs.`cuenta`.workers.dev
const kDefaultApiUrl = String.fromEnvironment('KIO_API_URL', defaultValue: 'http://127.0.0.1:8797');
const kDefaultSyncUrl = String.fromEnvironment('KIO_SYNC_URL', defaultValue: 'https://kio-sbs-backend.rmolina1529.workers.dev/sync/graphql');
const kDefaultAdminUrl = String.fromEnvironment('KIO_ADMIN_URL', defaultValue: 'https://kio-sbs.rmolina1529.workers.dev');

Future<String> _captureHardwareId() async {
  if (kIsWeb) return '';
  try {
    if (Platform.isLinux) {
      final f = File('/etc/machine-id');
      if (await f.exists()) return (await f.readAsString()).trim();
    }
    if (Platform.isWindows) {
      final r = await Process.run('wmic', ['csproduct', 'get', 'UUID'], runInShell: true);
      final lines = (r.stdout as String).split(RegExp(r'\r?\n')).map((e) => e.trim()).where((e) => e.isNotEmpty && e.toLowerCase() != 'uuid').toList();
      if (lines.isNotEmpty) return lines.first;
    }
  } catch (_) {}
  return '';
}

Future<String> _captureMacAddress() async {
  if (kIsWeb) return '';
  try {
    if (Platform.isLinux) {
      final dir = Directory('/sys/class/net');
      if (await dir.exists()) {
        for (final e in dir.listSync().whereType<Directory>()) {
          final name = e.path.split('/').last;
          if (name == 'lo') continue;
          final f = File('${e.path}/address');
          if (await f.exists()) {
            final mac = (await f.readAsString()).trim();
            if (mac.isNotEmpty && mac != '00:00:00:00:00:00') return mac;
          }
        }
      }
    }
    if (Platform.isWindows) {
      final r = await Process.run('getmac', ['/fo', 'csv', '/nh'], runInShell: true);
      final out = (r.stdout as String).trim();
      final first = out.split(RegExp(r'\r?\n')).map((e) => e.trim()).where((e) => e.isNotEmpty).firstOrNull;
      if (first != null) {
        final mac = first.split(',').first.replaceAll('"', '').trim();
        if (mac.isNotEmpty) return mac;
      }
    }
  } catch (_) {}
  return '';
}

class AppUser {
  final String id, name, email, role;
  final String? posTerminal, employeeId;
  AppUser.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        name = j['name'] as String,
        email = j['email'] as String,
        role = j['role'] as String,
        posTerminal = j['posTerminal'] as String?,
        employeeId = j['employeeId'] as String?;

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    return (parts.first.isNotEmpty ? parts.first[0] : '?').toUpperCase() + (parts.length > 1 ? parts[1][0].toUpperCase() : '');
  }

  String get roleLabel => const {
        'admin': 'Dueño / Gerente',
        'contador': 'Auxiliar contable',
        'cajero': 'Cajero',
        'vendedor': 'Vendedor',
      }[role] ??
      role;
}

class Company {
  final Map<String, dynamic> raw;
  Company(this.raw);
  String get id => raw['id'] as String;
  String get name => raw['name'] as String? ?? '';
  String? get nit => raw['nit'] as String?;
  String? get receiptFooter => raw['receiptFooter'] as String?;
  String get businessType {
    final settings = raw['settings'];
    if (settings is Map && settings['businessType'] != null) return settings['businessType'].toString();
    return (raw['businessType'] as String?) ?? '';
  }
}

const kMeQuery = '''
  user { id name email role posTerminal employeeId }
  company { id name nit address city phone email currency receiptFooter plan businessTypesEnabled settings }
  permissions
''';

/// Sesión del usuario. Funciona offline: el token y el perfil quedan en SQLite.
class Session extends ChangeNotifier {
  Session(this.db);
  final LocalDb db;

  String apiUrl = kDefaultApiUrl;
  String syncUrl = kDefaultSyncUrl;
  String adminUrl = kDefaultAdminUrl;
  String deviceId = '';
  String terminalCode = '';
  String section = '';
  String siteId = '';
  String macAddress = '';
  String hardwareId = '';
  String? token;
  AppUser? user;
  Company? company;
  Map<String, dynamic> permissions = {};
  bool expired = false;

  bool get loggedIn => token != null && user != null && company != null;
  String get companyId => company!.id;
  String get userId => user!.id;
  String get role => user?.role ?? '';
  bool get isAdmin => role == 'admin';
  bool get isFinance => role == 'admin' || role == 'contador';
  bool get isRestaurant => (company?.businessType.toLowerCase() ?? '').contains('restaur') || (company?.businessType.toLowerCase() ?? '') == 'food';

  /// Prefijo de numeración local (terminal configurada, usuario o código corto del equipo).
  String get terminal {
    if (terminalCode.trim().isNotEmpty) return terminalCode.trim().toUpperCase();
    if (user?.posTerminal?.trim().isNotEmpty ?? false) return user!.posTerminal!.trim().toUpperCase();
    return deviceId.replaceAll('-', '').substring(0, 4).toUpperCase();
  }

  String get platform => kIsWeb ? 'web' : Platform.operatingSystem;
  String get deviceName => kIsWeb ? 'Navegador' : Platform.localHostname;
  bool get deviceConfigured => terminalCode.trim().isNotEmpty;

  /// Permisos efectivos que calcula el servidor (rol base o rol personalizado de la empresa).
  bool canRead(String table) => (permissions[table] as Map?)?['read'] == true || (permissions.isEmpty && (kTables[table]?.canRead(role) ?? false));
  bool canWrite(String table) => (permissions[table] as Map?)?['write'] == true || (permissions.isEmpty && (kTables[table]?.canWrite(role) ?? false));

  GraphQLClient get api => GraphQLClient(apiUrl, token: token, deviceId: deviceId);
  GraphQLClient get sync => GraphQLClient(syncUrl, token: token, deviceId: deviceId);

  Future<void> load() async {
    apiUrl = await db.getMeta('cfg:api_url') ?? kDefaultApiUrl;
    final storedSync = await db.getMeta('cfg:sync_url') ?? '';
    // Migración: el sync ya vive en el mismo backend (/sync/graphql).
    if (storedSync.isEmpty || storedSync.contains('kio-sbs-sync') || storedSync.contains(':8798')) {
      syncUrl = '${apiUrl.replaceFirst(RegExp(r'/+$'), '')}/sync/graphql';
      await db.setMeta('cfg:sync_url', syncUrl);
    } else {
      syncUrl = storedSync;
    }
    adminUrl = await db.getMeta('cfg:admin_url') ?? kDefaultAdminUrl;
    deviceId = await db.getMeta('cfg:device_id') ?? '';
    if (deviceId.isEmpty) {
      deviceId = newId();
      await db.setMeta('cfg:device_id', deviceId);
    }
    terminalCode = await db.getMeta('cfg:terminal_code') ?? '';
    section = await db.getMeta('cfg:section') ?? '';
    siteId = await db.getMeta('cfg:site_id') ?? '';
    macAddress = await db.getMeta('cfg:mac_address') ?? '';
    hardwareId = await db.getMeta('cfg:hardware_id') ?? '';
    if (macAddress.isEmpty) {
      macAddress = await _captureMacAddress();
      if (macAddress.isNotEmpty) await db.setMeta('cfg:mac_address', macAddress);
    }
    if (hardwareId.isEmpty) {
      hardwareId = await _captureHardwareId();
      if (hardwareId.isNotEmpty) await db.setMeta('cfg:hardware_id', hardwareId);
    }
    token = await db.getMeta('auth:token');
    final me = await db.getMeta('auth:me');
    if (token != null && me != null) {
      final decoded = jsonDecode(me);
      if (decoded is Map<String, dynamic>) _applyMe(decoded);
    }
    notifyListeners();
  }

  Future<void> setDeviceConfig({required String terminalCode, String? section, String? siteId}) async {
    this.terminalCode = terminalCode.trim().toUpperCase();
    this.section = (section ?? '').trim();
    this.siteId = (siteId ?? '').trim();
    await db.setMeta('cfg:terminal_code', this.terminalCode);
    await db.setMeta('cfg:section', this.section);
    await db.setMeta('cfg:site_id', this.siteId);
    if (macAddress.isEmpty) {
      macAddress = await _captureMacAddress();
      if (macAddress.isNotEmpty) await db.setMeta('cfg:mac_address', macAddress);
    }
    if (hardwareId.isEmpty) {
      hardwareId = await _captureHardwareId();
      if (hardwareId.isNotEmpty) await db.setMeta('cfg:hardware_id', hardwareId);
    }
    notifyListeners();
  }

  void _applyMe(Map<String, dynamic> me) {
    final u = me['user'];
    if (u is Map<String, dynamic>) user = AppUser.fromJson(u);
    final c = me['company'];
    if (c is Map<String, dynamic>) company = Company(c);
    final p = me['permissions'];
    permissions = p is Map ? p.map((k, v) => MapEntry(k.toString(), v)) : <String, dynamic>{};
  }

  Future<void> setServers(String api, String sync, [String? admin]) async {
    apiUrl = api.trim();
    syncUrl = sync.trim();
    if (admin != null && admin.trim().isNotEmpty) adminUrl = admin.trim();
    await db.setMeta('cfg:api_url', apiUrl);
    await db.setMeta('cfg:sync_url', syncUrl);
    await db.setMeta('cfg:admin_url', adminUrl);
    notifyListeners();
  }

  /// Devuelve true si cambió la empresa respecto a los datos locales (se limpia la base local).
  Future<bool> login(String email, String password) async {
    final data = await GraphQLClient(apiUrl, deviceId: deviceId).run(
      'mutation(\$e:String!,\$p:String!,\$d:String){ login(email:\$e,password:\$p,deviceId:\$d){ token expiresAt me { $kMeQuery } } }',
      {'e': email.trim(), 'p': password, 'd': deviceId},
    );
    final rawLogin = data['login'];
    if (rawLogin is! Map<String, dynamic>) throw GqlException('Respuesta de login inválida');
    final rawMe = rawLogin['me'];
    if (rawMe is! Map<String, dynamic>) throw GqlException('Respuesta de login inválida');
    final login = rawLogin;
    final me = rawMe;
    final newCompany = (me['company'] as Map?)?['id'] as String? ?? '';
    final previous = await db.getMeta('auth:company_id');
    var wiped = false;
    if (previous != null && previous != newCompany) {
      await db.wipeData();
      wiped = true;
    }
    token = login['token'] as String;
    expired = false;
    _applyMe(me);
    await db.setMeta('auth:token', token);
    await db.setMeta('auth:me', jsonEncode(me));
    await db.setMeta('auth:company_id', newCompany);
    notifyListeners();
    return wiped;
  }

  /// Refresca perfil/permisos cuando hay conexión (si cambió el rol, por ejemplo).
  Future<void> refreshMe() async {
    if (token == null) return;
    try {
      final data = await api.run('{ me { $kMeQuery } }');
      final me = data['me'];
      if (me is! Map<String, dynamic>) return;
      _applyMe(me);
      await db.setMeta('auth:me', jsonEncode(me));
      notifyListeners();
    } on GqlException catch (e) {
      if (e.unauthenticated) markExpired();
    }
  }

  void markExpired() {
    if (!expired) {
      expired = true;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    try {
      await api.run('mutation { logout }', null, const Duration(seconds: 5));
    } catch (_) {/* offline: igual se cierra localmente */}
    token = null;
    user = null;
    await db.setMeta('auth:token', null);
    await db.setMeta('auth:me', null);
    notifyListeners();
  }
}
