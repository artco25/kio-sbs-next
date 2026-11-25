import '../data/local_db.dart';
import '../ui/format.dart';
import 'session.dart';

/// Métodos de pago habituales en Colombia.
const kPayMethods = {
  'efectivo': 'Efectivo',
  'tarjeta': 'Tarjeta débito/crédito',
  'transferencia': 'Transferencia',
  'nequi': 'Nequi / Daviplata',
};

class CartLine {
  CartLine({this.productId, required this.name, this.qty = 1, required this.price, this.taxRate = 0.19, this.discountPct = 0, this.trackStock = false});
  final String? productId;
  final String name;
  double qty;
  double price;
  double taxRate;
  double discountPct;
  final bool trackStock;

  double get subtotal => qty * price * (1 - discountPct / 100);
  double get tax => subtotal * taxRate;
  double get total => subtotal + tax;

  factory CartLine.fromProduct(DbRow p) => CartLine(
        productId: p['id'] as String,
        name: asStr(p['name']),
        price: asNum(p['price']).toDouble(),
        taxRate: asNum(p['tax_rate']).toDouble(),
        trackStock: asBool(p['track_stock']),
      );

  factory CartLine.fromRow(DbRow l, {bool trackStock = false}) => CartLine(
        productId: l['product_id'] as String?,
        name: asStr(l['name']),
        qty: asNum(l['qty']).toDouble(),
        price: asNum(l['price']).toDouble(),
        taxRate: asNum(l['tax_rate']).toDouble(),
        discountPct: asNum(l['discount_pct']).toDouble(),
        trackStock: trackStock,
      );
}

class Totals {
  final double subtotal, tax, discount, total;
  const Totals(this.subtotal, this.tax, this.discount, this.total);
  factory Totals.of(List<CartLine> lines) {
    var sub = 0.0, tax = 0.0, disc = 0.0;
    for (final l in lines) {
      sub += l.subtotal;
      tax += l.tax;
      disc += l.qty * l.price * l.discountPct / 100;
    }
    return Totals(sub, tax, disc, (sub + tax).roundToDouble());
  }
}

class BusinessException implements Exception {
  BusinessException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Consultas de negocio sobre la SQLite local (funcionan sin internet).
class Biz {
  Biz(this.s);
  final Session s;
  LocalDb get db => LocalDb.instance;

  /// Ventas a crédito confirmadas con su saldo (cartera), igual que la CTE del servidor.
  static const receivablesSql = '''
    SELECT s.*, p.name AS partner_name,
           s.total - COALESCE((SELECT SUM(x.amount) FROM payments x
                                WHERE x.sale_id = s.id AND x.deleted = 0 AND x.kind IN ('venta','abono')), 0) AS balance
      FROM sales s LEFT JOIN partners p ON p.id = s.partner_id
     WHERE s.deleted = 0 AND s.status = 'confirmada' AND s.payment_mode = 'credito' ''';

  Future<({double balance, double overdue})> partnerBalance(String partnerId) async {
    final rows = await db.raw('SELECT balance, due_date FROM ($receivablesSql) WHERE partner_id = ? AND balance > 0.5', [partnerId]);
    final today = localToday();
    var bal = 0.0, over = 0.0;
    for (final r in rows) {
      final b = asNum(r['balance']).toDouble();
      bal += b;
      final due = asStr(r['due_date']);
      if (due.isNotEmpty && due.compareTo(today) < 0) over += b;
    }
    return (balance: bal, overdue: over);
  }

  Future<Map<String, double>> stockByProduct() async {
    final rows = await db.raw('SELECT product_id, SUM(qty) AS q FROM stock_moves WHERE deleted = 0 GROUP BY product_id');
    return {for (final r in rows) asStr(r['product_id']): asNum(r['q']).toDouble()};
  }

  /// Control de cartera (artix_cartera): cliente bloqueado, mora o cupo excedido.
  Future<void> checkCredit(String? partnerId, double amount) async {
    if (partnerId == null) throw BusinessException('Selecciona el cliente para vender a crédito');
    final p = await db.byId('partners', partnerId);
    if (p == null) throw BusinessException('Cliente no encontrado');
    if (asBool(p['blocked'])) throw BusinessException('${p['name']} está bloqueado en cartera');
    final b = await partnerBalance(partnerId);
    if (b.overdue > 0) throw BusinessException('${p['name']} tiene cartera vencida por ${money(b.overdue)}');
    final limit = asNum(p['credit_limit']).toDouble();
    if (limit > 0 && b.balance + amount > limit) {
      throw BusinessException('Supera el cupo de crédito: disponible ${money(limit - b.balance)}');
    }
  }

  String _dueDate(DbRow? partner) {
    final days = asNum(partner?['payment_term_days']).toInt();
    return ymd(DateTime.now().add(Duration(days: days <= 0 ? 30 : days)));
  }

  /// Crea/actualiza una venta con sus líneas; si queda confirmada, descuenta inventario y registra pagos.
  Future<DbRow> saveSale({
    String? id,
    required String channel, // 'pos' | 'pedido'
    required List<CartLine> lines,
    String? partnerId,
    String status = 'confirmada',
    String paymentMode = 'contado',
    List<(String method, double amount)> payments = const [],
    String? posSessionId,
    String? notes,
    String? kitchenStatus,
    String? tableRef,
  }) async {
    if (lines.isEmpty) throw BusinessException('Agrega al menos un producto');
    final t = Totals.of(lines);
    final confirm = status == 'confirmada';
    final partner = partnerId == null ? null : await db.byId('partners', partnerId);
    if (confirm && paymentMode == 'credito') await checkCredit(partnerId, t.total);

    final existing = id == null ? null : await db.byId('sales', id);
    final saleId = id ?? newId();
    final number = asStr(existing?['number']).isNotEmpty
        ? existing!['number'] as String
        : await db.nextNumber(channel == 'pos' ? 'POS' : 'PED', s.terminal);
    final rows = <(String, DbRow)>[
      (
        'sales',
        {
          'id': saleId,
          'number': number,
          'channel': channel,
          'partner_id': partnerId,
          'seller_id': s.userId,
          'pos_session_id': posSessionId,
          'date': existing?['date'] ?? localNow(),
          'due_date': paymentMode == 'credito' ? _dueDate(partner) : null,
          'status': status,
          'payment_mode': paymentMode,
          'subtotal': t.subtotal,
          'discount_total': t.discount,
          'tax_total': t.tax,
          'total': t.total,
          'kitchen_status': kitchenStatus,
          'table_ref': tableRef,
          'notes': notes,
        }
      ),
    ];
    // Reemplaza las líneas anteriores (borrador editado). Van ANTES que la venta: si la venta llega
    // primero como confirmada, el servidor bloquea a cajero/vendedor modificar sus líneas.
    if (existing != null) {
      final olds = await db.all('sale_lines', where: 'sale_id = ?', args: [saleId]);
      rows.insertAll(0, [for (final old in olds) ('sale_lines', <String, Object?>{'id': old['id'], 'deleted': 1})]);
    }
    for (var i = 0; i < lines.length; i++) {
      final l = lines[i];
      rows.add(('sale_lines', {
        'id': newId(),
        'sale_id': saleId,
        'product_id': l.productId,
        'name': l.name,
        'qty': l.qty,
        'price': l.price,
        'discount_pct': l.discountPct,
        'tax_rate': l.taxRate,
        'subtotal': l.subtotal,
        'tax': l.tax,
        'total': l.total,
        'sequence': i + 1,
      }));
      if (confirm && l.trackStock && l.productId != null) {
        rows.add(('stock_moves', {'id': newId(), 'product_id': l.productId, 'qty': -l.qty, 'kind': 'venta', 'ref_id': saleId, 'date': localToday()}));
      }
    }
    for (final (method, amount) in payments) {
      if (amount <= 0) continue;
      rows.add(('payments', {
        'id': newId(),
        'number': await db.nextNumber('RC', s.terminal),
        'kind': 'venta',
        'sale_id': saleId,
        'partner_id': partnerId,
        'pos_session_id': posSessionId,
        'date': localNow(),
        'method': method,
        'amount': amount,
        'user_id': s.userId,
      }));
    }
    await db.saveAll(rows, companyId: s.companyId, userId: s.userId);
    return rows.firstWhere((r) => r.$1 == 'sales').$2;
  }

  /// Recibo de caja / abono a cartera: reparte el valor entre las facturas más antiguas.
  Future<List<String>> registerReceipt({required String partnerId, required double amount, required String method, String? reference, String? notes}) async {
    final open = await db.raw('SELECT * FROM ($receivablesSql) WHERE partner_id = ? AND balance > 0.5 ORDER BY due_date, date', [partnerId]);
    if (open.isEmpty) throw BusinessException('El cliente no tiene saldo pendiente');
    var left = amount;
    final rows = <(String, DbRow)>[];
    final numbers = <String>[];
    for (final sale in open) {
      if (left <= 0.5) break;
      final pay = left < asNum(sale['balance']) ? left : asNum(sale['balance']).toDouble();
      final number = await db.nextNumber('RC', s.terminal);
      numbers.add(number);
      rows.add(('payments', {
        'id': newId(),
        'number': number,
        'kind': 'abono',
        'sale_id': sale['id'],
        'partner_id': partnerId,
        'date': localNow(),
        'method': method,
        'amount': pay,
        'reference': reference,
        'notes': notes,
        'user_id': s.userId,
      }));
      left -= pay;
    }
    if (left > 0.5) throw BusinessException('El valor supera el saldo del cliente en ${money(left)}');
    await db.saveAll(rows, companyId: s.companyId, userId: s.userId);
    return numbers;
  }

  /// Sesión de caja abierta del usuario en este equipo.
  Future<DbRow?> openSession() async {
    final r = await db.all('pos_sessions', where: "status = 'abierta' AND user_id = ?", args: [s.userId], orderBy: 'opened_at DESC', limit: 1);
    return r.isEmpty ? null : r.first;
  }

  /// Efectivo esperado = base + cobros en efectivo − gastos de caja menor pagados desde la caja.
  Future<({double cashIn, double expenses, double expected, Map<String, double> byMethod, double sales, int count})> sessionSummary(DbRow session) async {
    final id = session['id'];
    final pays = await db.raw('SELECT method, SUM(amount) AS a FROM payments WHERE deleted = 0 AND pos_session_id = ? GROUP BY method', [id]);
    final byMethod = {for (final r in pays) asStr(r['method']): asNum(r['a']).toDouble()};
    final exp = (await db.scalar("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE deleted = 0 AND pos_session_id = ? AND status <> 'rechazada'", [id])).toDouble();
    final sales = await db.raw("SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS n FROM sales WHERE deleted = 0 AND status = 'confirmada' AND pos_session_id = ?", [id]);
    final cash = byMethod['efectivo'] ?? 0;
    return (
      cashIn: cash,
      expenses: exp,
      expected: asNum(session['opening_cash']).toDouble() + cash - exp,
      byMethod: byMethod,
      sales: asNum(sales.first['t']).toDouble(),
      count: asNum(sales.first['n']).toInt(),
    );
  }
}
