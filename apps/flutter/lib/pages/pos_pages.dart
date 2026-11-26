import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../data/local_db.dart';
import '../services/business.dart';
import '../services/session.dart';
import '../services/sync_service.dart';
import '../theme/kio_theme.dart';
import '../ui/format.dart';
import '../ui/shell.dart';
import '../ui/widgets.dart';

// =============================================================================
// Caja POS (artix_pos): apertura, venta rápida, cobro y cierre con arqueo
// =============================================================================

class PosPage extends StatefulWidget {
  const PosPage({super.key});
  @override
  State<PosPage> createState() => _PosPageState();
}

class _PosPageState extends State<PosPage> {
  final List<CartLine> _cart = [];
  String? _cat;
  String _q = '';
  String? _partnerId;
  bool _kitchen = false;
  final _table = TextEditingController();
  final _scan = TextEditingController();
  final _scanFocus = FocusNode();

  Biz get _biz => Biz(context.read<Session>());

  void _add(DbRow p) {
    setState(() {
      final existing = _cart.where((l) => l.productId == p['id']).firstOrNull;
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
    _add(r.first);
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
    if (mounted) toast(context, 'Caja cerrada. Se enviará al servidor en la próxima sincronización.');
  }

  Future<void> _charge(DbRow session) async {
    final t = Totals.of(_cart);
    final result = await showDialog<_PayResult>(context: context, builder: (_) => _PayDialog(total: t.total, hasPartner: _partnerId != null));
    if (result == null || !mounted) return;
    try {
      final sale = await _biz.saveSale(
        channel: 'pos',
        lines: _cart,
        partnerId: _partnerId,
        paymentMode: result.credit ? 'credito' : 'contado',
        payments: result.credit ? const [] : [(result.method, t.total)],
        posSessionId: session['id'] as String,
        kitchenStatus: _kitchen ? 'pendiente' : null,
        tableRef: _table.text.trim().isEmpty ? null : _table.text.trim(),
      );
      if (!mounted) return;
      final lines = List<CartLine>.from(_cart);
      setState(() {
        _cart.clear();
        _partnerId = null;
        _table.clear();
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
        return (
          session: await _biz.openSession(),
          cats: await db.all('categories', orderBy: 'sequence, name'),
          products: await db.raw('''
            SELECT p.*, COALESCE((SELECT SUM(qty) FROM stock_moves m WHERE m.product_id = p.id AND m.deleted = 0), 0) AS stock
              FROM products p WHERE p.deleted = 0 AND p.active = 1 AND p.available_pos = 1 ORDER BY p.name'''),
          partners: await db.all('partners', where: 'is_customer = 1', orderBy: 'name'),
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
          if (_q.isEmpty) return true;
          final q = _q.toLowerCase();
          return asStr(p['name']).toLowerCase().contains(q) || asStr(p['sku']).toLowerCase().contains(q);
        }).toList();
        final wide = MediaQuery.sizeOf(context).width >= 1000;
        final catalog = _catalog(d.cats, products, d.session!);
        final cart = _cartPanel(d.session!, d.partners);
        if (wide) {
          return Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Expanded(child: catalog),
            SizedBox(width: 400, child: cart),
          ]);
        }
        return Stack(children: [
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
                backgroundColor: Colors.white,
                builder: (_) => FractionallySizedBox(
                  heightFactor: .9,
                  child: StatefulBuilder(
                    builder: (c, setModal) => _cartPanel(
                      d.session!,
                      d.partners,
                      setLocal: (fn) => setModal(fn),
                      onBeforeClose: () => Navigator.of(c).pop(),
                    ),
                  ),
                ),
              ),
              icon: const Icon(LucideIcons.shoppingBag, size: 18),
              label: Text('Ver carrito (${_cart.length}) · ${money(Totals.of(_cart).total)}'),
            ),
          ),
        ]);
      },
    );
  }

  Widget _catalog(List<DbRow> cats, List<DbRow> products, DbRow session) {
    return ListView(padding: const EdgeInsets.fromLTRB(20, 16, 16, 90), children: [
      Wrap(spacing: 12, runSpacing: 12, crossAxisAlignment: WrapCrossAlignment.center, children: [
        Text('Caja ${session['terminal']}', style: Kio.title(24)),
        StatusPill('Abierta · ${session['number']}', color: Kio.green),
        FilledButton.tonalIcon(onPressed: () => _closeSession(session), icon: const Icon(LucideIcons.lock, size: 16), label: const Text('Cerrar caja')),
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
      const SizedBox(height: 12),
      SizedBox(
        height: 44,
        child: ListView(scrollDirection: Axis.horizontal, children: [
          _catChip(null, 'Todos', Kio.navy),
          for (final c in cats) _catChip(c['id'] as String, asStr(c['name']), Kio.navy),
        ]),
      ),
      const SizedBox(height: 14),
      LayoutBuilder(builder: (context, c) {
        // Tiles grandes para táctil: mínimo ~160px, crecen según ancho.
        final cols = (c.maxWidth / 175).floor().clamp(2, 7);
        final w = (c.maxWidth - (cols - 1) * 12) / cols;
        return Wrap(spacing: 12, runSpacing: 12, children: [
          for (final p in products) SizedBox(width: w, child: _productTile(p)),
        ]);
      }),
    ]);
  }

  Widget _productTile(DbRow p) {
    final name = asStr(p['name']);
    final price = asNum(p['price']) * (1 + asNum(p['tax_rate']));
    final stock = asNum(p['stock']);
    final track = asBool(p['track_stock']);
    final out = track && stock <= 0;
    final color = Suite.pos.color;
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: out ? null : () => _add(p),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: out ? Kio.border : Kio.borderStrong),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // Área "imagen" táctil: icono grande con fondo de color (placeholder; listo para imagen real).
            Container(
              height: 88,
              width: double.infinity,
              decoration: BoxDecoration(
                color: Kio.tint(out ? Kio.muted : color, .10),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Center(
                child: Text(
                  name.isNotEmpty ? name.characters.first.toUpperCase() : '•',
                  style: TextStyle(fontFamily: Kio.heading, fontSize: 34, fontWeight: FontWeight.w800, color: out ? Kio.subtle : color),
                ),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 40,
              child: Text(name, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w700, height: 1.2, color: out ? Kio.subtle : Kio.textStrong)),
            ),
            const SizedBox(height: 4),
            Text(money(price), style: TextStyle(color: out ? Kio.subtle : Kio.navy, fontWeight: FontWeight.w800, fontSize: 17)),
            if (track)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(out ? 'Agotado' : 'Stock ${qty(stock)}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: out ? Kio.danger : Kio.muted)),
              ),
          ]),
        ),
      ),
    );
  }

  Widget _catChip(String? id, String label, Color color) {
    final sel = _cat == id;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: sel,
        showCheckmark: false,
        selectedColor: Kio.navy,
        labelStyle: TextStyle(color: sel ? Colors.white : Kio.textStrong, fontWeight: FontWeight.w600),
        side: const BorderSide(color: Kio.borderStrong),
        backgroundColor: Colors.white,
        shape: const StadiumBorder(),
        onSelected: (_) => setState(() => _cat = id),
      ),
    );
  }

  Widget _cartPanel(DbRow session, List<DbRow> partners, {void Function(VoidCallback fn)? setLocal, VoidCallback? onBeforeClose}) {
    void upd(VoidCallback fn) {
      if (mounted) setState(fn);
      setLocal?.call(fn);
    }

    final t = Totals.of(_cart);
    return Container(
      decoration: const BoxDecoration(color: Colors.white, border: Border(left: BorderSide(color: Kio.border))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 12, 8),
          child: Row(children: [
            Expanded(child: Text('Venta actual', style: Kio.h2(18))),
            if (_cart.isNotEmpty)
              TextButton(onPressed: () => upd(_cart.clear), child: const Text('Vaciar')),
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
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: DropdownButtonFormField<String?>(
            initialValue: _partnerId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Cliente', prefixIcon: Icon(LucideIcons.userRound, size: 16)),
            items: [
              const DropdownMenuItem<String?>(value: null, child: Text('Consumidor final')),
              for (final p in partners) DropdownMenuItem<String?>(value: p['id'] as String, child: Text(asStr(p['name']), overflow: TextOverflow.ellipsis)),
            ],
            onChanged: (v) => upd(() => _partnerId = v),
          ),
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
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      child: Row(children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(l.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                            const SizedBox(height: 2),
                            Text('${money(l.price * (1 + l.taxRate))} c/u', style: Kio.small),
                          ]),
                        ),
                        _qtyBtn(LucideIcons.minus, () => upd(() => l.qty <= 1 ? _cart.removeAt(i) : l.qty -= 1)),
                        SizedBox(width: 42, child: Text(qty(l.qty), textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
                        _qtyBtn(LucideIcons.plus, () => upd(() => l.qty += 1)),
                        SizedBox(width: 92, child: Text(money(l.total), textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
                      ]),
                    );
                  },
                ),
        ),
        const Divider(),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 4),
          child: Row(children: [
            Checkbox(value: _kitchen, onChanged: (v) => setState(() => _kitchen = v ?? false)),
            const Text('Enviar a cocina'),
            const SizedBox(width: 12),
            if (_kitchen) Expanded(child: TextField(controller: _table, decoration: const InputDecoration(hintText: 'Mesa / turno'))),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 6, 20, 0),
          child: Column(children: [
            _kv('Subtotal', money(t.subtotal)),
            _kv('IVA', money(t.tax)),
            const SizedBox(height: 6),
            _kv('Total', money(t.total), bold: true, size: 22),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size(0, 54), backgroundColor: Kio.green, textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, fontFamily: 'Inter')),
            onPressed: _cart.isEmpty ? null : () => _charge(session),
            icon: const Icon(LucideIcons.banknote),
            label: Text('Cobrar ${money(t.total)}'),
          ),
        ),
      ]),
    );
  }

  Widget _qtyBtn(IconData icon, VoidCallback onTap) => Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(border: Border.all(color: Kio.borderStrong), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, size: 18, color: Kio.textStrong),
          ),
        ),
      );
}

Widget _kv(String k, String v, {bool bold = false, double size = 14}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(children: [
        Text(k, style: bold ? Kio.h2(size * .8) : Kio.label),
        const Spacer(),
        Text(v, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600, fontSize: size, fontFamily: bold ? Kio.heading : null)),
      ]),
    );

class _PayResult {
  _PayResult(this.method, this.change, this.credit);
  final String method;
  final double change;
  final bool credit;
}

class _PayDialog extends StatefulWidget {
  const _PayDialog({required this.total, required this.hasPartner});
  final double total;
  final bool hasPartner;
  @override
  State<_PayDialog> createState() => _PayDialogState();
}

class _PayDialogState extends State<_PayDialog> {
  String _method = 'efectivo';
  late String _raw = widget.total.round().toString();

  double get _rec => double.tryParse(_raw) ?? 0;

  void _key(String k) {
    setState(() {
      if (k == 'C') {
        _raw = '0';
      } else if (k == '⌫') {
        _raw = _raw.length <= 1 ? '0' : _raw.substring(0, _raw.length - 1);
      } else if (k == '00') {
        _raw = (_raw == '0') ? '0' : '${_raw}00';
      } else {
        _raw = (_raw == '0') ? k : '$_raw$k';
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final change = _rec - widget.total;
    final quick = <int>{
      widget.total.round(),
      ...[2000, 5000, 10000, 20000, 50000, 100000].where((x) => x > widget.total.round()),
    }.toList()..sort();
    final wide = MediaQuery.sizeOf(context).width >= 700;

    final left = Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final e in {...kPayMethods, if (widget.hasPartner) 'credito': 'Crédito'}.entries)
          ChoiceChip(
            label: Text(e.value),
            selected: _method == e.key,
            showCheckmark: false,
            selectedColor: Kio.navy,
            labelStyle: TextStyle(color: _method == e.key ? Colors.white : Kio.textStrong, fontWeight: FontWeight.w700),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            onSelected: (_) => setState(() => _method = e.key),
          ),
      ]),
      const SizedBox(height: 16),
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: Kio.bg, borderRadius: BorderRadius.circular(14), border: Border.all(color: Kio.border)),
        child: Column(children: [
          _kv('Total a cobrar', money(widget.total), bold: true, size: 18),
          const Divider(height: 18),
          _kv('Recibido', money(_rec), bold: true, size: 22),
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
              onPressed: () => setState(() => _raw = q.toString()),
            ),
        ]),
      ],
      if (_method == 'credito')
        const Padding(padding: EdgeInsets.only(top: 14), child: Text('Se valida cupo, mora y bloqueo del cliente antes de registrar.', style: Kio.label)),
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
                                backgroundColor: k == 'C' ? Kio.tint(Kio.danger, .12) : k == '⌫' ? Kio.tint(Kio.warning, .12) : Kio.brandLight,
                                foregroundColor: k == 'C' ? Kio.danger : Kio.textStrong,
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

    return AlertDialog(
      title: Text('Cobrar ${money(widget.total)}', style: Kio.h2(20)),
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
          onPressed: _method == 'efectivo' && change < 0 ? null : () => Navigator.pop(context, _PayResult(_method == 'credito' ? 'credito' : _method, change < 0 ? 0 : change, _method == 'credito')),
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
