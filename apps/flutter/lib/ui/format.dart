import 'package:intl/intl.dart';

final _num = NumberFormat.decimalPattern('es_CO');
final _pct = NumberFormat.decimalPercentPattern(locale: 'es_CO', decimalDigits: 0);

num asNum(Object? v) => v is num ? v : num.tryParse('${v ?? ''}') ?? 0;
bool asBool(Object? v) => v == true || v == 1 || v == '1';
String asStr(Object? v) => v == null ? '' : '$v';

/// Formato KIO: "\$ 26.878" (símbolo adelante, miles con punto, sin decimales).
String money(Object? v) {
  final n = asNum(v).round();
  return '${n < 0 ? '−' : ''}\$ ${_num.format(n.abs())}';
}
String qty(Object? v) => _num.format(asNum(v));
String pct(Object? v) => _pct.format(asNum(v));

/// Abrevia montos grandes para los ejes de gráficos ($ 1,2 M).
String moneyShort(num v) {
  if (v.abs() >= 1e6) return '\$ ${(v / 1e6).toStringAsFixed(1).replaceAll('.', ',')} M';
  if (v.abs() >= 1e3) return '\$ ${(v / 1e3).toStringAsFixed(0)} mil';
  return money(v);
}

DateTime? parseDate(Object? v) => v == null ? null : DateTime.tryParse('$v');

String dateShort(Object? v) {
  final d = parseDate(v);
  return d == null ? '—' : DateFormat('d MMM y', 'es').format(d);
}

String dateTime(Object? v) {
  final d = parseDate(v);
  return d == null ? '—' : DateFormat("d MMM, h:mm a", 'es').format(d);
}

String monthLabel(String ym) {
  final d = DateTime.tryParse('$ym-01');
  return d == null ? ym : DateFormat('MMM', 'es').format(d).replaceAll('.', '');
}

String ymd(DateTime d) => d.toIso8601String().substring(0, 10);

/// Variación porcentual para las insignias de las tarjetas KPI.
double? delta(num current, num previous) => previous == 0 ? null : (current - previous) / previous;
