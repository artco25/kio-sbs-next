// Prueba de punta a punta contra los workers locales (wrangler dev):
//   KIO_API_URL=http://127.0.0.1:8797 KIO_SYNC_URL=http://127.0.0.1:8798 \
//   KIO_PROVISION_TOKEN=... flutter test test/e2e_test.dart --update-goldens
// Crea una empresa nueva, inicia sesión, sincroniza, vende sin conexión, sincroniza de nuevo
// y genera capturas de las pantallas principales en test/goldens/.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:intl/date_symbol_data_local.dart';
import 'package:kio_sbs/data/local_db.dart';
import 'package:kio_sbs/pages/login_page.dart';
import 'package:kio_sbs/services/business.dart';
import 'package:kio_sbs/services/session.dart';
import 'package:kio_sbs/services/sync_service.dart';
import 'package:kio_sbs/theme/kio_theme.dart';
import 'package:kio_sbs/ui/shell.dart';
import 'package:provider/provider.dart';

final api = Platform.environment['KIO_API_URL'] ?? 'http://127.0.0.1:8797';
final syncUrl = Platform.environment['KIO_SYNC_URL'] ?? 'http://127.0.0.1:8798';

Future<void> loadFonts() async {
  Future<void> family(String name, List<String> assets) async {
    final loader = FontLoader(name);
    for (final a in assets) {
      loader.addFont(rootBundle.load(a));
    }
    await loader.load();
  }

  await family('Inter', ['assets/fonts/Inter-Regular.otf', 'assets/fonts/Inter-Medium.otf', 'assets/fonts/Inter-SemiBold.otf', 'assets/fonts/Inter-Bold.otf']);
  await family('Montserrat', ['assets/fonts/Montserrat-SemiBold.ttf', 'assets/fonts/Montserrat-Bold.ttf', 'assets/fonts/Montserrat-ExtraBold.ttf']);
  await family('packages/lucide_icons_flutter/Lucide', ['packages/lucide_icons_flutter/assets/lucide.ttf']);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = null; // red real hacia wrangler dev

  late LocalDb db;
  late Session session;
  late SyncService sync;

  testWidgets('offline-first: login, sync, venta sin conexión y capturas', (tester) async {
    final token = Platform.environment['KIO_PROVISION_TOKEN'];
    if (token == null) {
      markTestSkipped('Falta KIO_PROVISION_TOKEN');
      return;
    }
    final stamp = DateTime.now().millisecondsSinceEpoch;
    final email = 'e2e+$stamp@kio-sbs.test';
    const password = 'E2eKioSbs2026';

    await tester.runAsync(() async {
      await initializeDateFormatting('es');
      await loadFonts();
      final r = await http.post(Uri.parse('$api/provision'),
          headers: {'Content-Type': 'application/json', 'X-Provision-Token': token},
          body: jsonEncode({
            'company': {'name': 'Panadería La Espiga', 'nit': '901234567-8'},
            'admin': {'name': 'Laura Martínez', 'email': email, 'password': password},
            'demo': true,
          }));
      expect(r.statusCode, 201, reason: r.body);

      final dir = await Directory.systemTemp.createTemp('kio_sbs_e2e');
      db = await LocalDb.open(path: '${dir.path}/kio_sbs.db');
      session = Session(db);
      await session.load();
      await session.setServers(api, syncUrl);
      await session.login(email, password);
      expect(session.loggedIn, isTrue);

      sync = SyncService(db, session);
      await sync.syncNow();
      expect(sync.lastError, isNull);
      final products = await db.all('products');
      expect(products.length, 7);

      // Venta POS registrada localmente (sin tocar la red)
      final biz = Biz(session);
      await db.save('pos_sessions', {'number': 'CAJA-T-00001', 'terminal': 'T', 'user_id': session.userId, 'opened_at': localNow(), 'opening_cash': 100000, 'status': 'abierta'},
          companyId: session.companyId, userId: session.userId);
      final pos = (await biz.openSession())!;
      final sale = await biz.saveSale(
        channel: 'pos',
        lines: [CartLine.fromProduct(products.first)..qty = 3, CartLine.fromProduct(products[1])],
        payments: [('efectivo', 0)],
        posSessionId: pos['id'] as String,
      );
      // pago por el total
      await db.save('payments', {'number': 'RC-T-1', 'kind': 'venta', 'sale_id': sale['id'], 'date': localNow(), 'method': 'efectivo', 'amount': sale['total'], 'pos_session_id': pos['id'], 'user_id': session.userId},
          companyId: session.companyId, userId: session.userId);
      // Pedido a crédito de un cliente con cupo
      final partner = (await db.all('partners', where: 'credit_limit > 0')).first;
      await biz.saveSale(channel: 'pedido', lines: [CartLine.fromProduct(products[2])..qty = 10], partnerId: partner['id'] as String, paymentMode: 'credito');
      // Gasto de caja menor
      await db.save('expenses', {'number': 'CM-T-1', 'date': localToday(), 'concept': 'Domicilio de harina', 'category': 'transporte', 'amount': 18000, 'status': 'enviada', 'requested_by': session.userId},
          companyId: session.companyId, userId: session.userId);

      expect(await db.pendingCount(), greaterThan(5));
      await sync.syncNow();
      expect(sync.lastError, isNull);
      expect(await db.pendingCount(), 0);

      // El servidor ya tiene la venta (consulta GraphQL del worker api)
      final d = await session.api.run('{ sales(channel:"pos"){ total items{ number total lines{ name qty } } } dashboard{ kpis{ key value } } }');
      final items = (d['sales'] as Map)['items'] as List;
      expect(items.single['number'], sale['number']);
      expect((items.single['lines'] as List).length, 2);
    });

    // ------------------------------------------------------------------ capturas
    tester.view.physicalSize = const Size(1440, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    Future<void> shot(String module, String file) async {
      await tester.runAsync(() => db.setMeta('ui:module', module));
      await tester.pumpWidget(MultiProvider(
        key: ValueKey(module),
        providers: [
          ChangeNotifierProvider.value(value: db),
          ChangeNotifierProvider.value(value: session),
          ChangeNotifierProvider.value(value: sync),
        ],
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: Kio.theme(),
          locale: const Locale('es', 'CO'),
          supportedLocales: const [Locale('es', 'CO')],
          localizationsDelegates: GlobalMaterialLocalizations.delegates,
          home: module == 'login' ? const LoginPage() : const KioShell(),
        ),
      ));
      for (var i = 0; i < 6; i++) {
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 250)));
        await tester.pump();
      }
      await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/$file.png'));
    }

    await shot('login', '00_login');
    await shot('panel', '01_panel');
    await shot('contactos', '02_contactos');
    await shot('caja', '03_caja_pos');
    await shot('cartera', '04_cartera');
    await shot('caja_menor', '05_caja_menor');
    await shot('empleados', '06_empleados');
    await shot('sync', '07_sincronizacion');
  });
}
