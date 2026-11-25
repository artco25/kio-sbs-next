import { AlertTriangle, Banknote, Download, HandCoins, UsersRound, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KpiCard, RankRow } from '../../components/charts'
import { Badge, Button, Card, DataTable, ErrorBox, Field, Input, Modal, NameCell, PageHeader, SearchInput, Select, Switch, Tabs, Toolbar, useFeedback } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { date, money, relative, toNum } from '../../lib/format'
import { gql } from '../../lib/gql'
import { docNumber, exportCsv, nowLocal, saveRecords, today, type Change, uuid } from '../../lib/records'
import { useGql } from '../../lib/useGql'
import { dailySeries, daysLate, METHOD_OPTIONS, MiniStat } from './_shared'

interface Invoice {
  id: string
  number: string
  date: string
  dueDate: string | null
  total: number
  paid: number
  balance: number
  partner: { id: string; name: string } | null
}

interface ClientRow {
  id: string
  name: string
  invoices: number
  balance: number
  overdue: number
  oldest: number
  oldestDue: string | null
}

const Q = `query($from:String){
  receivables{ id number date dueDate total paid balance partner{ id name } }
  payments(kind:"abono", from:$from, limit:500){ date amount }
}`
const DQ = `{ dashboard{ kpis{ key value } aging{ bucket amount count } } }`

const BUCKETS = ['Corriente', '1-30', '31-60', '61-90', '+90']
const AGING_COLOR: Record<string, string> = { Corriente: 'bg-success', '1-30': 'bg-brand-500', '31-60': 'bg-warning', '61-90': 'bg-[#EA580C]', '+90': 'bg-danger' }
const bucketOf = (due: string | null) => {
  const d = daysLate(due)
  if (d <= 0) return 'Corriente'
  return d <= 30 ? '1-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '+90'
}

type TabKey = 'facturas' | 'clientes'

export default function Receivables() {
  const navigate = useNavigate()
  const { can, isFinance } = useAuth()
  const [tab, setTab] = useState<TabKey>('facturas')
  const [search, setSearch] = useState('')
  const [onlyOverdue, setOnlyOverdue] = useState(false)
  const [modal, setModal] = useState<{ open: boolean; partnerId: string }>({ open: false, partnerId: '' })

  const monthStart = `${today().slice(0, 7)}-01`
  const { data, loading, error } = useGql<{ receivables: Invoice[]; payments: { date: string; amount: number }[] }>(Q, { from: monthStart })
  const dash = useGql<{ dashboard: { kpis: { key: string; value: number }[]; aging: { bucket: string; amount: number; count: number }[] } }>(DQ, {}, { skip: !isFinance })

  const invoices = data?.receivables ?? []

  // Cálculos locales (siempre disponibles; el dashboard sólo afina totales y edades para finanzas)
  const computed = useMemo(() => {
    const aging = new Map<string, { amount: number; count: number }>(BUCKETS.map((b) => [b, { amount: 0, count: 0 }]))
    let total = 0
    let overdue = 0
    const clients = new Map<string, ClientRow>()
    for (const r of invoices) {
      const bal = toNum(r.balance)
      const late = daysLate(r.dueDate)
      total += bal
      if (late > 0) overdue += bal
      const b = aging.get(bucketOf(r.dueDate))!
      b.amount += bal
      b.count += 1
      const key = r.partner?.id ?? 'sin-cliente'
      const c = clients.get(key) ?? { id: key, name: r.partner?.name ?? 'Consumidor final', invoices: 0, balance: 0, overdue: 0, oldest: 0, oldestDue: null }
      c.invoices += 1
      c.balance += bal
      if (late > 0) c.overdue += bal
      if (r.dueDate && (!c.oldestDue || r.dueDate < c.oldestDue)) {
        c.oldestDue = r.dueDate
        c.oldest = late
      }
      clients.set(key, c)
    }
    return { aging, total, overdue, clients: [...clients.values()].sort((a, b) => b.balance - a.balance) }
  }, [invoices])

  const kpi = (k: string) => dash.data?.dashboard.kpis.find((x) => x.key === k)?.value
  const total = isFinance && kpi('cartera') != null ? kpi('cartera')! : computed.total
  const overdue = isFinance && kpi('vencida') != null ? kpi('vencida')! : computed.overdue
  const inArrears = computed.clients.filter((c) => c.overdue > 0).length
  const collected = (data?.payments ?? []).reduce((s, p) => s + toNum(p.amount), 0)
  const collectedSeries = useMemo(() => dailySeries((data?.payments ?? []).map((p) => ({ date: p.date, value: toNum(p.amount) })), monthStart, today()), [data, monthStart])

  const aging = BUCKETS.map((b) => {
    if (isFinance && dash.data) {
      const a = dash.data.dashboard.aging.find((x) => x.bucket === b)
      return { bucket: b, amount: a?.amount ?? 0, count: a?.count ?? 0 }
    }
    return { bucket: b, ...computed.aging.get(b)! }
  })
  const maxAging = Math.max(1, ...aging.map((a) => a.amount))
  const maxDebtor = Math.max(1, ...computed.clients.slice(0, 5).map((c) => c.balance))

  const q = search.trim().toLowerCase()
  const invoiceRows = useMemo(
    () => invoices.filter((r) => (!onlyOverdue || daysLate(r.dueDate) > 0) && (!q || r.number?.toLowerCase().includes(q) || r.partner?.name?.toLowerCase().includes(q))),
    [invoices, onlyOverdue, q],
  )
  const clientRows = useMemo(() => computed.clients.filter((c) => (!onlyOverdue || c.overdue > 0) && (!q || c.name.toLowerCase().includes(q))), [computed.clients, onlyOverdue, q])

  function exportRows() {
    if (tab === 'facturas') {
      exportCsv(
        'cartera_facturas',
        invoiceRows.map((r) => ({ number: r.number, partner: r.partner?.name ?? 'Consumidor final', date: r.date?.slice(0, 10), due: r.dueDate?.slice(0, 10) ?? '', late: Math.max(0, daysLate(r.dueDate)), total: r.total, balance: r.balance })),
        [
          { key: 'number', label: 'Documento' },
          { key: 'partner', label: 'Cliente' },
          { key: 'date', label: 'Fecha' },
          { key: 'due', label: 'Vence' },
          { key: 'late', label: 'Días de mora' },
          { key: 'total', label: 'Total' },
          { key: 'balance', label: 'Saldo' },
        ],
      )
    } else {
      exportCsv(
        'cartera_clientes',
        clientRows.map((c) => ({ name: c.name, invoices: c.invoices, balance: c.balance, overdue: c.overdue, oldest: c.oldest > 0 ? c.oldest : 0 })),
        [
          { key: 'name', label: 'Cliente' },
          { key: 'invoices', label: 'Facturas' },
          { key: 'balance', label: 'Saldo' },
          { key: 'overdue', label: 'Vencido' },
          { key: 'oldest', label: 'Mora más antigua (días)' },
        ],
      )
    }
  }

  const canPay = can('payments', 'write')

  return (
    <>
      <PageHeader
        title="Cartera"
        subtitle="Facturas a crédito pendientes de cobro, edades de mora y recaudo."
        actions={
          canPay && (
            <Button icon={Banknote} onClick={() => setModal({ open: true, partnerId: '' })} disabled={computed.clients.length === 0}>
              Registrar abono
            </Button>
          )
        }
      />
      <ErrorBox error={error ?? dash.error} />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={HandCoins} label="Total por cobrar" value={money(total)} hint={`${invoices.length} facturas con saldo`} />
        <KpiCard icon={AlertTriangle} label="Cartera vencida" value={money(overdue)} tone="danger" hint={total > 0 ? `${Math.round((overdue / total) * 100)} % de la cartera` : 'Sin cartera pendiente'} />
        <KpiCard icon={UsersRound} label="Clientes en mora" value={String(inArrears)} tone="warning" hint={`de ${computed.clients.length} con saldo`} />
        <KpiCard icon={Wallet} label="Recaudado este mes" value={money(collected)} tone="success" series={collectedSeries} hint="Abonos a cartera" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2" title="Cartera por edades" subtitle="Saldo según días de mora">
          {aging.map((a) => (
            <RankRow key={a.bucket} label={a.bucket === 'Corriente' ? 'Al día' : `${a.bucket} días`} value={a.amount} max={maxAging} right={`${money(a.amount)} · ${a.count}`} color={AGING_COLOR[a.bucket]} />
          ))}
        </Card>
        <Card className="xl:col-span-3" title="Mayores deudores" subtitle="Los 5 clientes con más saldo pendiente">
          {computed.clients.length === 0 ? (
            <p className="text-sm text-muted">No hay saldos pendientes.</p>
          ) : (
            computed.clients.slice(0, 5).map((c) => <RankRow key={c.id} label={c.name} value={c.balance} max={maxDebtor} right={`${money(c.balance)}${c.overdue > 0 ? ` · ${money(c.overdue)} vencido` : ''}`} color={c.overdue > 0 ? 'bg-danger' : 'bg-brand-600'} />)
          )}
        </Card>
      </div>

      <div className="mt-6 mb-4">
        <Tabs<TabKey>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'facturas', label: 'Facturas', count: invoices.length },
            { key: 'clientes', label: 'Por cliente', count: computed.clients.length },
          ]}
        />
      </div>

      <Card padded={false} className="pt-5">
        <Toolbar
          actions={
            <Button variant="secondary" icon={Download} onClick={exportRows} disabled={(tab === 'facturas' ? invoiceRows : clientRows).length === 0}>
              Exportar CSV
            </Button>
          }
        >
          <SearchInput value={search} onChange={setSearch} placeholder={tab === 'facturas' ? 'Buscar por documento o cliente…' : 'Buscar cliente…'} />
          <Switch checked={onlyOverdue} onChange={setOnlyOverdue} label={<span className="text-ink-soft">Sólo vencidas</span>} />
        </Toolbar>

        {tab === 'facturas' ? (
          <DataTable<Invoice>
            rows={invoiceRows}
            loading={loading}
            onRowClick={(r) => navigate(`/ventas/pedidos/${r.id}`)}
            footer={invoices.length >= 500 ? 'Se muestran las 500 facturas más antiguas con saldo.' : `${invoiceRows.length} facturas`}
            columns={[
              { key: 'number', header: 'Documento', render: (r) => <span className="font-semibold text-brand-700">{r.number}</span> },
              { key: 'partner', header: 'Cliente', render: (r) => <NameCell name={r.partner?.name ?? 'Consumidor final'} sub={`Emitida ${relative(r.date)}`} /> },
              { key: 'due', header: 'Vence', hideSm: true, render: (r) => <span className="text-ink-soft">{date(r.dueDate)}</span> },
              {
                key: 'late',
                header: 'Mora',
                render: (r) => {
                  const d = daysLate(r.dueDate)
                  return d > 0 ? <span className="font-bold text-danger">{d} {d === 1 ? 'día' : 'días'}</span> : <Badge tone="success">Al día</Badge>
                },
              },
              { key: 'total', header: 'Total', align: 'right', hideSm: true, render: (r) => money(r.total) },
              { key: 'balance', header: 'Saldo', align: 'right', render: (r) => <span className="font-semibold">{money(r.balance)}</span> },
            ]}
            empty={<p className="px-5 py-10 text-center text-sm text-muted">{onlyOverdue ? 'No hay facturas vencidas.' : 'No hay facturas con saldo pendiente.'}</p>}
          />
        ) : (
          <DataTable<ClientRow>
            rows={clientRows}
            loading={loading}
            footer={`${clientRows.length} clientes`}
            columns={[
              { key: 'name', header: 'Cliente', render: (c) => <NameCell name={c.name} sub={c.overdue > 0 ? 'En mora' : 'Al día'} /> },
              { key: 'invoices', header: 'Facturas', align: 'right', hideSm: true, render: (c) => c.invoices },
              { key: 'balance', header: 'Saldo', align: 'right', render: (c) => <span className="font-semibold">{money(c.balance)}</span> },
              { key: 'overdue', header: 'Vencido', align: 'right', render: (c) => <span className={c.overdue > 0 ? 'font-bold text-danger' : 'text-muted'}>{money(c.overdue)}</span> },
              { key: 'oldest', header: 'Más antigua', hideSm: true, render: (c) => (c.oldest > 0 ? <span className="font-bold text-danger">{c.oldest} {c.oldest === 1 ? 'día' : 'días'} de mora</span> : <span className="text-muted">Vence {date(c.oldestDue)}</span>) },
              {
                key: 'act',
                header: '',
                align: 'right',
                render: (c) =>
                  canPay && c.id !== 'sin-cliente' ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Banknote}
                      onClick={(e) => {
                        e.stopPropagation()
                        setModal({ open: true, partnerId: c.id })
                      }}
                    >
                      Abonar
                    </Button>
                  ) : null,
              },
            ]}
            empty={<p className="px-5 py-10 text-center text-sm text-muted">No hay clientes con saldo pendiente.</p>}
          />
        )}
      </Card>

      <ReceiptModal open={modal.open} initialPartner={modal.partnerId} invoices={invoices} clients={computed.clients} onClose={() => setModal({ open: false, partnerId: '' })} />
    </>
  )
}

// ============================================================================ abono a cartera (registerReceipt de Flutter)

const byOldest = (a: Invoice, b: Invoice) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || (a.date ?? '').localeCompare(b.date ?? '')

function distribute(open: Invoice[], amount: number) {
  let left = amount
  const parts: { invoice: Invoice; pay: number }[] = []
  for (const inv of [...open].sort(byOldest)) {
    if (left <= 0.5) break
    const bal = toNum(inv.balance)
    const pay = Math.min(left, bal)
    parts.push({ invoice: inv, pay })
    left -= pay
  }
  return { parts, left }
}

function ReceiptModal({ open, onClose, initialPartner, invoices, clients }: { open: boolean; onClose: () => void; initialPartner: string; invoices: Invoice[]; clients: ClientRow[] }) {
  const { toast } = useFeedback()
  const { me } = useAuth()
  const [partnerId, setPartnerId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('efectivo')
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setPartnerId(initialPartner)
    setAmount('')
    setMethod('efectivo')
    setReference('')
  }, [open, initialPartner])

  const selectable = clients.filter((c) => c.id !== 'sin-cliente')
  const client = selectable.find((c) => c.id === partnerId)
  const open_ = invoices.filter((i) => i.partner?.id === partnerId)
  const value = Number(String(amount).replace(',', '.')) || 0
  const plan = distribute(open_, value)

  async function submit() {
    if (!partnerId) return toast('Selecciona el cliente', 'error')
    if (value <= 0) return toast('Ingresa un valor mayor que cero', 'error')
    setSaving(true)
    try {
      // Saldos frescos del servidor para no repartir sobre datos desactualizados
      const fresh = await gql<{ receivables: Invoice[] }>('query($p:ID){ receivables(partnerId:$p){ id number date dueDate total paid balance partner{ id name } } }', { p: partnerId })
      if (fresh.receivables.length === 0) throw new Error('El cliente no tiene saldo pendiente')
      const { parts, left } = distribute(fresh.receivables, value)
      if (left > 0.5) throw new Error(`El valor supera el saldo del cliente en ${money(left)}`)
      if (parts.length > 40) throw new Error(`El abono toca ${parts.length} facturas y el máximo es 40 por guardado. Registra abonos más pequeños.`)
      const base = docNumber('RC')
      const changes: Change[] = parts.map((p, i) => ({
        table: 'payments',
        row: { id: uuid(), number: parts.length > 1 ? `${base}-${i + 1}` : base, kind: 'abono', sale_id: p.invoice.id, partner_id: partnerId, date: nowLocal(), method, amount: p.pay, reference: reference.trim() || null, user_id: me!.user.id },
      }))
      await saveRecords(changes)
      toast(`Abono de ${money(value)} aplicado a ${parts.length} ${parts.length === 1 ? 'factura' : 'facturas'}`)
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
      title="Registrar abono"
      subtitle="El valor se reparte entre las facturas más antiguas del cliente"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={Banknote} loading={saving} onClick={submit}>
            Registrar abono
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Cliente" required>
          <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">Selecciona…</option>
            {selectable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · saldo {money(c.balance)}
              </option>
            ))}
          </Select>
        </Field>
        {client && (
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="Saldo del cliente" value={money(client.balance)} />
            <MiniStat label="Vencido" value={money(client.overdue)} tone={client.overdue > 0 ? 'danger' : 'neutral'} />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor" required error={client && value > client.balance + 0.5 ? `Supera el saldo (${money(client.balance)})` : undefined}>
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
        </div>
        {client && (
          <Button variant="ghost" size="sm" onClick={() => setAmount(String(Math.round(client.balance)))}>
            Saldar todo ({money(client.balance)})
          </Button>
        )}
        <Field label="Referencia" hint="Opcional: número de transferencia o comprobante">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        {client && value > 0 && plan.parts.length > 0 && (
          <div className="rounded-2xl bg-canvas p-4">
            <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Se aplicará a</p>
            <ul className="space-y-1.5 text-sm">
              {plan.parts.map((p) => (
                <li key={p.invoice.id} className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-brand-700">{p.invoice.number}</span>
                  <span className="text-muted">{daysLate(p.invoice.dueDate) > 0 ? `${daysLate(p.invoice.dueDate)} días de mora` : 'Al día'}</span>
                  <span className="font-semibold tabular-nums">{money(p.pay)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
