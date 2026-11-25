import 'dart:convert';
import 'dart:math' as math;

import '../data/local_db.dart';
import '../ui/format.dart';

/// Tipos de novedad (artix_nomina). Horas: factor sobre el valor hora ordinario.
/// Recargos según Ley 2466 de 2025 (dominical/festivo parametrizable en payroll_params).
class NoveltyType {
  const NoveltyType(this.key, this.label, {this.factor, this.base = 0, this.unit = 'horas', this.kind = 'devengo', this.salarial = true});
  final String key, label, unit, kind;
  final double? factor; // horas extra / recargos: factor fijo
  final double base; // 1 = se suma el recargo dominical parametrizado
  final bool salarial;
}

const kNoveltyTypes = <NoveltyType>[
  NoveltyType('HED', 'Hora extra diurna', factor: 1.25),
  NoveltyType('HEN', 'Hora extra nocturna', factor: 1.75),
  NoveltyType('RN', 'Recargo nocturno', factor: 0.35),
  NoveltyType('RDF', 'Recargo dominical/festivo', factor: 0, base: 1),
  NoveltyType('HEDDF', 'Hora extra diurna dominical/festiva', factor: 1.25, base: 1),
  NoveltyType('HENDF', 'Hora extra nocturna dominical/festiva', factor: 1.75, base: 1),
  NoveltyType('bonificacion', 'Bonificación salarial', unit: 'valor'),
  NoveltyType('comision', 'Comisión', unit: 'valor'),
  NoveltyType('no_salarial', 'Pago no salarial', unit: 'valor', salarial: false),
  NoveltyType('ausencia', 'Ausencia no remunerada', unit: 'días', kind: 'dias'),
  NoveltyType('licencia_nr', 'Licencia no remunerada', unit: 'días', kind: 'dias'),
  NoveltyType('prestamo', 'Descuento préstamo', unit: 'valor', kind: 'deduccion'),
  NoveltyType('deduccion', 'Otra deducción', unit: 'valor', kind: 'deduccion'),
];

NoveltyType? noveltyType(String? k) => kNoveltyTypes.where((t) => t.key == k).firstOrNull;

/// Tarifa ARL por clase de riesgo (Decreto 1772 de 1994).
const kArlRates = {1: 0.00522, 2: 0.01044, 3: 0.02436, 4: 0.0435, 5: 0.0696};

/// Periodos: 'YYYY-MM' (mensual) o 'YYYY-MM-Q1' / 'YYYY-MM-Q2' (quincenal).
({String from, String to, int days}) periodRange(String period) {
  final y = int.parse(period.substring(0, 4)), m = int.parse(period.substring(5, 7));
  final last = DateTime(y, m + 1, 0).day;
  if (period.endsWith('Q1')) return (from: ymd(DateTime(y, m, 1)), to: ymd(DateTime(y, m, 15)), days: 15);
  if (period.endsWith('Q2')) return (from: ymd(DateTime(y, m, 16)), to: ymd(DateTime(y, m, last)), days: 15);
  return (from: ymd(DateTime(y, m, 1)), to: ymd(DateTime(y, m, last)), days: 30);
}

/// Liquidación simplificada de nómina colombiana. Devuelve la fila de `payslips` (sin id).
DbRow computePayslip({required DbRow employee, required DbRow params, required String period, required List<DbRow> novelties}) {
  final range = periodRange(period);
  final salary = asNum(employee['salary']).toDouble();
  final smmlv = asNum(params['smmlv']).toDouble();
  final integral = asBool(employee['integral_salary']);
  final hourly = salary / math.max(1, asNum(params['hours_divisor']).toDouble());
  final sunday = asNum(params['sunday_surcharge']).toDouble();

  // Días laborados: periodo comercial (30/15) menos ingreso/retiro dentro del periodo y ausencias no remuneradas.
  var days = range.days.toDouble();
  final start = asStr(employee['start_date']), end = asStr(employee['end_date']);
  if (start.isNotEmpty && start.compareTo(range.from) > 0) days -= DateTime.parse(start).difference(DateTime.parse(range.from)).inDays;
  if (end.isNotEmpty && end.compareTo(range.to) < 0) days -= DateTime.parse(range.to).difference(DateTime.parse(end)).inDays;

  final detail = <Map<String, Object?>>[];
  var overtime = 0.0, salarial = 0.0, noSalarial = 0.0, deductions = 0.0;
  for (final n in novelties) {
    final t = noveltyType(n['type'] as String?);
    if (t == null) continue;
    final q = asNum(n['quantity']).toDouble();
    final amount = asNum(n['amount']).toDouble();
    switch (t.kind) {
      case 'dias':
        days -= q;
        detail.add({'concepto': t.label, 'cantidad': q, 'valor': -(salary / 30 * q), 'tipo': 'dias'});
      case 'deduccion':
        deductions += amount;
        detail.add({'concepto': t.label, 'valor': amount, 'tipo': 'deduccion'});
      default:
        if (t.unit == 'horas') {
          final v = q * hourly * ((t.factor ?? 0) + t.base * sunday);
          overtime += v;
          detail.add({'concepto': t.label, 'cantidad': q, 'valor': v, 'tipo': 'devengo'});
        } else if (t.salarial) {
          salarial += amount;
          detail.add({'concepto': t.label, 'valor': amount, 'tipo': 'devengo'});
        } else {
          noSalarial += amount;
          detail.add({'concepto': t.label, 'valor': amount, 'tipo': 'devengo'});
        }
    }
  }
  days = days.clamp(0, range.days.toDouble());

  final basic = salary / 30 * days;
  // Auxilio de transporte: hasta 2 SMMLV y no aplica a salario integral.
  final transport = (!integral && asBool(employee['transport_aid']) && salary <= 2 * smmlv) ? asNum(params['transport_aid']) / 30 * days : 0.0;

  // IBC: devengos salariales (70 % si es integral), mínimo proporcional a 1 SMMLV.
  var ibc = (basic + overtime + salarial) * (integral ? 0.7 : 1);
  ibc = math.max(ibc, smmlv / 30 * days);
  final health = ibc * asNum(params['health_pct']);
  final pension = ibc * asNum(params['pension_pct']);
  // Fondo de solidaridad pensional sobre IBC mensualizado.
  final monthlyIbc = days == 0 ? 0 : ibc * 30 / days;
  final ratio = smmlv == 0 ? 0 : monthlyIbc / smmlv;
  final fspPct = ratio < 4 ? 0.0 : ratio < 16 ? 0.01 : ratio < 17 ? 0.012 : ratio < 18 ? 0.014 : ratio < 19 ? 0.016 : ratio < 20 ? 0.018 : 0.02;
  final solidarity = ibc * fspPct;

  final totalEarnings = basic + transport + overtime + salarial + noSalarial;
  final totalDeductions = health + pension + solidarity + deductions;

  // Costo empleador estimado: pensión 12 %, ARL, caja 4 % y provisiones de prestaciones.
  // Se asume exoneración de salud empleador, SENA e ICBF (art. 114-1 E.T.) para salarios < 10 SMMLV.
  final arl = ibc * (kArlRates[asNum(employee['arl_risk']).toInt()] ?? kArlRates[1]!);
  final exonerated = salary < 10 * smmlv;
  final employerSS = ibc * 0.12 + arl + ibc * 0.04 + (exonerated ? 0 : ibc * 0.085 + ibc * 0.05);
  final prestBase = basic + overtime + salarial + transport;
  final provisions = integral ? basic * 0.0417 : prestBase * 0.0833 * 2 + prestBase * 0.0833 * 0.12 + basic * 0.0417;
  final employerCost = totalEarnings + employerSS + provisions;

  return {
    'employee_id': employee['id'],
    'period': period,
    'date_from': range.from,
    'date_to': range.to,
    'days': days,
    'basic': basic.roundToDouble(),
    'transport': transport.roundToDouble(),
    'overtime': overtime.roundToDouble(),
    'other_earnings': (salarial + noSalarial).roundToDouble(),
    'total_earnings': totalEarnings.roundToDouble(),
    'health': health.roundToDouble(),
    'pension': pension.roundToDouble(),
    'solidarity': solidarity.roundToDouble(),
    'other_deductions': deductions.roundToDouble(),
    'total_deductions': totalDeductions.roundToDouble(),
    'net': (totalEarnings - totalDeductions).roundToDouble(),
    'employer_cost': employerCost.roundToDouble(),
    'detail': jsonEncode({
      'novedades': detail,
      'ibc': ibc.roundToDouble(),
      'valor_hora': hourly.roundToDouble(),
      'empleador': {
        'pension_12': (ibc * 0.12).roundToDouble(),
        'arl': arl.roundToDouble(),
        'caja_4': (ibc * 0.04).roundToDouble(),
        'provisiones': provisions.roundToDouble(),
        'exonerado_114_1': exonerated,
      },
    }),
  };
}
