import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import '../data/local_db.dart';
import '../data/tables.g.dart';
import 'graphql.dart';

const kAppVersion = '1.0.0';

/// URLs por defecto: se pueden fijar al compilar
///   flutter build windows --dart-define=KIO_API_URL=https://kio-sbs-api.<cuenta>.workers.dev \
///                         --dart-define=KIO_SYNC_URL=https://kio-sbs-sync.<cuenta>.workers.dev
const kDefaultApiUrl = String.fromEnvironment('KIO_API_URL', defaultValue: 'http://127.0.0.1:8797');
const kDefaultSyncUrl = String.fromEnvironment('KIO_SYNC_URL', defaultValue: 'http://127.0.0.1:8798');

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
}

const kMeQuery = '''
  user { id name email role posTerminal employeeId }
  company { id name nit address city phone email currency receiptFooter plan }
  permissions
''';

/// Sesión del usuario. Funciona offline: el token y el perfil quedan en SQLite.
class Session extends ChangeNotifier {
  Session(this.db);
  final LocalDb db;

  String apiUrl = kDefaultApiUrl;
  String syncUrl = kDefaultSyncUrl;
  String deviceId = '';
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

  /// Prefijo de numeración local (terminal de caja o código corto del equipo).
  String get terminal => (user?.posTerminal?.trim().isNotEmpty ?? false)
      ? user!.posTerminal!.trim().toUpperCase()
      : deviceId.replaceAll('-', '').substring(0, 4).toUpperCase();

  String get platform => kIsWeb ? 'web' : Platform.operatingSystem;
  String get deviceName => kIsWeb ? 'Navegador' : Platform.localHostname;

  /// Permisos efectivos que calcula el servidor (rol base o rol personalizado de la empresa).
  bool canRead(String table) => (permissions[table] as Map?)?['read'] == true || (permissions.isEmpty && (kTables[table]?.canRead(role) ?? false));
  bool canWrite(String table) => (permissions[table] as Map?)?['write'] == true || (permissions.isEmpty && (kTables[table]?.canWrite(role) ?? false));

  GraphQLClient get api => GraphQLClient(apiUrl, token: token, deviceId: deviceId);
  GraphQLClient get sync => GraphQLClient(syncUrl, token: token, deviceId: deviceId);

  Future<void> load() async {
    apiUrl = await db.getMeta('cfg:api_url') ?? kDefaultApiUrl;
    syncUrl = await db.getMeta('cfg:sync_url') ?? kDefaultSyncUrl;
    deviceId = await db.getMeta('cfg:device_id') ?? '';
    if (deviceId.isEmpty) {
      deviceId = newId();
      await db.setMeta('cfg:device_id', deviceId);
    }
    token = await db.getMeta('auth:token');
    final me = await db.getMeta('auth:me');
    if (token != null && me != null) _applyMe(jsonDecode(me) as Map<String, dynamic>);
    notifyListeners();
  }

  void _applyMe(Map<String, dynamic> me) {
    user = AppUser.fromJson(me['user'] as Map<String, dynamic>);
    company = Company(me['company'] as Map<String, dynamic>);
    permissions = (me['permissions'] as Map?)?.cast<String, dynamic>() ?? {};
  }

  Future<void> setServers(String api, String sync) async {
    apiUrl = api.trim();
    syncUrl = sync.trim();
    await db.setMeta('cfg:api_url', apiUrl);
    await db.setMeta('cfg:sync_url', syncUrl);
    notifyListeners();
  }

  /// Devuelve true si cambió la empresa respecto a los datos locales (se limpia la base local).
  Future<bool> login(String email, String password) async {
    final data = await GraphQLClient(apiUrl, deviceId: deviceId).run(
      'mutation(\$e:String!,\$p:String!,\$d:String){ login(email:\$e,password:\$p,deviceId:\$d){ token expiresAt me { $kMeQuery } } }',
      {'e': email.trim(), 'p': password, 'd': deviceId},
    );
    final login = data['login'] as Map<String, dynamic>;
    final me = login['me'] as Map<String, dynamic>;
    final newCompany = (me['company'] as Map)['id'] as String;
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
      final me = data['me'] as Map<String, dynamic>;
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
