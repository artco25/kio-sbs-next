import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'data/local_db.dart';
import 'pages/device_setup_page.dart';
import 'pages/login_page.dart';
import 'services/session.dart';
import 'services/sync_service.dart';
import 'services/updater.dart';
import 'theme/kio_theme.dart';
import 'ui/shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('es');
  // Al primer arranque (instalación) se crea la SQLite local con todas las tablas.
  final db = await LocalDb.open();
  final session = Session(db);
  await session.load();
  final sync = SyncService(db, session);
  final updater = UpdateService(session);

  runApp(MultiProvider(
    providers: [
      ChangeNotifierProvider.value(value: db),
      ChangeNotifierProvider.value(value: session),
      ChangeNotifierProvider.value(value: sync),
      ChangeNotifierProvider.value(value: updater),
    ],
    child: const KioSbsApp(),
  ));
  updater.start();
}

class KioSbsApp extends StatelessWidget {
  const KioSbsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'KIO SBS',
      debugShowCheckedModeBanner: false,
      theme: Kio.theme(),
      locale: const Locale('es', 'CO'),
      supportedLocales: const [Locale('es', 'CO'), Locale('es')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: const _Root(),
    );
  }
}

/// Muestra el login o el shell y arranca/detiene el ciclo de sincronización de 90 s.
class _Root extends StatefulWidget {
  const _Root();

  @override
  State<_Root> createState() => _RootState();
}

class _RootState extends State<_Root> with WidgetsBindingObserver {
  bool _started = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!mounted) return;
    context.read<SyncService>().onLifecycle(state);
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();
    final sync = context.read<SyncService>();
    final ready = session.loggedIn && session.deviceConfigured;
    if (ready && !_started) {
      _started = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        sync.start();
        session.refreshMe();
      });
    } else if (!ready && _started) {
      _started = false;
      sync.stop();
    }
    final child = !session.loggedIn
        ? const LoginPage()
        : !session.deviceConfigured
            ? const DeviceSetupPage()
            : const KioShell();
    // Cualquier interacción del usuario cuenta como actividad: retoma el sync si estaba en pausa.
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (_) => sync.noteActivity(),
      onPointerSignal: (_) => sync.noteActivity(),
      onPointerHover: (_) => sync.noteActivity(),
      child: child,
    );
  }
}
