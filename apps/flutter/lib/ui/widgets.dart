import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../data/local_db.dart';
import '../theme/kio_theme.dart';
import 'format.dart';

// ------------------------------------------------------------------ datos en vivo

/// Ejecuta una consulta local y la repite cada vez que cambia la SQLite (escritura o sync).
class LiveQuery<T> extends StatefulWidget {
  const LiveQuery({super.key, required this.query, required this.builder, this.deps = const []});
  final Future<T> Function() query;
  final Widget Function(BuildContext, T) builder;
  final List<Object?> deps;

  @override
  State<LiveQuery<T>> createState() => _LiveQueryState<T>();
}

class _LiveQueryState<T> extends State<LiveQuery<T>> {
  late Future<T> _future;
  T? _last;

  @override
  void initState() {
    super.initState();
    _future = widget.query();
    LocalDb.instance.addListener(_reload);
  }

  @override
  void didUpdateWidget(covariant LiveQuery<T> old) {
    super.didUpdateWidget(old);
    if (!_sameDeps(old.deps, widget.deps)) _reload();
  }

  bool _sameDeps(List<Object?> a, List<Object?> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }

  void _reload() {
    if (mounted) setState(() => _future = widget.query());
  }

  @override
  void dispose() {
    LocalDb.instance.removeListener(_reload);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: _future,
      builder: (context, snap) {
        if (snap.hasError) return EmptyState(icon: LucideIcons.circleAlert, title: 'Error al leer datos', message: '${snap.error}');
        if (snap.hasData) _last = snap.data;
        final value = snap.data ?? _last;
        if (value == null) return const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator(strokeWidth: 2)));
        return widget.builder(context, value as T);
      },
    );
  }
}

// ------------------------------------------------------------------ superficies

class KioCard extends StatelessWidget {
  const KioCard({super.key, required this.child, this.padding = const EdgeInsets.all(20), this.onTap});
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: Kio.surface,
        borderRadius: BorderRadius.circular(Kio.radius + 2),
        border: Border.all(color: Kio.border),
        boxShadow: Kio.shadow,
      ),
      child: child,
    );
    if (onTap == null) return card;
    return MouseRegion(cursor: SystemMouseCursors.click, child: GestureDetector(onTap: onTap, child: card));
  }
}

/// Ícono Lucide dentro de un cuadro redondeado con tinte suave (como en el Panel KIO).
class IconTile extends StatelessWidget {
  const IconTile(this.icon, {super.key, this.color = Kio.green, this.size = 36});
  final IconData icon;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: Kio.tint(color), borderRadius: BorderRadius.circular(size * 0.28)),
        child: Icon(icon, size: size * 0.5, color: color),
      );
}

class KpiCard extends StatelessWidget {
  const KpiCard({super.key, required this.icon, required this.label, required this.value, this.color = Kio.green, this.change, this.hint, this.onTap});
  final IconData icon;
  final String label;
  final String value;
  final Color color;
  final double? change;
  final String? hint;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return KioCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(18, 16, 12, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            IconTile(icon, color: color),
            const Spacer(),
            if (onTap != null) const Icon(LucideIcons.ellipsisVertical, size: 16, color: Kio.subtle),
          ]),
          const SizedBox(height: 18),
          Text(label, style: Kio.label, maxLines: 1, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 6),
          Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
            Flexible(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(value, style: Kio.title(27)),
              ),
            ),
            if (change != null) ...[const SizedBox(width: 10), DeltaBadge(change!)],
          ]),
          if (hint != null) ...[const SizedBox(height: 4), Text(hint!, style: Kio.small)],
        ],
      ),
    );
  }
}

class DeltaBadge extends StatelessWidget {
  const DeltaBadge(this.value, {super.key, this.inverse = false});
  final double value;
  final bool inverse;

  @override
  Widget build(BuildContext context) {
    final good = inverse ? value <= 0 : value >= 0;
    final c = good ? Kio.green : Kio.danger;
    final txt = '${value >= 0 ? '+' : ''}${(value * 100).round()}%';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(color: Kio.tint(c, .12), borderRadius: BorderRadius.circular(999)),
      child: Text(txt, style: TextStyle(color: c, fontSize: 11, fontWeight: FontWeight.w700)),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.text, {super.key, this.color = Kio.muted});
  final String text;
  final Color color;

  /// Colores por estado de documento usados en toda la app.
  static Color colorFor(String? status) => switch (status) {
        'confirmada' || 'aprobada' || 'pagada' || 'activo' || 'cliente' || 'listo' || 'cerrada' => Kio.green,
        'borrador' || 'solicitada' || 'pendiente' => Kio.muted,
        'enviada' || 'abierta' || 'preparando' || 'credito' => Kio.info,
        'vencida' || 'rechazada' || 'anulada' || 'bloqueado' => Kio.danger,
        'parcial' || 'por cobrar' => Kio.warning,
        _ => Kio.muted,
      };

  factory StatusPill.status(String? status) => StatusPill(_label(status), color: colorFor(status));

  static String _label(String? s) {
    if (s == null || s.isEmpty) return '—';
    return s[0].toUpperCase() + s.substring(1).replaceAll('_', ' ');
  }

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: Kio.tint(color, color == Kio.muted ? .10 : .12), borderRadius: BorderRadius.circular(999)),
        child: Text(text, style: TextStyle(color: color == Kio.muted ? Kio.text : color, fontSize: 12, fontWeight: FontWeight.w600)),
      );
}

class Avatar extends StatelessWidget {
  const Avatar(this.name, {super.key, this.size = 30, this.color});
  final String name;
  final double size;
  final Color? color;

  static const _palette = [Kio.navy, Kio.green, Kio.info, Kio.purple, Kio.warning, Color(0xFFE8577E)];

  @override
  Widget build(BuildContext context) {
    final words = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    final initials = words.isEmpty ? '?' : (words.first[0] + (words.length > 1 ? words[1][0] : '')).toUpperCase();
    final c = color ?? _palette[name.hashCode.abs() % _palette.length];
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: Kio.tint(c, .14), shape: BoxShape.circle),
      child: Text(initials, style: TextStyle(color: c, fontWeight: FontWeight.w700, fontSize: size * 0.38)),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.message, this.action});
  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
        child: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            IconTile(icon, color: Kio.navy, size: 48),
            const SizedBox(height: 14),
            Text(title, style: Kio.h2(16), textAlign: TextAlign.center),
            if (message != null) ...[const SizedBox(height: 6), Text(message!, style: Kio.label, textAlign: TextAlign.center)],
            if (action != null) ...[const SizedBox(height: 16), action!],
          ]),
        ),
      );
}

// ------------------------------------------------------------------ encabezados y filtros

/// Título grande en Montserrat + pestañas subrayadas (Resumen | Tabla | Gráfico).
class PageHeader extends StatelessWidget {
  const PageHeader({super.key, required this.title, this.tabs = const [], this.tab = 0, this.onTab, this.actions = const [], this.subtitle});
  final String title;
  final String? subtitle;
  final List<String> tabs;
  final int tab;
  final ValueChanged<int>? onTab;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final narrow = MediaQuery.sizeOf(context).width < 700;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        alignment: WrapAlignment.spaceBetween,
        runSpacing: 10,
        spacing: 12,
        children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text(title, style: Kio.title(narrow ? 24 : 30)),
            if (subtitle != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(subtitle!, style: Kio.label)),
          ]),
          if (actions.isNotEmpty) Wrap(spacing: 8, runSpacing: 8, children: actions),
        ],
      ),
      if (tabs.isNotEmpty) ...[
        const SizedBox(height: 14),
        Container(
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Kio.border))),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              for (var i = 0; i < tabs.length; i++)
                InkWell(
                  onTap: () => onTab?.call(i),
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(0, 6, 0, 10),
                    margin: const EdgeInsets.only(right: 22),
                    decoration: BoxDecoration(
                      border: Border(bottom: BorderSide(color: i == tab ? Kio.navy : Colors.transparent, width: 2)),
                    ),
                    child: Text(
                      tabs[i],
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: i == tab ? FontWeight.w700 : FontWeight.w500,
                        color: i == tab ? Kio.navy : Kio.muted,
                      ),
                    ),
                  ),
                ),
            ]),
          ),
        ),
      ],
      const SizedBox(height: 20),
    ]);
  }
}

class SearchField extends StatelessWidget {
  const SearchField({super.key, required this.hint, required this.onChanged, this.width = 280, this.controller, this.autofocus = false, this.onSubmitted});
  final String hint;
  final ValueChanged<String> onChanged;
  final ValueChanged<String>? onSubmitted;
  final double width;
  final TextEditingController? controller;
  final bool autofocus;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: width,
        child: TextField(
          controller: controller,
          autofocus: autofocus,
          onChanged: onChanged,
          onSubmitted: onSubmitted,
          decoration: InputDecoration(
            hintText: hint,
            prefixIcon: const Icon(LucideIcons.search, size: 16, color: Kio.subtle),
            prefixIconConstraints: const BoxConstraints(minWidth: 38),
          ),
        ),
      );
}

/// Chip con punto de color y menú (ej. "● Todos los estados").
class FilterChipMenu<T> extends StatelessWidget {
  const FilterChipMenu({super.key, required this.label, required this.value, required this.options, required this.onSelected, this.color = Kio.green});
  final String label;
  final T? value;
  final Map<T?, String> options;
  final ValueChanged<T?> onSelected;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<T?>(
      tooltip: '',
      onSelected: onSelected,
      position: PopupMenuPosition.under,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      color: Colors.white,
      itemBuilder: (_) => [
        for (final e in options.entries)
          PopupMenuItem<T?>(
            value: e.key,
            child: Row(children: [
              Icon(LucideIcons.check, size: 15, color: e.key == value ? Kio.navy : Colors.transparent),
              const SizedBox(width: 8),
              Text(e.value),
            ]),
          ),
      ],
      child: Container(
        height: 40,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(border: Border.all(color: Kio.borderStrong), borderRadius: BorderRadius.circular(Kio.radiusSm), color: Colors.white),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 7, height: 7, decoration: BoxDecoration(color: value == null ? color : Kio.navy, shape: BoxShape.circle)),
          const SizedBox(width: 9),
          Text(options[value] ?? label, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: Kio.textStrong)),
        ]),
      ),
    );
  }
}

// ------------------------------------------------------------------ tabla KIO

class KioColumn {
  const KioColumn(this.label, this.cell, {this.flex = 2, this.numeric = false, this.minWidth = 0});
  final String label;
  final Widget Function(DbRow row) cell;
  final int flex;
  final bool numeric;
  final double minWidth;
}

/// Tarjeta con título, subtítulo, barra de herramientas y tabla con encabezado en mayúsculas.
class KioTableCard extends StatelessWidget {
  const KioTableCard({
    super.key,
    required this.title,
    this.subtitle,
    this.toolbar = const [],
    this.trailing,
    required this.columns,
    required this.rows,
    this.onTap,
    this.emptyText = 'No hay registros todavía',
    this.mobileTitle,
    this.mobileSubtitle,
    this.mobileTrailing,
    this.footer,
  });

  final String title;
  final String? subtitle;
  final List<Widget> toolbar;
  final Widget? trailing;
  final List<KioColumn> columns;
  final List<DbRow> rows;
  final ValueChanged<DbRow>? onTap;
  final String emptyText;
  final Widget? footer;
  // Vista compacta en teléfonos
  final Widget Function(DbRow)? mobileTitle;
  final Widget Function(DbRow)? mobileSubtitle;
  final Widget? Function(DbRow)? mobileTrailing;

  @override
  Widget build(BuildContext context) {
    return KioCard(
      padding: EdgeInsets.zero,
      child: LayoutBuilder(builder: (context, c) {
        final compact = c.maxWidth < 640;
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(title, style: Kio.h2(18)),
                    if (subtitle != null) Padding(padding: const EdgeInsets.only(top: 3), child: Text(subtitle!, style: Kio.label)),
                  ]),
                ),
                if (trailing != null) trailing!,
              ]),
              if (toolbar.isNotEmpty) ...[const SizedBox(height: 14), Wrap(spacing: 10, runSpacing: 10, children: toolbar)],
            ]),
          ),
          const Divider(),
          if (rows.isEmpty)
            EmptyState(icon: LucideIcons.fileText, title: emptyText)
          else if (compact && mobileTitle != null)
            for (final r in rows) ...[
              ListTile(
                onTap: onTap == null ? null : () => onTap!(r),
                title: mobileTitle!(r),
                subtitle: mobileSubtitle?.call(r),
                trailing: mobileTrailing?.call(r),
              ),
              const Divider(),
            ]
          else
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: ConstrainedBox(
                constraints: BoxConstraints(minWidth: math.max(c.maxWidth, columns.length * 120.0)),
                child: SizedBox(
                  width: math.max(c.maxWidth, columns.length * 120.0),
                  child: Column(children: [
                    _header(),
                    for (final r in rows) _row(r),
                  ]),
                ),
              ),
            ),
          if (footer != null) ...[const Divider(), Padding(padding: const EdgeInsets.all(14), child: footer!)],
        ]);
      }),
    );
  }

  Widget _header() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Kio.border))),
        child: Row(children: [
          for (final col in columns)
            Expanded(
              flex: col.flex,
              child: Text(col.label.toUpperCase(), style: Kio.tableHead, textAlign: col.numeric ? TextAlign.right : TextAlign.left),
            ),
        ]),
      );

  Widget _row(DbRow r) => InkWell(
        onTap: onTap == null ? null : () => onTap!(r),
        hoverColor: Kio.brandLight.withValues(alpha: .5),
        child: Container(
          constraints: const BoxConstraints(minHeight: 56),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Kio.border))),
          child: Row(children: [
            for (final col in columns)
              Expanded(
                flex: col.flex,
                child: Align(alignment: col.numeric ? Alignment.centerRight : Alignment.centerLeft, child: col.cell(r)),
              ),
          ]),
        ),
      );
}

/// Celda "Nombre en negrita + correo gris" con avatar, como la tabla de Clientes de KIO.
class NameCell extends StatelessWidget {
  const NameCell(this.title, {super.key, this.subtitle, this.avatar = true});
  final String title;
  final String? subtitle;
  final bool avatar;

  @override
  Widget build(BuildContext context) => Row(children: [
        if (avatar) ...[Avatar(title), const SizedBox(width: 12)],
        Flexible(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w700, color: Kio.textStrong), overflow: TextOverflow.ellipsis),
            if (subtitle != null && subtitle!.isNotEmpty) Text(subtitle!, style: Kio.small, overflow: TextOverflow.ellipsis),
          ]),
        ),
      ]);
}

class UsageBar extends StatelessWidget {
  const UsageBar(this.value, {super.key, this.color = Kio.navy});
  final double value;
  final Color color;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        SizedBox(
          width: 88,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(value: value.clamp(0, 1), minHeight: 5, color: color, backgroundColor: Kio.border),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(width: 38, child: Text('${(value * 100).round()}%', style: const TextStyle(fontSize: 12.5), textAlign: TextAlign.right)),
      ]);
}

// ------------------------------------------------------------------ gráfico de barras

class BarSeries {
  const BarSeries(this.label, this.color, this.values);
  final String label;
  final Color color;
  final List<num> values;
}

class BarChart extends StatelessWidget {
  const BarChart({super.key, required this.labels, required this.series, this.height = 240});
  final List<String> labels;
  final List<BarSeries> series;
  final double height;

  @override
  Widget build(BuildContext context) {
    final maxV = series.expand((s) => s.values).fold<num>(0, (a, b) => math.max(a, b));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Wrap(spacing: 16, children: [
        for (final s in series)
          Row(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 10, height: 10, decoration: BoxDecoration(color: s.color, borderRadius: BorderRadius.circular(3))),
            const SizedBox(width: 6),
            Text(s.label, style: Kio.small),
          ]),
      ]),
      const SizedBox(height: 14),
      SizedBox(
        height: height,
        child: LayoutBuilder(builder: (context, c) {
          return Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            for (var i = 0; i < labels.length; i++)
              Expanded(
                child: Tooltip(
                  message: [labels[i], for (final s in series) '${s.label}: ${money(s.values[i])}'].join('\n'),
                  child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                    Row(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                      for (final s in series)
                        Container(
                          width: math.max(4, math.min(18, c.maxWidth / labels.length / series.length - 6)),
                          margin: const EdgeInsets.symmetric(horizontal: 1.5),
                          height: maxV == 0 ? 2 : math.max(2, (c.maxHeight - 26) * (s.values[i] / maxV)),
                          decoration: BoxDecoration(color: s.color, borderRadius: const BorderRadius.vertical(top: Radius.circular(4))),
                        ),
                    ]),
                    const SizedBox(height: 8),
                    Text(labels[i], style: const TextStyle(fontSize: 11, color: Kio.muted), maxLines: 1),
                  ]),
                ),
              ),
          ]);
        }),
      ),
    ]);
  }
}

/// Barra horizontal para rankings (top productos, edades de cartera).
class RankBar extends StatelessWidget {
  const RankBar({super.key, required this.label, required this.value, required this.max, this.color = Kio.navy, this.trailing});
  final String label;
  final num value;
  final num max;
  final Color color;
  final String? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis)),
            Text(trailing ?? money(value), style: const TextStyle(fontWeight: FontWeight.w600)),
          ]),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(value: max == 0 ? 0 : (value / max).toDouble(), minHeight: 6, color: color, backgroundColor: Kio.border),
          ),
        ]),
      );
}

/// Rejilla responsiva de tarjetas KPI (3-4 columnas en escritorio, 1-2 en móvil).
class KpiGrid extends StatelessWidget {
  const KpiGrid({super.key, required this.children, this.maxColumns = 4});
  final List<Widget> children;
  final int maxColumns;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, c) {
        final cols = math.max(1, math.min(maxColumns, (c.maxWidth / 250).floor()));
        final w = (c.maxWidth - (cols - 1) * 16) / cols;
        return Wrap(spacing: 16, runSpacing: 16, children: [for (final k in children) SizedBox(width: w, child: k)]);
      });
}

void toast(BuildContext context, String msg, {bool error = false}) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
    content: Row(children: [
      Icon(error ? LucideIcons.circleAlert : LucideIcons.check, size: 16, color: error ? const Color(0xFFFFB4B4) : const Color(0xFF9BE7B5)),
      const SizedBox(width: 10),
      Expanded(child: Text(msg)),
    ]),
  ));
}

Future<bool> confirm(BuildContext context, String title, String message, {String ok = 'Confirmar', bool danger = false}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title, style: Kio.h2(18)),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
        FilledButton(
          style: danger ? FilledButton.styleFrom(backgroundColor: Kio.danger) : null,
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(ok),
        ),
      ],
    ),
  );
  return r ?? false;
}
