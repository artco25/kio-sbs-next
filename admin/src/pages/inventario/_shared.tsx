import { ClipboardCheck, PackageMinus, PackagePlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Field, Input, Modal, Select, Tabs, Textarea, useFeedback, type Tone } from '../../components/ui'
import { money, qty, toNum } from '../../lib/format'
import { addDays, saveRecord, today } from '../../lib/records'

// ============================================================================ tipos y consultas

export interface CatRef {
  id: string
  name: string | null
  color: string | null
}

export interface Prod {
  id: string
  name: string | null
  sku: string | null
  barcode: string | null
  unit: string | null
  price: number
  cost: number
  taxRate: number
  trackStock: boolean
  minStock: number
  availablePos: boolean
  active: boolean
  stock: number
  category: CatRef | null
}

export interface Move {
  id: string
  productId: string | null
  qty: number
  kind: string | null
  date: string | null
  unitCost: number
  notes: string | null
  createdAt: string | null
  product: { id: string; name: string | null; sku: string | null; unit: string | null } | null
}

export const PRODUCT_FIELDS = 'id name sku barcode unit price cost taxRate trackStock minStock availablePos active stock category{ id name color }'
export const MOVE_FIELDS = 'id productId qty kind date unitCost notes createdAt product{ id name sku unit }'

// ============================================================================ presentación

export const UNIT_OPTIONS = [
  { value: 'unidad', label: 'Unidad' },
  { value: 'kg', label: 'Kilogramo' },
  { value: 'lb', label: 'Libra' },
  { value: 'l', label: 'Litro' },
  { value: 'servicio', label: 'Servicio' },
]
const UNIT_SHORT: Record<string, string> = { unidad: 'und', kg: 'kg', lb: 'lb', l: 'L', servicio: 'serv.' }
export const unitLabel = (u: string | null | undefined) => UNIT_SHORT[u ?? ''] ?? u ?? 'und'

export const MOVE_KIND: Record<string, { label: string; tone: Tone }> = {
  compra: { label: 'Entrada', tone: 'success' },
  venta: { label: 'Venta', tone: 'info' },
  ajuste: { label: 'Ajuste', tone: 'warning' },
  devolucion: { label: 'Devolución', tone: 'brand' },
}
export const KIND_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'compra', label: 'Entradas' },
  { value: 'venta', label: 'Ventas' },
  { value: 'ajuste', label: 'Ajustes' },
  { value: 'devolucion', label: 'Devoluciones' },
]

export function KindBadge({ kind }: { kind: string | null }) {
  const k = MOVE_KIND[kind ?? ''] ?? { label: kind ? kind[0].toUpperCase() + kind.slice(1) : '—', tone: 'neutral' as Tone }
  return <Badge tone={k.tone}>{k.label}</Badge>
}

/** Cantidad con signo y color: entradas en verde, salidas en rojo. */
export function SignedQty({ value, unit }: { value: number; unit?: string | null }) {
  const n = toNum(value)
  return (
    <span className={n > 0 ? 'font-semibold text-success' : n < 0 ? 'font-semibold text-danger' : 'text-muted'}>
      {n > 0 ? '+' : ''}
      {qty(n)}
      {unit ? <span className="ml-1 text-xs font-medium text-muted">{unitLabel(unit)}</span> : null}
    </span>
  )
}

export type StockLevel = 'off' | 'out' | 'low' | 'ok'
export const stockLevel = (p: Pick<Prod, 'trackStock' | 'stock' | 'minStock'>): StockLevel => (!p.trackStock ? 'off' : p.stock <= 0 ? 'out' : p.stock <= p.minStock ? 'low' : 'ok')

export function StockBadge({ p, withUnit = true }: { p: Pick<Prod, 'trackStock' | 'stock' | 'minStock' | 'unit'>; withUnit?: boolean }) {
  const lvl = stockLevel(p)
  if (lvl === 'off') return <span className="text-muted">Sin control</span>
  const text = `${qty(p.stock)}${withUnit ? ` ${unitLabel(p.unit)}` : ''}`
  if (lvl === 'out') return <Badge tone="danger" dot>Agotado · {text}</Badge>
  if (lvl === 'low') return <Badge tone="warning" dot>Bajo · {text}</Badge>
  return <Badge tone="success" dot>{text}</Badge>
}

export function CategoryBadge({ category }: { category: CatRef | null | undefined }) {
  if (!category?.name) return <span className="text-subtle">—</span>
  return (
    <Badge tone="neutral">
      <span className="h-2 w-2 rounded-full" style={{ background: category.color || '#A5B4FC' }} />
      {category.name}
    </Badge>
  )
}

// ============================================================================ cálculos

/** Margen sobre el precio de venta sin IVA (0..1) o null si no hay precio. */
export const marginOf = (p: Pick<Prod, 'price' | 'cost'>) => (p.price > 0 ? (p.price - p.cost) / p.price : null)
export const priceWithTax = (p: Pick<Prod, 'price' | 'taxRate'>) => p.price * (1 + p.taxRate)
export const stockValue = (p: Pick<Prod, 'trackStock' | 'stock' | 'cost'>) => (p.trackStock ? Math.max(0, p.stock) * p.cost : 0)

export function inventoryTotals(items: Prod[]) {
  const tracked = items.filter((p) => p.trackStock)
  return {
    value: tracked.reduce((s, p) => s + stockValue(p), 0),
    units: tracked.reduce((s, p) => s + Math.max(0, p.stock), 0),
    out: tracked.filter((p) => stockLevel(p) === 'out').length,
    low: tracked.filter((p) => stockLevel(p) === 'low' || stockLevel(p) === 'out').length,
  }
}

/**
 * Reconstruye hacia atrás la evolución diaria del inventario a partir de los movimientos
 * (existencia de un día = existencia actual − movimientos posteriores a ese día).
 */
export function inventoryHistory(products: Prod[], moves: Move[], days = 14) {
  const tracked = products.filter((p) => p.trackStock)
  const ids = new Set(tracked.map((p) => p.id))
  const relevant = moves.filter((m) => m.productId && ids.has(m.productId))
  const base = today()
  const res = { value: [] as number[], units: [] as number[], low: [] as number[], moves: [] as number[] }
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(base, -i)
    const delta = new Map<string, number>()
    let count = 0
    for (const m of relevant) {
      const md = (m.date ?? '').slice(0, 10)
      if (md > d) delta.set(m.productId!, (delta.get(m.productId!) ?? 0) + m.qty)
      if (md === d) count++
    }
    let value = 0
    let units = 0
    let low = 0
    for (const p of tracked) {
      const s = p.stock - (delta.get(p.id) ?? 0)
      value += Math.max(0, s) * p.cost
      units += Math.max(0, s)
      if (s <= p.minStock) low++
    }
    res.value.push(value)
    res.units.push(units)
    res.low.push(low)
    res.moves.push(count)
  }
  return res
}

export function useCategoryOptions(cats: { id: string; name: string | null }[] | undefined, allLabel = 'Todas las categorías') {
  return useMemo(() => [{ value: '', label: allLabel }, ...(cats ?? []).map((c) => ({ value: c.id, label: c.name ?? 'Sin nombre' }))], [cats, allLabel])
}

// ============================================================================ movimientos de inventario

export type StockMode = 'entrada' | 'salida' | 'conteo'

const parseNum = (v: string) => Number(v.trim().replace(',', '.'))

/**
 * Modal único para registrar entradas, salidas y conteos físicos.
 *  - entrada  → stock_moves kind 'compra' qty +
 *  - salida   → stock_moves kind 'ajuste' qty −
 *  - conteo   → stock_moves kind 'ajuste' con la diferencia (contado − existencia actual)
 */
export function StockActionModal({ open, onClose, mode: initialMode, products, product, onDone }: { open: boolean; onClose: () => void; mode: StockMode; products: Prod[]; product?: Prod | null; onDone?: () => void }) {
  const { toast } = useFeedback()
  const [mode, setMode] = useState<StockMode>(initialMode)
  const [productId, setProductId] = useState('')
  const [amount, setAmount] = useState('')
  const [cost, setCost] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const options = useMemo(
    () =>
      products
        .filter((p) => p.trackStock && (p.active || p.id === product?.id))
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'es')),
    [products, product],
  )
  const selected = options.find((p) => p.id === productId) ?? null

  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setProductId(product?.id ?? '')
    setAmount('')
    setCost(product ? String(product.cost) : '')
    setNote('')
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pick = (id: string) => {
    setProductId(id)
    const p = options.find((x) => x.id === id)
    setCost(p ? String(p.cost) : '')
    setError('')
  }

  const n = amount.trim() === '' ? NaN : parseNum(amount)
  const current = selected?.stock ?? 0
  const preview =
    selected && Number.isFinite(n)
      ? mode === 'entrada'
        ? { delta: n, after: current + n }
        : mode === 'salida'
          ? { delta: -n, after: current - n }
          : { delta: n - current, after: n }
      : null

  async function submit() {
    if (!selected) return setError('Selecciona un producto.')
    if (!Number.isFinite(n)) return setError('Escribe una cantidad válida.')
    let delta = 0
    let kind = 'ajuste'
    let notes: string | null = note.trim() || null
    let unitCost = selected.cost
    if (mode === 'entrada') {
      if (n <= 0) return setError('La cantidad debe ser mayor que cero.')
      const c = cost.trim() === '' ? selected.cost : parseNum(cost)
      if (!Number.isFinite(c) || c < 0) return setError('El costo unitario no es válido.')
      delta = n
      kind = 'compra'
      unitCost = c
    } else if (mode === 'salida') {
      if (n <= 0) return setError('La cantidad debe ser mayor que cero.')
      if (n > current) return setError(`La salida supera la existencia actual (${qty(current)}).`)
      if (!notes) return setError('Indica el motivo de la salida.')
      delta = -n
    } else {
      if (n < 0) return setError('La cantidad contada no puede ser negativa.')
      delta = Math.round((n - current) * 1000) / 1000
      notes = notes ? `Conteo físico: ${notes}` : 'Conteo físico'
      if (delta === 0) {
        toast('El conteo coincide con la existencia: no hay diferencia que registrar.')
        onClose()
        return
      }
    }
    setSaving(true)
    try {
      await saveRecord('stock_moves', { product_id: selected.id, qty: delta, kind, date: today(), unit_cost: unitCost, notes })
      toast(`Inventario actualizado: ${selected.name} ${delta > 0 ? '+' : ''}${qty(delta)} ${unitLabel(selected.unit)}`)
      onDone?.()
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const TITLE: Record<StockMode, string> = { entrada: 'Registrar entrada', salida: 'Registrar salida', conteo: 'Conteo físico' }
  const SUB: Record<StockMode, string> = {
    entrada: 'Suma unidades al inventario (compra o recepción de mercancía).',
    salida: 'Descuenta unidades por merma, daño, consumo interno u otro motivo.',
    conteo: 'Escribe lo que contaste: se registra el ajuste por la diferencia.',
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={TITLE[mode]}
      subtitle={SUB[mode]}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={saving} icon={mode === 'entrada' ? PackagePlus : mode === 'salida' ? PackageMinus : ClipboardCheck} onClick={submit}>
            {mode === 'conteo' ? 'Registrar conteo' : TITLE[mode]}
          </Button>
        </>
      }
    >
      <div className="mb-4">
        <Tabs<StockMode>
          value={mode}
          onChange={(m) => {
            setMode(m)
            setError('')
          }}
          tabs={[
            { key: 'entrada', label: 'Entrada', icon: PackagePlus },
            { key: 'salida', label: 'Salida', icon: PackageMinus },
            { key: 'conteo', label: 'Conteo', icon: ClipboardCheck },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Producto" required className="sm:col-span-2" hint={options.length === 0 ? 'No hay productos con control de inventario.' : undefined}>
          <Select value={productId} disabled={!!product} onChange={(e) => pick(e.target.value)}>
            <option value="">Selecciona…</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.sku ? ` · ${p.sku}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={mode === 'conteo' ? 'Cantidad contada' : 'Cantidad'} required hint={selected ? `Existencia actual: ${qty(current)} ${unitLabel(selected.unit)}` : undefined}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus />
        </Field>
        {mode === 'entrada' ? (
          <Field label="Costo unitario" hint="Se registra en el movimiento">
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-muted">$</span>
              <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className="pl-7" />
            </div>
          </Field>
        ) : (
          <Field label="Costo unitario" hint="Costo actual del producto">
            <Input value={selected ? money(selected.cost) : ''} disabled readOnly />
          </Field>
        )}
        <Field label={mode === 'salida' ? 'Motivo' : 'Nota'} required={mode === 'salida'} className="sm:col-span-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'entrada' ? 'Ej. Factura de compra, proveedor…' : mode === 'salida' ? 'Ej. Producto vencido, daño, consumo interno…' : 'Ej. Conteo de cierre de mes'} />
        </Field>
      </div>
      {preview && selected && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-ink-soft">
          Movimiento:
          <SignedQty value={preview.delta} unit={selected.unit} />
          <span className="text-muted">·</span>
          Nueva existencia:
          <span className="font-semibold text-ink">
            {qty(preview.after)} {unitLabel(selected.unit)}
          </span>
        </div>
      )}
      {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
    </Modal>
  )
}
