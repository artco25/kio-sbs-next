import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../data/local_db.dart';
import '../data/tables.g.dart';
import '../services/graphql.dart';
import '../services/session.dart';
import '../services/sync_service.dart';
import '../theme/kio_theme.dart';
import '../ui/format.dart';
import '../ui/shell.dart';
import '../ui/widgets.dart';

// =============================================================================
// Sincronización: estado, pendientes, rechazos y equipos instalados
// =============================================================================

class SyncPage extends StatelessWidget {
  const SyncPage({super.key});

  @override
  Widget build(BuildContext context) {
    final sync = context.watch<SyncService>();
    final s = context.watch<Session>();
    final stateLabel = switch (sync.state) {
      SyncState.idle => 'En línea',
      SyncState.syncing => 'Sincronizando…',
      SyncState.offline => 'Sin conexión (trabajando local)',
      SyncState.error => 'Error',
      SyncState.paused => 'En pausa (sin actividad)',
    };
    return PageBody(children: [
      PageHeader(
        title: 'Sincronización',
        subtitle: 'Este equipo guarda todo en SQLite y se sincroniza automáticamente cada ${kSyncInterval.inSeconds} segundos.',
        actions: [
          OutlinedButton.icon(
            onPressed: () async {
              if (await confirm(context, 'Descargar todo de nuevo', 'Se vuelve a traer toda la información del servidor. Los cambios pendientes de este equipo se conservan.')) {
                await sync.resync();
              }
            },
            icon: const Icon(LucideIcons.download, size: 15),
            label: const Text('Descargar todo'),
          ),
          FilledButton.icon(
            onPressed: sync.state == SyncState.syncing ? null : sync.syncNow,
            icon: const Icon(LucideIcons.refreshCw, size: 16),
            label: const Text('Sincronizar ahora'),
          ),
        ],
      ),
      KpiGrid(children: [
        KpiCard(
          icon: sync.online ? LucideIcons.cloudCheck : LucideIcons.cloudOff,
          color: sync.state == SyncState.error ? Kio.danger : sync.online ? Kio.green : Kio.warning,
          label: 'Estado',
          value: stateLabel,
          hint: sync.lastError,
        ),
        KpiCard(icon: LucideIcons.clock, color: Kio.info, label: 'Última sincronización', value: sync.lastSync == null ? '—' : TimeOfDay.fromDateTime(sync.lastSync!).format(context), hint: sync.lastSync == null ? null : dateShort(sync.lastSync!.toIso8601String())),
        KpiCard(icon: LucideIcons.cloud, color: sync.pending > 0 ? Kio.warning : Kio.green, label: 'Cambios pendientes de enviar', value: '${sync.pending}'),
        KpiCard(icon: LucideIcons.arrowRightLeft, color: Kio.navy, label: 'Revisión local / servidor', value: '${sync.cursor} / ${sync.head}', hint: 'Último ciclo: ↑${sync.lastPushed} ↓${sync.lastPulled}'),
      ]),
      const SizedBox(height: 20),
      LayoutBuilder(builder: (context, c) {
        final info = KioCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Este equipo', style: Kio.h2()),
            const SizedBox(height: 12),
            _kv('Equipo', '${s.deviceName} (${s.platform})'),
            _kv('Terminal / prefijo', s.terminal),
            _kv('Id del equipo', s.deviceId),
            _kv('Versión de la app', kAppVersion),
            _kv('Base local', LocalDb.instance.path),
            _kv('API', s.apiUrl),
            _kv('Sincronización', s.syncUrl),
            if (sync.clockSkew != null && sync.clockSkew!.inMinutes.abs() >= 2)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: StatusPill('El reloj del equipo difiere ${sync.clockSkew!.inMinutes} min del servidor', color: Kio.danger),
              ),
          ]),
        );
        final tables = KioCard(
          child: LiveQuery(
            query: () async => {
              for (final t in kTables.values.where((t) => s.canRead(t.name)))
                t.label: (
                  (await LocalDb.instance.scalar('SELECT COUNT(*) FROM ${t.name} WHERE deleted = 0')).toInt(),
                  (await LocalDb.instance.scalar('SELECT COUNT(*) FROM ${t.name} WHERE dirty = 1')).toInt(),
                ),
            },
            builder: (context, m) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Datos locales', style: Kio.h2()),
              const SizedBox(height: 10),
              for (final e in m.entries)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(children: [
                    Expanded(child: Text(e.key)),
                    Text(qty(e.value.$1), style: const TextStyle(fontWeight: FontWeight.w600)),
                    if (e.value.$2 > 0) ...[const SizedBox(width: 8), StatusPill('${e.value.$2} pendientes', color: Kio.warning)],
                  ]),
                ),
            ]),
          ),
        );
        return c.maxWidth > 900
            ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: info), const SizedBox(width: 16), Expanded(child: tables)])
            : Column(children: [info, const SizedBox(height: 16), tables]);
      }),
      const SizedBox(height: 16),
      LiveQuery(
        query: () async {
          final rows = await LocalDb.instance.rejectedRows();
          for (final r in rows) {
            r['_reason'] = await LocalDb.instance.getMeta('reject:${r['_table']}:${r['id']}');
          }
          return rows;
        },
        builder: (context, rows) => rows.isEmpty
            ? const SizedBox()
            : KioTableCard(
                title: 'Cambios rechazados por el servidor',
                subtitle: 'No se aplicaron por permisos o reglas de negocio. Descártalos para volver a la versión del servidor.',
                rows: rows,
                columns: [
                  KioColumn('Tabla', (r) => Text(kTables[r['_table']]?.label ?? asStr(r['_table']))),
                  KioColumn('Registro', (r) => Text(asStr(r['name'] ?? r['number'] ?? r['concept'] ?? r['id']), overflow: TextOverflow.ellipsis), flex: 3),
                  KioColumn('Motivo', (r) => Text(asStr(r['_reason']), style: const TextStyle(color: Kio.danger)), flex: 4),
                  KioColumn('', (r) => TextButton(onPressed: () => sync.discardRejected(r['_table'] as String, r['id'] as String), child: const Text('Descartar')), numeric: true),
                ],
              ),
      ),
      if (s.isAdmin) ...[const SizedBox(height: 16), const _DevicesCard()],
    ]);
  }
}

Widget _kv(String k, String v) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 150, child: Text(k, style: Kio.label)),
        Expanded(child: SelectableText(v, style: const TextStyle(fontWeight: FontWeight.w500))),
      ]),
    );

/// Monitoreo centralizado de equipos instalados (consulta en línea a la API).
class _DevicesCard extends StatefulWidget {
  const _DevicesCard();
  @override
  State<_DevicesCard> createState() => _DevicesCardState();
}

class _DevicesCardState extends State<_DevicesCard> {
  late Future<List<DbRow>> _f = _load();

  Future<List<DbRow>> _load() async {
    final d = await context.read<Session>().api.run('{ devices { id name platform appVersion lastSyncAt pending lastCursor user { name } } }');
    return [for (final x in (d['devices'] as List)) (x as Map).cast<String, Object?>()];
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<List<DbRow>>(
        future: _f,
        builder: (context, snap) {
          if (snap.hasError) {
            return KioCard(child: Row(children: [const Icon(LucideIcons.cloudOff, size: 16, color: Kio.muted), const SizedBox(width: 10), Expanded(child: Text('Equipos: ${snap.error}', style: Kio.label))]));
          }
          return KioTableCard(
            title: 'Equipos instalados',
            subtitle: 'Versión, último sync y cambios pendientes de cada equipo de la empresa.',
            trailing: IconButton(onPressed: () => setState(() => _f = _load()), icon: const Icon(LucideIcons.refreshCw, size: 16)),
            rows: snap.data ?? const [],
            columns: [
              KioColumn('Equipo', (r) => NameCell(asStr(r['name']), subtitle: asStr(r['platform']), avatar: false), flex: 3),
              KioColumn('Usuario', (r) => Text(asStr((r['user'] as Map?)?['name']))),
              KioColumn('Versión', (r) => Text(asStr(r['appVersion']))),
              KioColumn('Último sync', (r) => Text(dateTime(r['lastSyncAt']))),
              KioColumn('Pendientes', (r) => StatusPill('${r['pending']}', color: asNum(r['pending']) > 0 ? Kio.warning : Kio.green), numeric: true),
            ],
          );
        },
      );
}

// =============================================================================
// Usuarios y roles (artix_admin) — requiere conexión
// =============================================================================

const kRoleLabels = {'admin': 'Dueño / Gerente', 'contador': 'Auxiliar contable', 'cajero': 'Cajero', 'vendedor': 'Vendedor'};

class UsersPage extends StatefulWidget {
  const UsersPage({super.key});
  @override
  State<UsersPage> createState() => _UsersPageState();
}

class _UsersPageState extends State<UsersPage> {
  late Future<List<DbRow>> _f = _load();

  Future<List<DbRow>> _load() async {
    final d = await context.read<Session>().api.run('{ users { id name email role active posTerminal lastLoginAt } }');
    return [for (final x in (d['users'] as List)) (x as Map).cast<String, Object?>()];
  }

  Future<void> _edit([DbRow? u]) async {
    final name = TextEditingController(text: asStr(u?['name']));
    final email = TextEditingController(text: asStr(u?['email']));
    final pass = TextEditingController();
    final terminal = TextEditingController(text: asStr(u?['posTerminal']));
    String role = asStr(u?['role']).isEmpty ? 'cajero' : asStr(u!['role']);
    bool active = u == null || asBool(u['active']);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: Text(u == null ? 'Nuevo usuario' : asStr(u['name']), style: Kio.h2(18)),
          content: SizedBox(
            width: 440,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(controller: name, decoration: const InputDecoration(labelText: 'Nombre')),
              const SizedBox(height: 12),
              TextField(controller: email, enabled: u == null, decoration: const InputDecoration(labelText: 'Correo')),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: role,
                decoration: const InputDecoration(labelText: 'Rol'),
                items: [for (final e in kRoleLabels.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                onChanged: (v) => set(() => role = v ?? role),
              ),
              const SizedBox(height: 12),
              TextField(controller: terminal, decoration: const InputDecoration(labelText: 'Terminal de caja (prefijo de documentos)', hintText: 'Ej. C1')),
              const SizedBox(height: 12),
              TextField(
                controller: pass,
                obscureText: true,
                decoration: InputDecoration(labelText: u == null ? 'Contraseña' : 'Nueva contraseña (opcional)', helperText: 'Mínimo 8 caracteres con letras y números'),
              ),
              if (u != null) SwitchListTile(contentPadding: EdgeInsets.zero, value: active, onChanged: (v) => set(() => active = v), title: const Text('Activo')),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Guardar')),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    final api = context.read<Session>().api;
    try {
      if (u == null) {
        await api.run(r'mutation($i:UserInput!){ createUser(input:$i){ id } }', {
          'i': {'name': name.text.trim(), 'email': email.text.trim(), 'password': pass.text, 'role': role, 'posTerminal': terminal.text.trim().isEmpty ? null : terminal.text.trim()},
        });
      } else {
        await api.run(r'mutation($id:ID!,$i:UserUpdate!){ updateUser(id:$id, input:$i){ id } }', {
          'id': u['id'],
          'i': {
            'name': name.text.trim(),
            'role': role,
            'active': active,
            'posTerminal': terminal.text.trim().isEmpty ? null : terminal.text.trim(),
            if (pass.text.isNotEmpty) 'password': pass.text,
          },
        });
      }
      if (mounted) {
        toast(context, 'Usuario guardado');
        setState(() => _f = _load());
      }
    } on GqlException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) => PageBody(children: [
        PageHeader(
          title: 'Usuarios y roles',
          subtitle: 'Requiere conexión. Los permisos de cada rol se aplican en el servidor y en la app.',
          actions: [FilledButton.icon(onPressed: _edit, icon: const Icon(LucideIcons.plus, size: 16), label: const Text('Nuevo usuario'))],
        ),
        FutureBuilder<List<DbRow>>(
          future: _f,
          builder: (context, snap) {
            if (snap.hasError) {
              return KioCard(child: EmptyState(icon: LucideIcons.cloudOff, title: 'No se pudo consultar', message: '${snap.error}', action: OutlinedButton(onPressed: () => setState(() => _f = _load()), child: const Text('Reintentar'))));
            }
            if (!snap.hasData) return const Center(child: CircularProgressIndicator());
            return Column(children: [
              const _RoleMatrix(),
              const SizedBox(height: 20),
              KioTableCard(
                title: 'Usuarios',
                rows: snap.data!,
                onTap: _edit,
                columns: [
                  KioColumn('Usuario', (r) => NameCell(asStr(r['name']), subtitle: asStr(r['email'])), flex: 4),
                  KioColumn('Rol', (r) => StatusPill(kRoleLabels[r['role']] ?? asStr(r['role']), color: r['role'] == 'admin' ? Kio.navy : Kio.info)),
                  KioColumn('Terminal', (r) => Text(asStr(r['posTerminal']).isEmpty ? '—' : asStr(r['posTerminal']))),
                  KioColumn('Último ingreso', (r) => Text(dateTime(r['lastLoginAt']))),
                  KioColumn('Estado', (r) => asBool(r['active']) ? const StatusPill('Activo', color: Kio.green) : const StatusPill('Inactivo')),
                ],
              ),
            ]);
          },
        ),
      ]);
}

/// Matriz de permisos por rol (lectura/escritura por módulo), derivada de schema/tables.json.
class _RoleMatrix extends StatelessWidget {
  const _RoleMatrix();

  @override
  Widget build(BuildContext context) {
    Widget cell(TableSpec t, String role) {
      final w = t.canWrite(role), r = t.canRead(role);
      return Icon(w ? LucideIcons.pencil : r ? LucideIcons.eye : LucideIcons.minus, size: 15, color: w ? Kio.green : r ? Kio.info : Kio.subtle);
    }

    return KioTableCard(
      title: 'Permisos por rol',
      subtitle: 'Lápiz: crea y edita · Ojo: sólo consulta',
      rows: [for (final t in kTables.values) {'t': t.name}],
      columns: [
        KioColumn('Módulo', (r) => Text(kTables[r['t']]!.label, style: const TextStyle(fontWeight: FontWeight.w600)), flex: 3),
        for (final role in kRoles) KioColumn(kRoleLabels[role]!, (r) => Center(child: cell(kTables[r['t']]!, role))),
      ],
    );
  }
}

// =============================================================================
// Empresa
// =============================================================================

class CompanyPage extends StatefulWidget {
  const CompanyPage({super.key});
  @override
  State<CompanyPage> createState() => _CompanyPageState();
}

class _CompanyPageState extends State<CompanyPage> {
  final _c = <String, TextEditingController>{};
  bool _busy = false;

  static const _fields = {'name': 'Razón social', 'nit': 'NIT', 'address': 'Dirección', 'city': 'Ciudad', 'phone': 'Teléfono', 'email': 'Correo', 'receiptFooter': 'Pie de recibo POS'};

  @override
  void initState() {
    super.initState();
    final raw = context.read<Session>().company!.raw;
    for (final k in _fields.keys) {
      _c[k] = TextEditingController(text: asStr(raw[k]));
    }
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    final s = context.read<Session>();
    try {
      await s.api.run(r'mutation($i:CompanyInput!){ updateCompany(input:$i){ id } }', {
        'i': {for (final e in _c.entries) e.key: e.value.text.trim().isEmpty ? null : e.value.text.trim()},
      });
      await s.refreshMe();
      if (mounted) toast(context, 'Datos de la empresa actualizados');
    } on GqlException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PageBody(children: [
        const PageHeader(title: 'Empresa', subtitle: 'Datos que aparecen en recibos de caja y desprendibles. Requiere conexión.'),
        KioCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            LayoutBuilder(builder: (context, c) {
              final w = c.maxWidth < 600 ? c.maxWidth : (c.maxWidth - 16) / 2;
              return Wrap(spacing: 16, runSpacing: 14, children: [
                for (final e in _fields.entries) SizedBox(width: e.key == 'receiptFooter' ? c.maxWidth : w, child: TextField(controller: _c[e.key], decoration: InputDecoration(labelText: e.value))),
              ]);
            }),
            const SizedBox(height: 18),
            FilledButton(onPressed: _busy ? null : _save, child: const Text('Guardar')),
          ]),
        ),
      ]);
}
