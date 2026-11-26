import { ArrowLeft, Ban, Banknote, CheckCircle2, FilePenLine, Package, Plus, Printer, RotateCcw, Save, Search, Trash2, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, Button, Card, DataTable, EmptyState, ErrorBox, Field, IconButton, IconTile, ICON, Input, Modal, NameCell, PageHeader, Select, Spinner, Textarea, useFeedback } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { date, dateTime, money, qty, toNum } from '../../lib/format'
import { addDays, docNumber, nowLocal, saveRecord, saveRecords, today, uuid, type Change } from '../../lib/records'
import { useDebounced, useGql } from '../../lib/useGql'
import { PaymentState } from '../Dashboard'
import { ChannelBadge, CREDIT_FIELDS, CreditCard, creditProblem, METHOD_LABEL, METHOD_OPTIONS, MiniStat, type CreditPartner } from './_shared'

// ============================================================================ tipos y consultas

interface SaleDoc {
  id: string
  number: string
  channel: string
  date: string
  dueDate: string | null
  status: string
  paymentMode: string
  siteId: string | null
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  paid: number
  balance: number
  notes: string | null
  partner: (CreditPartner & { phone?: string | null; email?: string | null }) | null
  seller: { name: string } | null
  site: { name: string } | null
  lines: { id: string; productId: string | null; name: string; qty: number; price: number; discountPct: number; taxRate: number; subtotal: number; tax: number; total: number }[]
  payments: { id: string; number: string; kind: string; date: string; method: string; amount: number; reference: string | null }[]
}

const SALE_Q = `query($id:ID!){ sale(id:$id){
  id number channel date dueDate status paymentMode siteId subtotal discountTotal taxTotal total paid balance notes
  partner{ ${CREDIT_FIELDS} phone email } seller{ name } site{ name }
  lines{ id productId name qty price discountPct taxRate subtotal tax total }
  payments{ id number kind date method amount reference }
} }`

const CUSTOMERS_Q = `{ partners(customers:true, limit:500){ items{ ${CREDIT_FIELDS} } } }`

interface ProductHit {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  unit: string | null
  price: number
  taxRate: number
  trackStock: boolean
  stock: number
  active: boolean
}
const PRODUCTS_Q = `query($s:String){ products(search:$s, limit:8){ items{ id name sku barcode unit price taxRate trackStock stock active } } }`

interface EditLine {
  key: string
  productId: string | null
  name: string
  qty: string
  price: string
  discount: string
  taxRate: number
}
interface Meta {
  trackStock: boolean
  stock: number
  unit: string | null
}

const num = (v: string) => {
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const TAX_OPTIONS = [0, 0.05, 0.19]

function lineCalc(l: { qty: string; price: string; discount: string; taxRate: number }) {
  const gross = num(l.qty) * num(l.price)
  const discount = (gross * num(l.discount)) / 100
  const subtotal = gross - discount
  const tax = subtotal * l.taxRate
  return { gross, discount, subtotal, tax, total: subtotal + tax }
}

// ============================================================================ página

export default function OrderEditor() {
  const { id = 'nuevo' } = useParams()
  const { can } = useAuth()
  const isNew = id === 'nuevo'
  const { data, loading, error } = useGql<{ sale: SaleDoc | null }>(SALE_Q, { id }, { skip: isNew })
  const sale = data?.sale ?? null

  if (isNew) {
    return can('sales', 'write') ? <Editor key="nuevo" initial={null} /> : <NoAccess />
  }
  if (!sale) {
    return (
      <>
        <BackHeader title="Documento" />
        <ErrorBox error={error} />
        {loading ? (
          <div className="flex justify-center py-24">
            <Spinner />
          </div>
        ) : (
          <Card>
            <EmptyState title="Documento no encontrado" message="Es posible que haya sido eliminado o que no tengas acceso." />
          </Card>
        )}
      </>
    )
  }
  const editable = sale.status === 'borrador' && sale.channel === 'pedido' && can('sales', 'write')
  return editable ? <Editor key={sale.id} initial={sale} /> : <Viewer key={sale.id} sale={sale} />
}

function NoAccess() {
  return (
    <>
      <BackHeader title="Nuevo pedido" />
      <Card>
        <EmptyState title="Sin permiso" message="Tu rol no puede crear pedidos." />
      </Card>
    </>
  )
}

function BackHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="no-print">
      <Button variant="ghost" size="sm" icon={ArrowLeft} className="mb-3 -ml-2" onClick={() => navigate('/ventas/pedidos')}>
        Ventas y pedidos
      </Button>
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
    </div>
  )
}

// ============================================================================ editor (nuevo o borrador)

function Editor({ initial }: { initial: SaleDoc | null }) {
  const navigate = useNavigate()
  const { me, isFinance } = useAuth()
  const { toast, confirm } = useFeedback()
  const [busy, setBusy] = useState<null | 'draft' | 'confirm' | 'void'>(null)

  const [partnerId, setPartnerId] = useState(initial?.partner?.id ?? '')
  const [siteId, setSiteId] = useState(initial?.siteId ?? '')
  const [mode, setMode] = useState<'contado' | 'credito'>(initial?.paymentMode === 'credito' ? 'credito' : 'contado')
  const [method, setMethod] = useState('efectivo')
  const [dueDate, setDueDate] = useState(initial?.dueDate?.slice(0, 10) ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [newCust, setNewCust] = useState(false)
  const [nc, setNc] = useState({ name: '', doc_number: '', phone: '', email: '' })
  const [savingNc, setSavingNc] = useState(false)
  const [lines, setLines] = useState<EditLine[]>(() =>
    (initial?.lines ?? []).map((l) => ({ key: l.id, productId: l.productId, name: l.name, qty: String(l.qty), price: String(l.price), discount: String(l.discountPct || 0), taxRate: toNum(l.taxRate) })),
  )
  const [meta, setMeta] = useState<Record<string, Meta>>({})
  const sitesQ = useGql<{ sites: { id: string; name: string; active: boolean }[] }>('{ sites{ id name active } }')
  const sites = useMemo(() => (sitesQ.data?.sites ?? []).filter((s) => s.active), [sitesQ.data])

  // Clientes
  const customers = useGql<{ partners: { items: CreditPartner[] } }>(CUSTOMERS_Q)
  const customerList = useMemo(() => {
    const items = customers.data?.partners.items ?? []
    if (initial?.partner && !items.some((p) => p.id === initial.partner!.id)) return [initial.partner, ...items]
    return items
  }, [customers.data, initial])
  const partner = customerList.find((p) => p.id === partnerId) ?? null

  // Info de inventario de las líneas de un borrador existente
  const ids = useMemo(() => [...new Set((initial?.lines ?? []).map((l) => l.productId).filter((x): x is string => !!x))], [initial])
  const metaQuery = useMemo(() => `query(${ids.map((_, i) => `$i${i}:ID!`).join(',')}){ ${ids.map((_, i) => `p${i}: product(id:$i${i}){ id trackStock stock unit }`).join(' ')} }`, [ids])
  const metaVars = useMemo(() => Object.fromEntries(ids.map((x, i) => [`i${i}`, x])), [ids])
  const loadedMeta = useGql<Record<string, { id: string; trackStock: boolean; stock: number; unit: string | null } | null>>(metaQuery, metaVars, { skip: ids.length === 0 })
  useEffect(() => {
    if (!loadedMeta.data) return
    setMeta((m) => {
      const next = { ...m }
      for (const p of Object.values(loadedMeta.data!)) if (p) next[p.id] = { trackStock: !!p.trackStock, stock: toNum(p.stock), unit: p.unit }
      return next
    })
  }, [loadedMeta.data])

  function changePartner(id: string) {
    setPartnerId(id)
    const p = customerList.find((x) => x.id === id)
    const days = toNum(p?.paymentTermDays) > 0 ? toNum(p?.paymentTermDays) : 30
    setDueDate(addDays(today(), days))
  }
  function changeMode(m: 'contado' | 'credito') {
    setMode(m)
    if (m === 'credito' && !dueDate) {
      const days = toNum(partner?.paymentTermDays) > 0 ? toNum(partner?.paymentTermDays) : 30
      setDueDate(addDays(today(), days))
    }
  }

  async function createCustomer() {
    if (!nc.name.trim()) return toast('Nombre del cliente requerido.', 'error')
    setSavingNc(true)
    try {
      const id = uuid()
      await saveRecord('partners', { id, name: nc.name.trim(), doc_number: nc.doc_number.trim() || null, phone: nc.phone.trim() || null, email: nc.email.trim() || null, kind: 'cliente', active: 1 })
      toast('Cliente creado')
      setNewCust(false)
      setNc({ name: '', doc_number: '', phone: '', email: '' })
      await customers.reload()
      setPartnerId(id)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSavingNc(false)
    }
  }

  const totals = useMemo(() => {
    let subtotal = 0
    let discount = 0
    let tax = 0
    for (const l of lines) {
      const c = lineCalc(l)
      subtotal += c.subtotal
      discount += c.discount
      tax += c.tax
    }
    return { subtotal, discount, tax, total: Math.round(subtotal + tax) }
  }, [lines])

  const problem = mode === 'credito' ? creditProblem(partner, totals.total) : null
  const setLine = (key: string, patch: Partial<EditLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  function addProduct(p: ProductHit) {
    setMeta((m) => ({ ...m, [p.id]: { trackStock: !!p.trackStock, stock: toNum(p.stock), unit: p.unit } }))
    setLines((ls) => {
      const found = ls.find((l) => l.productId === p.id)
      if (found) return ls.map((l) => (l.key === found.key ? { ...l, qty: String(num(l.qty) + 1) } : l))
      return [...ls, { key: uuid(), productId: p.id, name: p.name, qty: '1', price: String(p.price), discount: '0', taxRate: toNum(p.taxRate) }]
    })
  }

  /** Arma los registros del documento. Las líneas viejas se borran PRIMERO: al confirmar, el servidor
   *  bloquea cambios de líneas de una venta ya confirmada para cajeros y vendedores. */
  function build(status: 'borrador' | 'confirmada'): { changes: Change[]; saleId: string } | string {
    if (lines.length === 0) return 'Agrega al menos un producto'
    for (const l of lines) {
      if (!l.name.trim()) return 'Hay una línea sin descripción'
      if (num(l.qty) <= 0) return `La cantidad de "${l.name}" debe ser mayor que cero`
      if (num(l.price) < 0) return `El precio de "${l.name}" no puede ser negativo`
      if (num(l.discount) < 0 || num(l.discount) > 100) return `El descuento de "${l.name}" debe estar entre 0 y 100 %`
    }
    const confirm = status === 'confirmada'
    if (confirm && ids.length > 0 && !loadedMeta.data) return 'Cargando el inventario de los productos, intenta de nuevo en un momento'
    if (confirm && mode === 'credito') {
      if (problem) return problem
      if (!dueDate) return 'Indica la fecha de vencimiento'
    }
    const saleId = initial?.id ?? uuid()
    const changes: Change[] = []
    for (const old of initial?.lines ?? []) changes.push({ table: 'sale_lines', row: { id: old.id, deleted: 1 } })
    changes.push({
      table: 'sales',
      row: {
        id: saleId,
        number: initial?.number ?? docNumber('PED'),
        channel: 'pedido',
        site_id: siteId || null,
        partner_id: partnerId || null,
        seller_id: me!.user.id,
        date: confirm || !initial ? nowLocal() : initial.date,
        due_date: mode === 'credito' ? dueDate || null : null,
        status,
        payment_mode: mode,
        subtotal: totals.subtotal,
        discount_total: totals.discount,
        tax_total: totals.tax,
        total: totals.total,
        notes: notes.trim() || null,
      },
    })
    lines.forEach((l, i) => {
      const c = lineCalc(l)
      changes.push({
        table: 'sale_lines',
        row: { id: uuid(), sale_id: saleId, product_id: l.productId, name: l.name.trim(), qty: num(l.qty), price: num(l.price), discount_pct: num(l.discount), tax_rate: l.taxRate, subtotal: c.subtotal, tax: c.tax, total: c.total, sequence: i + 1 },
      })
      if (confirm && l.productId && meta[l.productId]?.trackStock) {
        changes.push({ table: 'stock_moves', row: { id: uuid(), product_id: l.productId, qty: -num(l.qty), kind: 'venta', ref_id: saleId, date: today() } })
      }
    })
    if (confirm && mode === 'contado' && totals.total > 0) {
      changes.push({
        table: 'payments',
        row: { id: uuid(), number: docNumber('RC'), kind: 'venta', sale_id: saleId, partner_id: partnerId || null, date: nowLocal(), method, amount: totals.total, user_id: me!.user.id },
      })
    }
    if (changes.length > 40) return `El documento genera ${changes.length} registros y el máximo es 40 por guardado. Reduce las líneas o divide el pedido en dos.`
    return { changes, saleId }
  }

  async function submit(status: 'borrador' | 'confirmada') {
    const built = build(status)
    if (typeof built === 'string') {
      toast(built, 'error')
      return
    }
    setBusy(status === 'borrador' ? 'draft' : 'confirm')
    try {
      await saveRecords(built.changes)
      toast(status === 'borrador' ? 'Cotización guardada' : 'Pedido confirmado')
      navigate(`/ventas/pedidos/${built.saleId}`, { replace: true })
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  async function voidDoc() {
    if (!initial) return
    if (!(await confirm({ title: 'Anular documento', message: `Se anulará ${initial.number}. Esta acción no se puede deshacer.`, confirmLabel: 'Anular', danger: true }))) return
    setBusy('void')
    try {
      await saveRecord('sales', { id: initial.id, status: 'anulada' })
      toast('Documento anulado')
      navigate('/ventas/pedidos')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <BackHeader
        title={initial ? initial.number : 'Nuevo pedido'}
        subtitle={initial ? 'Cotización en borrador: edítala o confírmala para descontar inventario.' : 'Arma el pedido y confírmalo, o guárdalo como cotización.'}
        actions={
          <>
            {initial && isFinance && (
              <Button variant="ghost" icon={Ban} className="text-danger hover:bg-danger-soft hover:text-danger" loading={busy === 'void'} onClick={voidDoc}>
                Anular
              </Button>
            )}
            <Button variant="secondary" icon={Save} loading={busy === 'draft'} disabled={!!busy} onClick={() => submit('borrador')}>
              Guardar cotización
            </Button>
            <Button icon={CheckCircle2} loading={busy === 'confirm'} disabled={!!busy || !!problem} onClick={() => submit('confirmada')}>
              Confirmar pedido
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Productos" subtitle="Busca por nombre, código de barras o SKU" padded={false}>
            <div className="px-5 pt-4 pb-4">
              <ProductSearch onPick={addProduct} />
            </div>
            <LinesTable lines={lines} meta={meta} onChange={setLine} onRemove={(k) => setLines((ls) => ls.filter((l) => l.key !== k))} />
          </Card>
          <Card title="Notas">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condiciones de entrega, observaciones para el cliente…" />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Cliente y pago">
            <div className="space-y-4">
              <Field label="Sede / tienda" hint="Sede donde se atiende este pedido.">
                <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                  <option value="">Sin sede asignada</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Cliente" hint={customers.error ? customers.error.message : mode === 'credito' ? 'Obligatorio para vender a crédito' : 'Sin cliente se registra como consumidor final'}>
                <div className="flex gap-2">
                  <Select value={partnerId} onChange={(e) => changePartner(e.target.value)} className="flex-1">
                    <option value="">Sin cliente (consumidor final)</option>
                    {customerList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.docNumber ? ` · ${p.docNumber}` : ''}
                        {p.blocked ? ' (bloqueado)' : ''}
                      </option>
                    ))}
                  </Select>
                  <Button variant="secondary" icon={Plus} onClick={() => setNewCust(true)}>Nuevo</Button>
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Forma de pago">
                  <Select value={mode} onChange={(e) => changeMode(e.target.value as 'contado' | 'credito')}>
                    <option value="contado">Contado</option>
                    <option value="credito">Crédito</option>
                  </Select>
                </Field>
                {mode === 'contado' ? (
                  <Field label="Medio de pago">
                    <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                      {METHOD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <Field label="Vencimiento">
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </Field>
                )}
              </div>
            </div>
            {partner ? (
              <CreditCard partner={partner} amount={totals.total} credit={mode === 'credito'} />
            ) : (
              mode === 'credito' && (
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-warning-soft px-3.5 py-3 text-sm text-warning">
                  <UserRound {...ICON} className="shrink-0" />
                  Selecciona un cliente para vender a crédito.
                </div>
              )
            )}
          </Card>

          <Card title="Resumen">
            <dl className="space-y-2.5 text-sm">
              <Row label="Subtotal" value={money(totals.subtotal)} />
              <Row label="Descuentos" value={totals.discount > 0 ? `− ${money(totals.discount)}` : money(0)} />
              <Row label="IVA" value={money(totals.tax)} />
              <div className="flex items-center justify-between border-t border-line pt-3">
                <dt className="text-base font-bold text-ink">Total</dt>
                <dd className="font-display text-2xl font-extrabold text-brand-700 tabular-nums">{money(totals.total)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">
              {lines.length} {lines.length === 1 ? 'línea' : 'líneas'} · al confirmar {mode === 'contado' ? `se registra el pago en ${METHOD_LABEL[method] ?? method} y ` : 'queda en cartera y '}se descuenta el inventario de los productos con control de stock.
            </p>
          </Card>
        </div>
      </div>

      <Modal open={newCust} onClose={() => setNewCust(false)} title="Nuevo cliente" subtitle="Crea un cliente rápido para este pedido."
        footer={<><Button variant="secondary" onClick={() => setNewCust(false)}>Cancelar</Button><Button loading={savingNc} onClick={createCustomer}>Crear cliente</Button></>}>
        <div className="space-y-4">
          <Field label="Nombre" required><Input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder="Nombre del cliente" /></Field>
          <Field label="Documento / NIT"><Input value={nc.doc_number} onChange={(e) => setNc({ ...nc, doc_number: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Teléfono"><Input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} /></Field>
            <Field label="Correo"><Input value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} /></Field>
          </div>
        </div>
      </Modal>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  )
}

// ============================================================================ buscador de productos

function ProductSearch({ onPick }: { onPick: (p: ProductHit) => void }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const s = useDebounced(text.trim(), 250)
  const { data, loading } = useGql<{ products: { items: ProductHit[] } }>(PRODUCTS_Q, { s: s || null }, { skip: !open })
  const items = (data?.products.items ?? []).filter((p) => p.active !== false)

  function pick(p: ProductHit) {
    onPick(p)
    setText('')
  }

  return (
    <div className="relative">
      <Search {...ICON} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle" />
      <input
        className="input pl-10"
        placeholder="Agregar producto…"
        value={text}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && items[0]) {
            e.preventDefault()
            pick(items[0])
          }
        }}
      />
      {open && (
        <div onMouseDown={(e) => e.preventDefault()} className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-pop">
          {loading && items.length === 0 ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">No se encontraron productos.</p>
          ) : (
            items.map((p) => (
              <button key={p.id} type="button" onClick={() => pick(p)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-brand-50">
                <IconTile icon={Package} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{p.name}</div>
                  <div className="truncate text-xs text-muted">
                    {[p.sku, p.barcode].filter(Boolean).join(' · ') || 'Sin código'}
                    {p.trackStock ? ` · Stock ${qty(p.stock)}` : ''}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold text-ink">{money(p.price)}</span>
                <Plus {...ICON} className="shrink-0 text-brand-600" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================ tabla de líneas editable

function LinesTable({ lines, meta, onChange, onRemove }: { lines: EditLine[]; meta: Record<string, Meta>; onChange: (key: string, patch: Partial<EditLine>) => void; onRemove: (key: string) => void }) {
  if (lines.length === 0) return <EmptyState icon={Package} title="Aún no hay productos" message="Busca un producto arriba para agregarlo al pedido." />
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-y border-line bg-canvas/60 text-left">
            {['Producto', 'Cant.', 'Precio', 'Desc. %', 'IVA', 'Total', ''].map((h, i) => (
              <th key={i} className={`px-4 py-3 text-[11px] font-bold tracking-wider text-muted uppercase ${i >= 1 && i <= 5 ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const c = lineCalc(l)
            const m = l.productId ? meta[l.productId] : undefined
            const short = m?.trackStock && num(l.qty) > m.stock
            const rates = TAX_OPTIONS.includes(l.taxRate) ? TAX_OPTIONS : [...TAX_OPTIONS, l.taxRate]
            return (
              <tr key={l.key} className="border-b border-line last:border-0">
                <td className="px-4 py-3 align-middle">
                  <Input value={l.name} onChange={(e) => onChange(l.key, { name: e.target.value })} className="h-9 min-w-44 font-semibold" />
                  {m?.trackStock && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      Stock {qty(m.stock)} {m.unit ?? ''}
                      {short && <Badge tone="warning">Supera el stock</Badge>}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right align-middle">
                  <Input inputMode="decimal" value={l.qty} onChange={(e) => onChange(l.key, { qty: e.target.value })} className="h-9 w-20 text-right" />
                </td>
                <td className="px-4 py-3 text-right align-middle">
                  <Input inputMode="decimal" value={l.price} onChange={(e) => onChange(l.key, { price: e.target.value })} className="h-9 w-28 text-right" />
                </td>
                <td className="px-4 py-3 text-right align-middle">
                  <Input inputMode="decimal" value={l.discount} onChange={(e) => onChange(l.key, { discount: e.target.value })} className="h-9 w-20 text-right" />
                </td>
                <td className="px-4 py-3 text-right align-middle">
                  <Select value={String(l.taxRate)} onChange={(e) => onChange(l.key, { taxRate: Number(e.target.value) })} className="h-9 w-24">
                    {rates.map((r) => (
                      <option key={r} value={r}>
                        {Math.round(r * 10000) / 100} %
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-4 py-3 text-right align-middle font-semibold tabular-nums">
                  {money(c.total)}
                  {c.discount > 0 && <div className="text-xs font-normal text-muted">− {money(c.discount)}</div>}
                </td>
                <td className="px-2 py-3 align-middle">
                  <IconButton icon={Trash2} label="Quitar línea" tone="danger" onClick={() => onRemove(l.key)} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================ vista de sólo lectura (confirmada / anulada)

function Viewer({ sale }: { sale: SaleDoc }) {
  const navigate = useNavigate()
  const { me, can, isFinance } = useAuth()
  const { toast, confirm } = useFeedback()
  const [payOpen, setPayOpen] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [returning, setReturning] = useState(false)
  const [returnWh, setReturnWh] = useState('')
  const [returnMethod, setReturnMethod] = useState('efectivo')
  const [returnAmount, setReturnAmount] = useState('')
  const [returnNote, setReturnNote] = useState('')
  const [returnLines, setReturnLines] = useState<{ lineId: string; productId: string | null; name: string; maxQty: number; qty: string; unitTotal: number }[]>([])
  const whQ = useGql<{ warehouses: { id: string; name: string; active: boolean; isDefault: boolean }[] }>('{ warehouses{ id name active isDefault } }')

  const confirmed = sale.status === 'confirmada'
  const balance = confirmed ? Math.max(0, toNum(sale.total) - toNum(sale.paid)) : 0
  const canPay = confirmed && balance > 0.5 && can('payments', 'write')
  const canVoid = isFinance && sale.status !== 'anulada' && sale.status !== 'devuelta' && can('sales', 'write')
  const canReturn = sale.status === 'confirmada' && can('sales', 'write')
  const credit = sale.paymentMode === 'credito'

  async function voidDoc() {
    const whs = (whQ.data?.warehouses ?? []).filter((w) => w.active)
    const defaultWh = whs.find((w) => w.isDefault)?.id ?? whs[0]?.id ?? ''
    const stockLines = sale.lines.filter((l) => l.productId && toNum(l.qty) > 0)
    const needsStockReturn = sale.status === 'confirmada' && stockLines.length > 0
    const msg = needsStockReturn
      ? `Se anulará ${sale.number}. También se devolverán ${stockLines.length} línea(s) al inventario${defaultWh ? ` en la bodega seleccionada por defecto` : ''}. Los pagos no se revierten automáticamente.`
      : `Se anulará ${sale.number}. Esta acción no se puede deshacer.`
    if (!(await confirm({ title: 'Anular documento', message: msg, confirmLabel: 'Anular', danger: true }))) return
    if (needsStockReturn && !defaultWh) { toast('No hay bodega activa para devolver el inventario.', 'error'); return }
    setVoiding(true)
    try {
      if (needsStockReturn) {
        const changes: Change[] = stockLines.map((l) => ({ table: 'stock_moves', row: { id: uuid(), product_id: l.productId, qty: toNum(l.qty), kind: 'devolucion', ref_id: sale.id, date: today(), warehouse_id: defaultWh, notes: `Anulación ${sale.number}` } }))
        changes.push({ table: 'sales', row: { id: sale.id, status: 'anulada' } })
        await saveRecords(changes)
      } else {
        await saveRecord('sales', { id: sale.id, status: 'anulada' })
      }
      toast(needsStockReturn ? 'Documento anulado e inventario devuelto' : 'Documento anulado')
      navigate(0)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setVoiding(false)
    }
  }

  function openReturn() {
    const whs = (whQ.data?.warehouses ?? []).filter((w) => w.active)
    const lines = sale.lines.map((l) => ({
      lineId: l.id,
      productId: l.productId,
      name: l.name,
      maxQty: toNum(l.qty),
      qty: '0',
      unitTotal: toNum(l.qty) > 0 ? toNum(l.total) / toNum(l.qty) : 0,
    }))
    setReturnLines(lines)
    setReturnWh(whs.find((w) => w.isDefault)?.id ?? whs[0]?.id ?? '')
    setReturnAmount('0')
    setReturnMethod('efectivo')
    setReturnNote('')
    setReturnOpen(true)
  }

  function setReturnQty(lineId: string, qty: string) {
    setReturnLines((prev) => {
      const next = prev.map((l) => (l.lineId === lineId ? { ...l, qty } : l))
      const suggested = next.reduce((s, l) => s + Math.max(0, Math.min(l.maxQty, toNum(l.qty))) * l.unitTotal, 0)
      setReturnAmount(String(Math.min(toNum(sale.paid), Math.round(suggested))))
      return next
    })
  }

  async function submitReturn() {
    const selected = returnLines.map((l) => ({ ...l, q: Math.max(0, Math.min(l.maxQty, toNum(l.qty))) })).filter((l) => l.q > 0)
    if (selected.length === 0) return toast('Selecciona al menos un producto y cantidad a devolver.', 'error')
    const amt = Math.max(0, toNum(returnAmount))
    const paid = Math.max(0, toNum(sale.paid))
    if (amt <= 0) return toast('Indica el valor a reembolsar.', 'error')
    if (amt > paid + 0.5) return toast(`El reembolso no puede superar lo pagado (${money(paid)}).`, 'error')
    if (!returnWh) return toast('Selecciona la bodega donde ingresa la devolución.', 'error')
    const allReturned = returnLines.every((l) => Math.max(0, Math.min(l.maxQty, toNum(l.qty))) >= l.maxQty - 0.0001)
    const fullyRefunded = amt >= paid - 0.5
    const nextStatus = allReturned && fullyRefunded ? 'devuelta' : 'devuelta_parcial'
    if (!(await confirm({ title: 'Registrar devolución', message: `Se devolverán ${selected.length} línea(s) al inventario y se registrará un reembolso de ${money(amt)} para ${sale.number}.`, confirmLabel: 'Registrar devolución', danger: true }))) return
    setReturning(true)
    try {
      const changes: Change[] = []
      for (const l of selected) {
        if (!l.productId) continue
        changes.push({ table: 'stock_moves', row: { id: uuid(), product_id: l.productId, qty: l.q, kind: 'devolucion', ref_id: sale.id, date: today(), warehouse_id: returnWh, notes: `Devolución ${sale.number}${returnNote.trim() ? `: ${returnNote.trim()}` : ''}` } })
      }
      changes.push({
        table: 'payments',
        row: { id: uuid(), number: docNumber('DEV'), kind: 'reembolso', sale_id: sale.id, partner_id: sale.partner?.id ?? null, date: nowLocal(), method: returnMethod, amount: -amt, reference: `Devolución ${sale.number}`, notes: returnNote.trim() || null, user_id: me!.user.id },
      })
      changes.push({ table: 'sales', row: { id: sale.id, status: nextStatus } })
      if (changes.length > 40) throw new Error(`La devolución genera ${changes.length} registros y el límite es 40. Divide la devolución.`)
      await saveRecords(changes)
      toast(nextStatus === 'devuelta' ? 'Devolución total registrada' : 'Devolución parcial registrada')
      setReturnOpen(false)
      navigate(0)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setReturning(false)
    }
  }

  return (
    <>
      <style>{`@media print { body * { visibility: hidden !important } #print-area, #print-area * { visibility: visible !important } #print-area { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: 0 !important } .no-print { display: none !important } }`}</style>
      <BackHeader
        title={sale.number}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <ChannelBadge channel={sale.channel} />
            <PaymentState sale={sale} />
            {sale.site?.name && <span className="text-muted">Sede: {sale.site.name}</span>}
            <span>{dateTime(sale.date)}</span>
          </span>
        }
        actions={
          <>
            {canVoid && (
              <Button variant="ghost" icon={Ban} className="text-danger hover:bg-danger-soft hover:text-danger" loading={voiding} onClick={voidDoc}>
                Anular
              </Button>
            )}
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
              Imprimir
            </Button>
            {canReturn && (
              <Button variant="secondary" icon={RotateCcw} onClick={openReturn}>
                Devolución
              </Button>
            )}
            {canPay && (
              <Button icon={Banknote} onClick={() => setPayOpen(true)}>
                Registrar pago
              </Button>
            )}
          </>
        }
      />

      {sale.status === 'anulada' && (
        <div className="no-print mb-5 flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
          <Ban {...ICON} />
          Este documento está anulado y no cuenta en ventas ni en cartera.
        </div>
      )}
      {sale.status === 'devuelta' && (
        <div className="no-print mb-5 flex items-center gap-3 rounded-2xl border border-warning/20 bg-warning-soft px-4 py-3 text-sm text-warning">
          <RotateCcw {...ICON} />
          Este documento fue devuelto. Los productos fueron reintegrados al inventario y se registró el reembolso.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div id="print-area" className="card xl:col-span-2">
          <div className="hidden px-5 pt-5 print:block">
            <p className="text-lg font-extrabold">{me?.company.name}</p>
            <p className="text-xs">
              {[me?.company.nit && `NIT ${me.company.nit}`, me?.company.address, me?.company.city, me?.company.phone].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4 p-5">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wider text-muted uppercase">Cliente</p>
              <div className="mt-2">
                <NameCell name={sale.partner?.name ?? 'Consumidor final'} sub={sale.partner?.docNumber ?? undefined} />
              </div>
            </div>
            <div className="text-sm">
              <p className="text-xs font-semibold tracking-wider text-muted uppercase">Documento</p>
              <p className="mt-2 font-semibold text-brand-700">{sale.number}</p>
              <p className="text-muted">{date(sale.date)}</p>
              <p className="text-muted">Vendedor: {sale.seller?.name ?? '—'}</p>
              <p className="text-muted">
                {credit ? `Crédito · vence ${date(sale.dueDate)}` : 'Contado'}
              </p>
            </div>
          </div>
          <DataTable<SaleDoc['lines'][number]>
            pageSize={100}
            rows={sale.lines}
            columns={[
              { key: 'name', header: 'Producto', render: (l) => <span className="font-semibold">{l.name}</span> },
              { key: 'qty', header: 'Cant.', align: 'right', render: (l) => qty(l.qty) },
              { key: 'price', header: 'Precio', align: 'right', render: (l) => money(l.price) },
              { key: 'disc', header: 'Desc.', align: 'right', hideSm: true, render: (l) => (toNum(l.discountPct) > 0 ? `${qty(l.discountPct)} %` : '—') },
              { key: 'tax', header: 'IVA', align: 'right', hideSm: true, render: (l) => `${Math.round(toNum(l.taxRate) * 10000) / 100} %` },
              { key: 'total', header: 'Total', align: 'right', render: (l) => <span className="font-semibold">{money(l.total)}</span> },
            ]}
            empty={<p className="px-5 py-8 text-center text-sm text-muted">Sin líneas.</p>}
          />
          <div className="flex flex-col items-end gap-2 p-5 text-sm">
            <div className="w-full max-w-xs space-y-2">
              <Row label="Subtotal" value={money(sale.subtotal)} />
              <Row label="Descuentos" value={toNum(sale.discountTotal) > 0 ? `− ${money(sale.discountTotal)}` : money(0)} />
              <Row label="IVA" value={money(sale.taxTotal)} />
              <div className="flex items-center justify-between border-t border-line pt-3">
                <span className="font-bold">Total</span>
                <span className="font-display text-xl font-extrabold text-brand-700 tabular-nums">{money(sale.total)}</span>
              </div>
            </div>
          </div>
          {sale.notes && (
            <div className="border-t border-line px-5 py-4 text-sm">
              <p className="text-xs font-semibold tracking-wider text-muted uppercase">Notas</p>
              <p className="mt-1 whitespace-pre-line text-ink-soft">{sale.notes}</p>
            </div>
          )}
        </div>

        <div className="no-print space-y-6">
          <Card title="Estado de cuenta">
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Total" value={money(sale.total)} />
              <MiniStat label="Pagado" value={money(sale.paid)} tone="success" />
              <MiniStat label="Saldo" value={money(balance)} tone={balance > 0.5 ? 'danger' : 'neutral'} />
            </div>
            {confirmed && balance > 0.5 && credit && sale.dueDate && sale.dueDate.slice(0, 10) < today() && (
              <div className="mt-4 rounded-2xl border border-danger/20 bg-danger-soft px-3.5 py-3 text-sm text-danger">Factura vencida desde el {date(sale.dueDate)}.</div>
            )}
            {sale.partner && (
              <div className="mt-4 space-y-3">
                <CreditCard partner={sale.partner} amount={0} credit={false} />
                <Button variant="secondary" size="sm" icon={FilePenLine} onClick={() => navigate('/ventas/cartera')}>
                  Ver cartera
                </Button>
              </div>
            )}
          </Card>
          <Card title="Pagos registrados" padded={false}>
            <div className="pt-4">
              <DataTable<SaleDoc['payments'][number]>
                pageSize={50}
                rows={sale.payments}
                columns={[
                  { key: 'number', header: 'Recibo', render: (p) => <span className="font-semibold text-brand-700">{p.number}</span> },
                  { key: 'method', header: 'Medio', render: (p) => <span className="text-ink-soft">{METHOD_LABEL[p.method] ?? p.method}</span> },
                  { key: 'amount', header: 'Valor', align: 'right', render: (p) => <span className="font-semibold">{money(p.amount)}</span> },
                ]}
                empty={<p className="px-5 pb-6 text-center text-sm text-muted">Aún no hay pagos registrados.</p>}
              />
            </div>
          </Card>
        </div>
      </div>

      <PayModal open={payOpen} onClose={() => setPayOpen(false)} sale={sale} balance={balance} userId={me!.user.id} />
      <Modal open={returnOpen} onClose={() => setReturnOpen(false)} title="Registrar devolución" subtitle={`${sale.number} · Pagado ${money(sale.paid)}`} size="xl"
        footer={<><Button variant="ghost" onClick={() => setReturnOpen(false)}>Cancelar</Button><Button icon={RotateCcw} loading={returning} onClick={submitReturn}>Confirmar devolución</Button></>}>
        <div className="space-y-4">
          <div className="rounded-2xl border border-line overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface text-muted text-xs uppercase tracking-wider"><tr><th className="px-4 py-3 text-left">Producto</th><th className="px-4 py-3 text-right">Vendido</th><th className="px-4 py-3 text-right">Devolver</th><th className="px-4 py-3 text-right">Valor</th></tr></thead>
              <tbody className="divide-y divide-line">
                {returnLines.map((l) => {
                  const q = Math.max(0, Math.min(l.maxQty, toNum(l.qty)))
                  return (
                    <tr key={l.lineId}>
                      <td className="px-4 py-3 font-medium">{l.name}{!l.productId && <span className="ml-2 text-xs text-muted">(sin producto)</span>}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{qty(l.maxQty)}</td>
                      <td className="px-4 py-3 text-right"><input type="number" min="0" max={l.maxQty} step="0.01" value={l.qty} onChange={(e) => setReturnQty(l.lineId, e.target.value)} className="w-24 rounded-xl border border-line bg-white px-3 py-1.5 text-right" /></td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{money(q * l.unitTotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bodega de ingreso" required hint="Donde entran los productos devueltos">
              <Select value={returnWh} onChange={(e) => setReturnWh(e.target.value)}>
                <option value="">Selecciona bodega…</option>
                {(whQ.data?.warehouses ?? []).filter((w) => w.active).map((w) => <option key={w.id} value={w.id}>{w.name}{w.isDefault ? ' (principal)' : ''}</option>)}
              </Select>
            </Field>
            <Field label="Método de reembolso" required>
              <Select value={returnMethod} onChange={(e) => setReturnMethod(e.target.value)}>
                {METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="Valor a reembolsar" required hint={`Sugerido según líneas seleccionadas · Máximo ${money(sale.paid)}`}>
              <Input type="number" min="0" step="0.01" value={returnAmount} onChange={(e) => setReturnAmount(e.target.value)} />
            </Field>
            <Field label="Motivo / nota">
              <Input value={returnNote} onChange={(e) => setReturnNote(e.target.value)} placeholder="Ej. Cliente se arrepintió, producto defectuoso…" />
            </Field>
          </div>
          <div className="rounded-2xl border border-warning/20 bg-warning-soft px-4 py-3 text-sm text-warning">
            Selecciona las cantidades a devolver por línea. Se reintegrará stock solo de las líneas con producto. Si devuelves todo y reembolsas lo pagado, la venta quedará <b>Devuelta</b>; si es parcial, quedará <b>Devuelta parcial</b>.
          </div>
        </div>
      </Modal>
    </>
  )
}

// ============================================================================ registrar pago (abono)

function PayModal({ open, onClose, sale, balance, userId }: { open: boolean; onClose: () => void; sale: SaleDoc; balance: number; userId: string }) {
  const { toast } = useFeedback()
  const [method, setMethod] = useState('efectivo')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setAmount(String(Math.round(balance)))
      setReference('')
      setMethod('efectivo')
    }
  }, [open, balance])

  async function submit() {
    const value = num(amount)
    if (value <= 0) return toast('Ingresa un valor mayor que cero', 'error')
    if (value > balance + 0.5) return toast(`El valor supera el saldo de ${money(balance)}`, 'error')
    setSaving(true)
    try {
      await saveRecord('payments', { kind: 'abono', sale_id: sale.id, partner_id: sale.partner?.id ?? null, method, amount: value, reference: reference.trim() || null, number: docNumber('RC'), date: nowLocal(), user_id: userId })
      toast('Pago registrado')
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Registrar pago"
      subtitle={`${sale.number} · saldo ${money(balance)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={Banknote} loading={saving} onClick={submit}>
            Registrar pago
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Valor" required hint="No puede superar el saldo pendiente">
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-muted">$</span>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="pl-7" />
          </div>
        </Field>
        <Field label="Medio de pago">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Referencia" hint="Opcional: número de transferencia o comprobante">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
