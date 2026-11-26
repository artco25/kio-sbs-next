import { Download, FileSpreadsheet, ListFilter, Package, Pencil, Percent, Plus, SlidersHorizontal, Tags, TriangleAlert, Upload, Warehouse } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { KpiCard } from '../../components/charts'
import { RecordForm, type FieldDef } from '../../components/RecordForm'
import { Badge, Button, Card, DataTable, EmptyState, ErrorBox, FilterSelect, IconButton, IconTile, Modal, NameCell, PageHeader, SearchInput, StatusBadge, Toolbar, type Column } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { date, money, pct, qty } from '../../lib/format'
import { exportCsv, saveRecord, saveRecords, today, uuid, type Row } from '../../lib/records'
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

interface WH { id: string; name: string | null; siteId: string | null; active: boolean; isDefault: boolean }
interface WS { id: string; siteId: string | null; warehouseId: string; productId: string; qty: number; minQty: number; active: boolean; warehouse?: { id: string; name: string | null } | null }
interface Data {
  products: { total: number; items: Prod[] }
  categories: { id: string; name: string | null; color: string | null; productCount: number }[]
  stockMoves: Move[]
  warehouses: WH[]
}

const Q = `query{
  products(limit:500){ total items{ ${PRODUCT_FIELDS} } }
  categories{ id name color productCount }
  stockMoves(limit:500){ id productId qty date }
  warehouses{ id name siteId active isDefault }
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
  const initialStockRef = useRef<{ warehouse_id: string; qty: number } | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [adjust, setAdjust] = useState<{ mode: StockMode; product: Prod } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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

  const whOptionsForCreate = (data?.warehouses ?? []).filter((w) => w.active).map((w) => ({ value: w.id, label: w.name ?? w.id }))
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
    ...(!form.initial ? [
      { key: 'initial_warehouse_id', label: 'Bodega inicial', type: 'select' as const, options: [{ value: '', label: 'Sin asignar ahora' }, ...whOptionsForCreate], hint: 'Opcional: asigna el producto a una bodega al crearlo.' },
      { key: 'initial_qty', label: 'Existencia inicial en bodega', type: 'number' as const, defaultValue: 0, hint: 'Si indicas bodega, se crea la existencia inicial.' },
    ] : []),
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
          <Button variant="secondary" size="sm" icon={Warehouse} onClick={() => setDetailId(p.id)}>Bodegas</Button>
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

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        nombre: 'Aceite de girasol 1 L',
        sku: 'ACE-001',
        codigo_barras: '7701234567890',
        categoria: 'Despensa',
        unidad: 'unidad',
        precio_sin_iva: 12000,
        costo: 8500,
        iva: 0.19,
        stock_minimo: 5,
        controla_inventario: 'SI',
        disponible_pos: 'SI',
        activo: 'SI',
      },
    ], { header: ['nombre', 'sku', 'codigo_barras', 'categoria', 'unidad', 'precio_sin_iva', 'costo', 'iva', 'stock_minimo', 'controla_inventario', 'disponible_pos', 'activo'] })
    ws['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Productos')
    XLSX.writeFile(wb, 'plantilla-productos-kio.xlsx')
  }

  const onImportFile = async (file: File) => {
    setImporting(true)
    setImportMsg(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      if (!raw.length) throw new Error('El archivo no tiene filas.')
      const catByName = new Map(cats.map((c) => [(c.name ?? '').trim().toLowerCase(), c.id]))
      const bySku = new Map(items.filter((p) => p.sku).map((p) => [String(p.sku).trim().toLowerCase(), p.id]))
      const byBarcode = new Map(items.filter((p) => p.barcode).map((p) => [String(p.barcode).trim(), p.id]))
      const bool = (v: unknown) => {
        const s = String(v ?? '').trim().toLowerCase()
        return s === 'si' || s === 'sí' || s === '1' || s === 'true' || s === 'x' ? 1 : 0
      }
      const num = (v: unknown) => {
        const n = Number(String(v ?? '').replace(/[^0-9.,-]/g, '').replace(',', '.'))
        return Number.isFinite(n) ? n : 0
      }
      const changes = raw.map((r) => {
        const name = String(r.nombre ?? r.name ?? '').trim()
        if (!name) return null
        const catName = String(r.categoria ?? r.category ?? '').trim().toLowerCase()
        const sku = String(r.sku ?? '').trim() || null
        const barcode = String(r.codigo_barras ?? r.barcode ?? '').trim() || null
        const existingId = String(r.id ?? '').trim() || (sku ? bySku.get(sku.toLowerCase()) : undefined) || (barcode ? byBarcode.get(barcode) : undefined)
        const row: Row = {
          id: existingId || uuid(),
          name,
          sku,
          barcode,
          category_id: catByName.get(catName) ?? '',
          unit: String(r.unidad ?? r.unit ?? 'unidad').trim() || 'unidad',
          price: num(r.precio_sin_iva ?? r.price),
          cost: num(r.costo ?? r.cost),
          tax_rate: num(r.iva ?? r.tax_rate ?? 0.19),
          min_stock: num(r.stock_minimo ?? r.min_stock),
          track_stock: bool(r.controla_inventario ?? r.track_stock ?? 1),
          available_pos: bool(r.disponible_pos ?? r.available_pos ?? 1),
          active: bool(r.activo ?? r.active ?? 1),
        }
        return { table: 'products', row }
      }).filter(Boolean) as { table: string; row: Row }[]
      if (!changes.length) throw new Error('No se encontraron productos válidos (columna "nombre").')
      await saveRecords(changes)
      setImportMsg({ ok: true, text: `Se importaron ${changes.length} producto(s) correctamente.` })
      window.dispatchEvent(new Event('kio:invalidate'))
    } catch (e: any) {
      setImportMsg({ ok: false, text: e?.message || 'Error importando archivo.' })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const detail = items.find((p) => p.id === detailId) ?? null
  const hasFilters = !!(q || cat || status !== 'todos')

  return (
    <>
      <PageHeader
        title="Productos"
        subtitle="Catálogo, precios, márgenes y existencias de todo lo que vendes."
        actions={
          <>
            <Button variant="secondary" icon={FileSpreadsheet} onClick={downloadTemplate}>
              Plantilla Excel
            </Button>
            {canWrite && (
              <Button variant="secondary" icon={Upload} onClick={() => fileRef.current?.click()} disabled={importing}>
                {importing ? 'Importando…' : 'Importar Excel'}
              </Button>
            )}
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
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportFile(f) }} />
      {importMsg && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${importMsg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {importMsg.text}
        </div>
      )}
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
        subtitle={form.initial ? 'Editar datos del producto. Para asignarlo a bodegas, usa el botón "Bodegas" en la lista.' : 'Los cambios llegan a las cajas POS en menos de 90 segundos.'}
        fields={fields}
        initial={form.initial}
        validate={(v) => {
          initialStockRef.current = v.initial_warehouse_id ? { warehouse_id: String(v.initial_warehouse_id), qty: Number(v.initial_qty || 0) } : null
          delete v.initial_warehouse_id
          delete v.initial_qty
          v.tax_rate = Number(v.tax_rate)
          if (Number(v.price) < 0 || Number(v.cost) < 0 || Number(v.min_stock) < 0) return 'Precio, costo y stock mínimo no pueden ser negativos.'
          return null
        }}
        onSaved={async (id, _merged) => {
          const init = initialStockRef.current
          initialStockRef.current = null
          if (!init?.warehouse_id || form.initial) return
          try {
            const wh = (data?.warehouses ?? []).find((w) => w.id === init.warehouse_id)
            await saveRecord('warehouse_stocks', { product_id: id, warehouse_id: init.warehouse_id, site_id: wh?.siteId ?? null, qty: init.qty, min_qty: Number(_merged.min_stock || 0), active: 1 })
            if (init.qty > 0) {
              await saveRecord('stock_moves', { product_id: id, warehouse_id: init.warehouse_id, qty: init.qty, kind: 'ajuste', date: today(), unit_cost: Number(_merged.cost || 0), notes: 'Existencia inicial al crear producto' })
            }
          } catch { /* no bloquear creación del producto */ }
        }}
      />

      {detail && (
        <ProductDetail
          p={detail}
          warehouses={(data?.warehouses ?? []).filter((w) => w.active)}
          onClose={() => setDetailId(null)}
          onEdit={canWrite ? () => { setForm({ open: true, initial: toRow(detail) }); setDetailId(null) } : undefined}
          onAdjust={canStock && detail.trackStock ? () => setAdjust({ mode: 'entrada', product: detail }) : undefined}
        />
      )}

      <StockActionModal open={!!adjust} onClose={() => setAdjust(null)} mode={adjust?.mode ?? 'entrada'} product={adjust?.product ?? null} products={items} />
    </>
  )
}

function ProductDetail({ p, warehouses, onClose, onEdit, onAdjust }: { p: Prod; warehouses: WH[]; onClose: () => void; onEdit?: () => void; onAdjust?: () => void }) {
  const { can } = useAuth()
  const canStockWrite = can('warehouse_stocks', 'write')
  const movesQ = useGql<{ stockMoves: Move[] }>(`query($id:ID!){ stockMoves(productId:$id, limit:20){ ${MOVE_FIELDS} } }`, { id: p.id })
  const stocksQ = useGql<{ warehouseStocks: WS[] }>(
    `query($id:ID!){ warehouseStocks(productId:$id){ id siteId warehouseId productId qty minQty active warehouse{ id name } } }`,
    { id: p.id },
  )
  const [wsForm, setWsForm] = useState<{ open: boolean; initial: Row | null }>({ open: false, initial: null })
  const m = marginOf(p)
  const stocks = stocksQ.data?.warehouseStocks ?? []
  const associatedIds = new Set(stocks.map((s) => s.warehouseId))
  const availableWarehouses = warehouses.filter((w) => !associatedIds.has(w.id))
  const isEditingWs = !!wsForm.initial?.id
  const whOptions = (isEditingWs ? warehouses : availableWarehouses).map((w) => ({ value: w.id, label: w.name ?? w.id }))
  const allocated = stocks.reduce((a, s) => a + (Number(s.qty) || 0), 0)
  const unallocated = Math.max(0, (Number(p.stock) || 0) - allocated)
  const minAllocated = stocks.reduce((a, s) => a + (Number(s.minQty) || 0), 0)
  const effectiveMin = stocks.length ? minAllocated : (p.minStock ?? 0)
  const lvlBase = stockLevel(p)
  const lvl = stocks.length ? (p.stock <= 0 ? 'out' : p.stock <= effectiveMin ? 'low' : 'ok') : lvlBase
  const wsFields: FieldDef[] = [
    { key: 'warehouse_id', label: 'Bodega', type: 'select', required: true, options: whOptions },
    { key: 'qty', label: 'Existencia en bodega', type: 'number', required: true, defaultValue: 0, hint: `Stock total producto: ${qty(p.stock)}. Asignado en bodegas: ${qty(allocated)}. Sin asignar: ${qty(unallocated)}.` },
    { key: 'min_qty', label: 'Stock mínimo', type: 'number', defaultValue: 0 },
    { key: 'active', label: 'Activo en bodega', type: 'boolean', defaultValue: 1 },
  ]

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
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          {onAdjust && <Button variant="secondary" icon={SlidersHorizontal} onClick={onAdjust}>Ajustar stock</Button>}
          {onEdit && <Button icon={Pencil} onClick={onEdit}>Editar producto</Button>}
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
        <KpiCard icon={Package} label="Existencia total" value={p.trackStock ? `${qty(p.stock)} ${unitLabel(p.unit)}` : 'Sin control'} tone={lvl === 'out' ? 'danger' : lvl === 'low' ? 'warning' : 'success'} hint={p.trackStock ? `Mínimo ${qty(effectiveMin)} ${unitLabel(p.unit)}${stocks.length ? ' (suma bodegas)' : ''}` : 'No controla inventario'} />
        <KpiCard icon={Warehouse} label="Valor a costo" value={money(stockValue(p))} tone="info" hint={`Costo unitario ${money(p.cost)}`} />
        <KpiCard icon={Percent} label="Margen" value={m == null ? '—' : pct(m, 1)} tone={m != null && m < 0.15 ? 'warning' : 'success'} hint={`Utilidad por unidad ${money(p.price - p.cost)}`} />
        <KpiCard icon={Tags} label="Precio con IVA" value={money(priceWithTax(p))} hint={`Sin IVA ${money(p.price)}`} />
      </div>

      <div className="mt-6 mb-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-ink">Existencias por bodega</h3>
          <p className="text-xs text-muted">Total producto: {qty(p.stock)} · Asignado en bodegas: {qty(allocated)} · Sin asignar: {qty(unallocated)}</p>
        </div>
        {canStockWrite && (
          <Button
            size="sm"
            variant="secondary"
            icon={Plus}
            disabled={!availableWarehouses.length}
            onClick={() => setWsForm({ open: true, initial: { product_id: p.id, warehouse_id: availableWarehouses[0]?.id ?? '', active: 1, qty: stocks.length ? unallocated : (p.trackStock ? p.stock : 0), min_qty: p.minStock ?? 0 } })}
          >
            {availableWarehouses.length ? 'Asociar bodega' : 'Todas las bodegas asociadas'}
          </Button>
        )}
      </div>
      <ErrorBox error={stocksQ.error} />
      <div className="-mx-6 border-t border-line">
        <DataTable<WS>
          pageSize={6}
          loading={stocksQ.loading}
          rows={stocks}
          columns={[
            { key: 'warehouse', header: 'Bodega', render: (r) => <span className="font-medium text-ink">{r.warehouse?.name ?? r.warehouseId}</span> },
            { key: 'qty', header: 'Existencia', align: 'right', render: (r) => <span className="font-semibold">{qty(r.qty)} {unitLabel(p.unit)}</span> },
            { key: 'min', header: 'Mínimo', align: 'right', hideSm: true, render: (r) => <span className="text-muted">{qty(r.minQty)}</span> },
            { key: 'active', header: 'Estado', hideSm: true, render: (r) => <StatusBadge status={r.active ? 'activo' : 'inactivo'} /> },
            {
              key: 'actions', header: '', align: 'right', render: (r) => canStockWrite ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <IconButton icon={Pencil} label="Editar" onClick={() => setWsForm({ open: true, initial: { id: r.id, warehouse_id: r.warehouseId, product_id: r.productId, qty: r.qty, min_qty: r.minQty, active: r.active ? 1 : 0, site_id: r.siteId ?? '' } })} />
                </div>
              ) : null,
            },
          ]}
          empty={<EmptyState icon={Warehouse} title="Sin bodegas asociadas" message="Asocia este producto a una bodega para controlar existencias por ubicación." />}
        />
      </div>

      <h3 className="mt-6 mb-2 text-[15px] font-bold text-ink">Últimos movimientos</h3>
      <ErrorBox error={movesQ.error} />
      <div className="-mx-6 border-t border-line">
        <DataTable<Move>
          pageSize={6}
          loading={movesQ.loading}
          rows={movesQ.data?.stockMoves ?? []}
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

      <RecordForm
        open={wsForm.open}
        onClose={() => setWsForm((s) => ({ ...s, open: false }))}
        table="warehouse_stocks"
        title={wsForm.initial?.id ? 'Editar existencia por bodega' : 'Asociar producto a bodega'}
        subtitle={p.name ?? 'Producto'}
        fields={wsFields}
        initial={wsForm.initial}
        validate={(v) => {
          v.product_id = p.id
          const wh = warehouses.find((w) => w.id === v.warehouse_id)
          if (wh?.siteId) v.site_id = wh.siteId
          if (!v.id) {
            const existing = stocks.find((s) => s.warehouseId === v.warehouse_id)
            if (existing) v.id = existing.id
          }
          if (Number(v.qty) < 0 || Number(v.min_qty) < 0) return 'Las cantidades no pueden ser negativas.'
          return null
        }}
      />
    </Modal>
  )
}
