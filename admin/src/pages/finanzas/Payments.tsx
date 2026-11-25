import { Banknote, CalendarDays, CreditCard, Download, HandCoins, ReceiptText, Tag, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CHART, Donut, KpiCard } from '../../components/charts'
import { Badge, Button, Card, DataTable, EmptyState, ErrorBox, Field, FilterSelect, Input, Modal, NameCell, PageHeader, SearchInput, Select, Toolbar, useFeedback, ICON } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { date, dateTime, delta, money, qty, toNum } from '../../lib/format'
import { docNumber, exportCsv, nowLocal, saveRecords, today } from '../../lib/records'
import { useGql } from '../../lib/useGql'
import { dailySeries, DetailItem, DetailList, METHOD_ICON, METHOD_LABEL, METHOD_OPTIONS, PALETTE, parseAmount, previousRange, RANGES, rangeDates, type RangeKey } from './_shared'

interface Payment {
  id: string
  number: string | null
  kind: string | null
  date: string | null
  method: string | null
  amount: number
  reference: string | null
  saleId: string | null
  notes: string | null
  partner: { id: string; name: string | null } | null
  sale: { number: string | null } | null
}

const Q = `query($from:String,$to:String,$pf:String,$pt:String){
  cur: payments(from:$from, to:$to, limit:500){ id number kind date method amount reference saleId notes partner{ id name } sale{ number } }
  prev: payments(from:$pf, to:$pt, limit:500){ id method amount }
}`

const KIND_OPTIONS = [
  { value: 'all', label: 'Todos los tipos' },
  { value: 'venta', label: 'Venta de contado' },
  { value: 'abono', label: 'Abono a cartera' },
]
const METHOD_FILTER = [{ value: 'all', label: 'Todos los medios' }, ...METHOD_OPTIONS]

export default function Payments() {
  const { can } = useAuth()
  const canWrite = can('payments', 'write')
  const [range, setRange] = useState<RangeKey>('30')
  const [kind, setKind] = useState('all')
  const [method, setMethod] = useState('all')
  const [search, setSearch] = useState('')
  const [abono, setAbono] = useState(false)
  const [detail, setDetail] = useState<Payment | null>(null)

  const { from, to } = useMemo(() => rangeDates(range), [range])
  const prev = useMemo(() => previousRange(from, to), [from, to])
  const { data, loading, error } = useGql<{ cur: Payment[]; prev: { id: string; method: string; amount: number }[] }>(Q, { from, to, pf: prev.from, pt: prev.to })
  const rows = useMemo(() => data?.cur ?? [], [data])
  const prevRows = useMemo(() => data?.prev ?? [], [data])

  const stats = useMemo(() => {
    const sum = (r: { amount: number }[]) => r.reduce((s, x) => s + toNum(x.amount), 0)
    const isCash = (m: string | null) => m === 'efectivo'
    const day = (r: Payment) => r.date ?? ''
    return {
      total: sum(rows),
      prevTotal: sum(prevRows),
      count: rows.length,
      cash: sum(rows.filter((r) => isCash(r.method))),
      prevCash: sum(prevRows.filter((r) => isCash(r.method))),
      elec: sum(rows.filter((r) => !isCash(r.method))),
      prevElec: sum(prevRows.filter((r) => !isCash(r.method))),
      sTotal: dailySeries(rows, from, to, day, (r) => toNum(r.amount)),
      sCount: dailySeries(rows, from, to, day, () => 1),
      sCash: dailySeries(rows.filter((r) => isCash(r.method)), from, to, day, (r) => toNum(r.amount)),
      sElec: dailySeries(rows.filter((r) => !isCash(r.method)), from, to, day, (r) => toNum(r.amount)),
    }
  }, [rows, prevRows, from, to])

  const donut = useMemo(() => {
    const acc = new Map<string, number>()
    for (const r of rows) acc.set(r.method ?? 'otro', (acc.get(r.method ?? 'otro') ?? 0) + toNum(r.amount))
    return [...acc.entries()].sort((a, b) => b[1] - a[1]).map(([m, v], i) => ({ name: METHOD_LABEL[m] ?? m, value: v, color: PALETTE[i % PALETTE.length] }))
  }, [rows])

  const byKind = useMemo(() => {
    const abonos = rows.filter((r) => r.kind === 'abono')
    return { abonos: abonos.reduce((s, r) => s + toNum(r.amount), 0), nAbonos: abonos.length }
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (kind !== 'all' && r.kind !== kind) return false
      if (method !== 'all' && r.method !== method) return false
      if (!q) return true
      return [r.number, r.partner?.name, r.sale?.number, r.reference].some((v) => String(v ?? '').toLowerCase().includes(q))
    })
  }, [rows, kind, method, search])

  const filteredTotal = filtered.reduce((s, r) => s + toNum(r.amount), 0)

  function download() {
    exportCsv(
      'recibos_de_caja',
      filtered.map((r) => ({
        number: r.number,
        date: r.date,
        partner: r.partner?.name ?? 'Consumidor final',
        sale: r.sale?.number,
        kind: r.kind === 'abono' ? 'Abono a cartera' : 'Venta de contado',
        method: METHOD_LABEL[r.method ?? ''] ?? r.method,
        reference: r.reference,
        amount: r.amount,
      })),
      [
        { key: 'number', label: 'Recibo' },
        { key: 'date', label: 'Fecha' },
        { key: 'partner', label: 'Cliente' },
        { key: 'sale', label: 'Documento' },
        { key: 'kind', label: 'Tipo' },
        { key: 'method', label: 'Medio de pago' },
        { key: 'reference', label: 'Referencia' },
        { key: 'amount', label: 'Valor' },
      ],
    )
  }

  return (
    <>
      <PageHeader
        title="Recibos de caja"
        subtitle="Cobros de ventas de contado y abonos a cartera, por medio de pago."
        actions={
          <>
            <FilterSelect icon={CalendarDays} value={range} onChange={setRange} options={RANGES} />
            {canWrite && (
              <Button icon={HandCoins} onClick={() => setAbono(true)}>
                Registrar abono
              </Button>
            )}
          </>
        }
      />
      <ErrorBox error={error} />

      <div className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={Wallet} label="Recaudo del periodo" value={money(stats.total)} delta={delta(stats.total, stats.prevTotal)} series={stats.sTotal} />
          <KpiCard icon={ReceiptText} label="Número de recibos" value={qty(stats.count)} delta={delta(stats.count, prevRows.length)} series={stats.sCount} tone="info" />
          <KpiCard icon={Banknote} label="Efectivo" value={money(stats.cash)} delta={delta(stats.cash, stats.prevCash)} series={stats.sCash} tone="success" />
          <KpiCard icon={CreditCard} label="Medios electrónicos" value={money(stats.elec)} delta={delta(stats.elec, stats.prevElec)} series={stats.sElec} tone="warning" />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <Card title="Recaudo por medio de pago" subtitle="Total del periodo seleccionado" className="xl:col-span-2">
            {donut.length ? <Donut data={donut} height={200} /> : <p className="text-sm text-muted">Sin recaudos en el periodo.</p>}
          </Card>
          <Card title="Composición del recaudo" subtitle="Ventas de contado frente a abonos de cartera">
            <div className="space-y-3 text-sm">
              <Split label="Ventas de contado" value={stats.total - byKind.abonos} total={stats.total} color={CHART.brand2} />
              <Split label="Abonos a cartera" value={byKind.abonos} total={stats.total} color={CHART.brand} extra={`${byKind.nAbonos} recibos`} />
              <p className="pt-2 text-xs text-muted">Los abonos reducen la cartera por cobrar del cliente al aplicarse a sus facturas más antiguas.</p>
            </div>
          </Card>
        </div>

        <Card padded={false} className="pt-5">
          <Toolbar
            actions={
              <Button variant="secondary" icon={Download} onClick={download} disabled={!filtered.length}>
                Exportar CSV
              </Button>
            }
          >
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar por recibo, cliente o documento…" />
            <FilterSelect value={kind} onChange={setKind} options={KIND_OPTIONS} icon={Tag} />
            <FilterSelect value={method} onChange={setMethod} options={METHOD_FILTER} icon={CreditCard} />
          </Toolbar>
          <DataTable<Payment>
            rows={filtered}
            loading={loading}
            onRowClick={setDetail}
            footer={
              <span>
                {qty(filtered.length)} recibos · <strong className="text-ink">{money(filteredTotal)}</strong>
                {rows.length >= 500 && ' · se muestran los 500 más recientes del periodo'}
              </span>
            }
            columns={[
              { key: 'number', header: 'Recibo', render: (r) => <span className="font-semibold text-brand-700">{r.number ?? '—'}</span> },
              { key: 'date', header: 'Fecha', hideSm: true, render: (r) => <span className="text-muted">{dateTime(r.date)}</span> },
              { key: 'partner', header: 'Cliente', render: (r) => (r.partner?.name ? <NameCell name={r.partner.name} sub={r.reference ? `Ref. ${r.reference}` : undefined} /> : <span className="text-muted">Consumidor final</span>) },
              { key: 'sale', header: 'Documento', hideSm: true, render: (r) => r.sale?.number ?? '—' },
              { key: 'kind', header: 'Tipo', render: (r) => <Badge tone={r.kind === 'abono' ? 'info' : 'success'}>{r.kind === 'abono' ? 'Abono' : 'Venta'}</Badge> },
              { key: 'method', header: 'Medio', hideSm: true, render: (r) => <MethodCell method={r.method} /> },
              { key: 'amount', header: 'Valor', align: 'right', render: (r) => <span className="font-semibold">{money(r.amount)}</span> },
            ]}
            empty={<EmptyState icon={ReceiptText} title="No hay recibos" message="Ajusta los filtros o el periodo para ver otros recaudos." />}
          />
        </Card>
      </div>

      <AbonoModal open={abono} onClose={() => setAbono(false)} />

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Recibo ${detail?.number ?? ''}`} subtitle={detail ? dateTime(detail.date) : undefined} size="md" footer={<Button variant="secondary" onClick={() => setDetail(null)}>Cerrar</Button>}>
        {detail && (
          <DetailList>
              <DetailItem label="Valor"><span className="text-lg font-extrabold">{money(detail.amount)}</span></DetailItem>
              <DetailItem label="Tipo"><Badge tone={detail.kind === 'abono' ? 'info' : 'success'}>{detail.kind === 'abono' ? 'Abono a cartera' : 'Venta de contado'}</Badge></DetailItem>
              <DetailItem label="Cliente">{detail.partner?.name ?? 'Consumidor final'}</DetailItem>
              <DetailItem label="Documento">{detail.sale?.number}</DetailItem>
              <DetailItem label="Medio de pago"><MethodCell method={detail.method} /></DetailItem>
              <DetailItem label="Referencia">{detail.reference}</DetailItem>
              <DetailItem label="Fecha">{date(detail.date)}</DetailItem>
              <DetailItem label="Notas">{detail.notes}</DetailItem>
            </DetailList>
        )}
      </Modal>
    </>
  )
}

function MethodCell({ method }: { method: string | null }) {
  const Icon = METHOD_ICON[method ?? '']
  return (
    <span className="inline-flex items-center gap-2 text-ink-soft">
      {Icon && <Icon {...ICON} className="text-muted" />}
      {METHOD_LABEL[method ?? ''] ?? method ?? '—'}
    </span>
  )
}

function Split({ label, value, total, color, extra }: { label: string; value: number; total: number; color: string; extra?: string }) {
  const p = total > 0 ? (value / total) * 100 : 0
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="font-medium text-ink">{label}</span>
        <span className="font-semibold text-ink">
          {money(value)} <span className="font-normal text-muted">· {p.toLocaleString('es-CO', { maximumFractionDigits: 0 })} %</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-brand-50">
        <div className="h-full rounded-full" style={{ width: `${Math.max(p > 0 ? 2 : 0, p)}%`, background: color }} />
      </div>
      {extra && <p className="mt-1 text-xs text-muted">{extra}</p>}
    </div>
  )
}

// ============================================================================ registrar abono

interface Receivable {
  id: string
  number: string | null
  date: string | null
  dueDate: string | null
  total: number
  balance: number
}
interface DebtPartner {
  id: string
  name: string | null
  docNumber: string | null
  balance: number
}

const DEBTORS_Q = `{ partners(withBalance:true, limit:500){ items{ id name docNumber balance } } }`
const RECV_Q = `query($p:ID){ receivables(partnerId:$p){ id number date dueDate total balance } }`

function AbonoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useAuth()
  const { toast } = useFeedback()
  const [partnerId, setPartnerId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('efectivo')
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)

  const debtors = useGql<{ partners: { items: DebtPartner[] } }>(DEBTORS_Q, {}, { skip: !open })
  const recv = useGql<{ receivables: Receivable[] }>(RECV_Q, { p: partnerId }, { skip: !open || !partnerId })

  // Facturas del cliente de la más antigua a la más reciente (por fecha de emisión).
  const invoices = useMemo(() => [...(recv.data?.receivables ?? [])].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? ''))), [recv.data])
  const totalDebt = invoices.reduce((s, i) => s + toNum(i.balance), 0)
  const value = parseAmount(amount)
  const valid = Number.isFinite(value) && value > 0

  const plan = useMemo(() => {
    const cents = (n: number) => Math.round(n * 100)
    const out: { inv: Receivable; take: number }[] = []
    let left = valid ? cents(value) : 0
    for (const inv of invoices) {
      const take = Math.min(left, cents(toNum(inv.balance)))
      left -= take
      out.push({ inv, take: take / 100 })
    }
    return out
  }, [invoices, value, valid])
  const applied = plan.reduce((s, p) => s + p.take, 0)

  const todayStr = today()
  const err = !partnerId ? 'Selecciona un cliente.' : !valid ? 'Ingresa un valor mayor que cero.' : value > totalDebt + 0.5 ? `El valor supera el saldo del cliente (${money(totalDebt)}).` : ''

  function reset() {
    setPartnerId('')
    setAmount('')
    setMethod('efectivo')
    setReference('')
  }
  const close = () => {
    reset()
    onClose()
  }

  async function submit() {
    if (err || !me) {
      toast(err || 'Sesión no disponible', 'error')
      return
    }
    const parts = plan.filter((p) => p.take > 0)
    const base = docNumber('RC')
    setSaving(true)
    try {
      await saveRecords(
        parts.map((p, i) => ({
          table: 'payments',
          row: {
            kind: 'abono',
            sale_id: p.inv.id,
            partner_id: partnerId,
            method,
            amount: p.take,
            reference: reference.trim() || null,
            number: parts.length > 1 ? `${base}-${i + 1}` : base,
            date: nowLocal(),
            user_id: me.user.id,
          },
        })),
      )
      toast(`Abono de ${money(applied)} registrado en ${parts.length} ${parts.length === 1 ? 'factura' : 'facturas'}`)
      close()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const items = debtors.data?.partners.items ?? []

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title="Registrar abono"
      subtitle="El valor se aplica a las facturas a crédito más antiguas del cliente."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button icon={HandCoins} loading={saving} disabled={!!err} onClick={submit}>
            Registrar abono
          </Button>
        </>
      }
    >
      <ErrorBox error={debtors.error ?? recv.error} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Cliente con saldo" required className="sm:col-span-2" hint={!debtors.loading && items.length === 0 ? 'Ningún cliente tiene cartera pendiente.' : undefined}>
          <Select
            value={partnerId}
            onChange={(e) => {
              setPartnerId(e.target.value)
              setAmount('')
            }}
          >
            <option value="">Selecciona…</option>
            {items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · saldo {money(p.balance)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valor del abono" required hint={totalDebt ? `Saldo total: ${money(totalDebt)}` : undefined}>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-muted">$</span>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="pl-7" />
          </div>
        </Field>
        <Field label="Medio de pago" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHOD_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Referencia" className="sm:col-span-2" hint="Número de transferencia, voucher o consignación (opcional).">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej. 8841203" />
        </Field>
      </div>

      {partnerId && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-ink">Aplicación a facturas</h3>
            {totalDebt > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setAmount(String(Math.round(totalDebt * 100) / 100))}>
                Abonar saldo total
              </Button>
            )}
          </div>
          {recv.loading && invoices.length === 0 ? (
            <p className="text-sm text-muted">Cargando facturas…</p>
          ) : (
            <div className="scrollbar-thin overflow-x-auto rounded-2xl border border-line">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="bg-canvas/60 text-left text-[11px] font-bold tracking-wider text-muted uppercase">
                    <th className="px-4 py-2.5">Factura</th>
                    <th className="px-4 py-2.5">Vence</th>
                    <th className="px-4 py-2.5 text-right">Saldo</th>
                    <th className="px-4 py-2.5 text-right">Se abona</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map(({ inv, take }) => (
                    <tr key={inv.id} className="border-t border-line">
                      <td className="px-4 py-2.5 font-semibold text-brand-700">{inv.number}</td>
                      <td className="px-4 py-2.5">
                        {inv.dueDate ? date(inv.dueDate) : '—'} {inv.dueDate && inv.dueDate.slice(0, 10) < todayStr && <Badge tone="danger">Vencida</Badge>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(inv.balance)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{take > 0 ? money(take) : '—'}</td>
                    </tr>
                  ))}
                  {plan.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-4 text-center text-muted">
                        Este cliente no tiene facturas con saldo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {err && value > 0 && <p className="mt-2 text-xs text-danger">{err}</p>}
        </div>
      )}
    </Modal>
  )
}
