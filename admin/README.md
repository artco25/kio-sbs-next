# KIO SBS — Admin web

Administración web de KIO SBS (**Vite + React + TypeScript + Tailwind + Lucide + Recharts**), con la paleta
índigo `#1E1B4B · #4338CA · #6366F1 · #A5B4FC · #E0E7FF · #F8FAFF`. Consume el worker `kio-sbs-api` por **GraphQL**
y escribe con las mismas reglas de rol del sync, así las cajas (app Flutter) reciben los cambios en ≤ 90 s.

Se publica en **Cloudflare** como un Worker de archivos estáticos (`wrangler.jsonc`, SPA), sin servidor Node.

## Acceso por suite y permisos

Al entrar, el usuario elige la **suite** (Comercial, Punto de venta, Financiero, Personal y nómina, Sistema) y sólo ve
los módulos de las suites que su rol habilita. El administrador crea **roles por empresa** en *Sistema → Roles y
permisos* (suites + permiso por módulo: sin acceso / consultar / editar) y los asigna en *Usuarios*. El login incluye
**auto-registro** de empresas (se activa con `ALLOW_SIGNUP` en el worker api). El menú lateral es plegable.

## Módulos

| Sección | Pantallas |
|---|---|
| Principal | Dashboard (KPIs con tendencia, heatmap de ventas, indicadores, transacciones, 12 meses, cartera, top productos, medios de pago, stock bajo) |
| Comercial | Ventas y pedidos (editor tipo factura con control de cupo), Clientes y proveedores, Cartera y abonos, Punto de venta (sesiones de caja, arqueos, cocina) |
| Inventario | Productos, Categorías, Existencias y movimientos (entradas, salidas, conteo físico) |
| Financiero | Recibos de caja, Caja menor y gastos (aprobación), Informes |
| Personal y nómina | Empleados, Novedades, Vacaciones y permisos, Liquidación de nómina y parámetros |
| Sistema | Usuarios, Roles y permisos, Cajas y dispositivos, Empresa |

## Desarrollo

```bash
npm install
cp .env.example .env.local      # VITE_API_URL=http://127.0.0.1:8797
npm run dev                     # http://localhost:3000 (si el puerto está ocupado, Vite usa el siguiente)
```

Requiere los workers locales (`kio-sbs-bk`: `npm run dev:api` y `npm run dev:sync`). Usuario local: `npm run seed:dev`
en `kio-sbs-bk`; datos de ejemplo: `node scripts/demo-data.mjs`.

## Despliegue en Cloudflare

```bash
echo "VITE_API_URL=https://kio-sbs-api.<tu-cuenta>.workers.dev" > .env.production
npx wrangler login
npm run deploy                  # tsc + vite build + wrangler deploy → https://kio-sbs-admin.<tu-cuenta>.workers.dev
```

Para un dominio propio (ej. `admin.tuempresa.co`) agrega una ruta o *Custom Domain* al worker `kio-sbs-admin` desde el
panel de Cloudflare, y restringe `CORS_ORIGIN` del worker `kio-sbs-api` a ese dominio.

Convenciones de código y diseño: [CONVENTIONS.md](CONVENTIONS.md).
