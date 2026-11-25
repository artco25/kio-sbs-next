import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../data/local_db.dart';
import '../services/business.dart';
import '../services/graphql.dart';
import '../services/session.dart';
import '../theme/kio_theme.dart';
import '../ui/entity_form.dart';
import '../ui/format.dart';
import '../ui/shell.dart';
import '../ui/widgets.dart';
import 'comercial_pages.dart';
import 'csv_export.dart';

// =============================================================================
// Recibos de caja (artix_tesoreria / artix_cartera)
// =============================================================================

class PaymentsPage extends StatefulWidget {
  const PaymentsPage({super.key});
  @override
  State<PaymentsPage> createState() => _PaymentsPageState();
}

class _PaymentsPageState extends State<PaymentsPage> {
  String? _kind;
  String? _method;
  int _days = 30;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return PageBody(children: [
      PageHeader(
        title: 'Recibos de caja',
        subtitle: 'Cobros de ventas de contado y abonos a cartera.',
        actions: [
          if (s.canWrite('payments'))
            FilledButton.icon(onPressed: () => showReceiptDialog(context), icon: const Icon(LucideIcons.plus, size: 16), label: const Text('Registrar abono')),
        ],
      ),
      LiveQuery(
        deps: [_kind, _method, _days],
        query: () {
          final args = <Object?>[ymd(DateTime.now().subtract(Duration(days: _days)))];
          var where = 'x.deleted = 0 AND x.date >= ?';
          if (_kind != null) {
            where += ' AND x.kind = ?';
            args.add(_kind);
          }
          if (_method != null) {
            where += ' AND x.method = ?';
            args.add(_method);
          }
          return LocalDb.instance.raw('''
            SELECT x.*, p.name AS partner_name, s.number AS sale_number FROM payments x
              LEFT JOIN partners p ON p.id = x.partner_id LEFT JOIN sales s ON s.id = x.sale_id
             WHERE $where ORDER BY x.date DESC LIMIT 500''', args);
        },
        builder: (context, rows) {
          final byMethod = <String, double>{};
          for (final r in rows) {
            byMethod[asStr(r['method'])] = (byMethod[asStr(r['method'])] ?? 0) + asNum(r['amount']);
          }
          final total = byMethod.values.fold<double>(0, (a, b) => a + b);
          return Column(children: [
            KpiGrid(children: [
              KpiCard(icon: LucideIcons.receiptText, color: Kio.navy, label: 'Recaudo del periodo', value: money(total)),
              for (final e in byMethod.entries.take(3))
                KpiCard(icon: e.key == 'efectivo' ? LucideIcons.banknote : LucideIcons.creditCard, color: Kio.info, label: kPayMethods[e.key] ?? e.key, value: money(e.value)),
            ]),
            const SizedBox(height: 20),
            KioTableCard(
              title: 'Recibos',
              trailing: OutlinedButton.icon(
                onPressed: () => exportCsv(context, 'recibos', rows, const ['number', 'date', 'kind', 'partner_name', 'sale_number', 'method', 'amount', 'reference']),
                icon: const Icon(LucideIcons.download, size: 15),
                label: const Text('Descargar todo'),
              ),
              toolbar: [
                FilterChipMenu<int>(label: 'Periodo', value: _days, options: const {7: 'Últimos 7 días', 30: 'Últimos 30 días', 90: 'Últimos 90 días', 365: 'Último año'}, onSelected: (v) => setState(() => _days = v ?? 30)),
                FilterChipMenu<String>(label: 'Todos los tipos', value: _kind, options: const {null: 'Todos los tipos', 'venta': 'Venta de contado', 'abono': 'Abono a cartera'}, onSelected: (v) => setState(() => _kind = v)),
                FilterChipMenu<String>(label: 'Todos los medios', value: _method, options: {null: 'Todos los medios', ...kPayMethods}, onSelected: (v) => setState(() => _method = v)),
              ],
              rows: rows,
              columns: [
                KioColumn('Recibo', (r) => Text(asStr(r['number']), style: const TextStyle(fontWeight: FontWeight.w700))),
                KioColumn('Fecha', (r) => Text(dateTime(r['date']))),
                KioColumn('Cliente', (r) => r['partner_name'] == null ? const Text('Consumidor final', style: Kio.label) : NameCell(asStr(r['partner_name'])), flex: 3),
                KioColumn('Documento', (r) => Text(asStr(r['sale_number']))),
                KioColumn('Tipo', (r) => StatusPill(r['kind'] == 'abono' ? 'Abono' : 'Venta', color: r['kind'] == 'abono' ? Kio.info : Kio.green)),
                KioColumn('Medio', (r) => Text(kPayMethods[r['method']] ?? asStr(r['method']))),
                KioColumn('Valor', (r) => Text(money(r['amount']), style: const TextStyle(fontWeight: FontWeight.w700)), numeric: true),
              ],
            ),
          ]);
        },
      ),
    ]);
  }
}

// =============================================================================
// Caja menor y gastos (artix_caja_menor): borrador → enviada → aprobada/rechazada
// =============================================================================

const kExpenseCategories = {
  'transporte': 'Transporte y viáticos',
  'papeleria': 'Papelería',
  'aseo': 'Aseo y cafetería',
  'mantenimiento': 'Mantenimiento',
  'servicios': 'Servicios públicos',
  'compras': 'Compras menores',
  'otros': 'Otros',
};

class ExpensesPage extends StatefulWidget {
  const ExpensesPage({super.key});
  @override
  State<ExpensesPage> createState() => _ExpensesPageState();
}

class _ExpensesPageState extends State<ExpensesPage> {
  String? _status;

  List<FieldSpec> get _fields => const [
        FieldSpec('concept', 'Concepto', required: true, full: true),
        FieldSpec('date', 'Fecha', type: FieldType.date, required: true),
        FieldSpec('category', 'Categoría', type: FieldType.select, options: kExpenseCategories, defaultValue: 'otros'),
        FieldSpec('amount', 'Valor', type: FieldType.money, required: true),
        FieldSpec('tax', 'IVA incluido', type: FieldType.money),
        FieldSpec('partner_id', 'Proveedor', type: FieldType.ref, refTable: 'partners', refWhere: 'is_supplier = 1'),
        FieldSpec('receipt_ref', 'N.º de factura o recibo'),
        FieldSpec('notes', 'Notas', type: FieldType.multiline),
      ];

  Future<void> _edit([DbRow? r]) async {
    final s = context.read<Session>();
    if (r != null && !['borrador', null].contains(r['status'])) {
      await _detail(r);
      return;
    }
    final session = await Biz(s).openSession();
    final number = r == null ? await LocalDb.instance.nextNumber('CM', s.terminal) : null;
    if (!mounted) return;
    await showEntityForm(
      context,
      table: 'expenses',
      title: r == null ? 'Nuevo gasto' : asStr(r['concept']),
      fields: _fields,
      initial: r ?? {'date': localToday()},
      extra: r == null
          ? {'status': 'borrador', 'requested_by': s.userId, 'number': number, 'pos_session_id': session?['id']}
          : const {},
    );
  }

  Future<void> _setStatus(DbRow r, String status) async {
    final s = context.read<Session>();
    final approving = status == 'aprobada' || status == 'rechazada';
    if (approving) {
      // La aprobación va por la API (queda auditada en el servidor); si no hay internet se hace localmente.
      try {
        await s.api.run(r'mutation($id:ID!,$a:Boolean!){ approveExpense(id:$id, approve:$a){ id } }', {'id': r['id'], 'a': status == 'aprobada'});
        await LocalDb.instance.save('expenses', {'id': r['id'], 'status': status, 'approved_by': s.userId, 'approved_at': isoNow()}, companyId: s.companyId, userId: s.userId);
        if (mounted) toast(context, 'Gasto ${status == 'aprobada' ? 'aprobado' : 'rechazado'}');
        return;
      } on GqlException catch (e) {
        if (!e.offline && e.code != 'NOT_FOUND') {
          if (mounted) toast(context, e.message, error: true);
          return;
        }
      }
      await LocalDb.instance.save('expenses', {'id': r['id'], 'status': status, 'approved_by': s.userId, 'approved_at': isoNow()}, companyId: s.companyId, userId: s.userId);
    } else {
      await LocalDb.instance.save('expenses', {'id': r['id'], 'status': status}, companyId: s.companyId, userId: s.userId);
    }
    if (mounted) toast(context, 'Gasto ${status == 'enviada' ? 'enviado a aprobación' : status}');
  }

  Future<void> _detail(DbRow r) => showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(asStr(r['concept']), style: Kio.h2(18)),
          content: SizedBox(
            width: 380,
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              StatusPill.status(asStr(r['status'])),
              const SizedBox(height: 12),
              Text('${asStr(r['number'])} · ${dateShort(r['date'])}', style: Kio.label),
              Text(kExpenseCategories[r['category']] ?? asStr(r['category'])),
              const SizedBox(height: 8),
              Text(money(r['amount']), style: Kio.title(24)),
              if (asStr(r['notes']).isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(asStr(r['notes']))),
            ]),
          ),
          actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cerrar'))],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return PageBody(children: [
      PageHeader(
        title: 'Caja menor y gastos',
        subtitle: 'Registra el gasto en el sitio; el administrador o contador lo aprueba.',
        actions: [if (s.canWrite('expenses')) FilledButton.icon(onPressed: _edit, icon: const Icon(LucideIcons.plus, size: 16), label: const Text('Nuevo gasto'))],
      ),
      LiveQuery(
        deps: [_status],
        query: () async {
          final rows = await LocalDb.instance.raw('''
            SELECT e.*, p.name AS partner_name FROM expenses e LEFT JOIN partners p ON p.id = e.partner_id
             WHERE e.deleted = 0 ${_status == null ? '' : 'AND e.status = ?'} ORDER BY e.date DESC, e.created_at DESC LIMIT 500''', _status == null ? [] : [_status]);
          final sums = await LocalDb.instance.raw("SELECT status, SUM(amount) a, COUNT(*) n FROM expenses WHERE deleted = 0 AND date >= ? GROUP BY status", ['${localToday().substring(0, 7)}-01']);
          return (rows: rows, sums: {for (final r in sums) asStr(r['status']): (asNum(r['a']).toDouble(), asNum(r['n']).toInt())});
        },
        builder: (context, d) => Column(children: [
          KpiGrid(children: [
            KpiCard(icon: LucideIcons.wallet, color: Kio.purple, label: 'Aprobado este mes', value: money(d.sums['aprobada']?.$1 ?? 0)),
            KpiCard(icon: LucideIcons.clock, color: Kio.warning, label: 'Por aprobar', value: money(d.sums['enviada']?.$1 ?? 0), hint: '${d.sums['enviada']?.$2 ?? 0} solicitudes'),
            KpiCard(icon: LucideIcons.fileText, color: Kio.muted, label: 'En borrador', value: money(d.sums['borrador']?.$1 ?? 0)),
            KpiCard(icon: LucideIcons.x, color: Kio.danger, label: 'Rechazado', value: money(d.sums['rechazada']?.$1 ?? 0)),
          ]),
          const SizedBox(height: 20),
          KioTableCard(
            title: 'Gastos',
            toolbar: [
              FilterChipMenu<String>(
                label: 'Todos los estados',
                value: _status,
                options: const {null: 'Todos los estados', 'borrador': 'Borrador', 'enviada': 'Enviada', 'aprobada': 'Aprobada', 'rechazada': 'Rechazada'},
                onSelected: (v) => setState(() => _status = v),
              ),
            ],
            trailing: OutlinedButton.icon(
              onPressed: () => exportCsv(context, 'gastos', d.rows, const ['number', 'date', 'concept', 'category', 'partner_name', 'amount', 'status']),
              icon: const Icon(LucideIcons.download, size: 15),
              label: const Text('Descargar todo'),
            ),
            rows: d.rows,
            onTap: _edit,
            columns: [
              KioColumn('Gasto', (r) => NameCell(asStr(r['concept']), subtitle: '${asStr(r['number'])} · ${kExpenseCategories[r['category']] ?? ''}', avatar: false), flex: 4),
              KioColumn('Fecha', (r) => Text(dateShort(r['date']))),
              KioColumn('Proveedor', (r) => Text(asStr(r['partner_name']).isEmpty ? '—' : asStr(r['partner_name']))),
              KioColumn('Valor', (r) => Text(money(r['amount']), style: const TextStyle(fontWeight: FontWeight.w700)), numeric: true),
              KioColumn('Estado', (r) => StatusPill.status(asStr(r['status']))),
              KioColumn('', (r) {
                final st = r['status'];
                if (st == 'borrador' && s.canWrite('expenses')) {
                  return TextButton(onPressed: () => _setStatus(r, 'enviada'), child: const Text('Enviar'));
                }
                if (st == 'enviada' && s.isFinance) {
                  return Row(mainAxisSize: MainAxisSize.min, children: [
                    IconButton(tooltip: 'Aprobar', onPressed: () => _setStatus(r, 'aprobada'), icon: const Icon(LucideIcons.check, size: 17, color: Kio.green)),
                    IconButton(tooltip: 'Rechazar', onPressed: () => _setStatus(r, 'rechazada'), icon: const Icon(LucideIcons.x, size: 17, color: Kio.danger)),
                  ]);
                }
                return const SizedBox();
              }, numeric: true, flex: 2),
            ],
          ),
        ]),
      ),
    ]);
  }
}

// =============================================================================
// Informes (artix_informes): ventas, cartera por edades, gastos y estado de resultados
// =============================================================================

class ReportsPage extends StatefulWidget {
  const ReportsPage({super.key});
  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends State<ReportsPage> {
  int _tab = 0;
  late String _month = localToday().substring(0, 7);

  List<String> get _months {
    final now = DateTime.now();
    return [for (var i = 0; i < 12; i++) DateTime(now.year, now.month - i, 1).toIso8601String().substring(0, 7)];
  }

  @override
  Widget build(BuildContext context) {
    return PageBody(children: [
      PageHeader(
        title: 'Informes',
        tabs: const ['Estado de resultados', 'Ventas por día', 'Gastos por categoría'],
        tab: _tab,
        onTab: (i) => setState(() => _tab = i),
        actions: [
          FilterChipMenu<String>(
            label: 'Mes',
            value: _month,
            options: {for (final m in _months) m: '${monthLabel(m)} ${m.substring(0, 4)}'},
            onSelected: (v) => setState(() => _month = v ?? _month),
          ),
        ],
      ),
      LiveQuery(
        deps: [_tab, _month],
        query: () => _load(),
        builder: (context, d) => switch (_tab) {
          0 => _pnl(d),
          1 => _daily(d),
          _ => _byCategory(d),
        },
      ),
    ]);
  }

  Future<Map<String, Object>> _load() async {
    final db = LocalDb.instance;
    final from = '$_month-01';
    final next = DateTime.parse(from);
    final to = ymd(DateTime(next.year, next.month + 1, 1));
    final sales = await db.raw("SELECT COALESCE(SUM(subtotal),0) sub, COALESCE(SUM(tax_total),0) tax, COALESCE(SUM(total),0) tot, COUNT(*) n FROM sales WHERE deleted=0 AND status='confirmada' AND date >= ? AND date < ?", [from, to]);
    final cost = await db.scalar('''
      SELECT COALESCE(SUM(l.qty * p.cost),0) FROM sale_lines l JOIN sales s ON s.id = l.sale_id LEFT JOIN products p ON p.id = l.product_id
       WHERE l.deleted=0 AND s.deleted=0 AND s.status='confirmada' AND s.date >= ? AND s.date < ?''', [from, to]);
    final exp = await db.raw("SELECT category, COALESCE(SUM(amount),0) a FROM expenses WHERE deleted=0 AND status='aprobada' AND date >= ? AND date < ? GROUP BY category ORDER BY a DESC", [from, to]);
    final payroll = await db.scalar("SELECT COALESCE(SUM(employer_cost),0) FROM payslips WHERE deleted=0 AND status='confirmada' AND period LIKE ?", ['$_month%']);
    final daily = await db.raw("SELECT substr(date,1,10) d, SUM(total) t, COUNT(*) n FROM sales WHERE deleted=0 AND status='confirmada' AND date >= ? AND date < ? GROUP BY d ORDER BY d", [from, to]);
    return {'sales': sales.first, 'cost': cost.toDouble(), 'exp': exp, 'payroll': payroll.toDouble(), 'daily': daily};
  }

  Widget _pnl(Map<String, Object> d) {
    final sales = d['sales'] as DbRow;
    final income = asNum(sales['sub']).toDouble();
    final cost = d['cost'] as double;
    final exp = (d['exp'] as List<DbRow>).fold<double>(0, (a, r) => a + asNum(r['a']));
    final payroll = d['payroll'] as double;
    final gross = income - cost;
    final net = gross - exp - payroll;
    Widget line(String l, double v, {bool strong = false, bool neg = false, int indent = 0}) => Container(
          padding: EdgeInsets.fromLTRB(20.0 + indent * 18, 12, 20, 12),
          decoration: BoxDecoration(color: strong ? Kio.brandLight : null, border: const Border(bottom: BorderSide(color: Kio.border))),
          child: Row(children: [
            Expanded(child: Text(l, style: TextStyle(fontWeight: strong ? FontWeight.w800 : FontWeight.w500))),
            Text(neg ? '(${money(v)})' : money(v), style: TextStyle(fontWeight: strong ? FontWeight.w800 : FontWeight.w600, color: v < 0 ? Kio.danger : Kio.textStrong)),
          ]),
        );
    return Column(children: [
      KpiGrid(children: [
        KpiCard(icon: LucideIcons.trendingUp, color: Kio.green, label: 'Ingresos (sin IVA)', value: money(income)),
        KpiCard(icon: LucideIcons.package, color: Kio.warning, label: 'Costo de ventas', value: money(cost)),
        KpiCard(icon: LucideIcons.piggyBank, color: net >= 0 ? Kio.green : Kio.danger, label: 'Resultado del mes', value: money(net)),
        KpiCard(icon: LucideIcons.receipt, color: Kio.info, label: 'IVA generado', value: money(sales['tax'])),
      ]),
      const SizedBox(height: 20),
      KioCard(
        padding: EdgeInsets.zero,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(padding: const EdgeInsets.all(20), child: Text('Estado de resultados simplificado · ${monthLabel(_month)} ${_month.substring(0, 4)}', style: Kio.h2())),
          const Divider(),
          line('Ingresos por ventas', income),
          line('Costo de la mercancía vendida', cost, neg: true),
          line('Utilidad bruta', gross, strong: true),
          for (final r in d['exp'] as List<DbRow>) line(kExpenseCategories[r['category']] ?? asStr(r['category']), asNum(r['a']).toDouble(), neg: true, indent: 1),
          line('Gastos operacionales', exp, neg: true),
          line('Nómina (costo empleador)', payroll, neg: true),
          line('Resultado operacional', net, strong: true),
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Informe de gestión calculado con los datos de este equipo. No reemplaza los estados financieros bajo NIIF.', style: Kio.small),
          ),
        ]),
      ),
    ]);
  }

  Widget _daily(Map<String, Object> d) {
    final rows = d['daily'] as List<DbRow>;
    return Column(children: [
      KioCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Ventas por día', style: Kio.h2()),
          const SizedBox(height: 16),
          if (rows.isEmpty) const Text('Sin ventas en el mes', style: Kio.label) else BarChart(labels: [for (final r in rows) asStr(r['d']).substring(8)], series: [BarSeries('Ventas', Kio.navy, [for (final r in rows) asNum(r['t'])])]),
        ]),
      ),
      const SizedBox(height: 16),
      KioTableCard(
        title: 'Detalle diario',
        trailing: OutlinedButton.icon(onPressed: () => exportCsv(context, 'ventas_dia_$_month', rows, const ['d', 'n', 't']), icon: const Icon(LucideIcons.download, size: 15), label: const Text('Descargar')),
        rows: rows,
        columns: [
          KioColumn('Día', (r) => Text(dateShort(r['d']))),
          KioColumn('Transacciones', (r) => Text(qty(r['n'])), numeric: true),
          KioColumn('Total', (r) => Text(money(r['t']), style: const TextStyle(fontWeight: FontWeight.w700)), numeric: true),
        ],
      ),
    ]);
  }

  Widget _byCategory(Map<String, Object> d) {
    final rows = d['exp'] as List<DbRow>;
    final maxV = rows.isEmpty ? 0 : asNum(rows.first['a']);
    return KioCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Gastos aprobados por categoría', style: Kio.h2()),
        const SizedBox(height: 12),
        if (rows.isEmpty) const Text('Sin gastos aprobados en el mes', style: Kio.label),
        for (final r in rows) RankBar(label: kExpenseCategories[r['category']] ?? asStr(r['category']), value: asNum(r['a']), max: maxV, color: Kio.purple),
      ]),
    );
  }
}
