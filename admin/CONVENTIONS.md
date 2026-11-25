# Convenciones del admin web de KIO SBS

Admin web (Vite + React 19 + TypeScript + Tailwind 4 + lucide-react + recharts) que se despliega como
Worker de archivos estáticos en Cloudflare. Consume el worker `kio-sbs-api` por **GraphQL**.

## Reglas de diseño (obligatorias)

* **Paleta índigo**: `#1E1B4B` (ink / brand-950) · `#4338CA` (brand-700, primario) · `#6366F1` (brand-500) ·
  `#A5B4FC` (brand-300) · `#E0E7FF` (brand-100) · `#F8FAFF` (canvas). Clases Tailwind: `text-ink`, `text-muted`,
  `bg-canvas`, `bg-brand-50`, `text-brand-700`, `border-line`, `bg-success-soft text-success`, etc. (ver `src/index.css`).
* **Iconografía homogénea**: sólo `lucide-react`, tamaño 18 y trazo 1.75 (`{...ICON}` de `components/ui`), o
  `IconTile` para íconos en cuadro con tinte. **Nunca emojis.**
* **Componentes**: usar SIEMPRE los de `src/components/ui.tsx`, `charts.tsx` y `RecordForm.tsx`
  (Card, PageHeader, Tabs, Button, IconButton, Badge, StatusBadge, NameCell, DataTable, Toolbar, SearchInput,
  FilterSelect, Modal, Field/Input/Select/Textarea/Switch, EmptyState, ErrorBox, KpiCard, Sparkline, AreaTrend,
  Bars, Donut, RankRow, useFeedback().toast/confirm). No crear estilos ad-hoc que rompan la línea.
* Estructura típica de página: `PageHeader` (título + subtítulo + acciones con `Button`), fila de `KpiCard`
  (grid `sm:grid-cols-2 xl:grid-cols-4`, gap-5), y `Card padded={false}` con `Toolbar` + `DataTable`.
  Montos con `money()`, cantidades con `qty()`, fechas con `date()/dateTime()/relative()` de `lib/format`.
* Textos en español de Colombia; botones con verbo ("Nuevo producto", "Registrar abono").
* Responsive: debe verse bien desde 375 px (las tablas ya hacen scroll horizontal; usar `hideSm` en columnas secundarias).

## Datos

* **Lecturas**: `useGql<T>(QUERY, variables)` de `lib/useGql` (se recarga sola al guardar). Campos en **camelCase**.
  Esquema completo: `/home/rob/apps/kio/sbs/kio-sbs-bk/src/api/schema.ts`.
* **Escrituras**: `saveRecord(table, row)`, `saveRecords([{table,row}, …])` (≤ 40, atómico) y `deleteRecord(table,id)`
  de `lib/records`. Columnas en **snake_case** exactamente como en `/home/rob/apps/kio/sbs/kio-sbs-bk/schema/tables.json`.
  Booleanos como 1/0. Fechas de documentos con `nowLocal()` ('YYYY-MM-DDTHH:MM:SS') y días con `today()` ('YYYY-MM-DD').
  Números de documento web con `docNumber('PED')`, `docNumber('RC')`, etc.
* Mutaciones especiales del API: `approveExpense`, `approveLeave`, `createUser`, `updateUser`, `updateCompany`.
* Permisos: `useAuth().can('tabla', 'write')`, `isAdmin`, `isFinance`. Ocultar botones de escritura si no hay permiso.
* Las cajas POS (Flutter) reciben cualquier cambio en ≤ 90 s por el sync; no hay que hacer nada extra.

## Verificación

```bash
npx tsc -b          # sin errores
npx vite build      # compila
```
API local: `http://127.0.0.1:8797/graphql` (credenciales de prueba en `kio-sbs-bk/.dev.vars`: DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD).
