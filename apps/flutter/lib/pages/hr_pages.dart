import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../data/local_db.dart';
import '../services/graphql.dart';
import '../services/payroll.dart';
import '../services/session.dart';
import '../theme/kio_theme.dart';
import '../ui/entity_form.dart';
import '../ui/format.dart';
import '../ui/shell.dart';
import '../ui/widgets.dart';
import 'csv_export.dart';

// =============================================================================
// Empleados (hr + artix_nomina)
// =============================================================================

const employeeFields = [
  FieldSpec('name', 'Nombre completo', required: true, full: true),
  FieldSpec('doc_type', 'Tipo de documento', type: FieldType.select, options: {'CC': 'Cédula', 'CE': 'Cédula de extranjería', 'PPT': 'PPT', 'PP': 'Pasaporte'}, defaultValue: 'CC'),
  FieldSpec('doc_number', 'Número de documento', required: true),
  FieldSpec('email', 'Correo', type: FieldType.email),
  FieldSpec('phone', 'Teléfono', type: FieldType.phone),
  FieldSpec('position', 'Cargo'),
  FieldSpec('department', 'Área'),
  FieldSpec('salary', 'Salario mensual', type: FieldType.money, required: true),
  FieldSpec('start_date', 'Fecha de ingreso', type: FieldType.date, required: true),
  FieldSpec('end_date', 'Fecha de retiro', type: FieldType.date),
  FieldSpec('contract_type', 'Contrato', type: FieldType.select, options: {'indefinido': 'Término indefinido', 'fijo': 'Término fijo', 'obra': 'Obra o labor', 'aprendizaje': 'Aprendizaje'}, defaultValue: 'indefinido'),
  FieldSpec('pay_frequency', 'Periodicidad de pago', type: FieldType.select, options: {'mensual': 'Mensual', 'quincenal': 'Quincenal'}, defaultValue: 'mensual'),
  FieldSpec('eps', 'EPS'),
  FieldSpec('afp', 'Fondo de pensiones'),
  FieldSpec('arl_risk', 'Riesgo ARL', type: FieldType.select, options: {'1': 'Clase I', '2': 'Clase II', '3': 'Clase III', '4': 'Clase IV', '5': 'Clase V'}, defaultValue: '1'),
  FieldSpec('bank_name', 'Banco'),
  FieldSpec('bank_account', 'Cuenta bancaria'),
  FieldSpec('transport_aid', 'Auxilio de transporte', type: FieldType.boolean, defaultValue: 1),
  FieldSpec('integral_salary', 'Salario integral', type: FieldType.boolean),
  FieldSpec('active', 'Activo', type: FieldType.boolean, defaultValue: 1),
];

class EmployeesPage extends StatefulWidget {
  const EmployeesPage({super.key});
  @override
  State<EmployeesPage> createState() => _EmployeesPageState();
}

class _EmployeesPageState extends State<EmployeesPage> {
  String _q = '';
  bool? _active = true;

  Future<void> _edit([DbRow? r]) => showEntityForm(
        context,
        table: 'employees',
        title: r == null ? 'Nuevo empleado' : asStr(r['name']),
        fields: employeeFields,
        initial: r == null ? null : {...r, 'arl_risk': '${asNum(r['arl_risk']).toInt()}'},
        validate: (v) {
          v['arl_risk'] = int.tryParse('${v['arl_risk']}') ?? 1;
          return null;
        },
      );

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    if (!s.canRead('employees')) return const NoAccess();
    return PageBody(children: [
      PageHeader(
        title: 'Empleados',
        actions: [if (s.canWrite('employees')) FilledButton.icon(onPressed: _edit, icon: const Icon(LucideIcons.plus, size: 16), label: const Text('Nuevo'))],
      ),
      LiveQuery(
        deps: [_q, _active],
        query: () {
          final args = <Object?>[];
          var where = '1 = 1';
          if (_q.isNotEmpty) {
            where += ' AND (name LIKE ? OR doc_number LIKE ? OR position LIKE ?)';
            args.addAll(['%$_q%', '%$_q%', '%$_q%']);
          }
          if (_active != null) {
            where += ' AND active = ?';
            args.add(_active! ? 1 : 0);
          }
          return LocalDb.instance.all('employees', where: where, args: args, orderBy: 'name');
        },
        builder: (context, rows) {
          final payroll = rows.where((r) => asBool(r['active'])).fold<double>(0, (a, r) => a + asNum(r['salary']));
          return Column(children: [
            KpiGrid(maxColumns: 3, children: [
              KpiCard(icon: LucideIcons.users, color: Kio.purple, label: 'Empleados', value: qty(rows.length)),
              KpiCard(icon: LucideIcons.banknote, color: Kio.green, label: 'Salarios mensuales', value: money(payroll)),
              KpiCard(icon: LucideIcons.idCard, color: Kio.info, label: 'Salario promedio', value: money(rows.isEmpty ? 0 : payroll / rows.length)),
            ]),
            const SizedBox(height: 20),
            KioTableCard(
              title: 'Personal',
              trailing: OutlinedButton.icon(
                onPressed: () => exportCsv(context, 'empleados', rows, const ['name', 'doc_type', 'doc_number', 'position', 'department', 'salary', 'start_date', 'eps', 'afp']),
                icon: const Icon(LucideIcons.download, size: 15),
                label: const Text('Descargar todo'),
              ),
              toolbar: [
                SearchField(hint: 'Nombre, documento o cargo…', onChanged: (v) => setState(() => _q = v.trim())),
                FilterChipMenu<bool>(label: 'Activos', value: _active, options: const {true: 'Activos', false: 'Retirados', null: 'Todos'}, onSelected: (v) => setState(() => _active = v)),
              ],
              rows: rows,
              onTap: _edit,
              columns: [
                KioColumn('Empleado', (r) => NameCell(asStr(r['name']), subtitle: '${asStr(r['doc_type'])} ${asStr(r['doc_number'])}'), flex: 4),
                KioColumn('Cargo', (r) => Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [Text(asStr(r['position'])), Text(asStr(r['department']), style: Kio.small)]), flex: 3),
                KioColumn('Ingreso', (r) => Text(dateShort(r['start_date']))),
                KioColumn('Pago', (r) => StatusPill(asStr(r['pay_frequency']) == 'quincenal' ? 'Quincenal' : 'Mensual', color: Kio.info)),
                KioColumn('Salario', (r) => Text(money(r['salary']), style: const TextStyle(fontWeight: FontWeight.w700)), numeric: true),
              ],
            ),
          ]);
        },
      ),
    ]);
  }
}

// =============================================================================
// Novedades de nómina
// =============================================================================

class NoveltiesPage extends StatefulWidget {
  const NoveltiesPage({super.key});
  @override
  State<NoveltiesPage> createState() => _NoveltiesPageState();
}

class _NoveltiesPageState extends State<NoveltiesPage> {
  late String _period = localToday().substring(0, 7);

  List<FieldSpec> get _fields => [
        const FieldSpec('employee_id', 'Empleado', type: FieldType.ref, refTable: 'employees', refWhere: 'active = 1', required: true, full: true),
        FieldSpec('type', 'Tipo de novedad', type: FieldType.select, options: {for (final t in kNoveltyTypes) t.key: '${t.label} (${t.unit})'}, required: true),
        const FieldSpec('date', 'Fecha', type: FieldType.date, required: true),
        const FieldSpec('quantity', 'Cantidad (horas o días)', type: FieldType.number),
        const FieldSpec('amount', 'Valor (si aplica)', type: FieldType.money),
        const FieldSpec('notes', 'Observaciones', type: FieldType.multiline),
      ];

  Future<void> _edit([DbRow? r]) async {
    if (r != null && asStr(r['payslip_id']).isNotEmpty) {
      toast(context, 'La novedad ya fue liquidada en una nómina confirmada', error: true);
      return;
    }
    await showEntityForm(
      context,
      table: 'payroll_novelties',
      title: r == null ? 'Nueva novedad' : 'Editar novedad',
      fields: _fields,
      initial: r ?? {'date': localToday()},
      validate: (v) {
        v['period'] = asStr(v['date']).substring(0, 7);
        final t = noveltyType(v['type'] as String?);
        if (t == null) return 'Selecciona el tipo';
        if (t.unit == 'valor' && asNum(v['amount']) <= 0) return 'Indica el valor de la novedad';
        if (t.unit != 'valor' && asNum(v['quantity']) <= 0) return 'Indica la cantidad de ${t.unit}';
        return null;
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return PageBody(children: [
      PageHeader(
        title: 'Novedades de nómina',
        subtitle: 'Horas extra, recargos, bonificaciones, ausencias y descuentos del periodo.',
        actions: [
          _MonthPicker(value: _period, onChanged: (v) => setState(() => _period = v)),
          if (s.canWrite('payroll_novelties')) FilledButton.icon(onPressed: _edit, icon: const Icon(LucideIcons.plus, size: 16), label: const Text('Nueva novedad')),
        ],
      ),
      LiveQuery(
        deps: [_period],
        query: () => LocalDb.instance.raw('''
          SELECT n.*, e.name AS employee_name FROM payroll_novelties n LEFT JOIN employees e ON e.id = n.employee_id
           WHERE n.deleted = 0 AND n.period = ? ORDER BY n.date DESC''', [_period]),
        builder: (context, rows) => KioTableCard(
          title: 'Novedades de ${monthLabel(_period)} ${_period.substring(0, 4)}',
          rows: rows,
          onTap: _edit,
          columns: [
            KioColumn('Empleado', (r) => NameCell(asStr(r['employee_name'])), flex: 3),
            KioColumn('Novedad', (r) => Text(noveltyType(r['type'] as String?)?.label ?? asStr(r['type'])), flex: 3),
            KioColumn('Fecha', (r) => Text(dateShort(r['date']))),
            KioColumn('Cantidad', (r) => Text(asNum(r['quantity']) == 0 ? '—' : '${qty(r['quantity'])} ${noveltyType(r['type'] as String?)?.unit ?? ''}'), numeric: true),
            KioColumn('Valor', (r) => Text(asNum(r['amount']) == 0 ? '—' : money(r['amount'])), numeric: true),
            KioColumn('Estado', (r) => asStr(r['payslip_id']).isEmpty ? const StatusPill('Pendiente') : StatusPill.status('liquidada')),
          ],
        ),
      ),
    ]);
  }
}

class _MonthPicker extends StatelessWidget {
  const _MonthPicker({required this.value, required this.onChanged});
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final months = [for (var i = -1; i < 12; i++) DateTime(now.year, now.month - i, 1).toIso8601String().substring(0, 7)];
    return FilterChipMenu<String>(
      label: 'Periodo',
      value: value,
      options: {for (final m in months) m: '${monthLabel(m)} ${m.substring(0, 4)}'},
      onSelected: (v) => onChanged(v ?? value),
    );
  }
}

// =============================================================================
// Vacaciones y permisos (artix_autogestion)
// =============================================================================

class LeavesPage extends StatelessWidget {
  const LeavesPage({super.key});

  static const _types = {'vacaciones': 'Vacaciones', 'permiso': 'Permiso', 'licencia': 'Licencia', 'incapacidad': 'Incapacidad', 'calamidad': 'Calamidad doméstica'};

  List<FieldSpec> get _fields => const [
        FieldSpec('employee_id', 'Empleado', type: FieldType.ref, refTable: 'employees', refWhere: 'active = 1', required: true, full: true),
        FieldSpec('type', 'Tipo', type: FieldType.select, options: _types, required: true, defaultValue: 'vacaciones'),
        FieldSpec('paid', 'Remunerado', type: FieldType.boolean, defaultValue: 1),
        FieldSpec('date_from', 'Desde', type: FieldType.date, required: true),
        FieldSpec('date_to', 'Hasta', type: FieldType.date, required: true),
        FieldSpec('days', 'Días hábiles', type: FieldType.number),
        FieldSpec('notes', 'Motivo / observaciones', type: FieldType.multiline),
      ];

  Future<void> _decide(BuildContext context, DbRow r, bool approve) async {
    final s = context.read<Session>();
    try {
      await s.api.run(r'mutation($id:ID!,$a:Boolean!){ approveLeave(id:$id, approve:$a){ id } }', {'id': r['id'], 'a': approve});
    } on GqlException catch (e) {
      if (!e.offline && e.code != 'NOT_FOUND') {
        if (context.mounted) toast(context, e.message, error: true);
        return;
      }
    }
    await LocalDb.instance.save('leave_requests', {'id': r['id'], 'status': approve ? 'aprobada' : 'rechazada', 'approved_by': s.userId}, companyId: s.companyId, userId: s.userId);
    if (context.mounted) toast(context, approve ? 'Solicitud aprobada' : 'Solicitud rechazada');
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return PageBody(children: [
      PageHeader(
        title: 'Vacaciones y permisos',
        actions: [
          if (s.canWrite('leave_requests'))
            FilledButton.icon(
              onPressed: () => showEntityForm(
                context,
                table: 'leave_requests',
                title: 'Nueva solicitud',
                fields: _fields,
                extra: const {'status': 'solicitada'},
                validate: (v) {
                  final a = asStr(v['date_from']), b = asStr(v['date_to']);
                  if (b.compareTo(a) < 0) return 'La fecha final es anterior a la inicial';
                  if (asNum(v['days']) <= 0) v['days'] = DateTime.parse(b).difference(DateTime.parse(a)).inDays + 1;
                  return null;
                },
              ),
              icon: const Icon(LucideIcons.plus, size: 16),
              label: const Text('Nueva solicitud'),
            ),
        ],
      ),
      LiveQuery(
        query: () => LocalDb.instance.raw('''
          SELECT l.*, e.name AS employee_name FROM leave_requests l LEFT JOIN employees e ON e.id = l.employee_id
           WHERE l.deleted = 0 ORDER BY CASE l.status WHEN 'solicitada' THEN 0 ELSE 1 END, l.date_from DESC LIMIT 300'''),
        builder: (context, rows) {
          final pending = rows.where((r) => r['status'] == 'solicitada').length;
          final now = localToday();
          final away = rows.where((r) => r['status'] == 'aprobada' && asStr(r['date_from']).compareTo(now) <= 0 && asStr(r['date_to']).compareTo(now) >= 0).length;
          return Column(children: [
            KpiGrid(maxColumns: 3, children: [
              KpiCard(icon: LucideIcons.clock, color: Kio.warning, label: 'Por aprobar', value: '$pending'),
              KpiCard(icon: LucideIcons.calendarDays, color: Kio.info, label: 'Ausentes hoy', value: '$away'),
              KpiCard(icon: LucideIcons.userCheck, color: Kio.green, label: 'Solicitudes del año', value: '${rows.where((r) => asStr(r['date_from']).startsWith(now.substring(0, 4))).length}'),
            ]),
            const SizedBox(height: 20),
            KioTableCard(
              title: 'Solicitudes',
              rows: rows,
              columns: [
                KioColumn('Empleado', (r) => NameCell(asStr(r['employee_name'])), flex: 3),
                KioColumn('Tipo', (r) => Text(_types[r['type']] ?? asStr(r['type']))),
                KioColumn('Fechas', (r) => Text('${dateShort(r['date_from'])} → ${dateShort(r['date_to'])}'), flex: 3),
                KioColumn('Días', (r) => Text(qty(r['days'])), numeric: true, flex: 1),
                KioColumn('Estado', (r) => StatusPill.status(asStr(r['status']))),
                KioColumn('', (r) => r['status'] == 'solicitada' && s.isFinance
                    ? Row(mainAxisSize: MainAxisSize.min, children: [
                        IconButton(tooltip: 'Aprobar', onPressed: () => _decide(context, r, true), icon: const Icon(LucideIcons.check, size: 17, color: Kio.green)),
                        IconButton(tooltip: 'Rechazar', onPressed: () => _decide(context, r, false), icon: const Icon(LucideIcons.x, size: 17, color: Kio.danger)),
                      ])
                    : const SizedBox(), numeric: true, flex: 2),
              ],
            ),
          ]);
        },
      ),
    ]);
  }
}

// =============================================================================
// Liquidación de nómina (artix_nomina): borrador → confirmada + desprendible
// =============================================================================

class PayrollPage extends StatefulWidget {
  const PayrollPage({super.key});
  @override
  State<PayrollPage> createState() => _PayrollPageState();
}

class _PayrollPageState extends State<PayrollPage> {
  late String _month = localToday().substring(0, 7);
  String _quincena = '';
  int _tab = 0;

  String get _period => _quincena.isEmpty ? _month : '$_month-$_quincena';

  Future<DbRow?> _params() async {
    final year = int.parse(_month.substring(0, 4));
    final r = await LocalDb.instance.all('payroll_params', where: 'year <= ?', args: [year], orderBy: 'year DESC', limit: 1);
    return r.isEmpty ? null : r.first;
  }

  Future<void> _liquidate() async {
    final s = context.read<Session>();
    final db = LocalDb.instance;
    final params = await _params();
    if (params == null) {
      if (mounted) toast(context, 'Configura los parámetros de nómina del año', error: true);
      return;
    }
    final freq = _quincena.isEmpty ? 'mensual' : 'quincenal';
    final employees = await db.all('employees', where: 'active = 1 AND pay_frequency = ?', args: [freq]);
    if (employees.isEmpty) {
      if (mounted) toast(context, 'No hay empleados activos con pago $freq', error: true);
      return;
    }
    final range = periodRange(_period);
    final rows = <(String, DbRow)>[];
    for (final e in employees) {
      final existing = await db.all('payslips', where: 'employee_id = ? AND period = ?', args: [e['id'], _period], limit: 1);
      if (existing.isNotEmpty && existing.first['status'] == 'confirmada') continue;
      final nov = await db.all('payroll_novelties',
          where: "employee_id = ? AND date >= ? AND date <= ? AND (payslip_id IS NULL OR payslip_id = '')", args: [e['id'], range.from, range.to]);
      final slip = computePayslip(employee: e, params: params, period: _period, novelties: nov);
      rows.add(('payslips', {
        ...slip,
        'id': existing.isEmpty ? newId() : existing.first['id'],
        'number': existing.isEmpty ? await db.nextNumber('NOM', s.terminal) : existing.first['number'],
        'status': 'borrador',
      }));
    }
    await db.saveAll(rows, companyId: s.companyId, userId: s.userId);
    if (mounted) toast(context, '${rows.length} desprendibles liquidados en borrador');
  }

  Future<void> _confirmAll(List<DbRow> slips) async {
    final drafts = slips.where((r) => r['status'] == 'borrador').toList();
    if (drafts.isEmpty) return;
    if (!await confirm(context, 'Confirmar nómina', 'Se confirmarán ${drafts.length} desprendibles del periodo y sus novedades quedarán liquidadas.')) return;
    if (!mounted) return;
    final s = context.read<Session>();
    final db = LocalDb.instance;
    final range = periodRange(_period);
    final rows = <(String, DbRow)>[];
    for (final p in drafts) {
      rows.add(('payslips', {'id': p['id'], 'status': 'confirmada'}));
      for (final n in await db.all('payroll_novelties',
          where: "employee_id = ? AND date >= ? AND date <= ? AND (payslip_id IS NULL OR payslip_id = '')", args: [p['employee_id'], range.from, range.to])) {
        rows.add(('payroll_novelties', {'id': n['id'], 'payslip_id': p['id']}));
      }
    }
    await db.saveAll(rows, companyId: s.companyId, userId: s.userId);
    if (mounted) toast(context, 'Nómina confirmada');
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return PageBody(children: [
      PageHeader(
        title: 'Liquidación de nómina',
        tabs: const ['Periodo', 'Parámetros'],
        tab: _tab,
        onTab: (i) => setState(() => _tab = i),
        actions: _tab == 1
            ? const []
            : [
                _MonthPicker(value: _month, onChanged: (v) => setState(() => _month = v)),
                FilterChipMenu<String>(
                  label: 'Mensual',
                  value: _quincena,
                  options: const {'': 'Mensual', 'Q1': '1.ª quincena', 'Q2': '2.ª quincena'},
                  onSelected: (v) => setState(() => _quincena = v ?? ''),
                ),
                if (s.canWrite('payslips')) FilledButton.icon(onPressed: _liquidate, icon: const Icon(LucideIcons.calculator, size: 16), label: const Text('Liquidar')),
              ],
      ),
      if (_tab == 1) const _ParamsView() else _periodView(s),
    ]);
  }

  Widget _periodView(Session s) => LiveQuery(
        deps: [_period],
        query: () => LocalDb.instance.raw('''
          SELECT p.*, e.name AS employee_name, e.position FROM payslips p LEFT JOIN employees e ON e.id = p.employee_id
           WHERE p.deleted = 0 AND p.period = ? ORDER BY e.name''', [_period]),
        builder: (context, rows) {
          double sum(String k) => rows.fold<double>(0, (a, r) => a + asNum(r[k]));
          final drafts = rows.where((r) => r['status'] == 'borrador').length;
          return Column(children: [
            KpiGrid(children: [
              KpiCard(icon: LucideIcons.banknote, color: Kio.green, label: 'Total devengado', value: money(sum('total_earnings'))),
              KpiCard(icon: LucideIcons.minus, color: Kio.danger, label: 'Deducciones', value: money(sum('total_deductions'))),
              KpiCard(icon: LucideIcons.wallet, color: Kio.navy, label: 'Neto a pagar', value: money(sum('net'))),
              KpiCard(icon: LucideIcons.building2, color: Kio.purple, label: 'Costo empleador (estimado)', value: money(sum('employer_cost'))),
            ]),
            const SizedBox(height: 20),
            KioTableCard(
              title: 'Desprendibles · ${_quincena.isEmpty ? '' : '$_quincena '}${monthLabel(_month)} ${_month.substring(0, 4)}',
              subtitle: drafts > 0 ? '$drafts en borrador: revisa y confirma.' : null,
              trailing: Wrap(spacing: 8, children: [
                OutlinedButton.icon(
                  onPressed: () => exportCsv(context, 'nomina_$_period', rows, const ['number', 'employee_name', 'days', 'basic', 'transport', 'overtime', 'other_earnings', 'health', 'pension', 'solidarity', 'other_deductions', 'net', 'employer_cost', 'status']),
                  icon: const Icon(LucideIcons.download, size: 15),
                  label: const Text('Descargar'),
                ),
                if (drafts > 0 && s.canWrite('payslips')) FilledButton(onPressed: () => _confirmAll(rows), child: const Text('Confirmar nómina')),
              ]),
              rows: rows,
              emptyText: 'Aún no se ha liquidado este periodo',
              onTap: (r) => showDialog(context: context, builder: (_) => PayslipDialog(slip: r)),
              columns: [
                KioColumn('Empleado', (r) => NameCell(asStr(r['employee_name']), subtitle: asStr(r['position'])), flex: 4),
                KioColumn('Días', (r) => Text(qty(r['days'])), numeric: true, flex: 1),
                KioColumn('Devengado', (r) => Text(money(r['total_earnings'])), numeric: true),
                KioColumn('Deducciones', (r) => Text(money(r['total_deductions']), style: const TextStyle(color: Kio.danger)), numeric: true),
                KioColumn('Neto', (r) => Text(money(r['net']), style: const TextStyle(fontWeight: FontWeight.w800, color: Kio.navy)), numeric: true),
                KioColumn('Estado', (r) => StatusPill.status(asStr(r['status']))),
              ],
            ),
          ]);
        },
      );
}

class PayslipDialog extends StatelessWidget {
  const PayslipDialog({super.key, required this.slip});
  final DbRow slip;

  @override
  Widget build(BuildContext context) {
    final s = context.read<Session>();
    Map<String, dynamic> detail = {};
    try {
      detail = jsonDecode(asStr(slip['detail'])) as Map<String, dynamic>;
    } catch (_) {}
    final novs = (detail['novedades'] as List?)?.cast<Map>() ?? const [];
    Widget row(String l, Object? v, {bool neg = false, bool bold = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(children: [
            Expanded(child: Text(l, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w500))),
            Text(neg ? '− ${money(v)}' : money(v), style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600, color: neg ? Kio.danger : Kio.textStrong)),
          ]),
        );
    return AlertDialog(
      title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Desprendible de pago', style: Kio.h2(18)),
        Text('${s.company!.name}${s.company!.nit == null ? '' : ' · NIT ${s.company!.nit}'}', style: Kio.label),
      ]),
      content: SizedBox(
        width: 460,
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
            NameCell(asStr(slip['employee_name']), subtitle: '${asStr(slip['number'])} · ${dateShort(slip['date_from'])} a ${dateShort(slip['date_to'])} · ${qty(slip['days'])} días'),
            const SizedBox(height: 14),
            Text('DEVENGOS', style: Kio.tableHead),
            row('Salario básico', slip['basic']),
            if (asNum(slip['transport']) > 0) row('Auxilio de transporte', slip['transport']),
            if (asNum(slip['overtime']) > 0) row('Horas extra y recargos', slip['overtime']),
            if (asNum(slip['other_earnings']) > 0) row('Otros devengos', slip['other_earnings']),
            row('Total devengado', slip['total_earnings'], bold: true),
            const Divider(height: 22),
            Text('DEDUCCIONES', style: Kio.tableHead),
            row('Salud (4 %)', slip['health'], neg: true),
            row('Pensión (4 %)', slip['pension'], neg: true),
            if (asNum(slip['solidarity']) > 0) row('Fondo de solidaridad pensional', slip['solidarity'], neg: true),
            if (asNum(slip['other_deductions']) > 0) row('Otras deducciones', slip['other_deductions'], neg: true),
            row('Total deducciones', slip['total_deductions'], neg: true, bold: true),
            const Divider(height: 22),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: Kio.brandLight, borderRadius: BorderRadius.circular(12)),
              child: Row(children: [Text('NETO A PAGAR', style: Kio.h2(15)), const Spacer(), Text(money(slip['net']), style: Kio.title(22))]),
            ),
            if (novs.isNotEmpty) ...[
              const SizedBox(height: 14),
              Text('NOVEDADES', style: Kio.tableHead),
              for (final n in novs) Text('• ${n['concepto']}${n['cantidad'] != null ? ' (${qty(n['cantidad'])})' : ''}: ${money(n['valor'])}', style: Kio.small),
            ],
            const SizedBox(height: 12),
            Text('IBC ${money(detail['ibc'])} · valor hora ${money(detail['valor_hora'])}. Cálculo simplificado; no reemplaza la nómina electrónica DIAN.', style: Kio.small),
          ]),
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cerrar'))],
    );
  }
}

class _ParamsView extends StatelessWidget {
  const _ParamsView();

  static const _fields = [
    FieldSpec('year', 'Año', type: FieldType.integer, required: true),
    FieldSpec('smmlv', 'Salario mínimo (SMMLV)', type: FieldType.money, required: true),
    FieldSpec('transport_aid', 'Auxilio de transporte', type: FieldType.money, required: true),
    FieldSpec('uvt', 'UVT', type: FieldType.money),
    FieldSpec('health_pct', 'Salud empleado', type: FieldType.percent, defaultValue: 0.04),
    FieldSpec('pension_pct', 'Pensión empleado', type: FieldType.percent, defaultValue: 0.04),
    FieldSpec('hours_divisor', 'Horas mensuales (divisor valor hora)', type: FieldType.number, defaultValue: 210),
    FieldSpec('sunday_surcharge', 'Recargo dominical/festivo', type: FieldType.percent, defaultValue: 0.9),
    FieldSpec('notes', 'Fuente / notas', type: FieldType.multiline),
  ];

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return LiveQuery(
      query: () => LocalDb.instance.all('payroll_params', orderBy: 'year DESC'),
      builder: (context, rows) => KioTableCard(
        title: 'Parámetros anuales',
        subtitle: 'Valores legales usados en la liquidación. Verifícalos con los decretos vigentes.',
        trailing: s.canWrite('payroll_params')
            ? FilledButton.icon(
                onPressed: () {
                  final year = DateTime.now().year + (rows.any((r) => asNum(r['year']) == DateTime.now().year) ? 1 : 0);
                  final base = rows.isEmpty ? <String, Object?>{} : Map<String, Object?>.from(rows.first);
                  base.removeWhere((k, _) => !_fields.any((f) => f.key == k));
                  showEntityForm(context, table: 'payroll_params', title: 'Parámetros $year', fields: _fields, initial: {...base, 'year': year}, extra: {
                    // id determinista por año y empresa (igual que el servidor): evita duplicados entre equipos
                    'id': 'pp-$year-${s.companyId}',
                  }).ignore();
                },
                icon: const Icon(LucideIcons.plus, size: 16),
                label: const Text('Nuevo año'),
              )
            : null,
        rows: rows,
        onTap: s.canWrite('payroll_params') ? (r) => showEntityForm(context, table: 'payroll_params', title: 'Parámetros ${r['year']}', fields: _fields, initial: r) : null,
        columns: [
          KioColumn('Año', (r) => Text('${r['year']}', style: const TextStyle(fontWeight: FontWeight.w800))),
          KioColumn('SMMLV', (r) => Text(money(r['smmlv'])), numeric: true),
          KioColumn('Aux. transporte', (r) => Text(money(r['transport_aid'])), numeric: true),
          KioColumn('UVT', (r) => Text(money(r['uvt'])), numeric: true),
          KioColumn('Horas/mes', (r) => Text(qty(r['hours_divisor'])), numeric: true),
          KioColumn('Recargo dominical', (r) => Text(pct(r['sunday_surcharge'])), numeric: true),
        ],
      ),
    );
  }
}
