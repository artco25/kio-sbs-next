import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../services/session.dart';
import '../theme/kio_theme.dart';

class DeviceSetupPage extends StatefulWidget {
  const DeviceSetupPage({super.key});

  @override
  State<DeviceSetupPage> createState() => _DeviceSetupPageState();
}

class _DeviceSetupPageState extends State<DeviceSetupPage> {
  final _code = TextEditingController();
  final _section = TextEditingController();
  bool _saving = false;
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _known = [];
  List<Map<String, dynamic>> _sites = [];
  String? _siteId;

  @override
  void initState() {
    super.initState();
    final s = context.read<Session>();
    _code.text = s.terminalCode;
    _section.text = s.section;
    _siteId = s.siteId.isEmpty ? null : s.siteId;
    _loadKnown();
  }

  @override
  void dispose() {
    _code.dispose();
    _section.dispose();
    super.dispose();
  }

  Future<void> _loadKnown() async {
    setState(() { _loading = true; _error = null; });
    try {
      final s = context.read<Session>();
      final data = await s.api.run('{ devices{ id name terminalCode section macAddress platform } }');
      final raw = data['devices'];
      final list = raw is List ? raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() : <Map<String, dynamic>>[];
      final seen = <String>{};
      _known = list.where((d) {
        final code = (d['terminalCode'] as String?)?.trim() ?? '';
        if (code.isEmpty || seen.contains(code)) return false;
        seen.add(code);
        return true;
      }).toList();

      final sd = await s.api.run('{ sites { id name code active } }');
      final rawSites = sd['sites'];
      _sites = rawSites is List
          ? rawSites.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).where((x) => x['active'] != false).toList()
          : <Map<String, dynamic>>[];
      if ((_siteId == null || _siteId!.isEmpty) && _sites.isNotEmpty) _siteId = _sites.first['id'] as String;
    } catch (e) {
      _error = 'No se pudieron cargar terminales existentes: $e';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    final code = _code.text.trim().toUpperCase();
    if (code.isEmpty) {
      setState(() => _error = 'El código de caja/terminal es obligatorio.');
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      await context.read<Session>().setDeviceConfig(terminalCode: code, section: _section.text, siteId: _siteId);
    } catch (e) {
      if (mounted) setState(() { _error = '$e'; _saving = false; });
      return;
    }
    if (mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return Scaffold(
      backgroundColor: Kio.bg,
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: Card(
            margin: const EdgeInsets.all(24),
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: ListView(
                shrinkWrap: true,
                children: [
                  Row(children: [
                    Container(width: 44, height: 44, decoration: BoxDecoration(color: Kio.navy.withValues(alpha: .08), borderRadius: BorderRadius.circular(14)), child: const Icon(LucideIcons.store, color: Kio.navy)),
                    const SizedBox(width: 14),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Configurar caja POS', style: Kio.h2(24)),
                      const SizedBox(height: 4),
                      const Text('Identifica este equipo de forma permanente. Esta información se usa para sincronización, auditoría e historial de caja.', style: TextStyle(color: Kio.muted)),
                    ])),
                  ]),
                  const SizedBox(height: 24),
                  Wrap(spacing: 12, runSpacing: 12, children: [
                    _InfoChip(label: 'Equipo', value: s.deviceName),
                    _InfoChip(label: 'Plataforma', value: s.platform),
                    _InfoChip(label: 'MAC', value: s.macAddress.isEmpty ? 'No detectada' : s.macAddress),
                    _InfoChip(label: 'Hardware ID', value: s.hardwareId.isEmpty ? 'No detectado' : s.hardwareId),
                  ]),
                  const SizedBox(height: 24),
                  const Text('Código de caja / terminal *', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  TextField(controller: _code, decoration: const InputDecoration(hintText: 'Ej. CAJA-01, POS-RECEPCION'), textCapitalization: TextCapitalization.characters),
                  const SizedBox(height: 14),
                  const Text('Sección / ubicación', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  TextField(controller: _section, decoration: const InputDecoration(hintText: 'Ej. Mostrador, Sala, Bodega')),
                  const SizedBox(height: 14),
                  const Text('Sede / punto de venta *', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<String?>(
                    initialValue: _siteId,
                    isExpanded: true,
                    decoration: const InputDecoration(prefixIcon: Icon(LucideIcons.store, size: 16)),
                    items: [
                      const DropdownMenuItem<String?>(value: null, child: Text('Todas las sedes (sólo si no hay sedes configuradas)')),
                      if (_siteId != null && !_sites.any((x) => x['id'] == _siteId))
                        DropdownMenuItem<String?>(value: _siteId, child: Text('Sede guardada ($_siteId)')),
                      for (final site in _sites)
                        DropdownMenuItem<String?>(
                          value: site['id'] as String,
                          child: Text('${site['name']}${site['code'] != null ? ' · ${site['code']}' : ''}', overflow: TextOverflow.ellipsis),
                        ),
                    ],
                    onChanged: (v) => setState(() => _siteId = v),
                  ),
                  const SizedBox(height: 6),
                  const Text('El POS sólo venderá existencias de esta sede. No se muestran unidades del CEDI hasta que se requisicionen.', style: TextStyle(color: Kio.muted, fontSize: 12)),
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    Text(_error!, style: const TextStyle(color: Kio.danger, fontSize: 13)),
                  ],
                  const SizedBox(height: 20),
                  Row(children: [
                    Expanded(child: Text('Terminales existentes', style: Kio.h2(16))),
                    if (_loading) const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) else IconButton(onPressed: _loadKnown, icon: const Icon(LucideIcons.refreshCw, size: 18)),
                  ]),
                  const SizedBox(height: 8),
                  if (_known.isEmpty && !_loading)
                    const Text('No hay terminales registradas aún. Puedes escribir un código nuevo.', style: TextStyle(color: Kio.muted))
                  else
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      for (final d in _known)
                        ActionChip(
                          label: Text('${d['terminalCode']}${(d['section'] as String?)?.isNotEmpty == true ? ' · ${d['section']}' : ''}'),
                          onPressed: () {
                            _code.text = (d['terminalCode'] as String?) ?? '';
                            _section.text = (d['section'] as String?) ?? '';
                            setState(() {});
                          },
                        ),
                    ]),
                  const SizedBox(height: 24),
                  Align(
                    alignment: Alignment.centerRight,
                    child: FilledButton.icon(
                      onPressed: _saving ? null : _save,
                      icon: _saving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(LucideIcons.save, size: 18),
                      label: Text(s.deviceConfigured ? 'Guardar cambios' : 'Guardar y continuar'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        constraints: const BoxConstraints(maxWidth: 320),
        decoration: BoxDecoration(color: Kio.bg, borderRadius: BorderRadius.circular(12), border: Border.all(color: Kio.border)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label.toUpperCase(), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Kio.muted, letterSpacing: .6)),
          const SizedBox(height: 4),
          Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        ]),
      );
}
