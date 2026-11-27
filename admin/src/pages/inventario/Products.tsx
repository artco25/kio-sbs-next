import { Download, FileSpreadsheet, ListFilter, Package, Pencil, Percent, Plus, SlidersHorizontal, Tags, Trash2, TriangleAlert, Upload, Warehouse } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { KpiCard } from '../../components/charts'
import { RecordForm, type FieldDef } from '../../components/RecordForm'
import { Badge, Button, Card, DataTable, EmptyState, ErrorBox, FilterSelect, IconButton, IconTile, Modal, NameCell, PageHeader, SearchInput, StatusBadge, Toolbar, useFeedback, type Column } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { getCurrentSuite } from '../../lib/suites'
import { date, money, pct, qty } from '../../lib/format'
import { deleteRecord, exportCsv, saveRecord, saveRecords, today, uuid, type Row } from '../../lib/records'
import { gql } from '../../lib/gql'
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
  warehouseStocks: { id: string; warehouseId: string; productId: string; qty: number; active: boolean }[]
  tags: { id: string; name: string | null; color: string | null; active: boolean }[]
  productTags: { id: string; productId: string; tagId: string }[]
}

const Q = `query{
  products(limit:500){ total items{ ${PRODUCT_FIELDS} } }
  categories{ id name color productCount }
  stockMoves(limit:500){ id productId qty date }
  warehouses{ id name siteId active isDefault }
  warehouseStocks{ id warehouseId productId qty active }
  tags{ id name color active }
  productTags{ id productId tagId }
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
  description: p.description ?? '',
  short_description: p.shortDescription ?? '',
  brand: p.brand ?? '',
  weight: p.weight ?? 0,
  volume: p.volume ?? 0,
  cum: p.cum ?? '',
  color: p.color ?? '',
  flavor: p.flavor ?? '',
  tag_ids: (p.tags ?? []).map((t) => t.id),
})

function MarginText({ p }: { p: Prod }) {
  const m = marginOf(p)
  if (m == null) return <span className="text-subtle">—</span>
  return <span className={m < 0 ? 'font-semibold text-danger' : m < 0.15 ? 'font-semibold text-warning' : 'font-semibold text-success'}>{pct(m, 1)}</span>
}

export default function Products() {
  const { can } = useAuth()
  const { toast, confirm } = useFeedback()
  const canWrite = can('products', 'write')
  const canCreate = canWrite && getCurrentSuite() !== 'pos'
  const canStock = can('stock_moves', 'write')
  const [params, setParams] = useSearchParams()
  const { data, loading, error } = useGql<Data>(Q)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

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
  const [importPreview, setImportPreview] = useState<{ changes: { table: string; row: Row }[]; summary: { total: number; newCount: number; updateCount: number; stockMoves: number; newCategories: number; newTags: number; errors: string[]; warnings: string[] } } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const items = data?.products.items ?? []
  const cats = data?.categories ?? []
  const allTags = data?.tags ?? []
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
    { key: 'short_description', label: 'Descripción corta', full: true, placeholder: 'Resumen corto para POS/listados' },
    { key: 'description', label: 'Descripción larga', type: 'textarea', full: true, placeholder: 'Detalle del producto, uso, ingredientes, etc.' },
    { key: 'brand', label: 'Marca' },
    { key: 'cum', label: 'CUM / Código' },
    { key: 'color', label: 'Color' },
    { key: 'flavor', label: 'Sabor' },
    { key: 'weight', label: 'Peso', type: 'number', hint: 'Ej. kg, g (según tu unidad interna)' },
    { key: 'volume', label: 'Volumen', type: 'number', hint: 'Ej. L, ml (según tu unidad interna)' },
    { key: 'tag_ids', label: 'Etiquetas', type: 'multiselect', full: true, skipSave: true, options: allTags.filter((t) => t.active).map((t) => ({ value: t.id, label: t.name ?? t.id })), hint: 'Selecciona una o varias etiquetas para clasificar el producto.' },
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
    const headers = [
      'nombre', 'sku', 'codigo_barras', 'categoria', 'unidad', 'precio_sin_iva', 'costo', 'iva', 'stock_minimo',
      'controla_inventario', 'disponible_pos', 'activo',
      'descripcion_corta', 'descripcion', 'marca', 'peso', 'volumen', 'cum', 'color', 'sabor',
      'etiquetas', 'bodega_codigo', 'existencia_bodega',
    ]
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
        descripcion_corta: 'Aceite vegetal para cocina',
        descripcion: 'Aceite de girasol refinado, botella 1 litro.',
        marca: 'Kio',
        peso: 1,
        volumen: 1,
        cum: '',
        color: 'Amarillo',
        sabor: 'Neutro',
        etiquetas: 'Aceites|Cocina',
        bodega_codigo: (data?.warehouses ?? []).find((w) => w.isDefault)?.id?.slice(0, 8) ?? '',
        existencia_bodega: 10,
      },
    ], { header: headers })
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Productos')

    const whs = (data?.warehouses ?? []).map((w) => ({
      codigo_bodega: w.id,
      codigo_corto: w.id.slice(0, 8),
      nombre: w.name ?? '',
      sede: w.siteId ?? '',
      activa: w.active ? 'SI' : 'NO',
      predeterminada: w.isDefault ? 'SI' : 'NO',
    }))
    const wsWh = XLSX.utils.json_to_sheet(whs.length ? whs : [{ codigo_bodega: '', codigo_corto: '', nombre: 'No hay bodegas creadas', sede: '', activa: '', predeterminada: '' }], { header: ['codigo_bodega', 'codigo_corto', 'nombre', 'sede', 'activa', 'predeterminada'] })
    wsWh['!cols'] = [{ wch: 38 }, { wch: 14 }, { wch: 24 }, { wch: 38 }, { wch: 10 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, wsWh, 'Bodegas')

    const tagRows = (data?.tags ?? []).filter((t) => t.active).map((t) => ({ id: t.id, nombre: t.name ?? '', color: t.color ?? '' }))
    const wsTags = XLSX.utils.json_to_sheet(tagRows.length ? tagRows : [{ id: '', nombre: 'Ejemplo etiqueta', color: '' }], { header: ['id', 'nombre', 'color'] })
    wsTags['!cols'] = [{ wch: 38 }, { wch: 28 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, wsTags, 'Etiquetas')

    const catRows = (data?.categories ?? []).map((c) => ({ id: c.id, nombre: c.name ?? '', color: c.color ?? '' }))
    const wsCats = XLSX.utils.json_to_sheet(catRows.length ? catRows : [{ id: '', nombre: 'Ejemplo categoría', color: '' }], { header: ['id', 'nombre', 'color'] })
    wsCats['!cols'] = [{ wch: 38 }, { wch: 28 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, wsCats, 'Categorias')
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
      const bool = (v: unknown) => { const s = String(v ?? '').trim().toLowerCase(); return s === 'si' || s === 'sí' || s === '1' || s === 'true' || s === 'x' ? 1 : 0 }
      const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^0-9.,-]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
      const whs = data?.warehouses ?? []
      const findWh = (code: string) => { const c = code.trim().toLowerCase(); if (!c) return null; return whs.find((w) => w.id.toLowerCase() === c || w.id.slice(0, 8).toLowerCase() === c || (w.name ?? '').trim().toLowerCase() === c) ?? null }
      const wsByKey = new Map((data?.warehouseStocks ?? []).map((s) => [`${s.productId}:${s.warehouseId}`, Number(s.qty || 0)]))
      const tagByName = new Map((data?.tags ?? []).map((t) => [(t.name ?? '').trim().toLowerCase(), t.id]))
      const ptByProduct = new Map<string, { id: string; tagId: string }[]>()
      for (const pt of data?.productTags ?? []) { const arr = ptByProduct.get(pt.productId) ?? []; arr.push({ id: pt.id, tagId: pt.tagId }); ptByProduct.set(pt.productId, arr) }
      const changes: { table: string; row: Row }[] = []
      const errors: string[] = []
      const warnings: string[] = []
      const seenSku = new Set<string>()
      const seenBarcode = new Set<string>()
      let newCount = 0, updateCount = 0, stockMoves = 0, newCategories = 0, newTags = 0
      for (let i = 0; i < raw.length; i++) {
        const r = raw[i]
        const name = String(r.nombre ?? r.name ?? '').trim()
        if (!name) { warnings.push(`Fila ${i + 2}: sin nombre, omitida.`); continue }
        const catName = String(r.categoria ?? r.category ?? '').trim().toLowerCase()
        const sku = String(r.sku ?? '').trim() || null
        const barcode = String(r.codigo_barras ?? r.barcode ?? '').trim() || null
        if (sku) { const k = sku.toLowerCase(); if (seenSku.has(k)) warnings.push(`Fila ${i + 2}: SKU ${sku} duplicado en el archivo.`); seenSku.add(k) }
        if (barcode) { if (seenBarcode.has(barcode)) warnings.push(`Fila ${i + 2}: código de barras ${barcode} duplicado en el archivo.`); seenBarcode.add(barcode) }
        const existingId = String(r.id ?? '').trim() || (sku ? bySku.get(sku.toLowerCase()) : undefined) || (barcode ? byBarcode.get(barcode) : undefined)
        if (existingId) updateCount++; else newCount++
        let categoryId = catName ? (catByName.get(catName) ?? '') : ''
        if (catName && !categoryId) {
          const catId = uuid()
          const catLabel = String(r.categoria ?? r.category ?? '').trim()
          changes.push({ table: 'categories', row: { id: catId, name: catLabel, active: 1 } })
          catByName.set(catName, catId)
          categoryId = catId
          newCategories++
        }
        const id = existingId || uuid()
        const row: Row = {
          id, name, sku, barcode, category_id: categoryId,
          unit: String(r.unidad ?? r.unit ?? 'unidad').trim() || 'unidad',
          price: num(r.precio_sin_iva ?? r.price), cost: num(r.costo ?? r.cost), tax_rate: num(r.iva ?? r.tax_rate ?? 0.19),
          min_stock: num(r.stock_minimo ?? r.min_stock), track_stock: bool(r.controla_inventario ?? r.track_stock ?? 1),
          available_pos: bool(r.disponible_pos ?? r.available_pos ?? 1), active: bool(r.activo ?? r.active ?? 1),
          description: String(r.descripcion ?? r.description ?? '').trim() || null,
          short_description: String(r.descripcion_corta ?? r.short_description ?? '').trim() || null,
          brand: String(r.marca ?? r.brand ?? '').trim() || null, weight: num(r.peso ?? r.weight), volume: num(r.volumen ?? r.volume),
          cum: String(r.cum ?? '').trim() || null, color: String(r.color ?? '').trim() || null, flavor: String(r.sabor ?? r.flavor ?? '').trim() || null,
        }
        changes.push({ table: 'products', row })
        const rawTags = String(r.etiquetas ?? r.tags ?? [r.linea1, r.linea2, r.linea3, r.linea4, r.linea5, r.linea6, r.line1, r.line2, r.line3, r.line4, r.line5, r.line6].filter(Boolean).join('|') ?? '').trim()
        if (rawTags) {
          const tagNames = rawTags.split(/[|,;\n]+/).map((s) => s.trim()).filter(Boolean)
          const wantTagIds = new Set<string>()
          for (const tn of tagNames) {
            const k = tn.toLowerCase()
            let tid = tagByName.get(k)
            if (!tid) { tid = uuid(); tagByName.set(k, tid); changes.push({ table: 'tags', row: { id: tid, name: tn, active: 1 } }); newTags++ }
            wantTagIds.add(tid)
          }
          const curPts = ptByProduct.get(id) ?? []
          for (const pt of curPts) if (!wantTagIds.has(pt.tagId)) changes.push({ table: 'product_tags', row: { id: pt.id, deleted: 1 } })
          const curTagIds = new Set(curPts.map((p) => p.tagId))
          for (const tid of wantTagIds) if (!curTagIds.has(tid)) changes.push({ table: 'product_tags', row: { id: uuid(), product_id: id, tag_id: tid } })
        }
        const whCode = String(r.bodega_codigo ?? r.warehouse_code ?? r.bodega ?? '').trim()
        const whQtyRaw = r.existencia_bodega ?? r.stock_bodega ?? r.existencia ?? r.stock
        const whQtyProvided = whQtyRaw !== '' && whQtyRaw !== null && whQtyRaw !== undefined
        const whQty = whQtyProvided ? num(whQtyRaw) : 0
        const wh = findWh(whCode)
        if (whCode && !wh) warnings.push(`Fila ${i + 2}: bodega "${whCode}" no encontrada.`)
        if (wh && whQtyProvided) {
          const key = `${id}:${wh.id}`
          const current = wsByKey.get(key) ?? 0
          const delta = existingId ? (whQty - current) : whQty
          if (delta !== 0) {
            changes.push({ table: 'stock_moves', row: { id: uuid(), product_id: id, warehouse_id: wh.id, qty: delta, kind: 'ajuste', date: today(), unit_cost: num(r.costo ?? r.cost), notes: existingId ? 'Ajuste por importación masiva' : 'Importación masiva' } })
            wsByKey.set(key, current + delta)
            stockMoves++
          }
        }
      }
      if (!changes.length) throw new Error('No se encontraron productos válidos (columna "nombre").')
      setImportPreview({ changes, summary: { total: raw.length, newCount, updateCount, stockMoves, newCategories, newTags, errors, warnings } })
    } catch (e: any) {
      setImportMsg({ ok: false, text: e?.message || 'Error importando archivo.' })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const confirmImport = async () => {
    if (!importPreview) return
    setImporting(true)
    try {
      await saveRecords(importPreview.changes)
      const prodCount = importPreview.changes.filter((c) => c.table === 'products').length
      setImportMsg({ ok: true, text: `Se importaron ${prodCount} producto(s) correctamente.` })
      setImportPreview(null)
      window.dispatchEvent(new Event('kio:invalidate'))
    } catch (e: any) {
      setImportMsg({ ok: false, text: e?.message || 'Error importando archivo.' })
    } finally {
      setImporting(false)
    }
  }

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length) return
    if (!(await confirm({ title: 'Eliminar productos', message: `Se eliminarán ${ids.length} producto(s) seleccionados. Esta acción los ocultará de todos los módulos.`, confirmLabel: 'Eliminar', danger: true }))) return
    try {
      await saveRecords(ids.map((id) => ({ table: 'products', row: { id, deleted: 1 } })))
      toast(`${ids.length} producto(s) eliminados`)
      setSelectedIds(new Set())
    } catch (e) { toast((e as Error).message, 'error') }
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
            {canCreate && (
              <Button variant="secondary" icon={Upload} onClick={() => fileRef.current?.click()} disabled={importing}>
                {importing ? 'Importando…' : 'Importar Excel'}
              </Button>
            )}
            <Button variant="secondary" icon={Download} onClick={exportRows} disabled={rows.length === 0}>
              Exportar CSV
            </Button>
            {canCreate && (
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
          <Toolbar actions={canWrite && selectedIds.size > 0 ? <Button variant="danger" icon={Trash2} onClick={bulkDelete}>Eliminar ({selectedIds.size})</Button> : undefined}>
            <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre, SKU o código…" />
            <FilterSelect icon={Tags} value={cat} onChange={setCat} options={catOptions} />
            <FilterSelect icon={ListFilter} value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          </Toolbar>
          <DataTable<Prod>
            columns={columns}
            rows={rows}
            selected={canWrite ? selectedIds : undefined}
            onSelect={canWrite ? setSelectedIds : undefined}
            loading={loading}
            onRowClick={(p) => setDetailId(p.id)}
            footer={rows.length ? `${qty(rows.length)} de ${qty(items.length)} productos` : undefined}
            empty={
              hasFilters ? (
                <EmptyState icon={Package} title="Sin resultados" message="Ningún producto coincide con la búsqueda o los filtros." action={<Button variant="secondary" onClick={() => { setQ(''); setCat(''); setStatus('todos') }}>Quitar filtros</Button>} />
              ) : (
                <EmptyState icon={Package} title="Aún no tienes productos" message="Crea tu primer producto para venderlo en el POS y controlar su inventario." action={canCreate ? <Button icon={Plus} onClick={() => setForm({ open: true, initial: null })}>Nuevo producto</Button> : undefined} />
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
        onSaved={async (id, _merged, allValues) => {
          try {
            const selectedTagIds = Array.isArray(allValues?.tag_ids) ? allValues!.tag_ids.map(String) : []
            const current = form.initial
              ? await gql<{ productTags: { id: string; tagId: string }[] }>(`query($id:ID!){ productTags(productId:$id){ id tagId } }`, { id })
            : { productTags: [] as { id: string; tagId: string }[] }
            const cur = current.productTags ?? []
            const curIds = new Set(cur.map((t) => t.tagId))
            const want = new Set(selectedTagIds)
            const changes: { table: string; row: Row }[] = []
            for (const pt of cur) if (!want.has(pt.tagId)) changes.push({ table: 'product_tags', row: { id: pt.id, deleted: 1 } })
            for (const tagId of selectedTagIds) if (!curIds.has(tagId)) changes.push({ table: 'product_tags', row: { id: uuid(), product_id: id, tag_id: tagId } })
            if (changes.length) await saveRecords(changes)
          } catch { /* no bloquear guardado de producto */ }

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
          onDelete={canWrite ? () => setDetailId(null) : undefined}
        />
      )}

      <Modal open={!!importPreview} onClose={() => setImportPreview(null)} title="Validar importación" subtitle="Revisa el resumen antes de importar." size="lg"
        footer={<><Button variant="secondary" onClick={() => setImportPreview(null)}>Cancelar</Button><Button loading={importing} onClick={confirmImport} disabled={!importPreview || importPreview.summary.errors.length > 0}>Confirmar importación</Button></>}>
        {importPreview && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-xl bg-canvas p-3"><p className="text-muted">Filas</p><p className="text-lg font-bold">{importPreview.summary.total}</p></div>
              <div className="rounded-xl bg-canvas p-3"><p className="text-muted">Nuevos</p><p className="text-lg font-bold text-success">{importPreview.summary.newCount}</p></div>
              <div className="rounded-xl bg-canvas p-3"><p className="text-muted">Actualizar</p><p className="text-lg font-bold text-brand-700">{importPreview.summary.updateCount}</p></div>
              <div className="rounded-xl bg-canvas p-3"><p className="text-muted">Categorías</p><p className="text-lg font-bold">{importPreview.summary.newCategories}</p></div>
              <div className="rounded-xl bg-canvas p-3"><p className="text-muted">Etiquetas</p><p className="text-lg font-bold">{importPreview.summary.newTags}</p></div>
              <div className="rounded-xl bg-canvas p-3"><p className="text-muted">Mov. stock</p><p className="text-lg font-bold">{importPreview.summary.stockMoves}</p></div>
            </div>
            {importPreview.summary.errors.length > 0 && <div className="rounded-xl border border-danger/20 bg-danger-soft p-3 text-danger"><p className="font-semibold mb-1">Errores</p><ul className="list-disc pl-5">{importPreview.summary.errors.slice(0,8).map((e,i)=><li key={i}>{e}</li>)}</ul></div>}
            {importPreview.summary.warnings.length > 0 && <div className="rounded-xl border border-warning/20 bg-warning-soft p-3 text-warning"><p className="font-semibold mb-1">Advertencias ({importPreview.summary.warnings.length})</p><ul className="list-disc pl-5">{importPreview.summary.warnings.slice(0,10).map((w,i)=><li key={i}>{w}</li>)}{importPreview.summary.warnings.length > 10 && <li>…y {importPreview.summary.warnings.length - 10} más</li>}</ul></div>}
            <p className="text-muted">Se crearán/actualizarán productos por coincidencia de ID, SKU o código de barras. Las categorías que no existan se crearán automáticamente. Si indicas bodega y existencia, se genera un ajuste por la diferencia contra la existencia actual de esa bodega.</p>
          </div>
        )}
      </Modal>

      <StockActionModal open={!!adjust} onClose={() => setAdjust(null)} mode={adjust?.mode ?? 'entrada'} product={adjust?.product ?? null} products={items} warehouses={(data?.warehouses ?? []).filter((w) => w.active)} />
    </>
  )
}

function ProductDetail({ p, warehouses, onClose, onEdit, onAdjust, onDelete }: { p: Prod; warehouses: WH[]; onClose: () => void; onEdit?: () => void; onAdjust?: () => void; onDelete?: () => void }) {
  const { can } = useAuth()
  const { toast, confirm } = useFeedback()
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
          {onDelete && <Button variant="ghost" className="mr-auto text-danger hover:bg-danger-soft hover:text-danger" icon={Trash2} onClick={async () => { if (!(await confirm({ title: 'Eliminar producto', message: `Se eliminará "${p.name ?? 'este producto'}" de todos los módulos y dispositivos.`, confirmLabel: 'Eliminar', danger: true }))) return; try { await deleteRecord('products', p.id); toast('Producto eliminado'); onDelete() } catch (e) { toast((e as Error).message, 'error') } }}>Eliminar</Button>}
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
        {(p.tags ?? []).map((t) => <Badge key={t.id} tone="brand">{t.name ?? 'Etiqueta'}</Badge>)}
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
