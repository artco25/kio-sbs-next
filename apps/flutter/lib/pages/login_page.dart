import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../services/graphql.dart';
import '../services/session.dart';
import '../theme/kio_theme.dart';
import '../ui/widgets.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _busy = false;
  String? _error;

  Future<void> _login() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Escribe tu correo y tu contraseña');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final wiped = await context.read<Session>().login(_email.text, _password.text);
      if (wiped && mounted) toast(context, 'Se cambió de empresa: los datos locales anteriores se reemplazaron.');
    } on GqlException catch (e) {
      setState(() => _error = e.offline ? 'No hay conexión con el servidor. El primer inicio de sesión requiere internet.' : e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _servers() async {
    final s = context.read<Session>();
    final api = TextEditingController(text: s.apiUrl);
    final sync = TextEditingController(text: s.syncUrl);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Servidores', style: Kio.h2(18)),
        content: SizedBox(
          width: 440,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: api, decoration: const InputDecoration(labelText: 'API (kio-sbs-api)')),
            const SizedBox(height: 12),
            TextField(controller: sync, decoration: const InputDecoration(labelText: 'Sincronización (kio-sbs-sync)')),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Guardar')),
        ],
      ),
    );
    if (ok == true) await s.setServers(api.text, sync.text);
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 900;
    final form = Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(28),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (!wide) ...[Image.asset('assets/brand/artix_logo.png', height: 40), const SizedBox(height: 28)],
            Text('Inicia sesión', style: Kio.title(26)),
            const SizedBox(height: 6),
            const Text('KIO SBS · Small Business Solution', style: Kio.label),
            const SizedBox(height: 28),
            const Text('Correo electrónico', style: TextStyle(fontWeight: FontWeight.w500)),
            const SizedBox(height: 8),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              decoration: const InputDecoration(hintText: 'Escribe tu correo'),
            ),
            const SizedBox(height: 16),
            const Text('Contraseña', style: TextStyle(fontWeight: FontWeight.w500)),
            const SizedBox(height: 8),
            TextField(
              controller: _password,
              obscureText: _obscure,
              autofillHints: const [AutofillHints.password],
              onSubmitted: (_) => _login(),
              decoration: InputDecoration(
                hintText: 'Escribe tu contraseña',
                suffixIcon: IconButton(
                  onPressed: () => setState(() => _obscure = !_obscure),
                  icon: Icon(_obscure ? LucideIcons.eye : LucideIcons.eyeOff, size: 17),
                ),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Kio.tint(Kio.danger, .08), borderRadius: BorderRadius.circular(10)),
                child: Row(children: [
                  const Icon(LucideIcons.circleAlert, size: 16, color: Kio.danger),
                  const SizedBox(width: 10),
                  Expanded(child: Text(_error!, style: const TextStyle(color: Kio.danger))),
                ]),
              ),
            ],
            const SizedBox(height: 22),
            FilledButton(
              onPressed: _busy ? null : _login,
              style: FilledButton.styleFrom(minimumSize: const Size(0, 46), shape: const StadiumBorder()),
              child: _busy
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Iniciar sesión'),
            ),
            const SizedBox(height: 14),
            TextButton.icon(
              onPressed: _servers,
              icon: const Icon(LucideIcons.settings, size: 15),
              label: const Text('Configurar servidores'),
            ),
          ]),
        ),
      ),
    );

    return Scaffold(
      backgroundColor: Colors.white,
      body: wide
          ? Row(children: [
              Expanded(child: _BrandPanel()),
              Expanded(child: form),
            ])
          : form,
    );
  }
}

/// Panel de marca: fondo azul oscuro con las 4 suites de KIO SBS alrededor del logo.
class _BrandPanel extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    const suites = [Suite.financiero, Suite.comercial, Suite.personal, Suite.pos];
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF1E1B4B), Color(0xFF3730A3), Color(0xFF6366F1)]),
      ),
      padding: const EdgeInsets.all(48),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
          child: Image.asset('assets/brand/artix_logo.png', height: 28),
        ),
        const Spacer(),
        const Text('KIO SBS', style: TextStyle(fontFamily: Kio.heading, color: Colors.white, fontSize: 52, fontWeight: FontWeight.w800, height: 1)),
        const SizedBox(height: 10),
        const Text('Small Business Solution', style: TextStyle(color: Kio.cyan, fontSize: 18, fontWeight: FontWeight.w600)),
        const SizedBox(height: 14),
        const SizedBox(
          width: 420,
          child: Text(
            'Opera tu negocio aunque se caiga el internet: todo queda en este equipo y se sincroniza solo cada minuto y medio.',
            style: TextStyle(color: Color(0xFFB9C7D6), fontSize: 15, height: 1.5),
          ),
        ),
        const SizedBox(height: 36),
        Wrap(spacing: 12, runSpacing: 12, children: [
          for (final s in suites)
            Container(
              width: 200,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: .06),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white.withValues(alpha: .10)),
              ),
              child: Row(children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(color: s.color.withValues(alpha: .22), borderRadius: BorderRadius.circular(9)),
                  child: Icon(s.icon, size: 17, color: Colors.white),
                ),
                const SizedBox(width: 12),
                Flexible(child: Text(s.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600))),
              ]),
            ),
        ]),
        const Spacer(),
        const Text('© ARTIX · KIO SBS', style: TextStyle(color: Color(0xFF7F93A8), fontSize: 12)),
      ]),
    );
  }
}
