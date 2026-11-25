import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../data/local_db.dart';
import '../services/business.dart';
import '../services/session.dart';
import '../theme/kio_theme.dart';
import '../ui/format.dart';
import '../ui/shell.dart';
import '../ui/widgets.dart';

class DashData {
  double sales = 0, salesPrev = 0, ticket = 0, ticketPrev = 0, receivable = 0, overdue = 0, expenses = 0, expensesPrev = 0;
  int count = 0, countPrev = 0, pendingApprovals = 0;
  List<String> months = [];
  List<double> monthSales = [], monthExpenses = [];
  Map<String, double> aging = {};
  List<DbRow> top = [], lowStock = [];
}

/// Panel KIO SBS: todo se calcula sobre la SQLite local, así funciona sin internet.
Future<DashData> loadDashboard(Session s, int periodDays) async {
  final db = LocalDb.instance;
  final d = DashData();
  final now = DateTime.now();
  final from = ymd(now.subtract(Duration(days: periodDays - 1)));
  final prevFrom = ymd(now.subtract(Duration(days: periodDays * 2 - 1)));
  final end = ymd(now.add(const Duration(days: 1)));

  Future<(double, int)> salesIn(String a, String b) async {
    final r = await db.raw("SELECT COALESCE(SUM(total),0) t, COUNT(*) n FROM sales WHERE deleted=0 AND status='confirmada' AND date >= ? AND date < ?", [a, b]);
    return (asNum(r.first['t']).toDouble(), asNum(r.first['n']).toInt());
  }

  final cur = await salesIn(from, end);
  final prev = await salesIn(prevFrom, from);
  d.sales = cur.$1;
  d.count = cur.$2;
  d.salesPrev = prev.$1;
  d.countPrev = prev.$2;
  d.ticket = d.count == 0 ? 0 : d.sales / d.count;
  d.ticketPrev = d.countPrev == 0 ? 0 : d.salesPrev / d.countPrev;

  Future<double> expIn(String a, String b) async => (await db.scalar(
          "SELECT COALESCE(SUM(amount),0) FROM expenses WHERE deleted=0 AND status='aprobada' AND date >= ? AND date < ?", [a, b]))
      .toDouble();
  d.expenses = await expIn(from, end);
  d.expensesPrev = await expIn(prevFrom, from);

  // Cartera por edades
  final today = localToday();
  d.aging = {'Corriente': 0, '1-30': 0, '31-60': 0, '61-90': 0, '+90': 0};
  for (final r in await db.raw('SELECT balance, due_date FROM (${Biz.receivablesSql}) WHERE balance > 0.5')) {
    final b = asNum(r['balance']).toDouble();
    final due = DateTime.tryParse(asStr(r['due_date']));
    d.receivable += b;
    if (due == null || asStr(r['due_date']).compareTo(today) >= 0) {
      d.aging['Corriente'] = d.aging['Corriente']! + b;
      continue;
    }
    d.overdue += b;
    final days = DateTime.parse(today).difference(due).inDays;
    final k = days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '+90';
    d.aging[k] = d.aging[k]! + b;
  }

  // 12 meses
  for (var i = 11; i >= 0; i--) {
    d.months.add(DateTime(now.year, now.month - i, 1).toIso8601String().substring(0, 7));
  }
  final ms = {
    for (final r in await db.raw(
        "SELECT substr(date,1,7) m, SUM(total) t FROM sales WHERE deleted=0 AND status='confirmada' AND date >= ? GROUP BY m", ['${d.months.first}-01']))
      asStr(r['m']): asNum(r['t']).toDouble(),
  };
  final me = {
    for (final r in await db.raw(
        "SELECT substr(date,1,7) m, SUM(amount) t FROM expenses WHERE deleted=0 AND status='aprobada' AND date >= ? GROUP BY m", ['${d.months.first}-01']))
      asStr(r['m']): asNum(r['t']).toDouble(),
  };
  d.monthSales = [for (final m in d.months) ms[m] ?? 0];
  d.monthExpenses = [for (final m in d.months) me[m] ?? 0];

  d.top = await db.raw('''
    SELECT l.name, SUM(l.qty) qty, SUM(l.total) total FROM sale_lines l JOIN sales s ON s.id = l.sale_id
     WHERE l.deleted=0 AND s.deleted=0 AND s.status='confirmada' AND s.date >= ? GROUP BY l.product_id, l.name ORDER BY total DESC LIMIT 5''', [from]);
  d.lowStock = await db.raw('''
    SELECT p.name, p.min_stock, COALESCE((SELECT SUM(qty) FROM stock_moves m WHERE m.product_id = p.id AND m.deleted=0),0) stock
      FROM products p WHERE p.deleted=0 AND p.track_stock=1 AND p.active=1
     GROUP BY p.id HAVING stock <= p.min_stock ORDER BY stock LIMIT 6''');
  if (s.isFinance) {
    d.pendingApprovals = (await db.scalar("SELECT COUNT(*) FROM expenses WHERE deleted=0 AND status='enviada'")).toInt() +
        (s.canRead('leave_requests') ? (await db.scalar("SELECT COUNT(*) FROM leave_requests WHERE deleted=0 AND status='solicitada'")).toInt() : 0);
  }
  return d;
}

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  int _tab = 0;
  int _days = 30;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return PageBody(children: [
      PageHeader(
        title: 'Hola, ${s.user!.name.split(' ').first}',
        subtitle: '${s.company!.name} · ${s.user!.roleLabel}',
        tabs: const ['Resumen', 'Gráfico'],
        tab: _tab,
        onTab: (i) => setState(() => _tab = i),
        actions: [
          FilterChipMenu<int>(
            label: 'Periodo',
            value: _days,
            options: const {7: 'Últimos 7 días', 30: 'Últimos 30 días', 90: 'Últimos 90 días', 365: 'Último año'},
            onSelected: (v) => setState(() => _days = v ?? 30),
          ),
        ],
      ),
      LiveQuery<DashData>(
        deps: [_days],
        query: () => loadDashboard(s, _days),
        builder: (context, d) => _tab == 0 ? _summary(d) : _charts(d),
      ),
    ]);
  }

  Widget _summary(DashData d) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      KpiGrid(children: [
        KpiCard(icon: LucideIcons.trendingUp, color: Kio.green, label: 'Ventas', value: money(d.sales), change: delta(d.sales, d.salesPrev)),
        KpiCard(icon: LucideIcons.receipt, color: Kio.info, label: 'Número de ventas', value: qty(d.count), change: delta(d.count, d.countPrev)),
        KpiCard(icon: LucideIcons.tag, color: Kio.purple, label: 'Ticket medio', value: money(d.ticket), change: delta(d.ticket, d.ticketPrev)),
        KpiCard(icon: LucideIcons.handCoins, color: d.overdue > 0 ? Kio.danger : Kio.navy, label: 'Cartera por cobrar', value: money(d.receivable), hint: 'Vencida: ${money(d.overdue)}'),
      ]),
      const SizedBox(height: 16),
      KpiGrid(maxColumns: 4, children: [
        KpiCard(icon: LucideIcons.wallet, color: Kio.warning, label: 'Gastos aprobados', value: money(d.expenses), change: delta(d.expenses, d.expensesPrev)),
        KpiCard(icon: LucideIcons.piggyBank, color: Kio.green, label: 'Resultado (ventas − gastos)', value: money(d.sales - d.expenses)),
        if (d.pendingApprovals > 0)
          KpiCard(icon: LucideIcons.listChecks, color: Kio.danger, label: 'Aprobaciones pendientes', value: '${d.pendingApprovals}', hint: 'Gastos y solicitudes'),
        KpiCard(icon: LucideIcons.package, color: d.lowStock.isEmpty ? Kio.green : Kio.warning, label: 'Productos con stock bajo', value: '${d.lowStock.length}'),
      ]),
      const SizedBox(height: 20),
      LayoutBuilder(builder: (context, c) {
        final wide = c.maxWidth > 980;
        final chart = KioCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Ingresos de 12 meses', style: Kio.h2()),
            const SizedBox(height: 4),
            const Text('Ventas confirmadas frente a gastos aprobados', style: Kio.label),
            const SizedBox(height: 18),
            BarChart(
              labels: [for (final m in d.months) monthLabel(m)],
              series: [BarSeries('Ventas', Kio.navy, d.monthSales), BarSeries('Gastos', Kio.cyan, d.monthExpenses)],
            ),
          ]),
        );
        final aging = _agingCard(d);
        return wide
            ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(flex: 3, child: chart), const SizedBox(width: 16), Expanded(flex: 2, child: aging)])
            : Column(children: [chart, const SizedBox(height: 16), aging]);
      }),
      const SizedBox(height: 16),
      LayoutBuilder(builder: (context, c) {
        final wide = c.maxWidth > 980;
        final top = KioCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Productos más vendidos', style: Kio.h2()),
            const SizedBox(height: 10),
            if (d.top.isEmpty) const Text('Aún no hay ventas en el periodo', style: Kio.label),
            for (final t in d.top)
              RankBar(label: asStr(t['name']), value: asNum(t['total']), max: asNum(d.top.first['total']), color: Kio.green, trailing: '${qty(t['qty'])} · ${money(t['total'])}'),
          ]),
        );
        final low = KioCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Stock bajo', style: Kio.h2()),
            const SizedBox(height: 10),
            if (d.lowStock.isEmpty) const Text('Todo el inventario está sobre el mínimo', style: Kio.label),
            for (final p in d.lowStock)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(children: [
                  const IconTile(LucideIcons.package, color: Kio.warning, size: 30),
                  const SizedBox(width: 12),
                  Expanded(child: Text(asStr(p['name']), style: const TextStyle(fontWeight: FontWeight.w600))),
                  StatusPill('${qty(p['stock'])} / mín. ${qty(p['min_stock'])}', color: asNum(p['stock']) <= 0 ? Kio.danger : Kio.warning),
                ]),
              ),
          ]),
        );
        return wide
            ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: top), const SizedBox(width: 16), Expanded(child: low)])
            : Column(children: [top, const SizedBox(height: 16), low]);
      }),
    ]);
  }

  Widget _agingCard(DashData d) {
    final maxV = d.aging.values.fold<double>(0, (a, b) => a > b ? a : b);
    const colors = {'Corriente': Kio.green, '1-30': Kio.info, '31-60': Kio.warning, '61-90': Color(0xFFE07A3C), '+90': Kio.danger};
    return KioCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Cartera por edades', style: Kio.h2()),
        const SizedBox(height: 4),
        Text('Total por cobrar ${money(d.receivable)}', style: Kio.label),
        const SizedBox(height: 10),
        for (final e in d.aging.entries) RankBar(label: e.key == 'Corriente' ? 'Corriente' : '${e.key} días', value: e.value, max: maxV, color: colors[e.key]!),
      ]),
    );
  }

  Widget _charts(DashData d) => KioCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Ventas y gastos por mes', style: Kio.h2()),
          const SizedBox(height: 18),
          BarChart(
            height: 360,
            labels: [for (final m in d.months) monthLabel(m)],
            series: [BarSeries('Ventas', Kio.navy, d.monthSales), BarSeries('Gastos', Kio.cyan, d.monthExpenses)],
          ),
        ]),
      );
}
