import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../data/local_db.dart';
import '../services/business.dart';
import '../services/session.dart';
import '../theme/kio_theme.dart';
import '../ui/entity_form.dart';
import '../ui/format.dart';
import '../ui/shell.dart';
import '../ui/widgets.dart';
import 'csv_export.dart';

// =============================================================================
// Contactos (contacts + artix_cartera: cupo, plazo y bloqueo)
// =============================================================================

const partnerFields = [
  FieldSpec('name', 'Nombre o razón social', required: true, full: true),
  FieldSpec('doc_type', 'Tipo de documento', type: FieldType.select, options: {'CC': 'Cédula', 'NIT': 'NIT', 'CE': 'Cédula de extranjería', 'PP': 'Pasaporte'}, defaultValue: 'CC'),
  FieldSpec('doc_number', 'Número de documento'),
  FieldSpec('email', 'Correo', type: FieldType.email),
  FieldSpec('phone', 'Teléfono', type: FieldType.phone),
  FieldSpec('address', 'Dirección'),
  FieldSpec('city', 'Ciudad'),
  FieldSpec('is_customer', 'Es cliente', type: FieldType.boolean, defaultValue: 1),
  FieldSpec('is_supplier', 'Es proveedor', type: FieldType.boolean),
  FieldSpec('credit_limit', 'Cupo de crédito', type: FieldType.money, hint: '0 = sin cupo'),
  FieldSpec('payment_term_days', 'Plazo de pago (días)', type: FieldType.integer, defaultValue: 30),
  FieldSpec('blocked', 'Bloqueado en cartera', type: FieldType.boolean),
  FieldSpec('notes', 'Notas', type: FieldType.multiline),
];

class PartnersPage extends StatefulWidget {
  const PartnersPage({super.key});
  @override
  State<PartnersPage> createState() => _PartnersPageState();
}

class _PartnersPageState extends State<PartnersPage> {
  String _q = '';
  String? _kind;
  int _tab = 0;

  Future<({List<DbRow> rows, int total, int withSales, double ticket})> _load() async {
    final db = LocalDb.instance;
    final where = <String>['p.deleted = 0'];
    final args = <Object?>[];
    if (_q.isNotEmpty) {
      where.add('(p.name LIKE ? OR p.doc_number LIKE ? OR p.email LIKE ?)');
      args.addAll(['%$_q%', '%$_q%', '%$_q%']);
    }
    if (_kind == 'cliente') where.add('p.is_customer = 1');
    if (_kind == 'proveedor') where.add('p.is_supplier = 1');
    if (_kind == 'bloqueado') where.add('p.blocked = 1');
    final rows = await db.raw('''
      SELECT p.*,
        COALESCE((SELECT SUM(total) FROM sales s WHERE s.partner_id = p.id AND s.deleted = 0 AND s.status = 'confirmada'), 0) AS sales_total,
        COALESCE((SELECT SUM(balance) FROM (${Biz.receivablesSql}) r WHERE r.partner_id = p.id AND r.balance > 0.5), 0) AS balance
      FROM partners p WHERE ${where.join(' AND ')} ORDER BY p.name LIMIT 500''', args);
    final total = (await db.scalar('SELECT COUNT(*) FROM partners WHERE deleted = 0')).toInt();
    final withSales = (await db.scalar("SELECT COUNT(DISTINCT partner_id) FROM sales WHERE deleted = 0 AND status = 'confirmada' AND partner_id IS NOT NULL")).toInt();
    final t = await db.raw("SELECT COALESCE(AVG(total),0) a FROM sales WHERE deleted = 0 AND status = 'confirmada'");
    return (rows: rows, total: total, withSales: withSales, ticket: asNum(t.first['a']).toDouble());
  }

  Future<void> _edit([DbRow? r]) => showEntityForm(context, table: 'partners', title: r == null ? 'Nuevo contacto' : asStr(r['name']), fields: partnerFields, initial: r);

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return PageBody(children: [
      PageHeader(
        title: 'Contactos',
        tabs: const ['Resumen', 'Tabla'],
        tab: _tab,
        onTab: (i) => setState(() => _tab = i),
        actions: [if (s.canWrite('partners')) FilledButton.icon(onPressed: _edit, icon: const Icon(LucideIcons.plus, size: 16), label: const Text('Nuevo'))],
      ),
      LiveQuery(
        deps: [_q, _kind],
        query: _load,
        builder: (context, d) {
          final maxSales = d.rows.fold<double>(0, (m, r) => asNum(r['sales_total']) > m ? asNum(r['sales_total']).toDouble() : m);
          final table = KioTableCard(
            title: 'Clientes y proveedores',
            subtitle: 'Empresas y personas con las que haces negocio.',
            trailing: OutlinedButton.icon(
              onPressed: () => exportCsv(context, 'contactos', d.rows, const ['name', 'doc_type', 'doc_number', 'email', 'phone', 'city', 'credit_limit', 'balance', 'sales_total']),
              icon: const Icon(LucideIcons.download, size: 15),
              label: const Text('Descargar todo'),
            ),
            toolbar: [
              SearchField(hint: 'Buscar contacto…', onChanged: (v) => setState(() => _q = v.trim())),
              FilterChipMenu<String>(
                label: 'Todos los tipos',
                value: _kind,
                options: const {null: 'Todos los tipos', 'cliente': 'Clientes', 'proveedor': 'Proveedores', 'bloqueado': 'Bloqueados'},
                onSelected: (v) => setState(() => _kind = v),
              ),
            ],
            onTap: _edit,
            rows: d.rows,
            columns: [
              KioColumn('Contacto', (r) => NameCell(asStr(r['name']), subtitle: asStr(r['email']).isEmpty ? asStr(r['doc_number']) : asStr(r['email'])), flex: 4),
              KioColumn('Estado', (r) => asBool(r['blocked'])
                  ? StatusPill.status('bloqueado')
                  : asNum(r['sales_total']) > 0
                      ? const StatusPill('Cliente', color: Kio.green)
                      : asBool(r['is_supplier'])
                          ? const StatusPill('Proveedor', color: Kio.info)
                          : const StatusPill('Potencial')),
              KioColumn('Ciudad', (r) => Text(asStr(r['city']).isEmpty ? '—' : asStr(r['city']))),
              KioColumn('Cartera', (r) => Text(asNum(r['balance']) > 0 ? money(r['balance']) : '—', style: TextStyle(color: asNum(r['balance']) > 0 ? Kio.danger : Kio.subtle, fontWeight: FontWeight.w600)), numeric: true),
              KioColumn('Ventas', (r) => Text(money(r['sales_total'])), numeric: true),
              KioColumn('Uso', (r) => UsageBar(maxSales == 0 ? 0 : asNum(r['sales_total']) / maxSales), numeric: true, flex: 2),
            ],
            mobileTitle: (r) => Text(asStr(r['name']), style: const TextStyle(fontWeight: FontWeight.w700)),
            mobileSubtitle: (r) => Text('${asStr(r['city'])} · ventas ${money(r['sales_total'])}'),
            mobileTrailing: (r) => asNum(r['balance']) > 0 ? Text(money(r['balance']), style: const TextStyle(color: Kio.danger)) : null,
          );
          if (_tab == 1) return table;
          return Column(children: [
            KpiGrid(maxColumns: 3, children: [
              KpiCard(icon: LucideIcons.userRound, color: Kio.green, label: 'Contactos totales', value: qty(d.total)),
              KpiCard(icon: LucideIcons.tag, color: Kio.green, label: 'Clientes con compras', value: qty(d.withSales)),
              KpiCard(icon: LucideIcons.fileText, color: Kio.info, label: 'Ticket medio', value: money(d.ticket)),
            ]),
            const SizedBox(height: 20),
            table,
          ]);
        },
      ),
    ]);
  }
}

// =============================================================================
// Productos, categorías e inventario (product, stock)
// =============================================================================

List<FieldSpec> productFields() => const [
      FieldSpec('name', 'Nombre', required: true, full: true),
      FieldSpec('sku', 'Referencia (SKU)'),
      FieldSpec('barcode', 'Código de barras'),
      FieldSpec('category_id', 'Categoría', type: FieldType.ref, refTable: 'categories'),
      FieldSpec('unit', 'Unidad', type: FieldType.select, options: {'unidad': 'Unidad', 'kg': 'Kilogramo', 'lb': 'Libra', 'l': 'Litro', 'servicio': 'Servicio'}, defaultValue: 'unidad'),
      FieldSpec('price', 'Precio de venta (sin IVA)', type: FieldType.money, required: true),
      FieldSpec('cost', 'Costo', type: FieldType.money),
      FieldSpec('tax_rate', 'IVA', type: FieldType.select, options: {'0.19': '19 %', '0.05': '5 %', '0.0': 'Exento / excluido'}, defaultValue: '0.19'),
      FieldSpec('min_stock', 'Stock mínimo', type: FieldType.number),
      FieldSpec('track_stock', 'Controla inventario', type: FieldType.boolean, defaultValue: 1),
      FieldSpec('available_pos', 'Disponible en POS', type: FieldType.boolean, defaultValue: 1),
      FieldSpec('active', 'Activo', type: FieldType.boolean, defaultValue: 1),
    ];

class ProductsPage extends StatefulWidget {
  const ProductsPage({super.key});
  @override
  State<ProductsPage> createState() => _ProductsPageState();
}

class _ProductsPageState extends State<ProductsPage> {
  int _tab = 0;
  String _q = '';
  String? _cat;

  Future<void> _edit([DbRow? r]) async {
    final init = r == null ? null : {...r, 'tax_rate': '${asNum(r['tax_rate']).toDouble()}'};
    await showEntityForm(
      context,
      table: 'products',
      title: r == null ? 'Nuevo producto' : asStr(r['name']),
      fields: productFields(),
      initial: init,
      validate: (v) {
        v['tax_rate'] = double.tryParse('${v['tax_rate']}') ?? 0.19;
        return null;
      },
    );
  }

  Future<void> _adjust(DbRow p) async {
    final ctrl = TextEditingController();
    String kind = 'compra';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: Text('Movimiento de inventario', style: Kio.h2(18)),
          content: SizedBox(
            width: 380,
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(asStr(p['name']), style: const TextStyle(fontWeight: FontWeight.w700)),
              Text('Existencia actual: ${qty(p['stock'])}', style: Kio.label),
              const SizedBox(height: 14),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'compra', label: Text('Entrada')),
                  ButtonSegment(value: 'salida', label: Text('Salida')),
                  ButtonSegment(value: 'ajuste', label: Text('Conteo')),
                ],
                selected: {kind},
                onSelectionChanged: (v) => set(() => kind = v.first),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: ctrl,
                autofocus: true,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: kind == 'ajuste' ? 'Cantidad contada' : 'Cantidad'),
              ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Registrar')),
          ],
        ),
      ),
    );
    final n = double.tryParse(ctrl.text.replaceAll(',', '.'));
    if (ok != true || n == null || !mounted) return;
    final current = asNum(p['stock']).toDouble();
    final delta = switch (kind) { 'compra' => n, 'salida' => -n, _ => n - current };
    if (delta == 0) return;
    final s = context.read<Session>();
    await LocalDb.instance.save('stock_moves', {
      'product_id': p['id'],
      'qty': delta,
      'kind': kind == 'salida' ? 'ajuste' : kind,
      'date': localToday(),
      'unit_cost': p['cost'],
      'notes': kind == 'ajuste' ? 'Conteo físico' : null,
    }, companyId: s.companyId, userId: s.userId);
    if (mounted) toast(context, 'Inventario actualizado (${delta > 0 ? '+' : ''}${qty(delta)})');
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return PageBody(children: [
      PageHeader(
        title: 'Productos e inventario',
        tabs: const ['Productos', 'Categorías', 'Movimientos'],
        tab: _tab,
        onTab: (i) => setState(() => _tab = i),
        actions: [
          if (s.canWrite('products') && _tab == 0) FilledButton.icon(onPressed: _edit, icon: const Icon(LucideIcons.plus, size: 16), label: const Text('Nuevo producto')),
          if (s.canWrite('categories') && _tab == 1)
            FilledButton.icon(
              onPressed: () => showEntityForm(context, table: 'categories', title: 'Nueva categoría', fields: _catFields),
              icon: const Icon(LucideIcons.plus, size: 16),
              label: const Text('Nueva categoría'),
            ),
        ],
      ),
      if (_tab == 0) _products(s),
      if (_tab == 1) _categories(),
      if (_tab == 2) _moves(),
    ]);
  }

  static const _catFields = [
    FieldSpec('name', 'Nombre', required: true, full: true),
    FieldSpec('color', 'Color', type: FieldType.select, options: {'#24A756': 'Verde', '#4A9FD8': 'Azul', '#E0A33C': 'Ámbar', '#8B6FD6': 'Morado', '#D0454A': 'Rojo', '#214F76': 'Azul marino'}),
    FieldSpec('sequence', 'Orden', type: FieldType.integer),
  ];

  Widget _products(Session s) => LiveQuery(
        deps: [_q, _cat],
        query: () async {
          final db = LocalDb.instance;
          final cats = await db.all('categories', orderBy: 'sequence, name');
          final args = <Object?>[];
          var where = 'p.deleted = 0';
          if (_q.isNotEmpty) {
            where += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)';
            args.addAll(['%$_q%', '%$_q%', '%$_q%']);
          }
          if (_cat != null) {
            where += ' AND p.category_id = ?';
            args.add(_cat);
          }
          final rows = await db.raw('''
            SELECT p.*, c.name AS category_name, c.color AS category_color,
                   COALESCE((SELECT SUM(qty) FROM stock_moves m WHERE m.product_id = p.id AND m.deleted = 0), 0) AS stock
              FROM products p LEFT JOIN categories c ON c.id = p.category_id
             WHERE $where ORDER BY p.name''', args);
          return (cats: cats, rows: rows);
        },
        builder: (context, d) {
          final value = d.rows.fold<double>(0, (a, r) => a + asNum(r['stock']) * asNum(r['cost']));
          final low = d.rows.where((r) => asBool(r['track_stock']) && asNum(r['stock']) <= asNum(r['min_stock'])).length;
          return Column(children: [
            KpiGrid(maxColumns: 3, children: [
              KpiCard(icon: LucideIcons.package, color: Kio.warning, label: 'Productos', value: qty(d.rows.length)),
              KpiCard(icon: LucideIcons.boxes, color: Kio.navy, label: 'Inventario valorizado (costo)', value: money(value)),
              KpiCard(icon: LucideIcons.circleAlert, color: low > 0 ? Kio.danger : Kio.green, label: 'Bajo el mínimo', value: qty(low)),
            ]),
            const SizedBox(height: 20),
            KioTableCard(
              title: 'Catálogo',
              subtitle: 'Precios sin IVA. Toca un producto para editarlo.',
              trailing: OutlinedButton.icon(
                onPressed: () => exportCsv(context, 'productos', d.rows, const ['name', 'sku', 'barcode', 'category_name', 'price', 'cost', 'tax_rate', 'stock']),
                icon: const Icon(LucideIcons.download, size: 15),
                label: const Text('Descargar todo'),
              ),
              toolbar: [
                SearchField(hint: 'Nombre, SKU o código de barras…', onChanged: (v) => setState(() => _q = v.trim())),
                FilterChipMenu<String>(
                  label: 'Todas las categorías',
                  value: _cat,
                  options: {null: 'Todas las categorías', for (final c in d.cats) c['id'] as String: asStr(c['name'])},
                  onSelected: (v) => setState(() => _cat = v),
                ),
              ],
              onTap: s.canWrite('products') ? _edit : null,
              rows: d.rows,
              columns: [
                KioColumn('Producto', (r) => NameCell(asStr(r['name']), subtitle: [asStr(r['sku']), asStr(r['barcode'])].where((x) => x.isNotEmpty).join(' · ')), flex: 4),
                KioColumn('Categoría', (r) => r['category_name'] == null ? kDash : StatusPill(asStr(r['category_name']), color: _hex(r['category_color']))),
                KioColumn('Precio', (r) => Text(money(r['price']), style: const TextStyle(fontWeight: FontWeight.w600)), numeric: true),
                KioColumn('IVA', (r) => Text(pct(r['tax_rate'])), numeric: true, flex: 1),
                KioColumn('Existencia', (r) {
                  if (!asBool(r['track_stock'])) return kDash;
                  final lowS = asNum(r['stock']) <= asNum(r['min_stock']);
                  return StatusPill('${qty(r['stock'])} ${asStr(r['unit'])}', color: lowS ? Kio.danger : Kio.green);
                }, numeric: true),
                KioColumn('', (r) => s.canWrite('stock_moves') && asBool(r['track_stock'])
                    ? IconButton(tooltip: 'Movimiento de inventario', onPressed: () => _adjust(r), icon: const Icon(LucideIcons.arrowRightLeft, size: 16, color: Kio.navy))
                    : const SizedBox(), numeric: true, flex: 1),
              ],
              mobileTitle: (r) => Text(asStr(r['name']), style: const TextStyle(fontWeight: FontWeight.w700)),
              mobileSubtitle: (r) => Text('${money(r['price'])} · stock ${qty(r['stock'])}'),
            ),
          ]);
        },
      );

  Widget _categories() => LiveQuery(
        query: () => LocalDb.instance.raw('''
          SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.deleted = 0) AS n
            FROM categories c WHERE c.deleted = 0 ORDER BY c.sequence, c.name'''),
        builder: (context, rows) => KioTableCard(
          title: 'Categorías',
          subtitle: 'Agrupan los productos en el POS y en los informes.',
          rows: rows,
          onTap: (r) => showEntityForm(context, table: 'categories', title: asStr(r['name']), fields: _catFields, initial: r),
          columns: [
            KioColumn('Categoría', (r) => Row(children: [IconTile(LucideIcons.tag, color: _hex(r['color']), size: 30), const SizedBox(width: 12), Text(asStr(r['name']), style: const TextStyle(fontWeight: FontWeight.w700))]), flex: 4),
            KioColumn('Productos', (r) => Text(qty(r['n'])), numeric: true),
          ],
        ),
      );

  Widget _moves() => LiveQuery(
        query: () => LocalDb.instance.raw('''
          SELECT m.*, p.name AS product_name FROM stock_moves m LEFT JOIN products p ON p.id = m.product_id
           WHERE m.deleted = 0 ORDER BY m.created_at DESC LIMIT 300'''),
        builder: (context, rows) => KioTableCard(
          title: 'Movimientos de inventario',
          subtitle: 'Últimos 300 movimientos (ventas, entradas y conteos).',
          rows: rows,
          columns: [
            KioColumn('Fecha', (r) => Text(dateShort(r['date']))),
            KioColumn('Producto', (r) => Text(asStr(r['product_name']), style: const TextStyle(fontWeight: FontWeight.w600)), flex: 4),
            KioColumn('Tipo', (r) => StatusPill(asStr(r['kind']), color: r['kind'] == 'venta' ? Kio.info : r['kind'] == 'compra' ? Kio.green : Kio.warning)),
            KioColumn('Cantidad', (r) => Text('${asNum(r['qty']) > 0 ? '+' : ''}${qty(r['qty'])}', style: TextStyle(fontWeight: FontWeight.w700, color: asNum(r['qty']) < 0 ? Kio.danger : Kio.green)), numeric: true),
          ],
        ),
      );
}

Color _hex(Object? v) {
  final s = asStr(v).replaceAll('#', '');
  final n = int.tryParse(s, radix: 16);
  return n == null || s.length != 6 ? Kio.navy : Color(0xFF000000 | n);
}

// =============================================================================
// Pedidos de venta / cotizaciones (sale)
// =============================================================================

class OrdersPage extends StatefulWidget {
  const OrdersPage({super.key});
  @override
  State<OrdersPage> createState() => _OrdersPageState();
}

class _OrdersPageState extends State<OrdersPage> {
  String _q = '';
  String? _status;
  String _channel = 'pedido';

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return PageBody(children: [
      PageHeader(
        title: 'Pedidos de venta',
        tabs: const ['Pedidos y cotizaciones', 'Ventas POS'],
        tab: _channel == 'pedido' ? 0 : 1,
        onTab: (i) => setState(() => _channel = i == 0 ? 'pedido' : 'pos'),
        actions: [
          if (s.canWrite('sales'))
            FilledButton.icon(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const OrderEditor())),
              icon: const Icon(LucideIcons.plus, size: 16),
              label: const Text('Nuevo'),
            ),
        ],
      ),
      LiveQuery(
        deps: [_q, _status, _channel],
        query: () {
          final args = <Object?>[_channel];
          var where = 's.deleted = 0 AND s.channel = ?';
          if (_q.isNotEmpty) {
            where += ' AND (s.number LIKE ? OR p.name LIKE ?)';
            args.addAll(['%$_q%', '%$_q%']);
          }
          if (_status != null) {
            where += ' AND s.status = ?';
            args.add(_status);
          }
          return LocalDb.instance.raw('''
            SELECT s.*, p.name AS partner_name,
                   COALESCE((SELECT SUM(amount) FROM payments x WHERE x.sale_id = s.id AND x.deleted = 0), 0) AS paid
              FROM sales s LEFT JOIN partners p ON p.id = s.partner_id
             WHERE $where ORDER BY s.date DESC LIMIT 300''', args);
        },
        builder: (context, rows) {
          final total = rows.where((r) => r['status'] == 'confirmada').fold<double>(0, (a, r) => a + asNum(r['total']));
          return KioTableCard(
            title: _channel == 'pedido' ? 'Cotizaciones y pedidos' : 'Ventas de caja',
            subtitle: 'Confirmado en la vista: ${money(total)}',
            trailing: OutlinedButton.icon(
              onPressed: () => exportCsv(context, 'ventas', rows, const ['number', 'date', 'partner_name', 'status', 'payment_mode', 'subtotal', 'tax_total', 'total', 'paid']),
              icon: const Icon(LucideIcons.download, size: 15),
              label: const Text('Descargar todo'),
            ),
            toolbar: [
              SearchField(hint: 'Número o cliente…', onChanged: (v) => setState(() => _q = v.trim())),
              FilterChipMenu<String>(
                label: 'Todos los estados',
                value: _status,
                options: const {null: 'Todos los estados', 'borrador': 'Cotización', 'confirmada': 'Confirmada', 'anulada': 'Anulada'},
                onSelected: (v) => setState(() => _status = v),
              ),
            ],
            rows: rows,
            onTap: (r) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => OrderEditor(saleId: r['id'] as String))),
            columns: [
              KioColumn('Número', (r) => Text(asStr(r['number']), style: const TextStyle(fontWeight: FontWeight.w700))),
              KioColumn('Fecha', (r) => Text(dateTime(r['date']))),
              KioColumn('Cliente', (r) => r['partner_name'] == null ? const Text('Consumidor final', style: Kio.label) : NameCell(asStr(r['partner_name'])), flex: 3),
              KioColumn('Total', (r) => Text(money(r['total']), style: const TextStyle(fontWeight: FontWeight.w600, color: Kio.navy)), numeric: true),
              KioColumn('Estado', (r) => r['status'] == 'borrador' ? const StatusPill('Cotización', color: Kio.navy) : StatusPill.status(asStr(r['status']))),
              KioColumn('Pago', (r) {
                if (r['status'] != 'confirmada') return kDash;
                final bal = asNum(r['total']) - asNum(r['paid']);
                if (bal <= 0.5) return StatusPill.status('pagada');
                return StatusPill(asNum(r['paid']) > 0 ? 'Parcial' : 'Por cobrar', color: Kio.warning);
              }),
            ],
            mobileTitle: (r) => Text('${asStr(r['number'])} · ${asStr(r['partner_name'] ?? 'Consumidor final')}', style: const TextStyle(fontWeight: FontWeight.w700)),
            mobileSubtitle: (r) => Text(dateTime(r['date'])),
            mobileTrailing: (r) => Text(money(r['total']), style: const TextStyle(fontWeight: FontWeight.w700)),
          );
        },
      ),
    ]);
  }
}

/// Editor de cotización / pedido con líneas, control de cupo y confirmación.
class OrderEditor extends StatefulWidget {
  const OrderEditor({super.key, this.saleId});
  final String? saleId;
  @override
  State<OrderEditor> createState() => _OrderEditorState();
}

class _OrderEditorState extends State<OrderEditor> {
  DbRow? _sale;
  String? _partnerId;
  String _mode = 'credito';
  final List<CartLine> _lines = [];
  List<DbRow> _partners = [], _products = [];
  final _notes = TextEditingController();
  bool _loading = true;

  bool get _locked => _sale != null && _sale!['status'] != 'borrador';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final db = LocalDb.instance;
    _partners = await db.all('partners', where: 'is_customer = 1', orderBy: 'name');
    _products = await db.all('products', where: 'active = 1', orderBy: 'name');
    if (widget.saleId != null) {
      _sale = await db.byId('sales', widget.saleId);
      _partnerId = _sale?['partner_id'] as String?;
      _mode = asStr(_sale?['payment_mode']).isEmpty ? 'credito' : asStr(_sale!['payment_mode']);
      _notes.text = asStr(_sale?['notes']);
      for (final l in await db.all('sale_lines', where: 'sale_id = ?', args: [widget.saleId], orderBy: 'sequence')) {
        final p = _products.where((x) => x['id'] == l['product_id']).firstOrNull;
        _lines.add(CartLine.fromRow(l, trackStock: p != null && asBool(p['track_stock'])));
      }
    }
    setState(() => _loading = false);
  }

  Future<void> _save(String status) async {
    final s = context.read<Session>();
    try {
      final sale = await Biz(s).saveSale(
        id: _sale?['id'] as String?,
        channel: 'pedido',
        lines: _lines,
        partnerId: _partnerId,
        status: status,
        paymentMode: _mode,
        notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
        payments: status == 'confirmada' && _mode == 'contado' ? [('efectivo', Totals.of(_lines).total)] : const [],
      );
      if (!mounted) return;
      toast(context, status == 'confirmada' ? 'Pedido ${sale['number']} confirmado' : 'Cotización ${sale['number']} guardada');
      Navigator.pop(context);
    } on BusinessException catch (e) {
      toast(context, e.message, error: true);
    }
  }

  Future<void> _annul() async {
    if (!await confirm(context, 'Anular pedido', 'El pedido quedará anulado. Esta acción se sincroniza con todos los equipos.', ok: 'Anular', danger: true)) return;
    if (!mounted) return;
    final s = context.read<Session>();
    await LocalDb.instance.save('sales', {'id': _sale!['id'], 'status': 'anulada'}, companyId: s.companyId, userId: s.userId);
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final t = Totals.of(_lines);
    final s = context.watch<Session>();
    return Scaffold(
      appBar: AppBar(
        title: Text(_sale == null ? 'Nueva cotización' : asStr(_sale!['number']), style: Kio.h2(18)),
        actions: [
          if (_sale != null) Padding(padding: const EdgeInsets.only(right: 12), child: StatusPill.status(asStr(_sale!['status']))),
          if (_sale != null && _sale!['status'] == 'confirmada' && s.isFinance)
            TextButton.icon(onPressed: _annul, style: TextButton.styleFrom(foregroundColor: Kio.danger), icon: const Icon(LucideIcons.x, size: 16), label: const Text('Anular')),
          const SizedBox(width: 12),
        ],
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider()),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : PageBody(children: [
              KioCard(
                child: Wrap(spacing: 16, runSpacing: 14, children: [
                  SizedBox(
                    width: 360,
                    child: DropdownButtonFormField<String>(
                      initialValue: _partnerId,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Cliente'),
                      items: [for (final p in _partners) DropdownMenuItem(value: p['id'] as String, child: Text(asStr(p['name']), overflow: TextOverflow.ellipsis))],
                      onChanged: _locked ? null : (v) => setState(() => _partnerId = v),
                    ),
                  ),
                  SizedBox(
                    width: 220,
                    child: DropdownButtonFormField<String>(
                      initialValue: _mode,
                      decoration: const InputDecoration(labelText: 'Forma de pago'),
                      items: const [DropdownMenuItem(value: 'credito', child: Text('Crédito')), DropdownMenuItem(value: 'contado', child: Text('Contado'))],
                      onChanged: _locked ? null : (v) => setState(() => _mode = v ?? 'credito'),
                    ),
                  ),
                  if (_partnerId != null) _CreditInfo(partnerId: _partnerId!),
                ]),
              ),
              const SizedBox(height: 16),
              KioCard(
                padding: EdgeInsets.zero,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
                    child: Row(children: [
                      Expanded(child: Text('Líneas', style: Kio.h2())),
                      if (!_locked)
                        SizedBox(
                          width: 320,
                          child: Autocomplete<DbRow>(
                            displayStringForOption: (r) => asStr(r['name']),
                            optionsBuilder: (v) => _products.where((p) => asStr(p['name']).toLowerCase().contains(v.text.toLowerCase()) || asStr(p['barcode']) == v.text).take(12),
                            onSelected: (p) => setState(() => _lines.add(CartLine.fromProduct(p))),
                            fieldViewBuilder: (ctx, ctrl, focus, onSubmit) => TextField(
                              controller: ctrl,
                              focusNode: focus,
                              decoration: const InputDecoration(hintText: 'Agregar producto…', prefixIcon: Icon(LucideIcons.plus, size: 16)),
                            ),
                          ),
                        ),
                    ]),
                  ),
                  const Divider(),
                  if (_lines.isEmpty) const EmptyState(icon: LucideIcons.shoppingBag, title: 'Agrega productos al pedido'),
                  for (var i = 0; i < _lines.length; i++) _lineRow(i),
                  const Divider(),
                  Padding(
                    padding: const EdgeInsets.all(20),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Expanded(
                        child: TextField(controller: _notes, enabled: !_locked, maxLines: 3, decoration: const InputDecoration(labelText: 'Notas / condiciones')),
                      ),
                      const SizedBox(width: 30),
                      SizedBox(
                        width: 260,
                        child: Column(children: [
                          _tot('Subtotal', t.subtotal),
                          if (t.discount > 0) _tot('Descuentos', -t.discount),
                          _tot('IVA', t.tax),
                          const Divider(),
                          _tot('Total', t.total, big: true),
                        ]),
                      ),
                    ]),
                  ),
                ]),
              ),
              const SizedBox(height: 16),
              if (!_locked && s.canWrite('sales'))
                Wrap(alignment: WrapAlignment.end, spacing: 10, children: [
                  OutlinedButton(onPressed: _lines.isEmpty ? null : () => _save('borrador'), child: const Text('Guardar cotización')),
                  FilledButton.icon(
                    onPressed: _lines.isEmpty ? null : () => _save('confirmada'),
                    icon: const Icon(LucideIcons.check, size: 16),
                    label: const Text('Confirmar pedido'),
                  ),
                ]),
            ]),
    );
  }

  Widget _tot(String l, double v, {bool big = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [
          Text(l, style: big ? Kio.h2(16) : Kio.label),
          const Spacer(),
          Text(money(v), style: big ? Kio.h2(18) : const TextStyle(fontWeight: FontWeight.w600)),
        ]),
      );

  Widget _lineRow(int i) {
    final l = _lines[i];
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Kio.border))),
      child: Row(children: [
        Expanded(flex: 4, child: Text(l.name, style: const TextStyle(fontWeight: FontWeight.w600))),
        SizedBox(width: 90, child: _num(l.qty, (v) => l.qty = v, 'Cant.')),
        const SizedBox(width: 8),
        SizedBox(width: 130, child: _num(l.price, (v) => l.price = v, 'Precio')),
        const SizedBox(width: 8),
        SizedBox(width: 80, child: _num(l.discountPct, (v) => l.discountPct = v.clamp(0, 100).toDouble(), 'Desc. %')),
        Expanded(flex: 2, child: Text(money(l.total), textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w700))),
        if (!_locked) IconButton(onPressed: () => setState(() => _lines.removeAt(i)), icon: const Icon(LucideIcons.trash2, size: 16, color: Kio.danger)),
      ]),
    );
  }

  Widget _num(double v, void Function(double) set, String label) => TextFormField(
        initialValue: v == v.roundToDouble() ? v.toInt().toString() : v.toString(),
        enabled: !_locked,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(labelText: label),
        onChanged: (t) => setState(() => set(double.tryParse(t.replaceAll(',', '.')) ?? 0)),
      );
}

class _CreditInfo extends StatelessWidget {
  const _CreditInfo({required this.partnerId});
  final String partnerId;

  @override
  Widget build(BuildContext context) {
    final s = context.read<Session>();
    return LiveQuery(
      deps: [partnerId],
      query: () async => (bal: await Biz(s).partnerBalance(partnerId), p: await LocalDb.instance.byId('partners', partnerId)),
      builder: (context, d) {
        final limit = asNum(d.p?['credit_limit']).toDouble();
        final blocked = asBool(d.p?['blocked']);
        return Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
          if (blocked) StatusPill.status('bloqueado'),
          StatusPill('Saldo ${money(d.bal.balance)}', color: d.bal.balance > 0 ? Kio.warning : Kio.green),
          if (d.bal.overdue > 0) StatusPill('Vencido ${money(d.bal.overdue)}', color: Kio.danger),
          if (limit > 0) StatusPill('Cupo disponible ${money(limit - d.bal.balance)}', color: Kio.info),
        ]);
      },
    );
  }
}

// =============================================================================
// Cartera (artix_cartera): saldos, edades y recibos de caja
// =============================================================================

class ReceivablesPage extends StatefulWidget {
  const ReceivablesPage({super.key});
  @override
  State<ReceivablesPage> createState() => _ReceivablesPageState();
}

class _ReceivablesPageState extends State<ReceivablesPage> {
  bool _overdueOnly = false;
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return PageBody(children: [
      const PageHeader(title: 'Cartera', subtitle: 'Ventas a crédito pendientes de cobro, alertas de vencimiento y abonos.'),
      LiveQuery(
        deps: [_overdueOnly, _q],
        query: () async {
          final today = localToday();
          final args = <Object?>[];
          var where = 'balance > 0.5';
          if (_overdueOnly) {
            where += " AND due_date IS NOT NULL AND due_date <> '' AND due_date < ?";
            args.add(today);
          }
          if (_q.isNotEmpty) {
            where += ' AND (partner_name LIKE ? OR number LIKE ?)';
            args.addAll(['%$_q%', '%$_q%']);
          }
          final rows = await LocalDb.instance.raw('SELECT * FROM (${Biz.receivablesSql}) WHERE $where ORDER BY due_date', args);
          final all = await LocalDb.instance.raw('SELECT balance, due_date FROM (${Biz.receivablesSql}) WHERE balance > 0.5');
          final total = all.fold<double>(0, (a, r) => a + asNum(r['balance']));
          final over = all.where((r) => asStr(r['due_date']).isNotEmpty && asStr(r['due_date']).compareTo(today) < 0).fold<double>(0, (a, r) => a + asNum(r['balance']));
          return (rows: rows, total: total, over: over, today: today);
        },
        builder: (context, d) => Column(children: [
          KpiGrid(maxColumns: 3, children: [
            KpiCard(icon: LucideIcons.handCoins, color: Kio.navy, label: 'Total por cobrar', value: money(d.total)),
            KpiCard(icon: LucideIcons.circleAlert, color: Kio.danger, label: 'Vencido', value: money(d.over)),
            KpiCard(icon: LucideIcons.clock, color: Kio.green, label: 'Al día', value: money(d.total - d.over)),
          ]),
          const SizedBox(height: 20),
          KioTableCard(
            title: 'Facturas pendientes',
            subtitle: 'Toca una factura para registrar un abono del cliente.',
            toolbar: [
              SearchField(hint: 'Cliente o número…', onChanged: (v) => setState(() => _q = v.trim())),
              FilterChipMenu<bool>(
                label: 'Todas',
                value: _overdueOnly,
                options: const {false: 'Todas las facturas', true: 'Sólo vencidas'},
                onSelected: (v) => setState(() => _overdueOnly = v ?? false),
              ),
            ],
            rows: d.rows,
            onTap: s.canWrite('payments') ? (r) => showReceiptDialog(context, partnerId: r['partner_id'] as String?, suggested: asNum(r['balance']).toDouble()) : null,
            emptyText: 'No hay cartera pendiente',
            columns: [
              KioColumn('Factura', (r) => Text(asStr(r['number']), style: const TextStyle(fontWeight: FontWeight.w700))),
              KioColumn('Cliente', (r) => NameCell(asStr(r['partner_name'])), flex: 3),
              KioColumn('Vence', (r) {
                final due = asStr(r['due_date']);
                final days = due.isEmpty ? 0 : DateTime.parse(d.today).difference(DateTime.parse(due)).inDays;
                return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  Text(dateShort(due)),
                  if (days > 0) Text('$days días de mora', style: const TextStyle(fontSize: 12, color: Kio.danger, fontWeight: FontWeight.w600)),
                ]);
              }),
              KioColumn('Total', (r) => Text(money(r['total'])), numeric: true),
              KioColumn('Saldo', (r) => Text(money(r['balance']), style: const TextStyle(fontWeight: FontWeight.w700, color: Kio.navy)), numeric: true),
            ],
          ),
        ]),
      ),
    ]);
  }
}

/// Recibo de caja (abono) de un cliente; reparte el valor entre sus facturas más antiguas.
Future<void> showReceiptDialog(BuildContext context, {String? partnerId, double? suggested}) async {
  final s = context.read<Session>();
  final partners = await LocalDb.instance.raw('SELECT DISTINCT partner_id AS id, partner_name AS name FROM (${Biz.receivablesSql}) WHERE balance > 0.5 ORDER BY name');
  if (!context.mounted) return;
  if (partners.isEmpty) {
    toast(context, 'No hay clientes con saldo pendiente');
    return;
  }
  String? pid = partnerId ?? partners.first['id'] as String?;
  String method = 'efectivo';
  final amount = TextEditingController(text: suggested == null ? '' : suggested.round().toString());
  final reference = TextEditingController();
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, set) => AlertDialog(
        title: Text('Recibo de caja', style: Kio.h2(18)),
        content: SizedBox(
          width: 420,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButtonFormField<String>(
              initialValue: pid,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Cliente'),
              items: [for (final p in partners) DropdownMenuItem(value: p['id'] as String, child: Text(asStr(p['name'])))],
              onChanged: (v) => set(() => pid = v),
            ),
            const SizedBox(height: 12),
            TextField(controller: amount, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Valor recibido', prefixText: r'$ ')),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: method,
              decoration: const InputDecoration(labelText: 'Medio de pago'),
              items: [for (final e in kPayMethods.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
              onChanged: (v) => set(() => method = v ?? 'efectivo'),
            ),
            const SizedBox(height: 12),
            TextField(controller: reference, decoration: const InputDecoration(labelText: 'Referencia (opcional)')),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Registrar abono')),
        ],
      ),
    ),
  );
  final value = double.tryParse(amount.text.replaceAll('.', '').replaceAll(',', '.'));
  if (ok != true || pid == null || value == null || value <= 0 || !context.mounted) return;
  try {
    final numbers = await Biz(s).registerReceipt(partnerId: pid!, amount: value, method: method, reference: reference.text.trim().isEmpty ? null : reference.text.trim());
    if (context.mounted) toast(context, 'Abono registrado (${numbers.join(', ')})');
  } on BusinessException catch (e) {
    if (context.mounted) toast(context, e.message, error: true);
  }
}
