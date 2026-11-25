import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../data/local_db.dart';
import '../services/session.dart';
import '../theme/kio_theme.dart';
import 'format.dart';
import 'widgets.dart';

enum FieldType { text, multiline, email, phone, money, number, percent, integer, boolean, date, select, ref }

/// Definición declarativa de un campo de formulario (al estilo de las vistas de Odoo).
class FieldSpec {
  const FieldSpec(
    this.key,
    this.label, {
    this.type = FieldType.text,
    this.required = false,
    this.options = const {},
    this.refTable,
    this.refLabel = 'name',
    this.refWhere,
    this.full = false,
    this.hint,
    this.readOnly = false,
    this.defaultValue,
  });

  final String key;
  final String label;
  final FieldType type;
  final bool required;
  final Map<String, String> options;
  final String? refTable;
  final String refLabel;
  final String? refWhere;
  final bool full;
  final String? hint;
  final bool readOnly;
  final Object? defaultValue;
}

/// Abre el formulario de un registro y lo guarda en SQLite (queda pendiente de sincronizar).
Future<DbRow?> showEntityForm(
  BuildContext context, {
  required String table,
  required String title,
  required List<FieldSpec> fields,
  DbRow? initial,
  Map<String, Object?> extra = const {},
  String? Function(Map<String, Object?> values)? validate,
  bool allowDelete = true,
}) {
  return showDialog<DbRow>(
    context: context,
    builder: (_) => _EntityFormDialog(
      table: table,
      title: title,
      fields: fields,
      initial: initial,
      extra: extra,
      validate: validate,
      allowDelete: allowDelete,
    ),
  );
}

class _EntityFormDialog extends StatefulWidget {
  const _EntityFormDialog({
    required this.table,
    required this.title,
    required this.fields,
    required this.initial,
    required this.extra,
    required this.validate,
    required this.allowDelete,
  });
  final String table;
  final String title;
  final List<FieldSpec> fields;
  final DbRow? initial;
  final Map<String, Object?> extra;
  final String? Function(Map<String, Object?>)? validate;
  final bool allowDelete;

  @override
  State<_EntityFormDialog> createState() => _EntityFormDialogState();
}

class _EntityFormDialogState extends State<_EntityFormDialog> {
  final _form = GlobalKey<FormState>();
  late final Map<String, Object?> _values;
  final Map<String, List<DbRow>> _refs = {};
  bool _saving = false;

  /// Nuevo si no hay registro inicial o si sólo trae valores precargados (sin id).
  bool get _isNew => widget.initial?['id'] == null;

  @override
  void initState() {
    super.initState();
    _values = {
      for (final f in widget.fields) f.key: widget.initial?[f.key] ?? f.defaultValue,
    };
    _loadRefs();
  }

  Future<void> _loadRefs() async {
    for (final f in widget.fields.where((f) => f.type == FieldType.ref)) {
      _refs[f.key] = await LocalDb.instance.all(f.refTable!, where: f.refWhere, orderBy: f.refLabel);
    }
    if (mounted) setState(() {});
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    _form.currentState!.save();
    final err = widget.validate?.call(_values);
    if (err != null) {
      toast(context, err, error: true);
      return;
    }
    setState(() => _saving = true);
    final s = context.read<Session>();
    final row = await LocalDb.instance.save(
      widget.table,
      {if (!_isNew) 'id': widget.initial!['id'], ...widget.extra, ..._values},
      companyId: s.companyId,
      userId: s.userId,
    );
    if (mounted) Navigator.pop(context, row);
  }

  Future<void> _delete() async {
    if (!await confirm(context, 'Eliminar registro', '¿Seguro que deseas eliminarlo? Se eliminará también en los demás equipos al sincronizar.',
        ok: 'Eliminar', danger: true)) {
      return;
    }
    if (!mounted) return;
    final s = context.read<Session>();
    await LocalDb.instance.remove(widget.table, widget.initial!['id'] as String, companyId: s.companyId, userId: s.userId);
    if (mounted) Navigator.pop(context, widget.initial);
  }

  @override
  Widget build(BuildContext context) {
    final canWrite = context.read<Session>().canWrite(widget.table);
    final width = MediaQuery.sizeOf(context).width;
    return Dialog(
      insetPadding: EdgeInsets.symmetric(horizontal: width < 600 ? 12 : 40, vertical: 24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720),
        child: Form(
          key: _form,
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 20, 12, 8),
              child: Row(children: [
                Expanded(child: Text(widget.title, style: Kio.h2(19))),
                IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(LucideIcons.x, size: 18)),
              ]),
            ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 8),
                child: LayoutBuilder(builder: (context, c) {
                  final half = c.maxWidth < 520 ? c.maxWidth : (c.maxWidth - 16) / 2;
                  return Wrap(spacing: 16, runSpacing: 14, children: [
                    for (final f in widget.fields)
                      SizedBox(
                        width: f.full || f.type == FieldType.multiline ? c.maxWidth : half,
                        child: _field(f, canWrite),
                      ),
                  ]);
                }),
              ),
            ),
            const Divider(),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 24, 16),
              child: Row(children: [
                if (!_isNew && widget.allowDelete && canWrite)
                  TextButton.icon(
                    onPressed: _delete,
                    style: TextButton.styleFrom(foregroundColor: Kio.danger),
                    icon: const Icon(LucideIcons.trash2, size: 16),
                    label: const Text('Eliminar'),
                  ),
                const Spacer(),
                OutlinedButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
                const SizedBox(width: 10),
                if (canWrite)
                  FilledButton(
                    onPressed: _saving ? null : _save,
                    child: _saving
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Guardar'),
                  ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  InputDecoration _dec(FieldSpec f) => InputDecoration(labelText: f.label + (f.required ? ' *' : ''), hintText: f.hint);

  String? _req(FieldSpec f, Object? v) => f.required && (v == null || '$v'.trim().isEmpty) ? 'Obligatorio' : null;

  Widget _field(FieldSpec f, bool canWrite) {
    final enabled = canWrite && !f.readOnly;
    switch (f.type) {
      case FieldType.boolean:
        return Container(
          height: 46,
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(children: [
            Switch(
              value: asBool(_values[f.key]),
              activeTrackColor: Kio.navy,
              onChanged: enabled ? (v) => setState(() => _values[f.key] = v ? 1 : 0) : null,
            ),
            const SizedBox(width: 8),
            Flexible(child: Text(f.label)),
          ]),
        );
      case FieldType.select:
        return DropdownButtonFormField<String>(
          initialValue: f.options.containsKey(_values[f.key]) ? _values[f.key] as String : null,
          decoration: _dec(f),
          items: [for (final e in f.options.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
          onChanged: enabled ? (v) => setState(() => _values[f.key] = v) : null,
          validator: (v) => _req(f, v),
        );
      case FieldType.ref:
        final items = _refs[f.key] ?? const <DbRow>[];
        final current = _values[f.key] as String?;
        return DropdownButtonFormField<String>(
          initialValue: items.any((r) => r['id'] == current) ? current : null,
          isExpanded: true,
          decoration: _dec(f),
          items: [
            if (!f.required) const DropdownMenuItem<String>(value: null, child: Text('—')),
            for (final r in items) DropdownMenuItem(value: r['id'] as String, child: Text(asStr(r[f.refLabel]), overflow: TextOverflow.ellipsis)),
          ],
          onChanged: enabled ? (v) => setState(() => _values[f.key] = v) : null,
          validator: (v) => _req(f, v),
        );
      case FieldType.date:
        final ctrl = TextEditingController(text: asStr(_values[f.key]).length >= 10 ? asStr(_values[f.key]).substring(0, 10) : '');
        return TextFormField(
          controller: ctrl,
          readOnly: true,
          decoration: _dec(f).copyWith(suffixIcon: const Icon(LucideIcons.calendarDays, size: 16)),
          validator: (v) => _req(f, v),
          onTap: !enabled
              ? null
              : () async {
                  final d = await showDatePicker(
                    context: context,
                    initialDate: parseDate(_values[f.key]) ?? DateTime.now(),
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2100),
                    locale: const Locale('es'),
                  );
                  if (d != null) setState(() => _values[f.key] = ymd(d));
                },
        );
      default:
        final numeric = {FieldType.money, FieldType.number, FieldType.percent, FieldType.integer}.contains(f.type);
        var initial = _values[f.key];
        if (f.type == FieldType.percent && initial != null) initial = (asNum(initial) * 100).toString().replaceAll(RegExp(r'\.0$'), '');
        if (numeric && initial != null) initial = '$initial'.replaceAll(RegExp(r'\.0$'), '');
        return TextFormField(
          initialValue: initial == null ? '' : '$initial',
          enabled: enabled,
          maxLines: f.type == FieldType.multiline ? 3 : 1,
          keyboardType: numeric
              ? const TextInputType.numberWithOptions(decimal: true)
              : f.type == FieldType.email
                  ? TextInputType.emailAddress
                  : f.type == FieldType.phone
                      ? TextInputType.phone
                      : TextInputType.text,
          inputFormatters: numeric ? [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,-]'))] : null,
          decoration: _dec(f).copyWith(
            prefixText: f.type == FieldType.money ? r'$ ' : null,
            suffixText: f.type == FieldType.percent ? '%' : null,
          ),
          validator: (v) {
            final r = _req(f, v);
            if (r != null) return r;
            if (f.type == FieldType.email && (v ?? '').isNotEmpty && !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v!)) return 'Correo inválido';
            if (numeric && (v ?? '').isNotEmpty && num.tryParse(v!.replaceAll(',', '.')) == null) return 'Número inválido';
            return null;
          },
          onSaved: (v) {
            final t = (v ?? '').trim();
            if (!numeric) {
              _values[f.key] = t.isEmpty ? null : t;
              return;
            }
            final n = num.tryParse(t.replaceAll(',', '.')) ?? 0;
            _values[f.key] = f.type == FieldType.percent ? n / 100 : (f.type == FieldType.integer ? n.toInt() : n);
          },
        );
    }
  }
}
