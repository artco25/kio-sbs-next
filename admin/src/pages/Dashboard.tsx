import { CalendarDays, Download, HandCoins, Package, PiggyBank, Receipt, ShoppingBag, Tag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AreaTrend, Bars, CHART, Donut, Heatmap, KpiCard, RadarCompare, RankRow } from '../components/charts'
import { Badge, Button, Card, DataTable, ErrorBox, FilterSelect, NameCell, PageHeader, Spinner, StatusBadge } from '../components/ui'
import { useAuth } from '../lib/auth'
import { delta, money, monthLabel, qty, relative, toNum } from '../lib/format'
import { addDays, exportCsv, today } from '../lib/records'
import { useGql } from '../lib/useGql'

type RangeKey = 'hoy' | '7' | '30' | 'mes' | '90' | 'anio'
const RANGES: { value: RangeKey; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: 'mes', label: 'Este mes' },
  { value: '90', label: 'Últimos 90 días' },
  { value: 'anio', label: 'Este año' },
]

function rangeDates(r: RangeKey) {
  const to = today()
  switch (r) {
    case 'hoy':
      return { from: to, to }
    case 'mes':
      return { from: `${to.slice(0, 7)}-01`, to }
    case 'anio':
      return { from: `${to.slice(0, 4)}-01-01`, to }
    default:
      return { from: addDays(to, -(Number(r) - 1)), to }
  }
}

interface SaleRow {
  id: string
  number: string
  channel: string
  date: string
  status: string
  paymentMode: string
  total: number
  paid: number
  partner: { name: string } | null
  seller: { name: string } | null
}

interface DashboardData {
  dashboard: {
    kpis: { key: string; label: string; value: number; previous: number }[]
    months: { month: string; sales: number; expenses: number }[]
    aging: { bucket: string; amount: number; count: number }[]
    topProducts: { name: string; qty: number; total: number }[]
    daily: { date: string; sales: number; orders: number; expenses: number }[]
    heatmap: { weekday: number; hour: number; amount: number; count: number }[]
    byMethod: { method: string; amount: number; count: number }[]
    recent: SaleRow[]
  }
  products: { items: { id: string; name: string; stock: number; minStock: number; unit: string }[] }
}

const Q = `query($from:String,$to:String){
  dashboard(from:$from, to:$to){
    kpis{ key label value previous }
    months{ month sales expenses }
    aging{ bucket amount count }
    topProducts{ name qty total }
    daily{ date sales orders expenses }
    heatmap{ weekday hour amount count }
    byMethod{ method amount count }
    recent{ id number channel date status paymentMode total paid partner{ name } seller{ name } }
  }
  products(lowStock:true, limit:6){ items{ id name stock minStock unit } }
}`

const METHOD_LABEL: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', nequi: 'Nequi / Daviplata' }
const METHOD_COLOR = [CHART.brand, CHART.brand2, CHART.soft, '#C7D2FE', '#1E1B4B']
const AGING_COLOR: Record<string, string> = { Corriente: 'bg-success', '1-30': 'bg-brand-500', '31-60': 'bg-warning', '61-90': 'bg-[#EA580C]', '+90': 'bg-danger' }
const DAY_NAMES = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados']

export default function Dashboard() {
  const auth = useAuth()
  if (!auth.isFinance) return <OperatorHome />
  return <FinanceDashboard />
}

function FinanceDashboard() {
  const navigate = useNavigate()
  const [range, setRange] = useState<RangeKey>('30')
  const vars = useMemo(() => rangeDates(range), [range])
  const { data, loading, error } = useGql<DashboardData>(Q, vars)
  const d = data?.dashboard
  const kpi = (k: string) => d?.kpis.find((x) => x.key === k) ?? { value: 0, previous: 0 }

  const daily = d?.daily ?? []
  const ventas = kpi('ventas')
  const pedidos = kpi('pedidos')
  const ticket = kpi('ticket')
  const gastos = kpi('gastos')
  const nomina = kpi('nomina')
  const utilidad = ventas.value - gastos.value - nomina.value
  const utilidadPrev = ventas.previous - gastos.previous - nomina.previous

  const radar = useMemo(() => {
    const pairs: [string, number, number][] = [
      ['Ventas', ventas.value, ventas.previous],
      ['Pedidos', pedidos.value, pedidos.previous],
      ['Ticket medio', ticket.value, ticket.previous],
      ['Utilidad', Math.max(0, utilidad), Math.max(0, utilidadPrev)],
      ['Gasto bajo', 1 / (1 + gastos.value), 1 / (1 + gastos.previous)],
    ]
    return pairs.map(([metric, a, b]) => {
      const m = Math.max(a, b) || 1
      return { metric, actual: (a / m) * 100, anterior: (b / m) * 100 }
    })
  }, [ventas, pedidos, ticket, gastos, utilidad, utilidadPrev])

  const peak = useMemo(() => {
    const best = [...(d?.heatmap ?? [])].sort((a, b) => b.amount - a.amount)[0]
    if (!best) return null
    const h = best.hour
    return `Mayor venta los ${DAY_NAMES[best.weekday]} entre ${h > 12 ? h - 12 : h} y ${h + 2 > 12 ? h + 2 - 12 : h + 2} ${h + 2 >= 12 ? 'p. m.' : 'a. m.'}`
  }, [d])

  const receivable = kpi('cartera').value
  const overdue = kpi('vencida').value

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Resumen de ventas, cartera, gastos y operación de tus cajas."
        actions={
          <>
            <FilterSelect icon={CalendarDays} value={range} onChange={setRange} options={RANGES} />
            <Button
              icon={Download}
              onClick={() =>
                exportCsv('reporte_ventas', daily, [
                  { key: 'date', label: 'Fecha' },
                  { key: 'orders', label: 'Ventas' },
                  { key: 'sales', label: 'Total vendido' },
                  { key: 'expenses', label: 'Gastos' },
                ])
              }
            >
              Exportar reporte
            </Button>
          </>
        }
      />
      <ErrorBox error={error} />
      {!d && loading ? (
        <div className="flex justify-center py-24">
          <Spinner />
        </div>
      ) : d ? (
        <div className="space-y-6">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={ShoppingBag} label="Ventas totales" value={money(ventas.value)} delta={delta(ventas.value, ventas.previous)} series={daily.map((x) => x.sales)} />
            <KpiCard icon={Receipt} label="Número de ventas" value={qty(pedidos.value)} delta={delta(pedidos.value, pedidos.previous)} series={daily.map((x) => x.orders)} tone="info" />
            <KpiCard icon={Tag} label="Ticket medio" value={money(ticket.value)} delta={delta(ticket.value, ticket.previous)} series={daily.map((x) => (x.orders ? x.sales / x.orders : 0))} tone="warning" />
            <KpiCard icon={PiggyBank} label="Utilidad operativa" value={money(utilidad)} delta={delta(utilidad, utilidadPrev)} series={daily.map((x) => x.sales - x.expenses)} tone="success" />
          </div>

          <div className="grid gap-6 xl:grid-cols-5">
            <Card className="xl:col-span-3" title="Actividad de ventas" subtitle={peak ?? 'Aún no hay ventas con hora registrada en el periodo.'}>
              <Heatmap cells={d.heatmap} />
            </Card>
            <Card className="xl:col-span-2" title="Indicadores del negocio" subtitle="Este periodo frente al anterior">
              <RadarCompare data={radar} />
              <div className="mt-2 flex justify-center gap-5 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-600" /> Este periodo
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-300" /> Periodo anterior
                </span>
              </div>
            </Card>
          </div>

          <Card title="Transacciones recientes" subtitle="Últimas ventas de cajas y pedidos" padded={false} actions={<Button variant="secondary" size="sm" onClick={() => navigate('/ventas/pedidos')}>Ver todas</Button>}>
            <div className="pt-4">
              <DataTable<SaleRow>
                rows={d.recent}
                onRowClick={(r) => navigate(`/ventas/pedidos/${r.id}`)}
                columns={[
                  { key: 'number', header: 'Documento', render: (r) => <span className="font-semibold text-brand-700">{r.number}</span> },
                  { key: 'partner', header: 'Cliente', render: (r) => <NameCell name={r.partner?.name ?? 'Consumidor final'} sub={r.seller?.name} /> },
                  { key: 'channel', header: 'Canal', hideSm: true, render: (r) => <Badge tone={r.channel === 'pos' ? 'brand' : 'info'}>{r.channel === 'pos' ? 'Caja POS' : 'Pedido'}</Badge> },
                  { key: 'total', header: 'Total', align: 'right', render: (r) => <span className="font-semibold">{money(r.total)}</span> },
                  { key: 'pago', header: 'Pago', render: (r) => <PaymentState sale={r} /> },
                  { key: 'date', header: 'Fecha', hideSm: true, render: (r) => <span className="text-muted">{relative(r.date)}</span> },
                ]}
                empty={<p className="px-5 pb-6 text-sm text-muted">Aún no hay ventas registradas.</p>}
              />
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-5">
            <Card className="xl:col-span-3" title="Ingresos de 12 meses" subtitle="Ventas confirmadas frente a gastos aprobados">
              <AreaTrend
                data={d.months.map((m) => ({ ...m, label: monthLabel(m.month) }))}
                xKey="label"
                series={[
                  { key: 'sales', label: 'Ventas', color: CHART.brand },
                  { key: 'expenses', label: 'Gastos', color: CHART.soft },
                ]}
              />
            </Card>
            <Card className="xl:col-span-2" title="Cartera por edades" subtitle={`Por cobrar ${money(receivable)} · vencida ${money(overdue)}`} actions={<Button variant="secondary" size="sm" icon={HandCoins} onClick={() => navigate('/ventas/cartera')}>Cobrar</Button>}>
              {d.aging.map((a) => (
                <RankRow key={a.bucket} label={a.bucket === 'Corriente' ? 'Al día' : `${a.bucket} días`} value={a.amount} max={Math.max(...d.aging.map((x) => x.amount))} right={`${money(a.amount)} · ${a.count}`} color={AGING_COLOR[a.bucket]} />
              ))}
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            <Card title="Productos más vendidos">
              {d.topProducts.length ? (
                <Bars horizontal height={Math.max(160, d.topProducts.length * 44)} data={d.topProducts.map((p) => ({ name: p.name, total: p.total }))} xKey="name" series={[{ key: 'total', label: 'Vendido', color: CHART.brand2 }]} />
              ) : (
                <p className="text-sm text-muted">Sin ventas en el periodo.</p>
              )}
            </Card>
            <Card title="Medios de pago">
              {d.byMethod.length ? (
                <Donut data={d.byMethod.map((m, i) => ({ name: METHOD_LABEL[m.method] ?? m.method, value: m.amount, color: METHOD_COLOR[i % METHOD_COLOR.length] }))} />
              ) : (
                <p className="text-sm text-muted">Sin recaudos en el periodo.</p>
              )}
            </Card>
            <Card title="Stock bajo" subtitle="Productos en o por debajo del mínimo" actions={<Button variant="secondary" size="sm" icon={Package} onClick={() => navigate('/inventario/existencias')}>Inventario</Button>}>
              {data!.products.items.length === 0 ? (
                <p className="text-sm text-muted">Todo el inventario está sobre el mínimo.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data!.products.items.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="truncate text-sm font-medium">{p.name}</span>
                      <Badge tone={p.stock <= 0 ? 'danger' : 'warning'}>
                        {qty(p.stock)} / mín. {qty(p.minStock)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      ) : null}
    </>
  )
}

export function PaymentState({ sale }: { sale: { status: string; total: number; paid: number; paymentMode: string } }) {
  if (sale.status !== 'confirmada') return <StatusBadge status={sale.status} />
  const bal = toNum(sale.total) - toNum(sale.paid)
  if (bal <= 0.5) return <StatusBadge status="pagada" />
  return <StatusBadge status={toNum(sale.paid) > 0 ? 'parcial' : 'por_cobrar'} />
}

const OPQ = `query($from:String){ sales(from:$from, limit:8){ total amount items{ id number channel date status paymentMode total paid partner{ name } seller{ name } } } }`

/** Inicio para cajeros y vendedores (sin acceso a finanzas). */
function OperatorHome() {
  const navigate = useNavigate()
  const { data, error } = useGql<{ sales: { total: number; amount: number; items: SaleRow[] } }>(OPQ, { from: today() })
  return (
    <>
      <PageHeader title="Inicio" subtitle="Tus ventas de hoy." />
      <ErrorBox error={error} />
      <div className="grid gap-5 sm:grid-cols-2">
        <KpiCard icon={ShoppingBag} label="Vendido hoy" value={money(data?.sales.amount ?? 0)} />
        <KpiCard icon={Receipt} label="Ventas de hoy" value={qty(data?.sales.total ?? 0)} tone="info" />
      </div>
      <Card className="mt-6" title="Últimas ventas" padded={false}>
        <div className="pt-4">
          <DataTable<SaleRow>
            rows={data?.sales.items ?? []}
            onRowClick={(r) => navigate(`/ventas/pedidos/${r.id}`)}
            columns={[
              { key: 'number', header: 'Documento', render: (r) => <span className="font-semibold text-brand-700">{r.number}</span> },
              { key: 'partner', header: 'Cliente', render: (r) => <NameCell name={r.partner?.name ?? 'Consumidor final'} /> },
              { key: 'total', header: 'Total', align: 'right', render: (r) => money(r.total) },
              { key: 'pago', header: 'Pago', render: (r) => <PaymentState sale={r} /> },
              { key: 'date', header: 'Fecha', render: (r) => relative(r.date) },
            ]}
          />
        </div>
      </Card>
    </>
  )
}
