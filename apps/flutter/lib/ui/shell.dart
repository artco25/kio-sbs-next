import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../data/local_db.dart';
import '../pages/catalog.dart';
import '../services/session.dart';
import '../services/sync_service.dart';
import '../theme/kio_theme.dart';
import 'widgets.dart';

/// Marco de KIO SBS: riel de suites + panel de módulos (264/76 px) + barra superior.
class KioShell extends StatefulWidget {
  const KioShell({super.key});

  @override
  State<KioShell> createState() => _KioShellState();
}

class _KioShellState extends State<KioShell> {
  String _current = 'panel';
  String _suite = 'inicio';
  bool _collapsed = false;
  final _scaffold = GlobalKey<ScaffoldState>();

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    final db = LocalDb.instance;
    final collapsed = await db.getMeta('ui:collapsed');
    final last = await db.getMeta('ui:module');
    if (!mounted) return;
    final s = context.read<Session>();
    final mod = kModules.where((m) => m.key == last && m.visible(s)).firstOrNull;
    setState(() {
      _collapsed = collapsed == '1';
      if (mod != null) {
        _current = mod.key;
        _suite = mod.suite.key;
      }
    });
  }

  void _open(Module m) {
    setState(() {
      _current = m.key;
      _suite = m.suite.key;
    });
    unawaited(LocalDb.instance.setMeta('ui:module', m.key));
    if (_scaffold.currentState?.isDrawerOpen ?? false) Navigator.pop(context);
  }

  void _toggle() {
    setState(() => _collapsed = !_collapsed);
    unawaited(LocalDb.instance.setMeta('ui:collapsed', _collapsed ? '1' : '0'));
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final modules = kModules.where((m) => m.visible(s)).toList();
    final current = modules.firstWhere((m) => m.key == _current, orElse: () => modules.first);
    final wide = MediaQuery.sizeOf(context).width >= 900;

    final nav = _NavPanel(
      modules: modules,
      current: current,
      suite: _suite,
      collapsed: wide && _collapsed,
      onSuite: (k) {
        setState(() => _suite = k);
        if (wide && _collapsed) _toggle();
      },
      onOpen: _open,
      onToggle: wide ? _toggle : null,
    );

    return Scaffold(
      key: _scaffold,
      drawer: wide ? null : Drawer(width: 300, backgroundColor: Colors.white, child: SafeArea(child: nav)),
      body: Row(children: [
        if (wide) nav,
        Expanded(
          child: Column(children: [
            _TopBar(title: current.label, onMenu: wide ? null : () => _scaffold.currentState?.openDrawer(), onOpen: _open),
            if (s.expired) const _ExpiredBanner(),
            Expanded(
              child: _GridBackground(
                child: KeyedSubtree(key: ValueKey(current.key), child: current.builder(context)),
              ),
            ),
          ]),
        ),
      ]),
    );
  }
}

// ------------------------------------------------------------------ menú lateral

class _NavPanel extends StatelessWidget {
  const _NavPanel({
    required this.modules,
    required this.current,
    required this.suite,
    required this.collapsed,
    required this.onSuite,
    required this.onOpen,
    required this.onToggle,
  });
  final List<Module> modules;
  final Module current;
  final String suite;
  final bool collapsed;
  final ValueChanged<String> onSuite;
  final ValueChanged<Module> onOpen;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final suites = Suite.all.where((x) => modules.any((m) => m.suite.key == x.key)).toList();
    final active = suites.firstWhere((x) => x.key == suite, orElse: () => suites.first);
    final items = modules.where((m) => m.suite.key == active.key).toList();

    final rail = Container(
      width: 64,
      decoration: const BoxDecoration(color: Colors.white, border: Border(right: BorderSide(color: Kio.border))),
      child: Column(children: [
        const SizedBox(height: 14),
        Image.asset('assets/brand/kio_mark.png', width: 30, height: 30),
        const SizedBox(height: 18),
        for (final x in suites.where((x) => x.key != 'sistema'))
          _RailButton(suite: x, selected: x.key == active.key, onTap: () => onSuite(x.key)),
        const Spacer(),
        for (final x in suites.where((x) => x.key == 'sistema'))
          _RailButton(suite: x, selected: x.key == active.key, onTap: () => onSuite(x.key)),
        const SizedBox(height: 6),
        Tooltip(
          message: '${s.user?.name}\n${s.user?.roleLabel}',
          child: Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: const BoxDecoration(color: Kio.navy, shape: BoxShape.circle),
            child: Text(s.user?.initials ?? '?', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
          ),
        ),
        const SizedBox(height: 14),
      ]),
    );

    if (collapsed) return rail;

    return Row(mainAxisSize: MainAxisSize.min, children: [
      rail,
      Container(
        width: 220,
        decoration: const BoxDecoration(color: Colors.white, border: Border(right: BorderSide(color: Kio.border))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 20, 8, 10),
            child: Row(children: [
              Expanded(
                child: Text(active.name.toUpperCase(),
                    style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 0.8, color: Kio.muted)),
              ),
              if (onToggle != null)
                IconButton(
                  tooltip: 'Contraer menú',
                  onPressed: onToggle,
                  icon: const Icon(LucideIcons.panelLeftClose, size: 17, color: Kio.muted),
                ),
            ]),
          ),
          Expanded(
            child: ListView(padding: const EdgeInsets.symmetric(horizontal: 10), children: [
              for (final m in items) _NavItem(module: m, selected: m.key == current.key, onTap: () => onOpen(m)),
            ]),
          ),
          const Divider(),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.company?.name ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13), overflow: TextOverflow.ellipsis),
              const SizedBox(height: 2),
              const Text('KIO SBS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1.2, color: Kio.muted)),
            ]),
          ),
        ]),
      ),
    ]);
  }
}

class _RailButton extends StatelessWidget {
  const _RailButton({required this.suite, required this.selected, required this.onTap});
  final Suite suite;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tooltip(
        message: suite.name,
        preferBelow: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Stack(alignment: Alignment.centerLeft, children: [
            Container(width: 3, height: selected ? 22 : 0, decoration: const BoxDecoration(color: Kio.navy, borderRadius: BorderRadius.horizontal(right: Radius.circular(3)))),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: onTap,
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: selected ? Kio.brandLight : Colors.transparent, borderRadius: BorderRadius.circular(10)),
                  child: Icon(suite.icon, size: 19, color: selected ? Kio.navy : suite.color),
                ),
              ),
            ),
          ]),
        ),
      );
}

class _NavItem extends StatelessWidget {
  const _NavItem({required this.module, required this.selected, required this.onTap});
  final Module module;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 2),
        child: Material(
          color: selected ? Kio.brandLight : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          child: InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
              child: Row(children: [
                Icon(module.icon, size: 18, color: module.color),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    module.label,
                    style: TextStyle(fontSize: 14.5, color: Kio.navy, fontWeight: selected ? FontWeight.w700 : FontWeight.w500),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ]),
            ),
          ),
        ),
      );
}

// ------------------------------------------------------------------ barra superior

class _TopBar extends StatelessWidget {
  const _TopBar({required this.title, this.onMenu, required this.onOpen});
  final String title;
  final VoidCallback? onMenu;
  final ValueChanged<Module> onOpen;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final narrow = MediaQuery.sizeOf(context).width < 600;
    return Container(
      height: 58,
      padding: EdgeInsets.only(left: onMenu == null ? 28 : 6, right: 16),
      decoration: const BoxDecoration(color: Colors.white, border: Border(bottom: BorderSide(color: Kio.border))),
      child: Row(children: [
        if (onMenu != null) IconButton(onPressed: onMenu, icon: const Icon(LucideIcons.menu, size: 20)),
        const Text('KIO SBS', style: TextStyle(fontFamily: Kio.heading, fontWeight: FontWeight.w800, fontSize: 17, color: Kio.navy)),
        if (!narrow) ...[
          const SizedBox(width: 14),
          const Text('/', style: TextStyle(color: Kio.subtle)),
          const SizedBox(width: 14),
          Flexible(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w600, color: Kio.muted), overflow: TextOverflow.ellipsis)),
        ],
        const Spacer(),
        SyncPill(onTap: () => onOpen(kModules.firstWhere((m) => m.key == 'sync'))),
        const SizedBox(width: 10),
        if (!narrow) Text(s.company?.name.toUpperCase() ?? '', style: const TextStyle(color: Kio.muted, fontWeight: FontWeight.w600, fontSize: 13)),
        const SizedBox(width: 8),
        PopupMenuButton<String>(
          tooltip: 'Cuenta',
          position: PopupMenuPosition.under,
          color: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          onSelected: (v) async {
            if (v == 'logout' && await confirm(context, 'Cerrar sesión', 'Los cambios pendientes se conservan en este equipo y se enviarán al volver a entrar.')) {
              if (!context.mounted) return;
              context.read<SyncService>().stop();
              await context.read<Session>().logout();
            }
          },
          itemBuilder: (_) => [
            PopupMenuItem(
              enabled: false,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.user?.name ?? '', style: const TextStyle(fontWeight: FontWeight.w700, color: Kio.textStrong)),
                Text('${s.user?.email ?? ''} · ${s.user?.roleLabel ?? ''}', style: Kio.small),
              ]),
            ),
            const PopupMenuDivider(),
            const PopupMenuItem(value: 'logout', child: Row(children: [Icon(LucideIcons.logOut, size: 16), SizedBox(width: 10), Text('Cerrar sesión')])),
          ],
          child: Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: Kio.navy, borderRadius: BorderRadius.circular(9)),
            child: Text(s.user?.initials ?? '?', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
          ),
        ),
      ]),
    );
  }
}

/// Indicador del sync: en línea / sincronizando / sin conexión + pendientes.
class SyncPill extends StatelessWidget {
  const SyncPill({super.key, this.onTap});
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final sync = context.watch<SyncService>();
    final (IconData icon, Color color, String text) = switch (sync.state) {
      SyncState.syncing => (LucideIcons.refreshCw, Kio.info, 'Sincronizando…'),
      SyncState.offline => (LucideIcons.cloudOff, Kio.warning, 'Sin conexión'),
      SyncState.error => (LucideIcons.circleAlert, Kio.danger, 'Error de sync'),
      SyncState.paused => (LucideIcons.pauseCircle, Kio.muted, 'En pausa (sin actividad)'),
      SyncState.idle => sync.pending > 0 ? (LucideIcons.cloud, Kio.info, 'En línea') : (LucideIcons.cloudCheck, Kio.green, 'Sincronizado'),
    };
    final narrow = MediaQuery.sizeOf(context).width < 600;
    return Tooltip(
      message: sync.lastError ?? (sync.lastSync == null ? 'Aún no sincroniza' : 'Última sincronización: ${TimeOfDay.fromDateTime(sync.lastSync!).format(context)}'),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(color: Kio.tint(color, .10), borderRadius: BorderRadius.circular(999)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 15, color: color),
            if (!narrow) ...[const SizedBox(width: 7), Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 12.5))],
            if (sync.pending > 0) ...[
              const SizedBox(width: 7),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(99)),
                child: Text('${sync.pending}', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
              ),
            ],
          ]),
        ),
      ),
    );
  }
}

class _ExpiredBanner extends StatelessWidget {
  const _ExpiredBanner();

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        color: Kio.tint(Kio.warning, .15),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        child: Row(children: [
          const Icon(LucideIcons.lock, size: 16, color: Kio.warning),
          const SizedBox(width: 10),
          const Expanded(child: Text('Tu sesión venció. Puedes seguir trabajando sin conexión; inicia sesión de nuevo para sincronizar.')),
          TextButton(
            onPressed: () async {
              context.read<SyncService>().stop();
              await context.read<Session>().logout();
            },
            child: const Text('Iniciar sesión'),
          ),
        ]),
      );
}

/// Fondo gris claro con cuadrícula sutil, como el área de trabajo de KIO.
class _GridBackground extends StatelessWidget {
  const _GridBackground({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => CustomPaint(painter: _GridPainter(), child: child);
}

class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = Kio.bg);
    final p = Paint()
      ..color = Kio.grid.withValues(alpha: .7)
      ..strokeWidth = 1;
    for (double x = 0; x < size.width; x += 28) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), p);
    }
    for (double y = 0; y < size.height; y += 28) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), p);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Contenedor estándar de página: scroll + márgenes del área de trabajo.
class PageBody extends StatelessWidget {
  const PageBody({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final narrow = MediaQuery.sizeOf(context).width < 700;
    return ListView(
      padding: EdgeInsets.fromLTRB(narrow ? 14 : 30, narrow ? 18 : 26, narrow ? 14 : 30, 40),
      children: children,
    );
  }
}

/// Atajo para el ícono de una celda vacía.
const kDash = Text('—', style: TextStyle(color: Kio.subtle));

/// Usado por páginas: tarjeta de error cuando no hay permiso.
class NoAccess extends StatelessWidget {
  const NoAccess({super.key});
  @override
  Widget build(BuildContext context) =>
      const EmptyState(icon: LucideIcons.lock, title: 'Sin permiso', message: 'Tu rol no tiene acceso a este módulo.');
}
