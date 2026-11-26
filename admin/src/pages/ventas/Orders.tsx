import { CalendarDays, Download, HandCoins, MapPin, Plus, Receipt, ShoppingBag, Tag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KpiCard } from '../../components/charts'
import { Button, Card, DataTable, ErrorBox, FilterSelect, NameCell, PageHeader, SearchInput, Tabs, Toolbar } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { delta, money, qty, relative, toNum } from '../../lib/format'
import { exportCsv, today } from '../../lib/records'
import { useDebounced, useGql } from '../../lib/useGql'
import { PaymentState } from '../Dashboard'
import { ChannelBadge, dailySeries, PERIODS, periodDates, previousDates, type PeriodKey } from './_shared'

interface SaleRow {
  id: string
  number: string
  channel: string
  date: string
  status: string
  paymentMode: string
  total: number
  paid: number
  siteId: string | null
  partner: { name: string } | null
  seller: { name: string } | null
}
interface Site { id: string; name: string }

interface Data {
  list: { total: number; amount: number; items: SaleRow[] }
  confirmed: { total: number; amount: number; items: { date: string; total: number }[] }
  prev: { total: number; amount: number }
  nAll: { total: number }
  nPedido: { total: number }
  nPos: { total: number }
  nBorrador: { total: number }
  nDevuelta: { total: number }
  nAnulada: { total: number }
  receivables: { balance: number; dueDate: string | null }[]
  sites: Site[]
}

const Q = `query($from:String,$to:String,$pfrom:String,$pto:String,$channel:String,$status:String,$search:String,$siteId:ID){
  list: sales(from:$from, to:$to, channel:$channel, status:$status, search:$search, siteId:$siteId, limit:500){
    total amount items{ id number channel date status paymentMode total paid siteId partner{ name } seller{ name } }
  }
  confirmed: sales(from:$from, to:$to, status:"confirmada", siteId:$siteId, limit:500){ total amount items{ date total } }
  prev: sales(from:$pfrom, to:$pto, status:"confirmada", siteId:$siteId, limit:1){ total amount }
  nAll: sales(from:$from, to:$to, siteId:$siteId, limit:1){ total }
  nPedido: sales(from:$from, to:$to, channel:"pedido", siteId:$siteId, limit:1){ total }
  nPos: sales(from:$from, to:$to, channel:"pos", siteId:$siteId, limit:1){ total }
  nBorrador: sales(from:$from, to:$to, status:"borrador", siteId:$siteId, limit:1){ total }
  nDevuelta: sales(from:$from, to:$to, status:"devuelta", siteId:$siteId, limit:1){ total }
  nAnulada: sales(from:$from, to:$to, status:"anulada", siteId:$siteId, limit:1){ total }
  receivables{ balance dueDate }
  sites{ id name }
}`

type TabKey = 'todas' | 'pedidos' | 'pos' | 'cotizaciones' | 'devueltas' | 'anuladas'
type StateKey = 'todos' | 'pagada' | 'parcial' | 'por_cobrar'

const stateOf = (s: SaleRow): StateKey | 'otro' => {
  if (s.status !== 'confirmada') return 'otro'
  const bal = toNum(s.total) - toNum(s.paid)
  if (bal <= 0.5) return 'pagada'
  return toNum(s.paid) > 0 ? 'parcial' : 'por_cobrar'
}

export default function Orders() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const [period, setPeriod] = useState<PeriodKey>('30')
  const [tab, setTab] = useState<TabKey>('todas')
  const [search, setSearch] = useState('')
  const [state, setState] = useState<StateKey>('todos')
  const [siteId, setSiteId] = useState('')
  const q = useDebounced(search.trim(), 300)

  const dates = useMemo(() => periodDates(period), [period])
  const prevDates = useMemo(() => previousDates(dates), [dates])
  const vars = {
    ...dates,
    pfrom: prevDates.from,
    pto: prevDates.to,
    channel: tab === 'pedidos' ? 'pedido' : tab === 'pos' ? 'pos' : null,
    status: tab === 'cotizaciones' ? 'borrador' : tab === 'devueltas' ? 'devuelta' : tab === 'anuladas' ? 'anulada' : null,
    search: q || null,
    siteId: siteId || null,
  }
  const { data, loading, error } = useGql<Data>(Q, vars)

  const rows = useMemo(() => (data?.list.items ?? []).filter((s) => state === 'todos' || stateOf(s) === state), [data, state])

  const vendido = data?.confirmed.amount ?? 0
  const nVentas = data?.confirmed.total ?? 0
  const ticket = nVentas ? vendido / nVentas : 0
  const prevTicket = data?.prev.total ? data.prev.amount / data.prev.total : 0
  const salesSeries = useMemo(() => dailySeries((data?.confirmed.items ?? []).map((s) => ({ date: s.date, value: toNum(s.total) })), dates.from, dates.to), [data, dates])
  const countSeries = useMemo(() => dailySeries((data?.confirmed.items ?? []).map((s) => ({ date: s.date, value: 1 })), dates.from, dates.to), [data, dates])
  const ticketSeries = useMemo(() => salesSeries.map((v, i) => (countSeries[i] ? v / countSeries[i] : 0)), [salesSeries, countSeries])
  const receivable = (data?.receivables ?? []).reduce((s, r) => s + toNum(r.balance), 0)
  const hoy = today()
  const overdue = (data?.receivables ?? []).filter((r) => r.dueDate && r.dueDate.slice(0, 10) < hoy).reduce((s, r) => s + toNum(r.balance), 0)

  const truncated = (data?.list.total ?? 0) > (data?.list.items.length ?? 0)
  const siteOptions = useMemo(() => [{ value: '', label: 'Todas las sedes' }, ...(data?.sites ?? []).map((s) => ({ value: s.id, label: s.name }))], [data?.sites])

  return (
    <>
      <PageHeader
        title="Ventas y pedidos"
        subtitle="Pedidos, ventas de caja y cotizaciones del periodo seleccionado."
        actions={
          <>
            <FilterSelect icon={CalendarDays} value={period} onChange={setPeriod} options={PERIODS} />
            {can('sales', 'write') && (
              <Button icon={Plus} onClick={() => navigate('/ventas/pedidos/nuevo')}>
                Nuevo pedido
              </Button>
            )}
          </>
        }
      />
      <ErrorBox error={error} />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={ShoppingBag} label="Vendido" value={money(vendido)} delta={delta(vendido, data?.prev.amount ?? 0)} series={salesSeries} />
        <KpiCard icon={Receipt} label="Número de ventas" value={qty(nVentas)} delta={delta(nVentas, data?.prev.total ?? 0)} series={countSeries} tone="info" />
        <KpiCard icon={Tag} label="Ticket medio" value={money(ticket)} delta={delta(ticket, prevTicket)} series={ticketSeries} tone="warning" />
        <KpiCard icon={HandCoins} label="Por cobrar" value={money(receivable)} tone="danger" hint={overdue > 0 ? `${money(overdue)} vencido` : 'Cartera de clientes al día'} />
      </div>

      <div className="mt-6 mb-4">
        <Tabs<TabKey>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'todas', label: 'Todas', count: data?.nAll.total },
            { key: 'pedidos', label: 'Pedidos', count: data?.nPedido.total },
            { key: 'pos', label: 'Caja POS', count: data?.nPos.total },
            { key: 'cotizaciones', label: 'Cotizaciones', count: data?.nBorrador.total },
            { key: 'devueltas', label: 'Devueltas', count: data?.nDevuelta.total },
            { key: 'anuladas', label: 'Anuladas', count: data?.nAnulada.total },
          ]}
        />
      </div>

      <Card padded={false} className="pt-5">
        <Toolbar
          actions={
            <Button
              variant="secondary"
              icon={Download}
              disabled={rows.length === 0}
              onClick={() =>
                exportCsv(
                  'ventas',
                  rows.map((r) => ({
                    number: r.number,
                    partner: r.partner?.name ?? 'Consumidor final',
                    channel: r.channel === 'pos' ? 'Caja POS' : r.channel === 'pedido' ? 'Pedido' : r.channel,
                    seller: r.seller?.name ?? '',
                    date: r.date,
                    status: r.status,
                    total: r.total,
                    paid: r.paid,
                    balance: r.status === 'confirmada' ? Math.max(0, toNum(r.total) - toNum(r.paid)) : 0,
                  })),
                  [
                    { key: 'number', label: 'Documento' },
                    { key: 'partner', label: 'Cliente' },
                    { key: 'channel', label: 'Canal' },
                    { key: 'seller', label: 'Vendedor' },
                    { key: 'date', label: 'Fecha' },
                    { key: 'status', label: 'Estado' },
                    { key: 'total', label: 'Total' },
                    { key: 'paid', label: 'Pagado' },
                    { key: 'balance', label: 'Saldo' },
                  ],
                )
              }
            >
              Exportar CSV
            </Button>
          }
        >
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar por documento o cliente…" />
          <FilterSelect value={siteId} onChange={setSiteId} icon={MapPin} options={siteOptions} />
          <FilterSelect<StateKey>
            value={state}
            onChange={setState}
            options={[
              { value: 'todos', label: 'Todos los estados' },
              { value: 'pagada', label: 'Pagadas' },
              { value: 'parcial', label: 'Pago parcial' },
              { value: 'por_cobrar', label: 'Por cobrar' },
            ]}
          />
        </Toolbar>
        <DataTable<SaleRow>
          rows={rows}
          loading={loading}
          onRowClick={(r) => navigate(`/ventas/pedidos/${r.id}`)}
          footer={truncated ? `Mostrando las ${data!.list.items.length} más recientes de ${data!.list.total}. Acota el periodo para ver el resto.` : `${rows.length} documentos`}
          columns={[
            { key: 'number', header: 'Documento', render: (r) => <span className="font-semibold text-brand-700">{r.number}</span> },
            { key: 'partner', header: 'Cliente', render: (r) => <NameCell name={r.partner?.name ?? 'Consumidor final'} sub={r.paymentMode === 'credito' ? 'A crédito' : undefined} /> },
            { key: 'channel', header: 'Canal', hideSm: true, render: (r) => <ChannelBadge channel={r.channel} /> },
            { key: 'seller', header: 'Vendedor', hideSm: true, render: (r) => <span className="text-ink-soft">{r.seller?.name ?? '—'}</span> },
            { key: 'date', header: 'Fecha', hideSm: true, render: (r) => <span className="text-muted">{relative(r.date)}</span> },
            { key: 'total', header: 'Total', align: 'right', render: (r) => <span className="font-semibold">{money(r.total)}</span> },
            { key: 'pago', header: 'Estado', render: (r) => <PaymentState sale={r} /> },
          ]}
          empty={<p className="px-5 py-10 text-center text-sm text-muted">No hay documentos con estos filtros en el periodo.</p>}
        />
      </Card>
    </>
  )
}
