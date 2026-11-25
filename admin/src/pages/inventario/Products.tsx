import { Download, ListFilter, Package, Pencil, Percent, Plus, SlidersHorizontal, Tags, TriangleAlert, Warehouse } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { KpiCard } from '../../components/charts'
import { RecordForm, type FieldDef } from '../../components/RecordForm'
import { Badge, Button, Card, DataTable, EmptyState, ErrorBox, FilterSelect, IconButton, IconTile, Modal, NameCell, PageHeader, SearchInput, StatusBadge, Toolbar, type Column } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { date, money, pct, qty } from '../../lib/format'
import { exportCsv, type Row } from '../../lib/records'
import { useGql } from '../../lib/useGql'
import {
  CategoryBadge,
  inventoryHistory,
  inventoryTotals,
  KindBadge,
  marginOf,
  MOVE_FIELDS,
  PRODUCT_FIELDS,
  priceWithTax,
  SignedQty,
  StockActionModal,
  StockBadge,
  stockLevel,
  stockValue,
  UNIT_OPTIONS,
  unitLabel,
  useCategoryOptions,
  type Move,
  type Prod,
  type StockMode,
} from './_shared'

interface Data {
  products: { total: number; items: Prod[] }
  categories: { id: string; name: string | null; color: string | null; productCount: number }[]
  stockMoves: Move[]
}

const Q = `query{
  products(limit:500){ total items{ ${PRODUCT_FIELDS} } }
  categories{ id name color productCount }
  stockMoves(limit:500){ id productId qty date }
}`

type StatusFilter = 'todos' | 'activos' | 'inactivos' | 'bajo'
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'todos', label: 'Todos los estados' },
  { value: 'activos', label: 'Activos' },
  { value: 'inactivos', label: 'Inactivos' },
  { value: 'bajo', label: 'Stock bajo' },
]

const TAX_OPTIONS = [
  { value: '0.19', label: '19 %' },
  { value: '0.05', label: '5 %' },
  { value: '0', label: 'Exento / excluido (0 %)' },
]

const toRow = (p: Prod): Row => ({
  id: p.id,
  name: p.name,
  sku: p.sku,
  barcode: p.barcode,
  category_id: p.category?.id ?? '',
  unit: p.unit ?? 'unidad',
  price: p.price,
  cost: p.cost,
  tax_rate: String(p.taxRate),
  min_stock: p.minStock,
  track_stock: p.trackStock ? 1 : 0,
  available_pos: p.availablePos ? 1 : 0,
  active: p.active ? 1 : 0,
})

function MarginText({ p }: { p: Prod }) {
  const m = marginOf(p)
  if (m == null) return <span className="text-subtle">—</span>
  return <span className={m < 0 ? 'font-semibold text-danger' : m < 0.15 ? 'font-semibold text-warning' : 'font-semibold text-success'}>{pct(m, 1)}</span>
}

export default function Products() {
  const { can } = useAuth()
  const canWrite = can('products', 'write')
  const canStock = can('stock_moves', 'write')
  const [params, setParams] = useSearchParams()
  const { data, loading, error } = useGql<Data>(Q)

  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('todos')
  const cat = params.get('categoria') ?? ''
  const setCat = (v: string) => setParams(v ? { categoria: v } : {}, { replace: true })

  const [form, setForm] = useState<{ open: boolean; initial: Row | null }>({ open: false, initial: null })
  const [detailId, setDetailId] = useState<string | null>(null)
  const [adjust, setAdjust] = useState<{ mode: StockMode; product: Prod } | null>(null)

  const items = data?.products.items ?? []
  const cats = data?.categories ?? []
  const catOptions = useCategoryOptions(cats)

  const totals = useMemo(() => inventoryTotals(items), [items])
  const hist = useMemo(() => inventoryHistory(items, data?.stockMoves ?? []), [items, data])
  const active = items.filter((p) => p.active)
  const margins = active.map(marginOf).filter((m): m is number => m != null)
  const avgMargin = margins.length ? margins.reduce((s, m) => s + m, 0) / margins.length : 0

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return items.filter((p) => {
      if (cat && p.category?.id !== cat) return false
      if (status === 'activos' && !p.active) return false
      if (status === 'inactivos' && p.active) return false
      if (status === 'bajo' && !(stockLevel(p) === 'low' || stockLevel(p) === 'out')) return false
      if (term && !`${p.name ?? ''} ${p.sku ?? ''} ${p.barcode ?? ''}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [items, q, cat, status])

  const fields: FieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, full: true, placeholder: 'Ej. Aceite de girasol 1 L' },
    { key: 'sku', label: 'Referencia (SKU)' },
    { key: 'barcode', label: 'Código de barras' },
    { key: 'category_id', label: 'Categoría', type: 'select', options: cats.map((c) => ({ value: c.id, label: c.name ?? 'Sin nombre' })) },
    { key: 'unit', label: 'Unidad de medida', type: 'select', required: true, options: UNIT_OPTIONS, defaultValue: 'unidad' },
    { key: 'price', label: 'Precio de venta (sin IVA)', type: 'money', required: true },
    { key: 'cost', label: 'Costo', type: 'money' },
    {
      key: 'tax_rate',
      label: 'IVA',
      type: 'select',
      required: true,
      defaultValue: '0.19',
      options: form.initial && !TAX_OPTIONS.some((o) => o.value === String(form.initial?.tax_rate)) ? [...TAX_OPTIONS, { value: String(form.initial.tax_rate), label: `${Number(form.initial.tax_rate) * 100} %` }] : TAX_OPTIONS,
    },
    { key: 'min_stock', label: 'Stock mínimo', type: 'number', hint: 'Avisa cuando la existencia llega a este nivel' },
    { key: 'track_stock', label: 'Controla inventario', type: 'boolean', defaultValue: 1 },
    { key: 'available_pos', label: 'Disponible en POS', type: 'boolean', defaultValue: 1 },
    { key: 'active', label: 'Activo', type: 'boolean', defaultValue: 1 },
  ]

  const columns: Column<Prod>[] = [
    { key: 'name', header: 'Producto', render: (p) => <NameCell name={p.name ?? 'Sin nombre'} sub={[p.sku, p.barcode].filter(Boolean).join(' · ') || undefined} /> },
    { key: 'category', header: 'Categoría', hideSm: true, render: (p) => <CategoryBadge category={p.category} /> },
    { key: 'price', header: 'Precio sin IVA', align: 'right', render: (p) => <span className="font-semibold">{money(p.price)}</span> },
    { key: 'priceTax', header: 'Precio con IVA', align: 'right', hideSm: true, render: (p) => <span className="text-ink-soft">{money(priceWithTax(p))}</span> },
    { key: 'cost', header: 'Costo', align: 'right', hideSm: true, render: (p) => <span className="text-muted">{money(p.cost)}</span> },
    { key: 'margin', header: 'Margen', align: 'right', hideSm: true, render: (p) => <MarginText p={p} /> },
    { key: 'stock', header: 'Existencia', render: (p) => <StockBadge p={p} /> },
    { key: 'active', header: 'Estado', hideSm: true, render: (p) => <StatusBadge status={p.active ? 'activo' : 'inactivo'} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          {canStock && p.trackStock && <IconButton icon={SlidersHorizontal} label="Ajustar stock" onClick={() => setAdjust({ mode: 'entrada', product: p })} />}
          {canWrite && <IconButton icon={Pencil} label="Editar" onClick={() => setForm({ open: true, initial: toRow(p) })} />}
        </div>
      ),
    },
  ]

  const exportRows = () =>
    exportCsv(
      'productos',
      rows.map((p) => ({
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        category: p.category?.name,
        unit: p.unit,
        price: p.price,
        priceTax: Math.round(priceWithTax(p)),
        cost: p.cost,
        margin: marginOf(p) == null ? '' : Math.round(marginOf(p)! * 1000) / 10,
        stock: p.trackStock ? p.stock : '',
        minStock: p.minStock,
        value: Math.round(stockValue(p)),
        active: p.active ? 'Sí' : 'No',
      })),
      [
        { key: 'name', label: 'Producto' },
        { key: 'sku', label: 'SKU' },
        { key: 'barcode', label: 'Código de barras' },
        { key: 'category', label: 'Categoría' },
        { key: 'unit', label: 'Unidad' },
        { key: 'price', label: 'Precio sin IVA' },
        { key: 'priceTax', label: 'Precio con IVA' },
        { key: 'cost', label: 'Costo' },
        { key: 'margin', label: 'Margen %' },
        { key: 'stock', label: 'Existencia' },
        { key: 'minStock', label: 'Stock mínimo' },
        { key: 'value', label: 'Valor a costo' },
        { key: 'active', label: 'Activo' },
      ],
    )

  const detail = items.find((p) => p.id === detailId) ?? null
  const hasFilters = !!(q || cat || status !== 'todos')

  return (
    <>
      <PageHeader
        title="Productos"
        subtitle="Catálogo, precios, márgenes y existencias de todo lo que vendes."
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={exportRows} disabled={rows.length === 0}>
              Exportar CSV
            </Button>
            {canWrite && (
              <Button icon={Plus} onClick={() => setForm({ open: true, initial: null })}>
                Nuevo producto
              </Button>
            )}
          </>
        }
      />
      <ErrorBox error={error} />

      <div className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={Package} label="Productos activos" value={qty(active.length)} hint={`${qty(items.length)} en el catálogo`} />
          <KpiCard icon={Warehouse} label="Valor del inventario" value={money(totals.value)} series={hist.value} tone="info" hint="A costo, productos con control" />
          <KpiCard icon={TriangleAlert} label="Bajo el mínimo" value={qty(totals.low)} series={hist.low} tone={totals.low > 0 ? 'warning' : 'success'} hint={`${qty(totals.out)} agotados`} inverse />
          <KpiCard icon={Percent} label="Margen promedio" value={pct(avgMargin, 1)} tone="success" hint="Sobre el precio sin IVA" />
        </div>

        <Card padded={false} className="pt-5">
          <Toolbar>
            <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre, SKU o código…" />
            <FilterSelect icon={Tags} value={cat} onChange={setCat} options={catOptions} />
            <FilterSelect icon={ListFilter} value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          </Toolbar>
          <DataTable<Prod>
            columns={columns}
            rows={rows}
            loading={loading}
            onRowClick={(p) => setDetailId(p.id)}
            footer={rows.length ? `${qty(rows.length)} de ${qty(items.length)} productos` : undefined}
            empty={
              hasFilters ? (
                <EmptyState icon={Package} title="Sin resultados" message="Ningún producto coincide con la búsqueda o los filtros." action={<Button variant="secondary" onClick={() => { setQ(''); setCat(''); setStatus('todos') }}>Quitar filtros</Button>} />
              ) : (
                <EmptyState icon={Package} title="Aún no tienes productos" message="Crea tu primer producto para venderlo en el POS y controlar su inventario." action={canWrite ? <Button icon={Plus} onClick={() => setForm({ open: true, initial: null })}>Nuevo producto</Button> : undefined} />
              )
            }
          />
        </Card>
      </div>

      <RecordForm
        open={form.open}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        table="products"
        title={form.initial ? (form.initial.name as string) : 'Nuevo producto'}
        subtitle={form.initial ? 'Editar producto' : 'Los cambios llegan a las cajas POS en menos de 90 segundos.'}
        fields={fields}
        initial={form.initial}
        validate={(v) => {
          v.tax_rate = Number(v.tax_rate)
          if (Number(v.price) < 0 || Number(v.cost) < 0 || Number(v.min_stock) < 0) return 'Precio, costo y stock mínimo no pueden ser negativos.'
          return null
        }}
      />

      {detail && (
        <ProductDetail
          p={detail}
          onClose={() => setDetailId(null)}
          onEdit={canWrite ? () => { setForm({ open: true, initial: toRow(detail) }); setDetailId(null) } : undefined}
          onAdjust={canStock && detail.trackStock ? () => setAdjust({ mode: 'entrada', product: detail }) : undefined}
        />
      )}

      <StockActionModal open={!!adjust} onClose={() => setAdjust(null)} mode={adjust?.mode ?? 'entrada'} product={adjust?.product ?? null} products={items} />
    </>
  )
}

function ProductDetail({ p, onClose, onEdit, onAdjust }: { p: Prod; onClose: () => void; onEdit?: () => void; onAdjust?: () => void }) {
  const { data, loading, error } = useGql<{ stockMoves: Move[] }>(`query($id:ID!){ stockMoves(productId:$id, limit:20){ ${MOVE_FIELDS} } }`, { id: p.id })
  const m = marginOf(p)
  const lvl = stockLevel(p)
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-3">
          <IconTile icon={Package} size={40} />
          <span className="min-w-0">
            <span className="block truncate">{p.name}</span>
            <span className="block text-sm font-normal text-muted">{[p.sku, p.barcode].filter(Boolean).join(' · ') || 'Sin referencia'}</span>
          </span>
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          {onAdjust && (
            <Button variant="secondary" icon={SlidersHorizontal} onClick={onAdjust}>
              Ajustar stock
            </Button>
          )}
          {onEdit && (
            <Button icon={Pencil} onClick={onEdit}>
              Editar producto
            </Button>
          )}
        </>
      }
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge status={p.active ? 'activo' : 'inactivo'} />
        <CategoryBadge category={p.category} />
        <Badge tone="neutral">IVA {pct(p.taxRate)}</Badge>
        <Badge tone={p.availablePos ? 'brand' : 'neutral'}>{p.availablePos ? 'Disponible en POS' : 'No está en POS'}</Badge>
        <Badge tone="neutral">Unidad: {unitLabel(p.unit)}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard icon={Package} label="Existencia" value={p.trackStock ? `${qty(p.stock)} ${unitLabel(p.unit)}` : 'Sin control'} tone={lvl === 'out' ? 'danger' : lvl === 'low' ? 'warning' : 'success'} hint={p.trackStock ? `Mínimo ${qty(p.minStock)} ${unitLabel(p.unit)}` : 'No controla inventario'} />
        <KpiCard icon={Warehouse} label="Valor a costo" value={money(stockValue(p))} tone="info" hint={`Costo unitario ${money(p.cost)}`} />
        <KpiCard icon={Percent} label="Margen" value={m == null ? '—' : pct(m, 1)} tone={m != null && m < 0.15 ? 'warning' : 'success'} hint={`Utilidad por unidad ${money(p.price - p.cost)}`} />
        <KpiCard icon={Tags} label="Precio con IVA" value={money(priceWithTax(p))} hint={`Sin IVA ${money(p.price)}`} />
      </div>

      <h3 className="mt-6 mb-2 text-[15px] font-bold text-ink">Últimos movimientos</h3>
      <ErrorBox error={error} />
      <div className="-mx-6 border-t border-line">
        <DataTable<Move>
          pageSize={6}
          loading={loading}
          rows={data?.stockMoves ?? []}
          columns={[
            { key: 'date', header: 'Fecha', render: (r) => <span className="text-muted">{date(r.date)}</span> },
            { key: 'kind', header: 'Tipo', render: (r) => <KindBadge kind={r.kind} /> },
            { key: 'qty', header: 'Cantidad', align: 'right', render: (r) => <SignedQty value={r.qty} unit={p.unit} /> },
            { key: 'cost', header: 'Costo unit.', align: 'right', hideSm: true, render: (r) => money(r.unitCost) },
            { key: 'notes', header: 'Notas', hideSm: true, render: (r) => <span className="text-muted">{r.notes ?? '—'}</span> },
          ]}
          empty={<EmptyState icon={SlidersHorizontal} title="Sin movimientos" message={p.trackStock ? 'Registra una entrada para empezar el kardex de este producto.' : 'Este producto no controla inventario.'} />}
        />
      </div>
    </Modal>
  )
}
