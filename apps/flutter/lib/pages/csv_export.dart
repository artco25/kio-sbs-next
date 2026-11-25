import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../data/local_db.dart';
import '../ui/widgets.dart';

/// "Descargar todo": guarda un CSV (UTF-8 con BOM, separador ';' para Excel en español).
Future<void> exportCsv(BuildContext context, String name, List<DbRow> rows, List<String> cols) async {
  String esc(Object? v) {
    final s = v == null ? '' : '$v';
    return s.contains(RegExp(r'[;"\n]')) ? '"${s.replaceAll('"', '""')}"' : s;
  }

  final buf = StringBuffer('﻿')..writeln(cols.join(';'));
  for (final r in rows) {
    buf.writeln(cols.map((c) => esc(r[c])).join(';'));
  }
  try {
    final dir = (Platform.isAndroid || Platform.isIOS) ? await getApplicationDocumentsDirectory() : (await getDownloadsDirectory() ?? await getApplicationDocumentsDirectory());
    final file = File(p.join(dir.path, 'kio_sbs_${name}_${DateTime.now().toIso8601String().substring(0, 19).replaceAll(':', '-')}.csv'));
    await file.writeAsBytes(utf8.encode(buf.toString()));
    if (context.mounted) toast(context, 'Archivo guardado en ${file.path}');
  } catch (e) {
    if (context.mounted) toast(context, 'No se pudo guardar el archivo: $e', error: true);
  }
}
