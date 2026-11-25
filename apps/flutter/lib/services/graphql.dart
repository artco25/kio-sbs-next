import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

class GqlException implements Exception {
  final String message;
  final String? code;
  final bool offline;
  GqlException(this.message, {this.code, this.offline = false});
  bool get unauthenticated => code == 'UNAUTHENTICATED';
  @override
  String toString() => message;
}

/// Cliente GraphQL mínimo (POST JSON). Se usa contra los dos workers: api y sync.
class GraphQLClient {
  GraphQLClient(this.baseUrl, {this.token, this.deviceId, http.Client? client}) : _injected = client;

  final String baseUrl;
  final String? token;
  final String? deviceId;
  final http.Client? _injected;

  Uri get _uri => Uri.parse('${baseUrl.replaceAll(RegExp(r'/+$'), '')}/graphql');

  Future<Map<String, dynamic>> run(String query, [Map<String, dynamic>? variables, Duration timeout = const Duration(seconds: 25)]) async {
    final http.Response res;
    // Cliente por solicitud y cerrado al terminar: no deja conexiones ni timers colgando.
    final client = _injected ?? http.Client();
    try {
      res = await client
          .post(
            _uri,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/graphql-response+json, application/json',
              if (token != null) 'Authorization': 'Bearer $token',
              if (deviceId != null) 'X-Device-Id': deviceId!,
            },
            body: jsonEncode({'query': query, 'variables': variables ?? {}}),
          )
          .timeout(timeout);
    } on SocketException {
      throw GqlException('Sin conexión con el servidor', offline: true);
    } on TimeoutException {
      throw GqlException('El servidor no respondió a tiempo', offline: true);
    } on http.ClientException catch (e) {
      throw GqlException('Sin conexión con el servidor (${e.message})', offline: true);
    } finally {
      if (_injected == null) client.close();
    }

    Map<String, dynamic> body;
    try {
      body = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    } catch (_) {
      throw GqlException('Respuesta inválida del servidor (HTTP ${res.statusCode})', offline: res.statusCode >= 500);
    }
    final errors = body['errors'] as List?;
    if (errors != null && errors.isNotEmpty) {
      final e = errors.first as Map<String, dynamic>;
      final code = (e['extensions'] as Map?)?['code'] as String?;
      throw GqlException(e['message'] as String? ?? 'Error', code: code);
    }
    return (body['data'] as Map<String, dynamic>?) ?? {};
  }
}
