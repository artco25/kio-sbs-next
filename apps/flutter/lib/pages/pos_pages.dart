import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../data/local_db.dart';
import '../services/business.dart';
import '../services/session.dart';
import '../services/sync_service.dart';
import '../services/updater.dart';
import '../theme/kio_theme.dart';
import '../ui/format.dart';
import '../ui/shell.dart';
import '../ui/widgets.dart';

/// Venta en curso dentro de una pestaña: cada cliente/turno conserva su carrito.
class _SaleTicket {
  _SaleTicket(this.label);
  final String label;
  final List<CartLine> cart = <CartLine>[];
  String? partnerId;
  String? partnerName;
  bool kitchen = false;
  final TextEditingController table = TextEditingController();

  void reset() {
    cart.clear();
    partnerId = null;
    partnerName = null;
    kitchen = false;
    table.clear();
  }
}

// =============================================================================
// Caja POS (artix_pos): apertura, venta rápida, cobro y cierre con arqueo
// =============================================================================

class PosPage extends StatefulWidget {
  const PosPage({super.key});
  @override
  State<PosPage> createState() => _PosPageState();
}

class _PosPageState extends State<PosPage> {
  final List<_SaleTicket> _tickets = [_SaleTicket('Venta 1')];
  int _activeTicket = 0;
  int _ticketSeq = 1;
  String? _cat;
  String _q = '';
  final _partnerSearch = TextEditingController();
  final _scan = TextEditingController();
  final _scanFocus = FocusNode();
  bool _dark = false;

  PosPal get pal => _dark ? PosPal.darkPal : PosPal.light;
  ThemeData get _posTheme => _dark ? Kio.posTheme() : Kio.theme().copyWith(scaffoldBackgroundColor: PosPal.light.bg);

  @override
  void initState() {
    super.initState();
    unawaited(LocalDb.instance.getMeta('ui:pos_dark').then((v) {
      if (mounted && v == '1') setState(() => _dark = true);
    }));
  }

  void _toggleDark() {
    setState(() => _dark = !_dark);
    unawaited(LocalDb.instance.setMeta('ui:pos_dark', _dark ? '1' : '0'));
  }

  _SaleTicket get _ticket => _tickets[_activeTicket];
  List<CartLine> get _cart => _ticket.cart;
  String? get _partnerId => _ticket.partnerId;
  bool get _kitchen => _ticket.kitchen;
  TextEditingController get _table => _ticket.table;

  Biz get _biz => Biz(context.read<Session>());

  @override
  void dispose() {
    for (final t in _tickets) {
      t.table.dispose();
    }
    _partnerSearch.dispose();
    _scan.dispose();
    _scanFocus.dispose();
    super.dispose();
  }

  Future<void> _add(DbRow p) async {
    final pid = p['id'] as String?;
    final track = asBool(p['track_stock']);
    final available = track && pid != null ? await _biz.availableStock(pid) : double.infinity;
    final inCart = _cart.where((l) => l.productId == pid).fold<double>(0, (s, l) => s + l.qty);
    if (track && inCart + 1 > available + 1e-6) {
      if (mounted) toast(context, 'Stock insuficiente para ${asStr(p['name'])}: hay ${qty(available)} disponibles', error: true);
      return;
    }
    if (!mounted) return;
    setState(() {
      final existing = _cart.where((l) => l.productId == pid).firstOrNull;
      if (existing != null) {
        existing.qty += 1;
      } else {
        _cart.add(CartLine.fromProduct(p));
      }
    });
  }

  /// Lector de código de barras: escribe el código + Enter.
  Future<void> _onScan(String code) async {
    final c = code.trim();
    if (c.isEmpty) return;
    final r = await LocalDb.instance.all('products', where: 'active = 1 AND (barcode = ? OR sku = ?)', args: [c, c], limit: 1);
    _scan.clear();
    _scanFocus.requestFocus();
    if (r.isEmpty) {
      if (mounted) toast(context, 'Código $c no encontrado', error: true);
      return;
    }
    await _add(r.first);
  }

  Future<void> _openSession() async {
    final ctrl = TextEditingController(text: '0');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Abrir caja', style: Kio.h2(18)),
        content: SizedBox(
          width: 360,
          child: TextField(controller: ctrl, autofocus: true, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Base en efectivo', prefixText: r'$ ')),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Abrir caja')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final s = context.read<Session>();
    await LocalDb.instance.save('pos_sessions', {
      'number': await LocalDb.instance.nextNumber('CAJA', s.terminal),
      'terminal': s.terminal,
      'user_id': s.userId,
      'opened_at': localNow(),
      'opening_cash': double.tryParse(ctrl.text.replaceAll('.', '')) ?? 0,
      'status': 'abierta',
    }, companyId: s.companyId, userId: s.userId);
    if (mounted) await context.read<UpdateService>().refreshCashState();
  }

  Future<void> _closeSession(DbRow session) async {
    final sum = await _biz.sessionSummary(session);
    if (!mounted) return;
    final counted = TextEditingController(text: sum.expected.round().toString());
    final notes = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, set) {
        final diff = (double.tryParse(counted.text.replaceAll('.', '')) ?? 0) - sum.expected;
        return AlertDialog(
          title: Text('Cierre de caja · ${session['number']}', style: Kio.h2(18)),
          content: SizedBox(
            width: 420,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              _kv('Ventas (${sum.count})', money(sum.sales)),
              for (final e in sum.byMethod.entries) _kv('  ${kPayMethods[e.key] ?? e.key}', money(e.value)),
              _kv('Base inicial', money(session['opening_cash'])),
              _kv('Gastos de caja menor', '− ${money(sum.expenses)}'),
              const Divider(height: 20),
              _kv('Efectivo esperado', money(sum.expected), bold: true),
              const SizedBox(height: 12),
              TextField(controller: counted, onChanged: (_) => set(() {}), keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Efectivo contado (arqueo)', prefixText: r'$ ')),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: StatusPill(diff.abs() < 1 ? 'Cuadrada' : 'Diferencia ${money(diff)}', color: diff.abs() < 1 ? Kio.green : Kio.danger),
              ),
              const SizedBox(height: 8),
              TextField(controller: notes, decoration: const InputDecoration(labelText: 'Observaciones')),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Cerrar caja')),
          ],
        );
      }),
    );
    if (ok != true || !mounted) return;
    final s = context.read<Session>();
    final c = double.tryParse(counted.text.replaceAll('.', '')) ?? 0;
    await LocalDb.instance.save('pos_sessions', {
      'id': session['id'],
      'closed_at': localNow(),
      'expected_cash': sum.expected,
      'counted_cash': c,
      'difference': c - sum.expected,
      'status': 'cerrada',
      'notes': notes.text.trim().isEmpty ? null : notes.text.trim(),
    }, companyId: s.companyId, userId: s.userId);
    if (mounted) await context.read<UpdateService>().refreshCashState();
    if (mounted) toast(context, 'Caja cerrada. Se enviará al servidor en la próxima sincronización.');
  }

  Future<void> _cashOut(DbRow session) async {
    final amount = TextEditingController();
    final concept = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Salida de dinero · ${session['number']}', style: Kio.h2(18)),
        content: SizedBox(
          width: 380,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('El valor se descuenta del efectivo esperado en el cierre.', style: TextStyle(color: Kio.muted, fontSize: 12)),
            const SizedBox(height: 12),
            TextField(controller: amount, autofocus: true, keyboardType: const TextInputType.numberWithOptions(decimal: true), inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))], decoration: const InputDecoration(labelText: 'Valor de la salida', prefixText: r'$ ')),
            const SizedBox(height: 10),
            TextField(controller: concept, decoration: const InputDecoration(labelText: 'Concepto', hintText: 'Ej. Pago a proveedor, cambio para domiciliario')),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Registrar salida')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await _biz.registerCashOut(
        posSessionId: session['id'] as String,
        amount: double.tryParse(amount.text.replaceFirst(',', '.')) ?? 0,
        concept: concept.text,
      );
      if (mounted) toast(context, 'Salida registrada. El arqueo ya la descuenta.');
    } on BusinessException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
  }

  Future<void> _deliveryCollections(DbRow session) async {
    final pending = await LocalDb.instance.raw(
      "SELECT * FROM sales WHERE deleted = 0 AND status = 'confirmada' AND delivery_status IN ('en_camino','recaudo_parcial') ORDER BY date DESC",
    );
    if (!mounted) return;
    if (pending.isEmpty) {
      toast(context, 'No hay domicilios pendientes de recaudo');
      return;
    }
    String? selected = pending.first['id'] as String;
    final amount = TextEditingController();
    double pendingAmount(DbRow s) => asNum(s['total']).toDouble() - asNum(s['delivery_collected_amount']).toDouble();

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setModal) {
        final sale = pending.where((s) => s['id'] == selected).firstOrNull ?? pending.first;
        return AlertDialog(
          title: Text('Recaudo de domicilios', style: Kio.h2(18)),
          content: SizedBox(
            width: 440,
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              DropdownButtonFormField<String>(
                initialValue: selected,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Domicilio', prefixIcon: Icon(Icons.local_shipping, size: 16)),
                items: [
                  for (final s in pending)
                    DropdownMenuItem<String>(
                      value: s['id'] as String,
                      child: Text('${asStr(s['number'])} · ${asStr(s['delivery_rider_name']).isEmpty ? 'Sin domiciliario' : asStr(s['delivery_rider_name'])} · ${money(pendingAmount(s))}', overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) {
                  setModal(() {
                    selected = v;
                    amount.clear();
                  });
                },
              ),
              const SizedBox(height: 10),
              _kv('Pendiente por recaudar', money(pendingAmount(sale)), bold: true),
              _kv('Dirección', asStr(sale['delivery_address']).isEmpty ? '—' : asStr(sale['delivery_address'])),
              const SizedBox(height: 10),
              TextField(controller: amount, autofocus: true, keyboardType: const TextInputType.numberWithOptions(decimal: true), inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))], decoration: const InputDecoration(labelText: 'Valor que trae el domiciliario', prefixText: r'$ ')),
              const SizedBox(height: 8),
              const Text('Al confirmar entra a efectivo de la caja abierta.', style: TextStyle(color: Kio.muted, fontSize: 12)),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Registrar recaudo')),
          ],
        );
      }),
    );
    if (ok != true || !mounted) return;
    try {
      await _biz.registerDeliveryCollection(
        saleId: selected!,
        amount: double.tryParse(amount.text.replaceFirst(',', '.')) ?? 0,
        posSessionId: session['id'] as String,
      );
      if (mounted) toast(context, 'Recaudo registrado y abonado a la venta.');
    } on BusinessException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
  }

  Future<void> _assertCartStock() async {
    final needs = <String, double>{};
    final names = <String, String>{};
    for (final l in _cart) {
      if (!l.trackStock || l.productId == null) continue;
      needs[l.productId!] = (needs[l.productId!] ?? 0) + l.qty;
      names[l.productId!] = l.name;
    }
    for (final e in needs.entries) {
      final available = await _biz.availableStock(e.key);
      if (e.value > available + 1e-6) {
        throw BusinessException('Stock insuficiente para ${names[e.key]}: hay ${qty(available)}, se piden ${qty(e.value)}');
      }
    }
  }

  Future<void> _charge(DbRow session) async {
    await _assertCartStock();
    if (!mounted) return;
    final t = Totals.of(_cart);
    final result = await showDialog<_PayResult>(context: context, builder: (_) => Theme(data: _posTheme, child: _PayDialog(total: t.total, hasPartner: _partnerId != null)));
    if (result == null || !mounted) return;
    try {
      final sale = await _biz.saveSale(
        channel: 'pos',
        lines: _cart,
        partnerId: _partnerId,
        paymentMode: result.credit ? 'credito' : result.delivery ? 'contra_entrega' : 'contado',
        payments: result.credit || result.delivery ? const [] : [(result.method, t.total)],
        posSessionId: session['id'] as String,
        kitchenStatus: _kitchen ? 'pendiente' : null,
        tableRef: _table.text.trim().isEmpty ? null : _table.text.trim(),
        deliveryUserId: result.deliveryUserId,
        deliveryRiderName: result.deliveryRiderName,
        deliveryAddress: result.deliveryAddress,
        deliveryStatus: result.delivery ? 'en_camino' : null,
      );
      if (!mounted) return;
      final lines = List<CartLine>.from(_cart);
      setState(() {
        _ticket.reset();
        _partnerSearch.clear();
      });
      await showDialog(context: context, builder: (_) => _ReceiptDialog(sale: sale, lines: lines, change: result.change, method: result.method, credit: result.credit));
      _scanFocus.requestFocus();
    } on BusinessException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    context.watch<Session>();
    return LiveQuery(
      query: () async {
        final db = LocalDb.instance;
        final siteId = context.read<Session>().siteId;
        return (
          session: await _biz.openSession(),
          cats: await db.all('categories', orderBy: 'sequence, name'),
          products: await db.raw('''
            SELECT p.*, CASE WHEN EXISTS (SELECT 1 FROM warehouse_stocks ws WHERE ws.product_id = p.id AND ws.deleted = 0 AND ws.active = 1
                                                  AND (? = '' OR ws.site_id = ?))
                              THEN COALESCE((SELECT SUM(ws.qty) FROM warehouse_stocks ws
                                              WHERE ws.product_id = p.id AND ws.deleted = 0 AND ws.active = 1
                                                AND (? = '' OR ws.site_id = ?)), 0)
                              ELSE COALESCE((SELECT SUM(m.qty) FROM stock_moves m
                                              WHERE m.product_id = p.id AND m.deleted = 0
                                                AND (? = '' OR m.site_id = ? OR m.site_id IS NULL)), 0) END AS stock
              FROM products p WHERE p.deleted = 0 AND p.active = 1 AND p.available_pos = 1 ORDER BY p.name''', [siteId, siteId, siteId, siteId, siteId, siteId]),
          partners: await db.all('partners', where: "deleted = 0 AND (is_customer = 1 OR COALESCE(is_supplier, 0) = 0)", orderBy: 'name'),
        );
      },
      builder: (context, d) {
        if (d.session == null) {
          return PageBody(children: [
            const PageHeader(title: 'Caja POS'),
            KioCard(
              child: EmptyState(
                icon: LucideIcons.store,
                title: 'La caja está cerrada',
                message: 'Abre la caja con la base en efectivo para empezar a vender. Funciona aunque no haya internet.',
                action: FilledButton.icon(onPressed: _openSession, icon: const Icon(LucideIcons.lockOpen, size: 16), label: const Text('Abrir caja')),
              ),
            ),
          ]);
        }
        final products = d.products.where((p) {
          if (_cat != null && p['category_id'] != _cat) return false;
          if (asBool(p['track_stock']) && asNum(p['stock']) <= 0) return false;
          if (_q.isEmpty) return true;
          final q = _q.toLowerCase();
          return asStr(p['name']).toLowerCase().contains(q) || asStr(p['sku']).toLowerCase().contains(q);
        }).toList();
        final wide = MediaQuery.sizeOf(context).width >= 1000;
        final catalog = _catalog(d.cats, products, d.products, d.session!);
        final cart = _cartPanel(d.session!, d.partners, products: d.products);
        Widget dark(Widget w) => Theme(data: _posTheme, child: ColoredBox(color: pal.bg, child: w));
        if (wide) {
          return dark(Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Expanded(child: catalog),
            SizedBox(width: 400, child: cart),
          ]));
        }
        return dark(Stack(children: [
          catalog,
          Positioned(
            left: 14,
            right: 14,
            bottom: 14,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size(0, 52)),
              onPressed: () => showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                backgroundColor: pal.panel,
                builder: (_) => Theme(
                  data: _posTheme,
                  child: FractionallySizedBox(
                    heightFactor: .9,
                    child: StatefulBuilder(
                      builder: (c, setModal) => _cartPanel(
                        d.session!,
                        d.partners,
                        products: products,
                        setLocal: (fn) => setModal(fn),
                        onBeforeClose: () => Navigator.of(c).pop(),
                      ),
                    ),
                  ),
                ),
              ),
              icon: const Icon(LucideIcons.shoppingBag, size: 18),
              label: Text('Ver carrito (${_cart.length}) · ${money(Totals.of(_cart).total)}'),
            ),
          ),
        ]));
      },
    );
  }

  Widget _catalog(List<DbRow> cats, List<DbRow> products, List<DbRow> allProducts, DbRow session) {
    Color pastel(int i) => Kio.posPastels[i % Kio.posPastels.length];
    int countOf(String? id) => allProducts.where((p) => id == null || p['category_id'] == id).length;
    Widget catTile(String? id, String label, Color color) {
      final sel = _cat == id;
      if (!_dark) {
        return Material(
          color: sel ? pal.accent : pal.pill,
          borderRadius: BorderRadius.circular(30),
          child: InkWell(
            borderRadius: BorderRadius.circular(30),
            onTap: () => setState(() => _cat = id),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 18, 8),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                CircleAvatar(radius: 14, backgroundColor: Colors.white, child: Icon(id == null ? LucideIcons.layoutGrid : LucideIcons.tag, size: 14, color: Kio.navyDark)),
                const SizedBox(width: 8),
                Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)),
              ]),
            ),
          ),
        );
      }
      return SizedBox(
        width: 168,
        height: 110,
        child: Material(
          color: color,
          borderRadius: BorderRadius.circular(18),
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: () => setState(() => _cat = id),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), border: Border.all(color: sel ? Colors.white : Colors.transparent, width: 2.5)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Icon(id == null ? LucideIcons.layoutGrid : LucideIcons.tag, size: 18, color: Kio.navyDark),
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Kio.navyDark)),
                  Text('${countOf(id)} productos', style: TextStyle(fontSize: 12, color: Kio.navyDark.withValues(alpha: .6))),
                ]),
              ]),
            ),
          ),
        ),
      );
    }

    Widget headerBtn(IconData icon, String label, VoidCallback onTap) => OutlinedButton.icon(
          onPressed: onTap,
          icon: Icon(icon, size: 16),
          label: Text(label),
          style: OutlinedButton.styleFrom(foregroundColor: pal.text, side: BorderSide(color: pal.border), backgroundColor: pal.card),
        );

    return ListView(padding: const EdgeInsets.fromLTRB(20, 16, 16, 90), children: [
      Wrap(spacing: 12, runSpacing: 12, crossAxisAlignment: WrapCrossAlignment.center, children: [
        Image.asset('assets/brand/kio_mark.png', width: 34, height: 34),
        Text(_dark ? 'KIO SBS' : 'Catálogo', style: Kio.title(_dark ? 20 : 26).copyWith(color: pal.text)),
        Text('Caja ${session['terminal']}', style: Kio.h2(16).copyWith(color: pal.muted)),
        StatusPill('Abierta · ${session['number']}', color: Kio.green),
        headerBtn(LucideIcons.plus, 'Nueva venta', _newTicket),
        headerBtn(LucideIcons.lock, 'Cerrar caja', () => _closeSession(session)),
        headerBtn(Icons.money_off, 'Salida de dinero', () => _cashOut(session)),
        headerBtn(Icons.local_shipping, 'Recaudos domicilio', () => _deliveryCollections(session)),
      ]),
      const SizedBox(height: 14),
      Wrap(spacing: 10, runSpacing: 10, children: [
        SizedBox(
          width: 280,
          child: TextField(
            controller: _scan,
            focusNode: _scanFocus,
            autofocus: true,
            onSubmitted: _onScan,
            decoration: const InputDecoration(hintText: 'Escanear código de barras…', prefixIcon: Icon(LucideIcons.scanBarcode, size: 18)),
          ),
        ),
        SearchField(hint: 'Buscar producto…', width: 260, onChanged: (v) => setState(() => _q = v.trim())),
      ]),
      const SizedBox(height: 14),
      Wrap(spacing: 12, runSpacing: 12, children: [
        catTile(null, 'Todos', Kio.posPastels[0]),
        for (var i = 0; i < cats.length; i++) catTile(cats[i]['id'] as String, asStr(cats[i]['name']), pastel(i + 1)),
      ]),
      const SizedBox(height: 18),
      const Divider(),
      const SizedBox(height: 14),
      LayoutBuilder(builder: (context, c) {
        final cols = (c.maxWidth / 190).floor().clamp(2, 6);
        final w = (c.maxWidth - (cols - 1) * 12) / cols;
        return Wrap(spacing: 12, runSpacing: 12, children: [
          for (final p in products) SizedBox(width: w, child: _productTile(p, _catColor(cats, p['category_id']))),
        ]);
      }),
    ]);
  }

  Color accentDeep(Color c) => Color.lerp(c, Kio.navyDark, .55)!;

  Color _catColor(List<DbRow> cats, Object? id) {
    final i = cats.indexWhere((c) => c['id'] == id);
    return i < 0 ? Kio.posPastels[0] : Kio.posPastels[(i + 1) % Kio.posPastels.length];
  }

  Widget _productTile(DbRow p, Color accent) {
    final name = asStr(p['name']);
    final price = asNum(p['price']) * (1 + asNum(p['tax_rate']));
    final stock = asNum(p['stock']);
    final track = asBool(p['track_stock']);
    final out = track && stock <= 0;
    final inCart = _cart.where((l) => l.productId == p['id']).fold<double>(0, (s, l) => s + l.qty);
    if (!_dark) {
      return Material(
        color: pal.card,
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: out ? null : () => unawaited(_add(p)),
          child: Container(
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: pal.border)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Stack(children: [
                Container(
                  height: 92,
                  color: Kio.tint(out ? Kio.muted : Kio.navy, .08),
                  alignment: Alignment.center,
                  child: Text(name.isNotEmpty ? name.characters.first.toUpperCase() : '•', style: TextStyle(fontFamily: Kio.heading, fontSize: 36, fontWeight: FontWeight.w800, color: out ? Kio.subtle : accentDeep(accent))),
                ),
                if (inCart > 0)
                  Positioned(
                    right: 8,
                    top: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                      decoration: BoxDecoration(color: Kio.purple, borderRadius: BorderRadius.circular(12)),
                      child: Text(qty(inCart), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: Colors.white)),
                    ),
                  ),
              ]),
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 10, 10, 12),
                child: Column(children: [
                  SizedBox(height: 36, child: Text(name, maxLines: 2, textAlign: TextAlign.center, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5, height: 1.2, color: out ? pal.muted : pal.text))),
                  const SizedBox(height: 4),
                  Text(money(price), style: TextStyle(color: out ? pal.muted : pal.accent, fontWeight: FontWeight.w700, fontSize: 14)),
                  Text(track ? (out ? 'Agotado' : 'Stock ${qty(stock)}') : 'Sin control', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: out ? Kio.danger : pal.muted)),
                ]),
              ),
            ]),
          ),
        ),
      );
    }
    return Material(
      color: pal.card,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: out ? null : () => unawaited(_add(p)),
        child: Container(
          decoration: BoxDecoration(border: Border(left: BorderSide(color: out ? pal.border : accent, width: 5))),
          padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(
              height: 40,
              child: Text(name, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w700, height: 1.2, color: out ? pal.muted : pal.text)),
            ),
            const SizedBox(height: 4),
            Text(money(price), style: TextStyle(color: out ? pal.muted : Kio.cyan, fontWeight: FontWeight.w800, fontSize: 17)),
            const SizedBox(height: 4),
            Row(children: [
              Expanded(
                child: Text(track ? (out ? 'Agotado' : 'Stock ${qty(stock)}') : 'Sin control', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: out ? Kio.danger : pal.muted)),
              ),
              if (inCart > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(10)),
                  child: Text(qty(inCart), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: Kio.navyDark)),
                )
              else
                Icon(LucideIcons.plus, size: 16, color: pal.muted),
            ]),
          ]),
        ),
      ),
    );
  }

  String _ticketTitle(_SaleTicket t) {
    if (t.partnerName != null && t.partnerName!.trim().isNotEmpty) return t.partnerName!.trim();
    final tableRef = t.table.text.trim();
    if (tableRef.isNotEmpty) return 'Mesa $tableRef';
    return t.label;
  }

  List<DbRow> _visiblePartners(List<DbRow> partners) {
    final q = _partnerSearch.text.trim().toLowerCase();
    if (q.isEmpty) return [...partners];
    return partners.where((p) => asStr(p['name']).toLowerCase().contains(q) || asStr(p['doc_number']).toLowerCase().contains(q)).toList();
  }

  void _selectTicket(int i) => setState(() => _activeTicket = i);

  void _newTicket() {
    setState(() {
      _ticketSeq += 1;
      _tickets.add(_SaleTicket('Venta $_ticketSeq'));
      _activeTicket = _tickets.length - 1;
      _partnerSearch.clear();
    });
  }

  Future<void> _closeTicket(int i) async {
    final cart = _tickets[i].cart;
    if (cart.isNotEmpty && !await confirm(context, 'Cerrar venta', 'Esta pestaña tiene ${cart.length} línea(s). ¿Deseas descartarla?', ok: 'Descartar', danger: true)) {
      return;
    }
    setState(() {
      _tickets.removeAt(i);
      if (_tickets.isEmpty) {
        _ticketSeq += 1;
        _tickets.add(_SaleTicket('Venta $_ticketSeq'));
      }
      if (_activeTicket >= _tickets.length) _activeTicket = _tickets.length - 1;
      _partnerSearch.clear();
    });
  }

  /// Alta rápida desde caja: no depende de permiso de escritura en Contactos.
  /// El servidor acepta este cliente porque es una fila básica de cliente desde POS.
  Future<void> _newCustomer() async {
    final form = GlobalKey<FormState>();
    final name = TextEditingController();
    final doc = TextEditingController();
    final phone = TextEditingController();
    final email = TextEditingController();
    String docType = 'CC';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Nuevo cliente', style: Kio.h2(18)),
        content: SizedBox(
          width: 400,
          child: Form(
            key: form,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextFormField(controller: name, autofocus: true, decoration: const InputDecoration(labelText: 'Nombre / Razón social *'), validator: (v) => v == null || v.trim().isEmpty ? 'Obligatorio' : null),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: docType,
                decoration: const InputDecoration(labelText: 'Tipo documento'),
                items: const [
                  DropdownMenuItem(value: 'CC', child: Text('Cédula')),
                  DropdownMenuItem(value: 'NIT', child: Text('NIT')),
                  DropdownMenuItem(value: 'CE', child: Text('CE')),
                  DropdownMenuItem(value: 'PP', child: Text('Pasaporte')),
                ],
                onChanged: (v) => docType = v ?? 'CC',
              ),
              const SizedBox(height: 10),
              TextFormField(controller: doc, decoration: const InputDecoration(labelText: 'Número documento')),
              const SizedBox(height: 10),
              TextFormField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Teléfono')),
              const SizedBox(height: 10),
              TextFormField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Correo')),
            ]),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, form.currentState?.validate() ?? false), child: const Text('Crear cliente')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final s = context.read<Session>();
    final row = await LocalDb.instance.save(
      'partners',
      {
        'name': name.text.trim(),
        'doc_type': docType,
        'doc_number': doc.text.trim().isEmpty ? null : doc.text.trim(),
        'phone': phone.text.trim().isEmpty ? null : phone.text.trim(),
        'email': email.text.trim().isEmpty ? null : email.text.trim(),
        'is_customer': 1,
        'is_supplier': 0,
      },
      companyId: s.companyId,
      userId: s.userId,
    );
    if (!mounted) return;
    setState(() {
      _ticket.partnerId = row['id'] as String;
      _ticket.partnerName = asStr(row['name']);
      _partnerSearch.clear();
    });
    unawaited(context.read<SyncService>().syncNow());
    toast(context, 'Cliente creado y listo para facturar');
  }

  Widget _ticketTabs(List<DbRow> partners) {
    return Container(
      height: 48,
      decoration: BoxDecoration(color: pal.bg, border: Border(bottom: BorderSide(color: pal.border))),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
        itemCount: _tickets.length + 1,
        separatorBuilder: (_, _) => const SizedBox(width: 6),
        itemBuilder: (_, i) {
          if (i == _tickets.length) {
            return ActionChip(
              label: const Text('+ Nueva venta'),
              onPressed: _newTicket,
              side: BorderSide(color: pal.border),
              backgroundColor: pal.card,
              labelStyle: TextStyle(color: pal.text),
            );
          }
          final t = _tickets[i];
          final selected = i == _activeTicket;
          final title = _ticketTitle(t) + (t.cart.isEmpty ? '' : ' · ${t.cart.length}');
          return InputChip(
            label: Text(title, overflow: TextOverflow.ellipsis),
            selected: selected,
            showCheckmark: false,
            selectedColor: Kio.brandSecondary,
            labelStyle: TextStyle(color: pal.text, fontWeight: FontWeight.w600),
            deleteIconColor: pal.muted,
            side: BorderSide(color: pal.border),
            onSelected: (_) => _selectTicket(i),
            onDeleted: () => unawaited(_closeTicket(i)),
            deleteIcon: const Icon(LucideIcons.x, size: 14),
          );
        },
      ),
    );
  }

  Widget _cartPanel(DbRow session, List<DbRow> partners, {required List<DbRow> products, void Function(VoidCallback fn)? setLocal, VoidCallback? onBeforeClose}) {
    void upd(VoidCallback fn) {
      if (mounted) setState(fn);
      setLocal?.call(fn);
    }

    double stockFor(String? productId, {required bool trackStock}) {
      if (!trackStock || productId == null) return double.infinity;
      final p = products.where((x) => x['id'] == productId).firstOrNull;
      if (p == null) return 0;
      return asNum(p['stock']).toDouble();
    }

    Future<void> editQty(int index, double cap) async {
      final line = _cart[index];
      final c = TextEditingController(text: qty(line.qty));
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('Cantidad · ${line.name}', style: Kio.h2(18)),
          content: SizedBox(
            width: 320,
            child: TextField(
              controller: c,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
              decoration: InputDecoration(
                labelText: 'Cantidad',
                helperText: line.trackStock && cap.isFinite ? 'Disponible: ${qty(cap)}' : null,
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Aplicar')),
          ],
        ),
      );
      if (ok != true) return;
      final v = double.tryParse(c.text.replaceFirst(',', '.'));
      if (v == null || v <= 0) {
        if (mounted) toast(context, 'Cantidad no válida', error: true);
        return;
      }
      if (line.trackStock && cap.isFinite && v > cap + 1e-6) {
        if (mounted) toast(context, 'No hay más stock de ${line.name}. Máximo ${qty(cap)}', error: true);
        return;
      }
      upd(() => line.qty = v);
    }

    final totals = Totals.of(_cart);
    final visible = _visiblePartners(partners);
    if (_partnerId != null && !visible.any((p) => p['id'] == _partnerId)) {
      final selected = partners.where((p) => p['id'] == _partnerId).firstOrNull;
      if (selected != null) visible.insert(0, selected);
    }
    return Container(
      decoration: BoxDecoration(color: pal.panel, border: Border(left: BorderSide(color: pal.border))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _ticketTabs(partners),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 12, 6),
          child: Row(children: [
            Expanded(child: Text(_ticketTitle(_ticket), style: Kio.h2(18).copyWith(color: pal.text), overflow: TextOverflow.ellipsis)),
            if (_cart.isNotEmpty)
              TextButton(onPressed: () => upd(() => _ticket.cart.clear()), child: const Text('Vaciar')),
            const SizedBox(width: 4),
            IconButton.filledTonal(
              tooltip: _dark ? 'Modo claro' : 'Modo oscuro',
              onPressed: () {
                _toggleDark();
                setLocal?.call(() {});
              },
              icon: Icon(_dark ? LucideIcons.sun : LucideIcons.moon, size: 18),
            ),
            const SizedBox(width: 4),
            IconButton.filledTonal(
              tooltip: 'Salida de dinero',
              onPressed: () => _cashOut(session),
              icon: const Icon(Icons.money_off, size: 18),
            ),
            const SizedBox(width: 4),
            FilledButton.tonalIcon(
              onPressed: () {
                onBeforeClose?.call();
                _closeSession(session);
              },
              icon: const Icon(LucideIcons.lock, size: 16),
              label: const Text('Cerrar caja'),
              style: FilledButton.styleFrom(visualDensity: VisualDensity.compact),
            ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
          child: TextField(
            controller: _partnerSearch,
            onChanged: (_) => upd(() {}),
            decoration: const InputDecoration(
              labelText: 'Buscar cliente por nombre o documento',
              prefixIcon: Icon(LucideIcons.search, size: 16),
              isDense: true,
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(children: [
            Expanded(
              child: DropdownButtonFormField<String?>(
                initialValue: _partnerId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Cliente', prefixIcon: Icon(LucideIcons.userRound, size: 16)),
                items: [
                  const DropdownMenuItem<String?>(value: null, child: Text('Sin cliente (consumidor final)')),
                  for (final p in visible) DropdownMenuItem<String?>(value: p['id'] as String, child: Text(asStr(p['name']), overflow: TextOverflow.ellipsis)),
                ],
                onChanged: (v) => upd(() {
                  _ticket.partnerId = v;
                  _ticket.partnerName = v == null ? null : asStr(partners.where((p) => p['id'] == v).firstOrNull?['name']);
                }),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filledTonal(
              tooltip: 'Nuevo cliente',
              onPressed: _newCustomer,
              icon: const Icon(LucideIcons.userPlus, size: 18),
            ),
          ]),
        ),
        const SizedBox(height: 10),
        const Divider(),
        Expanded(
          child: _cart.isEmpty
              ? const EmptyState(icon: LucideIcons.shoppingBag, title: 'Carrito vacío', message: 'Toca un producto o escanea su código')
              : ListView.separated(
                  itemCount: _cart.length,
                  separatorBuilder: (_, _) => const Divider(),
                  itemBuilder: (_, i) {
                    final l = _cart[i];
                    final cap = stockFor(l.productId, trackStock: l.trackStock);
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      child: Row(children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(l.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: pal.text)),
                            const SizedBox(height: 2),
                            Text('${money(l.price * (1 + l.taxRate))} c/u', style: Kio.small.copyWith(color: pal.muted)),
                          ]),
                        ),
                        _qtyBtn(LucideIcons.minus, () => upd(() => l.qty <= 1 ? _ticket.cart.removeAt(i) : l.qty -= 1)),
                        InkWell(
                          onTap: () => unawaited(editQty(i, cap)),
                          child: Container(
                            width: 46,
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            alignment: Alignment.center,
                            decoration: BoxDecoration(border: Border.all(color: pal.border), borderRadius: BorderRadius.circular(8)),
                            child: Text(qty(l.qty), textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: pal.text)),
                          ),
                        ),
                        _qtyBtn(LucideIcons.plus, () {
                          if (l.qty + 1 > cap + 1e-6) {
                            toast(context, 'No hay más stock disponible de ${l.name}', error: true);
                            return;
                          }
                          upd(() => l.qty += 1);
                        }),
                        SizedBox(width: 92, child: Text(money(l.total), textAlign: TextAlign.right, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: pal.text))),
                      ]),
                    );
                  },
                ),
        ),
        const Divider(),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 4),
          child: Row(children: [
            Checkbox(value: _kitchen, onChanged: (v) => upd(() => _ticket.kitchen = v ?? false)),
            Text('Enviar a cocina', style: TextStyle(color: pal.text)),
            const SizedBox(width: 12),
            if (_kitchen) Expanded(child: TextField(controller: _table, decoration: const InputDecoration(hintText: 'Mesa / turno'))),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 6, 20, 0),
          child: Column(children: [
            _kv('Subtotal', money(totals.subtotal)),
            _kv('IVA', money(totals.tax)),
            const SizedBox(height: 6),
            _kv('Total', money(totals.total), bold: true, size: 22),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size(0, 54), backgroundColor: pal.cta, foregroundColor: Colors.white, disabledBackgroundColor: pal.dark ? null : Kio.borderStrong, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(_dark ? 12 : 30)), textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, fontFamily: 'Inter')),
            onPressed: _cart.isEmpty ? null : () => _charge(session),
            icon: const Icon(LucideIcons.banknote),
            label: Text('Cobrar ${money(totals.total)}'),
          ),
        ),
      ]),
    );
  }

  Widget _qtyBtn(IconData icon, VoidCallback onTap) => Material(
        color: pal.card,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(border: Border.all(color: pal.border), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, size: 18, color: pal.text),
          ),
        ),
      );
}

Widget _kv(String k, String v, {bool bold = false, double size = 14}) => Builder(builder: (context) {
      final fg = PosPal.of(context).text;
      final muted = PosPal.of(context).muted;
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [
          Text(k, style: bold ? Kio.h2(size * .8).copyWith(color: fg) : Kio.label.copyWith(color: muted)),
          const Spacer(),
          Text(v, style: TextStyle(color: fg, fontWeight: bold ? FontWeight.w800 : FontWeight.w600, fontSize: size, fontFamily: bold ? Kio.heading : null)),
        ]),
      );
    });

class _PayResult {
  _PayResult(this.method, this.change, this.credit, {this.deliveryUserId, this.deliveryRiderName, this.deliveryAddress});
  final String method;
  final double change;
  final bool credit;
  final String? deliveryUserId;
  final String? deliveryRiderName;
  final String? deliveryAddress;
  bool get delivery => method == 'contra_entrega';
}

class _PayDialog extends StatefulWidget {
  const _PayDialog({required this.total, required this.hasPartner});
  final double total;
  final bool hasPartner;
  @override
  State<_PayDialog> createState() => _PayDialogState();
}

class _PayDialogState extends State<_PayDialog> {
  PosPal get pal => PosPal.of(context);
  String _method = 'efectivo';
  final TextEditingController _received = TextEditingController();
  final FocusNode _receivedFocus = FocusNode();
  final TextEditingController _address = TextEditingController();
  List<Map<String, dynamic>> _users = [];
  String? _riderId;
  bool _loadingUsers = true;

  String get _raw => _received.text;
  double get _rec => double.tryParse(_raw.replaceFirst(',', '.')) ?? 0;

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  Future<void> _loadUsers() async {
    try {
      final data = await context.read<Session>().api.run('{ posUsers { id name role } }');
      final raw = data['posUsers'];
      _users = raw is List
          ? raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
          : <Map<String, dynamic>>[];
    } catch (_) {
      _users = [];
    } finally {
      if (mounted) setState(() => _loadingUsers = false);
    }
  }

  @override
  void dispose() {
    _received.dispose();
    _receivedFocus.dispose();
    _address.dispose();
    super.dispose();
  }

  void _focusReceived() {
    _receivedFocus.requestFocus();
    _received.selection = TextSelection.fromPosition(TextPosition(offset: _received.text.length));
  }

  void _setReceived(String v) {
    setState(() => _received.text = v);
    _focusReceived();
  }

  void _key(String k) {
    final cur = _raw;
    final next = switch (k) {
      'C' => '',
      '⌫' => cur.isEmpty ? '' : cur.substring(0, cur.length - 1),
      '00' => cur.isEmpty ? '' : '${cur}00',
      _ => '$cur$k',
    };
    _setReceived(next);
  }

  static const _methodIcons = <String, IconData>{
    'efectivo': LucideIcons.banknote,
    'tarjeta': LucideIcons.creditCard,
    'transferencia': LucideIcons.landmark,
    'nequi': LucideIcons.smartphone,
    'contra_entrega': LucideIcons.truck,
    'credito': LucideIcons.handCoins,
  };

  Widget _methodTile(String key, String label, {bool enabled = true}) {
    final sel = _method == key;
    final selBg = pal.dark ? Colors.white : pal.pill;
    final selFg = pal.dark ? Kio.navyDark : Colors.white;
    return SizedBox(
      width: 112,
      height: 74,
      child: Material(
        color: sel ? selBg : pal.card,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: !enabled
              ? null
              : () {
                  setState(() => _method = key);
                  if (key == 'efectivo') _focusReceived();
                },
          child: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), border: Border.all(color: sel ? selBg : pal.border)),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(_methodIcons[key] ?? LucideIcons.wallet, size: 20, color: !enabled ? pal.border : sel ? selFg : pal.text),
              const SizedBox(height: 6),
              Text(label, maxLines: 2, textAlign: TextAlign.center, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: !enabled ? pal.border : sel ? selFg : pal.text)),
            ]),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final change = _rec - widget.total;
    final quick = <int>{
      widget.total.round(),
      ...[2000, 5000, 10000, 20000, 50000, 100000].where((x) => x > widget.total.round()),
    }.toList()..sort();
    final wide = MediaQuery.sizeOf(context).width >= 700;

    final methods = <String, String>{...kPayMethods, 'credito': 'Crédito'};
    final left = Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Text('Formas de pago', style: TextStyle(fontWeight: FontWeight.w700, color: Kio.muted, fontSize: 13)),
      const SizedBox(height: 8),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final e in methods.entries)
          _methodTile(
            e.key,
            e.key == 'credito' && !widget.hasPartner ? 'Crédito (requiere cliente)' : e.value,
            enabled: !(e.key == 'credito' && !widget.hasPartner),
          ),
      ]),
      const SizedBox(height: 16),
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: pal.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: pal.border)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _kv('Total a cobrar', money(widget.total), bold: true, size: 18),
          const Divider(height: 18),
          if (_method == 'efectivo')
            TextField(
              controller: _received,
              focusNode: _receivedFocus,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
              textInputAction: TextInputAction.done,
              onChanged: (_) => setState(() {}),
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 22),
              decoration: const InputDecoration(labelText: 'Recibido', hintText: '0', prefixText: r'$ '),
            )
          else if (_method == 'contra_entrega')
            _kv('Recibido', 'Al entregar', bold: true, size: 20)
          else
            _kv('Recibido', money(widget.total), bold: true, size: 22),
          const SizedBox(height: 6),
          _kv('Cambio', money(change < 0 ? 0 : change), bold: true, size: 24),
        ]),
      ),
      if (_method == 'efectivo') ...[
        const SizedBox(height: 12),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final q in quick.take(6))
            ActionChip(
              label: Text(money(q), style: const TextStyle(fontWeight: FontWeight.w700)),
              onPressed: () => _setReceived(q.toString()),
            ),
        ]),
      ],
      if (_method == 'credito')
        const Padding(padding: EdgeInsets.only(top: 14), child: Text('Se valida cupo, mora y bloqueo del cliente antes de registrar.', style: Kio.label)),
      if (_method == 'contra_entrega') ...[
        const SizedBox(height: 14),
        if (_loadingUsers)
          const SizedBox(height: 24, width: 24, child: CircularProgressIndicator(strokeWidth: 2))
        else
          DropdownButtonFormField<String>(
            initialValue: _riderId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Domiciliario (usuario del sistema)', prefixIcon: Icon(Icons.person, size: 16)),
            items: [
              const DropdownMenuItem<String>(value: null, child: Text('Selecciona el domiciliario')),
              for (final u in _users) DropdownMenuItem<String>(value: u['id'] as String, child: Text(asStr(u['name']))),
            ],
            onChanged: (v) => setState(() => _riderId = v),
          ),
        const SizedBox(height: 10),
        TextField(controller: _address, keyboardType: TextInputType.streetAddress, decoration: const InputDecoration(labelText: 'Dirección de entrega', prefixIcon: Icon(Icons.place, size: 16))),
        const SizedBox(height: 8),
        const Text('La venta queda registrada sin pago. Al volver, registra el recaudo en "Recaudos domicilio" y entra a la caja abierta.', style: TextStyle(color: Kio.muted, fontSize: 12)),
      ],
    ]);

    final numpad = _method == 'efectivo'
        ? SizedBox(
            width: 280,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              for (final row in const [
                ['1', '2', '3'],
                ['4', '5', '6'],
                ['7', '8', '9'],
                ['C', '0', '⌫'],
                ['00'],
              ])
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(children: [
                    for (final k in row)
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          child: SizedBox(
                            height: 58,
                            child: FilledButton.tonal(
                              style: FilledButton.styleFrom(
                                backgroundColor: k == 'C' ? Kio.tint(Kio.danger, .18) : k == '⌫' ? Kio.tint(Kio.warning, .18) : pal.card,
                                foregroundColor: k == 'C' ? Kio.danger : pal.text,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                textStyle: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, fontFamily: 'Inter'),
                              ),
                              onPressed: () => _key(k),
                              child: Text(k),
                            ),
                          ),
                        ),
                      ),
                  ]),
                ),
            ]),
          )
        : const SizedBox.shrink();

    final canConfirm = switch (_method) {
      'efectivo' => _rec > 0 && change >= 0,
      'contra_entrega' => _riderId != null && _address.text.trim().isNotEmpty,
      _ => true,
    };

    return AlertDialog(
      title: Text('Cobrar ${money(widget.total)}', style: Kio.h2(20).copyWith(color: pal.text)),
      content: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: wide ? 760 : 460),
        child: wide && _method == 'efectivo'
            ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(child: left),
                const SizedBox(width: 20),
                numpad,
              ])
            : SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [left, if (_method == 'efectivo') ...[const SizedBox(height: 16), numpad]])),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: Kio.green, minimumSize: const Size(160, 48)),
          onPressed: canConfirm
              ? () => Navigator.pop(
                    context,
                    _PayResult(
                      _method,
                      change < 0 ? 0 : change,
                      _method == 'credito',
                      deliveryUserId: _method == 'contra_entrega' ? _riderId : null,
                      deliveryRiderName: _method == 'contra_entrega'
                          ? (_users.where((u) => u['id'] == _riderId).firstOrNull?['name'] as String?)
                          : null,
                      deliveryAddress: _method == 'contra_entrega' ? _address.text.trim() : null,
                    ),
                  )
              : null,
          child: const Text('Confirmar pago', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        ),
      ],
    );
  }
}

class _ReceiptDialog extends StatelessWidget {
  const _ReceiptDialog({required this.sale, required this.lines, required this.change, required this.method, required this.credit});
  final DbRow sale;
  final List<CartLine> lines;
  final double change;
  final String method;
  final bool credit;

  @override
  Widget build(BuildContext context) {
    final s = context.read<Session>();
    const mono = TextStyle(fontFamily: 'monospace', fontSize: 12.5, height: 1.4);
    return AlertDialog(
      title: Row(children: [
        const IconTile(LucideIcons.check, color: Kio.green, size: 34),
        const SizedBox(width: 12),
        Text('Venta ${sale['number']}', style: Kio.h2(18)),
      ]),
      content: Container(
        width: 330,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: const Color(0xFFFAFAF7), border: Border.all(color: Kio.border), borderRadius: BorderRadius.circular(8)),
        child: DefaultTextStyle(
          style: mono.copyWith(color: Kio.text),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(s.company!.name.toUpperCase(), textAlign: TextAlign.center, style: mono.copyWith(fontWeight: FontWeight.w700)),
            if (s.company!.nit != null) Text('NIT ${s.company!.nit}', textAlign: TextAlign.center),
            Text(dateTime(sale['date']), textAlign: TextAlign.center),
            const Text('--------------------------------'),
            for (final l in lines) Text('${qty(l.qty)} x ${l.name}\n${money(l.total).padLeft(32)}'),
            const Text('--------------------------------'),
            Text('SUBTOTAL ${money(sale['subtotal']).padLeft(23)}'),
            Text('IVA      ${money(sale['tax_total']).padLeft(23)}'),
            Text('TOTAL    ${money(sale['total']).padLeft(23)}', style: mono.copyWith(fontWeight: FontWeight.w800)),
            Text(credit ? 'A CRÉDITO' : '${(kPayMethods[method] ?? method).toUpperCase()}${change > 0 ? '  CAMBIO ${money(change)}' : ''}'),
            if (s.company!.receiptFooter != null) ...[const SizedBox(height: 6), Text(s.company!.receiptFooter!, textAlign: TextAlign.center)],
          ]),
        ),
      ),
      actions: [FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Nueva venta'))],
    );
  }
}

// =============================================================================
// Sesiones de caja (historial, arqueos)
// =============================================================================

class PosSessionsPage extends StatelessWidget {
  const PosSessionsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return PageBody(children: [
      const PageHeader(title: 'Sesiones de caja', subtitle: 'Aperturas, cierres y arqueos de todos los equipos.'),
      LiveQuery(
        query: () => LocalDb.instance.raw('''
          SELECT ps.*,
            (SELECT COALESCE(SUM(total),0) FROM sales s WHERE s.pos_session_id = ps.id AND s.deleted = 0 AND s.status = 'confirmada') AS sales_total,
            (SELECT COUNT(*) FROM sales s WHERE s.pos_session_id = ps.id AND s.deleted = 0 AND s.status = 'confirmada') AS sales_count
          FROM pos_sessions ps WHERE ps.deleted = 0 ORDER BY ps.opened_at DESC LIMIT 200'''),
        builder: (context, rows) {
          final open = rows.where((r) => r['status'] == 'abierta').length;
          final today = rows.where((r) => asStr(r['opened_at']).startsWith(localToday())).fold<double>(0, (a, r) => a + asNum(r['sales_total']));
          final diff = rows.where((r) => r['status'] == 'cerrada').fold<double>(0, (a, r) => a + asNum(r['difference']));
          return Column(children: [
            KpiGrid(maxColumns: 3, children: [
              KpiCard(icon: LucideIcons.store, color: Kio.green, label: 'Cajas abiertas', value: '$open'),
              KpiCard(icon: LucideIcons.trendingUp, color: Kio.navy, label: 'Ventas de hoy en caja', value: money(today)),
              KpiCard(icon: LucideIcons.calculator, color: diff.abs() < 1 ? Kio.green : Kio.danger, label: 'Diferencias de arqueo acumuladas', value: money(diff)),
            ]),
            const SizedBox(height: 20),
            KioTableCard(
              title: 'Historial',
              rows: rows,
              columns: [
                KioColumn('Sesión', (r) => NameCell(asStr(r['number']), subtitle: 'Terminal ${asStr(r['terminal'])}', avatar: false), flex: 2),
                KioColumn('Apertura', (r) => Text(dateTime(r['opened_at']))),
                KioColumn('Cierre', (r) => r['closed_at'] == null ? kDash : Text(dateTime(r['closed_at']))),
                KioColumn('Ventas', (r) => Text('${money(r['sales_total'])} (${r['sales_count']})'), numeric: true),
                KioColumn('Diferencia', (r) => r['status'] != 'cerrada'
                    ? kDash
                    : Text(money(r['difference']), style: TextStyle(fontWeight: FontWeight.w700, color: asNum(r['difference']).abs() < 1 ? Kio.green : Kio.danger)), numeric: true),
                KioColumn('Estado', (r) => StatusPill.status(asStr(r['status']))),
              ],
            ),
          ]);
        },
      ),
    ]);
  }
}

// =============================================================================
// Pantalla de cocina (artix_kds): refresco cada 5 s, ámbar a 10 min y rojo a 20 min
// =============================================================================

class KdsPage extends StatefulWidget {
  const KdsPage({super.key});
  @override
  State<KdsPage> createState() => _KdsPageState();
}

class _KdsPageState extends State<KdsPage> {
  Timer? _tick;
  Timer? _sync;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 5), (_) => setState(() {}));
    // Mientras la pantalla de cocina está abierta, sincroniza más seguido para ver pedidos de otras cajas.
    _sync = Timer.periodic(const Duration(seconds: 20), (_) => context.read<SyncService>().syncNow());
  }

  @override
  void dispose() {
    _tick?.cancel();
    _sync?.cancel();
    super.dispose();
  }

  Future<void> _set(DbRow sale, String status) async {
    final s = context.read<Session>();
    await LocalDb.instance.save('sales', {'id': sale['id'], 'kitchen_status': status}, companyId: s.companyId, userId: s.userId);
  }

  @override
  Widget build(BuildContext context) {
    return PageBody(children: [
      const PageHeader(title: 'Pantalla de cocina', subtitle: 'Pedidos enviados desde la caja. Ámbar a los 10 minutos, rojo a los 20.'),
      LiveQuery(
        query: () async {
          final db = LocalDb.instance;
          final sales = await db.all('sales', where: "kitchen_status IN ('pendiente','preparando')", orderBy: 'date');
          final lines = <String, List<DbRow>>{};
          for (final s in sales) {
            lines[s['id'] as String] = await db.all('sale_lines', where: 'sale_id = ?', args: [s['id']], orderBy: 'sequence');
          }
          return (sales: sales, lines: lines);
        },
        builder: (context, d) {
          if (d.sales.isEmpty) return const KioCard(child: EmptyState(icon: LucideIcons.chefHat, title: 'Sin pedidos pendientes'));
          return LayoutBuilder(builder: (context, c) {
            final cols = (c.maxWidth / 280).floor().clamp(1, 6);
            final w = (c.maxWidth - (cols - 1) * 14) / cols;
            return Wrap(spacing: 14, runSpacing: 14, children: [
              for (final sale in d.sales) SizedBox(width: w, child: _ticket(sale, d.lines[sale['id']] ?? const [])),
            ]);
          });
        },
      ),
    ]);
  }

  Widget _ticket(DbRow sale, List<DbRow> lines) {
    final start = parseDate(sale['date']) ?? DateTime.now();
    final mins = DateTime.now().difference(start).inMinutes;
    final color = mins >= 20 ? Kio.danger : mins >= 10 ? Kio.warning : Kio.green;
    final preparing = sale['kitchen_status'] == 'preparando';
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(Kio.radius),
        border: Border.all(color: color, width: 2),
        boxShadow: Kio.shadow,
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(color: Kio.tint(color, .12), borderRadius: const BorderRadius.vertical(top: Radius.circular(Kio.radius - 2))),
          child: Row(children: [
            Text(asStr(sale['table_ref']).isEmpty ? asStr(sale['number']) : 'Mesa ${sale['table_ref']}', style: Kio.h2(16)),
            const Spacer(),
            Icon(LucideIcons.clock, size: 14, color: color),
            const SizedBox(width: 4),
            Text('$mins min', style: TextStyle(color: color, fontWeight: FontWeight.w800)),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            for (final l in lines)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Text('${qty(l['qty'])} × ${asStr(l['name'])}', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
              ),
            if (asStr(sale['notes']).isNotEmpty) Text(asStr(sale['notes']), style: Kio.small),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
          child: preparing
              ? FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: Kio.green),
                  onPressed: () => _set(sale, 'listo'),
                  icon: const Icon(LucideIcons.check, size: 16),
                  label: const Text('Listo'),
                )
              : OutlinedButton.icon(onPressed: () => _set(sale, 'preparando'), icon: const Icon(LucideIcons.chefHat, size: 16), label: const Text('Preparar')),
        ),
      ]),
    );
  }
}
