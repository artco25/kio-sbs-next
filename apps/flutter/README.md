# KIO SBS — App Flutter (Windows · Linux · Android · iOS)

App **offline-first** de KIO SBS con la línea gráfica de KIO (`artix_brand`: azul marino `#214F76`,
Montserrat + Inter, íconos Lucide, menú lateral por suites, tarjetas KPI y tablas limpias).

* Al instalar/abrir por primera vez crea una **SQLite local** (`kio_sbs.db` en la carpeta de soporte
  de la app) con todas las tablas de `lib/data/tables.g.dart` y la auto-migra en cada versión.
* Todo se lee y escribe en SQLite → funciona **sin internet**.
* Cada **90 segundos** (y al abrir, al iniciar sesión o con "Sincronizar ahora") envía los cambios
  pendientes (`push`) y trae los del servidor (`pull`) contra el worker `kio-sbs-sync` (GraphQL).
* El login, usuarios, empresa y aprobaciones usan el worker `kio-sbs-api` (GraphQL).

## Módulos

| Suite | Módulos |
|---|---|
| Inicio | Panel KIO SBS (ventas, ticket, cartera por edades, 12 meses, top productos, stock bajo) |
| Comercial | Contactos (cupo, plazo, bloqueo) · Productos e inventario · Pedidos/cotizaciones · Cartera y abonos |
| Punto de venta | Caja POS (apertura, lector de código de barras, cobro, cambio, recibo, cierre con arqueo) · Sesiones de caja · Pantalla de cocina (ámbar 10 min / rojo 20 min) |
| Financiero | Recibos de caja · Caja menor (borrador → enviada → aprobada) · Informes (estado de resultados, ventas por día, gastos) |
| Personal y nómina | Empleados · Novedades (HED, HEN, recargos, bonos, ausencias, descuentos) · Vacaciones y permisos · Liquidación con desprendible y parámetros anuales |
| Sistema | Sincronización (pendientes, rechazos, equipos instalados) · Usuarios y roles · Empresa |

## Ejecutar y compilar

```bash
flutter pub get
# Desarrollo contra los workers locales (por defecto 127.0.0.1:8797 / 8798)
flutter run -d linux
# Producción: URLs de los workers fijadas al compilar (también se pueden cambiar en el login → "Configurar servidores")
flutter build windows --release --dart-define=KIO_API_URL=https://kio-sbs-api.<cuenta>.workers.dev --dart-define=KIO_SYNC_URL=https://kio-sbs-sync.<cuenta>.workers.dev
flutter build linux   --release --dart-define=KIO_API_URL=... --dart-define=KIO_SYNC_URL=...
flutter build apk     --release --dart-define=KIO_API_URL=... --dart-define=KIO_SYNC_URL=...
flutter build ipa     --release --dart-define=KIO_API_URL=... --dart-define=KIO_SYNC_URL=...   # en macOS
```

El `.exe` de Windows se compila en una máquina Windows (Flutter no compila Windows desde Linux).
SQLite se empaqueta solo (paquete `sqlite3` con build hooks).

## Esquema

`lib/data/tables.g.dart` se **genera** desde `kio-sbs-bk/schema/tables.json`:

```bash
cd ../../../kio-sbs-bk && node scripts/gen-schema.mjs
```

## Pruebas

```bash
flutter analyze
# Punta a punta contra los workers locales: aprovisiona una empresa, inicia sesión, sincroniza,
# vende sin conexión, vuelve a sincronizar, verifica en el servidor y genera capturas en test/goldens/
KIO_PROVISION_TOKEN=<token de .dev.vars> flutter test test/e2e_test.dart --update-goldens
```
