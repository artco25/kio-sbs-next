import { CalendarDays, CalendarRange, Download, HandCoins, Lock, Package, Percent, Receipt, Scale, ShoppingBag, Tag, TrendingUp, Wallet, PiggyBank } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { AreaTrend, Bars, CHART, Donut, KpiCard, RankRow } from '../../components/charts'
import { Button, Card, cn, DataTable, EmptyState, ErrorBox, FilterSelect, PageHeader, Spinner, Tabs, TONE_SOFT } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { date, money, monthLabel, pct, qty, toNum } from '../../lib/format'
import { exportCsv, today } from '../../lib/records'
import { useGql } from '../../lib/useGql'
import { categoryLabel, monthBounds, monthName, monthOptions, PALETTE, usePaged } from './_shared'

// ============================================================================ consultas

const SALES_Q = `query($from:String,$to:String,$limit:Int,$offset:Int){
  sales(status:"confirmada", from:$from, to:$to, limit:$limit, offset:$offset){
    total
    items{ id number date subtotal taxTotal total lines{ productId name qty taxRate subtotal tax total } }
  }
}`
const PRODUCTS_Q = `query($limit:Int,$offset:Int){ products(limit:$limit, offset:$offset){ total items{ id cost } } }`
const CORE_Q = `query($from:String,$to:String,$p0:String,$p1:String,$p2:String){
  dashboard(from:$from, to:$to){
    daily{ date sales orders }
    months{ month sales expenses }
    aging{ bucket amount count }
  }
  expenses(status:"aprobada", from:$from, to:$to, limit:500){ category amount }
  a: payslips(period:$p0){ status employerCost }
  b: payslips(period:$p1){ status employerCost }
  c: payslips(period:$p2){ status employerCost }
}`

interface SaleLine {
  productId: string | null
  name: string | null
  qty: number
  taxRate: number
  subtotal: number
  tax: number
  total: number
}
interface Sale {
  id: string
  number: string | null
  date: string | null
  subtotal: number
  taxTotal: number
  total: number
  lines: SaleLine[]
}
interface Core {
  dashboard: {
    daily: { date: string; sales: number; orders: number }[]
    months: { month: string; sales: number; expenses: number }[]
    aging: { bucket: string; amount: number; count: number }[]
  }
  expenses: { category: string | null; amount: number }[]
  a: { status: string | null; employerCost: number }[]
  b: { status: string | null; employerCost: number }[]
  c: { status: string | null; employerCost: number }[]
}

type TabKey = 'pyg' | 'diario' | 'mensual' | 'productos' | 'iva' | 'cartera'

const AGING_COLOR: Record<string, string> = { Corriente: 'bg-success', '1-30': 'bg-brand-500', '31-60': 'bg-warning', '61-90': 'bg-[#EA580C]', '+90': 'bg-danger' }
const agingLabel = (b: string) => (b === 'Corriente' ? 'Al día' : `${b} días`)
const NOTE = 'Informe de gestión; no reemplaza los estados financieros bajo NIIF'

export default function Reports() {
  const { isFinance } = useAuth()
  if (!isFinance) {
    return (
      <>
        <PageHeader title="Informes" />
        <Card>
          <EmptyState icon={Lock} title="Sin acceso a informes" message="Los informes financieros están disponibles para administradores y contadores." />
        </Card>
      </>
    )
  }
  return <ReportsView />
}

function ReportsView() {
  const [ym, setYm] = useState(() => today().slice(0, 7))
  const [tab, setTab] = useState<TabKey>('pyg')
  const months = useMemo(() => monthOptions(12), [])
  const { from, to } = useMemo(() => monthBounds(ym), [ym])

  const core = useGql<Core>(CORE_Q, { from, to, p0: ym, p1: `${ym}-Q1`, p2: `${ym}-Q2` })
  const sales = usePaged<Sale>(SALES_Q, { from, to }, 'sales')
  const products = usePaged<{ id: string; cost: number }>(PRODUCTS_Q, {}, 'products')

  const calc = useMemo<Calc>(() => {
    const cost = new Map(products.items.map((p) => [p.id, toNum(p.cost)]))
    let income = 0
    let taxTotal = 0
    let gross = 0
    let cogs = 0
    let noCost = 0
    const prod = new Map<string, { name: string; qty: number; sub: number; total: number; cost: number }>()
    const rates = new Map<number, { base: number; tax: number; lines: number }>()
    let lineTax = 0
    for (const s of sales.items) {
      income += toNum(s.subtotal)
      taxTotal += toNum(s.taxTotal)
      gross += toNum(s.total)
      for (const l of s.lines) {
        const c = l.productId ? (cost.get(l.productId) ?? 0) : 0
        if (!c) noCost++
        const lineCost = toNum(l.qty) * c
        cogs += lineCost
        const key = l.productId ?? `n:${l.name}`
        const p = prod.get(key) ?? { name: l.name ?? 'Sin nombre', qty: 0, sub: 0, total: 0, cost: 0 }
        p.qty += toNum(l.qty)
        p.sub += toNum(l.subtotal)
        p.total += toNum(l.total)
        p.cost += lineCost
        prod.set(key, p)
        const r = Math.round(toNum(l.taxRate) * 10000) / 10000
        const rr = rates.get(r) ?? { base: 0, tax: 0, lines: 0 }
        rr.base += toNum(l.subtotal)
        rr.tax += toNum(l.tax)
        rr.lines++
        rates.set(r, rr)
        lineTax += toNum(l.tax)
      }
    }
    const expByCat = new Map<string, number>()
    for (const e of core.data?.expenses ?? []) expByCat.set(e.category ?? 'otros', (expByCat.get(e.category ?? 'otros') ?? 0) + toNum(e.amount))
    const expenses = [...expByCat.entries()].sort((a, b) => b[1] - a[1])
    const expTotal = expenses.reduce((s, [, v]) => s + v, 0)
    const payroll = [...(core.data?.a ?? []), ...(core.data?.b ?? []), ...(core.data?.c ?? [])].filter((p) => p.status === 'confirmada').reduce((s, p) => s + toNum(p.employerCost), 0)
    const grossProfit = income - cogs
    return {
      income,
      taxTotal,
      gross,
      cogs,
      noCost,
      grossProfit,
      expenses,
      expTotal,
      payroll,
      net: grossProfit - expTotal - payroll,
      lineTax,
      products: [...prod.values()].sort((a, b) => b.sub - a.sub),
      rates: [...rates.entries()].sort((a, b) => b[0] - a[0]),
    }
  }, [sales.items, products.items, core.data])

  const loading = core.loading || sales.loading || products.loading
  const ready = !!core.data && !(sales.loading && sales.items.length === 0 && !sales.error)
  const d = core.data?.dashboard

  const notes: string[] = []
  if (sales.truncated) notes.push('Hay más de 5.000 ventas en el mes: el informe usa las primeras 5.000.')
  if ((core.data?.expenses.length ?? 0) >= 500) notes.push('Se leyeron los primeros 500 gastos aprobados del mes; el total de gastos puede estar incompleto.')

  return (
    <>
      <PageHeader title="Informes" subtitle="Resultados, ventas, impuestos y cartera de la empresa." actions={<FilterSelect icon={CalendarDays} value={ym} onChange={setYm} options={months} />}>
        <Tabs<TabKey>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'pyg', label: 'Estado de resultados', icon: Scale },
            { key: 'diario', label: 'Ventas por día', icon: CalendarRange },
            { key: 'mensual', label: 'Ventas por mes', icon: TrendingUp },
            { key: 'productos', label: 'Más vendidos', icon: Package },
            { key: 'iva', label: 'IVA generado', icon: Percent },
            { key: 'cartera', label: 'Cartera por edades', icon: HandCoins },
          ]}
        />
      </PageHeader>
      <ErrorBox error={core.error ?? sales.error ?? products.error} />
      {notes.map((n) => (
        <div key={n} className={cn('mb-4 rounded-2xl px-4 py-3 text-sm', TONE_SOFT.warning)}>
          {n}
        </div>
      ))}

      {!ready ? (
        <div className="flex justify-center py-24">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          {tab === 'pyg' && <PygReport ym={ym} calc={calc} daily={d?.daily ?? []} busy={loading} />}
          {tab === 'diario' && <DailyReport ym={ym} daily={d?.daily ?? []} />}
          {tab === 'mensual' && <MonthlyReport months={d?.months ?? []} ym={ym} />}
          {tab === 'productos' && <ProductsReport ym={ym} rows={calc.products} />}
          {tab === 'iva' && <TaxReport ym={ym} calc={calc} />}
          {tab === 'cartera' && <AgingReport aging={d?.aging ?? []} />}
          <p className="pb-2 text-center text-xs text-muted">{NOTE}</p>
        </div>
      )}
    </>
  )
}

interface Calc {
  income: number
  taxTotal: number
  gross: number
  cogs: number
  noCost: number
  grossProfit: number
  expenses: [string, number][]
  expTotal: number
  payroll: number
  net: number
  lineTax: number
  products: { name: string; qty: number; sub: number; total: number; cost: number }[]
  rates: [number, { base: number; tax: number; lines: number }][]
}

const ExportButton = ({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) => (
  <Button variant="secondary" size="sm" icon={Download} onClick={onClick} disabled={disabled}>
    Exportar CSV
  </Button>
)

const Neg = ({ v }: { v: number }) => <>{money(-Math.abs(v))}</>

// ============================================================================ a) estado de resultados

interface PygRow {
  id: string
  label: ReactNode
  text: string
  value: number
  kind: 'line' | 'sub' | 'total'
  indent?: boolean
}

function PygReport({ ym, calc, daily, busy }: { ym: string; calc: Calc; daily: { sales: number }[]; busy: boolean }) {
  const income = calc.income
  const ratio = (v: number) => (income ? pct(v / income, 1) : '—')
  const rows: PygRow[] = useMemo(() => {
    const r: PygRow[] = [
      { id: 'inc', text: 'Ingresos por ventas (sin IVA)', label: 'Ingresos por ventas (sin IVA)', value: calc.income, kind: 'line' },
      { id: 'cogs', text: '(-) Costo de la mercancía vendida', label: '(−) Costo de la mercancía vendida', value: -calc.cogs, kind: 'line' },
      { id: 'gp', text: 'Utilidad bruta', label: 'Utilidad bruta', value: calc.grossProfit, kind: 'total' },
    ]
    for (const [c, v] of calc.expenses) r.push({ id: `e-${c}`, text: `Gasto: ${categoryLabel(c)}`, label: categoryLabel(c), value: -v, kind: 'line', indent: true })
    r.push({ id: 'exp', text: '(-) Gastos operacionales', label: '(−) Gastos operacionales', value: -calc.expTotal, kind: 'sub' })
    r.push({ id: 'pay', text: '(-) Nómina (costo empleador)', label: '(−) Nómina (costo empleador)', value: -calc.payroll, kind: 'line' })
    r.push({ id: 'net', text: 'Resultado operacional', label: 'Resultado operacional', value: calc.net, kind: 'total' })
    return r
  }, [calc])

  const download = () =>
    exportCsv(
      `estado_resultados_${ym}`,
      rows.map((r) => ({ concept: r.text, value: r.value, pct: income ? Math.round((r.value / income) * 10000) / 100 : '' })),
      [
        { key: 'concept', label: 'Concepto' },
        { key: 'value', label: 'Valor' },
        { key: 'pct', label: '% de ingresos' },
      ],
    )

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={ShoppingBag} label="Ingresos (sin IVA)" value={money(calc.income)} series={daily.map((x) => x.sales)} hint="Ventas confirmadas del mes" />
        <KpiCard icon={Package} label="Costo de ventas" value={money(calc.cogs)} tone="warning" hint={`${ratio(calc.cogs)} de los ingresos`} />
        <KpiCard icon={Wallet} label="Utilidad bruta" value={money(calc.grossProfit)} tone="info" hint={`Margen bruto ${ratio(calc.grossProfit)}`} />
        <KpiCard icon={PiggyBank} label="Resultado operacional" value={money(calc.net)} tone={calc.net >= 0 ? 'success' : 'danger'} hint={`Margen operacional ${ratio(calc.net)}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          padded={false}
          title={`Estado de resultados · ${monthName(ym)}`}
          subtitle={calc.noCost ? `${calc.noCost} líneas vendidas sin costo registrado en el producto (el costo de ventas puede estar subestimado).` : 'Costo calculado con cantidad vendida por costo actual del producto.'}
          actions={<ExportButton onClick={download} />}
        >
          <div className="pt-4">
            <DataTable<PygRow>
              rows={rows}
              loading={busy}
              pageSize={40}
              columns={[
                {
                  key: 'label',
                  header: 'Concepto',
                  render: (r) => <span className={cn(r.kind !== 'line' && 'font-extrabold', r.indent && 'pl-6 text-ink-soft', r.kind === 'sub' && 'font-bold')}>{r.label}</span>,
                },
                { key: 'pct', header: '% ingresos', align: 'right', hideSm: true, render: (r) => <span className="text-muted">{ratio(r.value)}</span> },
                {
                  key: 'value',
                  header: 'Valor',
                  align: 'right',
                  render: (r) => <span className={cn(r.kind === 'total' ? 'font-extrabold' : 'font-semibold', r.kind === 'total' && r.value < 0 && 'text-danger')}>{r.value < 0 ? <Neg v={r.value} /> : money(r.value)}</span>,
                },
              ]}
            />
          </div>
        </Card>
        <Card title="Gastos por categoría" subtitle="Gastos aprobados del mes">
          {calc.expenses.length ? <Donut height={170} data={calc.expenses.map(([c, v], i) => ({ name: categoryLabel(c), value: v, color: PALETTE[i % PALETTE.length] }))} /> : <p className="text-sm text-muted">No hay gastos aprobados en el mes.</p>}
          <div className="mt-5 border-t border-line pt-4 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-muted">Nómina (costo empleador)</span>
              <span className="font-semibold">{money(calc.payroll)}</span>
            </div>
            <p className="mt-1 text-xs text-muted">Incluye desprendibles confirmados del mes, mensuales y quincenales.</p>
          </div>
        </Card>
      </div>
    </>
  )
}

// ============================================================================ b) ventas por día

function DailyReport({ ym, daily }: { ym: string; daily: { date: string; sales: number; orders: number }[] }) {
  const t = today()
  const upto = daily.filter((d) => d.date <= t)
  const total = daily.reduce((s, d) => s + d.sales, 0)
  const orders = daily.reduce((s, d) => s + d.orders, 0)
  const best = [...daily].sort((a, b) => b.sales - a.sales)[0]
  const activeDays = daily.filter((d) => d.orders > 0).length
  const rows = upto.map((d) => ({ ...d, id: d.date }))

  const download = () =>
    exportCsv(
      `ventas_por_dia_${ym}`,
      daily,
      [
        { key: 'date', label: 'Fecha' },
        { key: 'orders', label: 'Ventas' },
        { key: 'sales', label: 'Total vendido (con IVA)' },
      ],
    )

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={ShoppingBag} label="Vendido en el mes" value={money(total)} series={daily.map((d) => d.sales)} hint="Con IVA" />
        <KpiCard icon={Receipt} label="Número de ventas" value={qty(orders)} tone="info" series={daily.map((d) => d.orders)} hint={`${activeDays} días con ventas`} />
        <KpiCard icon={Tag} label="Ticket medio" value={money(orders ? total / orders : 0)} tone="warning" hint="Total vendido / ventas" />
        <KpiCard icon={TrendingUp} label="Mejor día" value={best && best.sales > 0 ? money(best.sales) : '—'} tone="success" hint={best && best.sales > 0 ? date(best.date) : 'Sin ventas en el mes'} />
      </div>
      <Card title="Ventas por día" subtitle={monthName(ym)} actions={<ExportButton onClick={download} disabled={!daily.length} />}>
        <Bars data={daily.map((d) => ({ label: d.date.slice(8), sales: d.sales }))} xKey="label" series={[{ key: 'sales', label: 'Ventas', color: CHART.brand2 }]} />
      </Card>
      <Card title="Detalle diario" padded={false}>
        <div className="pt-4">
          <DataTable
            rows={rows}
            pageSize={16}
            columns={[
              { key: 'date', header: 'Día', render: (r) => <span className="font-semibold">{date(r.date)}</span> },
              { key: 'orders', header: 'Ventas', align: 'right', render: (r) => (r.orders ? qty(r.orders) : <span className="text-muted">—</span>) },
              { key: 'ticket', header: 'Ticket medio', align: 'right', hideSm: true, render: (r) => (r.orders ? money(r.sales / r.orders) : <span className="text-muted">—</span>) },
              { key: 'sales', header: 'Total vendido', align: 'right', render: (r) => <span className="font-semibold">{money(r.sales)}</span> },
            ]}
            footer={<span>Total del mes: <strong className="text-ink">{money(total)}</strong></span>}
            empty={<EmptyState title="Sin ventas" message="No hay ventas confirmadas en este mes." />}
          />
        </div>
      </Card>
    </>
  )
}

// ============================================================================ c) ventas por mes

function MonthlyReport({ months, ym }: { months: { month: string; sales: number; expenses: number }[]; ym: string }) {
  const data = months.map((m) => ({ ...m, label: `${monthLabel(m.month)} ${m.month.slice(2, 4)}`, id: m.month, diff: m.sales - m.expenses }))
  const total = months.reduce((s, m) => s + m.sales, 0)
  const exp = months.reduce((s, m) => s + m.expenses, 0)
  const best = [...months].sort((a, b) => b.sales - a.sales)[0]
  const download = () =>
    exportCsv(
      `ventas_por_mes_hasta_${ym}`,
      data,
      [
        { key: 'month', label: 'Mes' },
        { key: 'sales', label: 'Ventas (con IVA)' },
        { key: 'expenses', label: 'Gastos aprobados' },
        { key: 'diff', label: 'Diferencia' },
      ],
    )
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={ShoppingBag} label="Ventas de 12 meses" value={money(total)} series={months.map((m) => m.sales)} hint="Con IVA" />
        <KpiCard icon={Wallet} label="Gastos aprobados" value={money(exp)} tone="warning" series={months.map((m) => m.expenses)} hint="Últimos 12 meses" />
        <KpiCard icon={CalendarDays} label="Promedio mensual" value={money(total / 12)} tone="info" hint="Ventas / 12 meses" />
        <KpiCard icon={TrendingUp} label="Mejor mes" value={best && best.sales > 0 ? money(best.sales) : '—'} tone="success" hint={best && best.sales > 0 ? monthName(best.month) : 'Sin ventas'} />
      </div>
      <Card title="Ventas por mes" subtitle={`12 meses hasta ${monthName(ym)}`} actions={<ExportButton onClick={download} />}>
        <AreaTrend
          data={data}
          xKey="label"
          series={[
            { key: 'sales', label: 'Ventas', color: CHART.brand },
            { key: 'expenses', label: 'Gastos', color: CHART.soft },
          ]}
        />
      </Card>
      <Card title="Detalle mensual" padded={false}>
        <div className="pt-4">
          <DataTable
            rows={[...data].reverse()}
            pageSize={12}
            columns={[
              { key: 'month', header: 'Mes', render: (r) => <span className="font-semibold">{monthName(r.month)}</span> },
              { key: 'sales', header: 'Ventas', align: 'right', render: (r) => <span className="font-semibold">{money(r.sales)}</span> },
              { key: 'expenses', header: 'Gastos aprobados', align: 'right', hideSm: true, render: (r) => money(r.expenses) },
              { key: 'diff', header: 'Diferencia', align: 'right', render: (r) => <span className={cn('font-semibold', r.diff < 0 && 'text-danger')}>{money(r.diff)}</span> },
            ]}
          />
        </div>
      </Card>
    </>
  )
}

// ============================================================================ d) más vendidos

function ProductsReport({ ym, rows }: { ym: string; rows: { name: string; qty: number; sub: number; total: number; cost: number }[] }) {
  const top = rows.slice(0, 10)
  const total = rows.reduce((s, r) => s + r.sub, 0)
  const table = rows.map((r, i) => ({ ...r, id: `${i}`, rank: i + 1, profit: r.sub - r.cost, share: total ? r.sub / total : 0 }))
  const download = () =>
    exportCsv(
      `productos_mas_vendidos_${ym}`,
      table.map((r) => ({ ...r, share: Math.round(r.share * 10000) / 100 })),
      [
        { key: 'rank', label: '#' },
        { key: 'name', label: 'Producto' },
        { key: 'qty', label: 'Unidades' },
        { key: 'sub', label: 'Ventas sin IVA' },
        { key: 'total', label: 'Ventas con IVA' },
        { key: 'profit', label: 'Utilidad bruta' },
        { key: 'share', label: '% de ventas' },
      ],
    )
  return (
    <>
      <Card title="Productos más vendidos" subtitle={`Top 10 por ventas sin IVA · ${monthName(ym)}`} actions={<ExportButton onClick={download} disabled={!rows.length} />}>
        {top.length ? <Bars horizontal height={Math.max(200, top.length * 42)} data={top.map((p) => ({ name: p.name, sub: p.sub }))} xKey="name" series={[{ key: 'sub', label: 'Ventas sin IVA', color: CHART.brand2 }]} /> : <p className="text-sm text-muted">No hay ventas confirmadas en este mes.</p>}
      </Card>
      <Card title="Detalle por producto" padded={false}>
        <div className="pt-4">
          <DataTable
            rows={table}
            pageSize={15}
            columns={[
              { key: 'rank', header: '#', render: (r) => <span className="text-muted">{r.rank}</span> },
              { key: 'name', header: 'Producto', render: (r) => <span className="font-semibold">{r.name}</span> },
              { key: 'qty', header: 'Unidades', align: 'right', render: (r) => qty(r.qty) },
              { key: 'sub', header: 'Ventas sin IVA', align: 'right', render: (r) => <span className="font-semibold">{money(r.sub)}</span> },
              { key: 'profit', header: 'Utilidad bruta', align: 'right', hideSm: true, render: (r) => money(r.profit) },
              { key: 'share', header: '% ventas', align: 'right', hideSm: true, render: (r) => <span className="text-muted">{pct(r.share, 1)}</span> },
            ]}
            footer={<span>{qty(table.length)} productos · <strong className="text-ink">{money(total)}</strong></span>}
            empty={<EmptyState icon={Package} title="Sin ventas" message="No hay ventas confirmadas en este mes." />}
          />
        </div>
      </Card>
    </>
  )
}

// ============================================================================ e) IVA generado

function TaxReport({ ym, calc }: { ym: string; calc: Calc }) {
  const taxed = calc.rates.filter(([r]) => r > 0).reduce((s, [, v]) => s + v.base, 0)
  const exempt = calc.rates.filter(([r]) => r === 0).reduce((s, [, v]) => s + v.base, 0)
  const diff = Math.abs(calc.taxTotal - calc.lineTax)
  const rows = calc.rates.map(([rate, v]) => ({ id: String(rate), rate, ...v }))
  const download = () =>
    exportCsv(
      `iva_generado_${ym}`,
      rows.map((r) => ({ tarifa: r.rate > 0 ? `${Math.round(r.rate * 10000) / 100} %` : 'Exento / excluido', base: r.base, tax: r.tax, lines: r.lines })),
      [
        { key: 'tarifa', label: 'Tarifa' },
        { key: 'base', label: 'Base gravable' },
        { key: 'tax', label: 'IVA generado' },
        { key: 'lines', label: 'Líneas' },
      ],
    )
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Percent} label="IVA generado" value={money(calc.taxTotal)} hint="Suma de ventas confirmadas" />
        <KpiCard icon={ShoppingBag} label="Base gravada" value={money(taxed)} tone="info" hint="Ventas con IVA, sin impuesto" />
        <KpiCard icon={Tag} label="Exentas o excluidas" value={money(exempt)} tone="warning" hint="Tarifa 0 %" />
        <KpiCard icon={Receipt} label="Ingresos sin IVA" value={money(calc.income)} tone="success" hint={`Total facturado ${money(calc.gross)}`} />
      </div>
      <Card title="IVA generado por tarifa" subtitle={`${monthName(ym)} · ${qty(calc.rates.reduce((s, [, v]) => s + v.lines, 0))} líneas de venta`} padded={false} actions={<ExportButton onClick={download} disabled={!rows.length} />}>
        <div className="pt-4">
          <DataTable
            rows={rows}
            columns={[
              { key: 'rate', header: 'Tarifa', render: (r) => <span className="font-semibold">{r.rate > 0 ? pct(r.rate, 1) : 'Exento / excluido (0 %)'}</span> },
              { key: 'lines', header: 'Líneas', align: 'right', hideSm: true, render: (r) => qty(r.lines) },
              { key: 'base', header: 'Base gravable', align: 'right', render: (r) => money(r.base) },
              { key: 'tax', header: 'IVA generado', align: 'right', render: (r) => <span className="font-semibold">{money(r.tax)}</span> },
            ]}
            footer={<span>Total IVA generado: <strong className="text-ink">{money(calc.taxTotal)}</strong></span>}
            empty={<EmptyState icon={Percent} title="Sin ventas" message="No hay ventas confirmadas en este mes." />}
          />
        </div>
      </Card>
      {diff > 1 && <div className={cn('rounded-2xl px-4 py-3 text-sm', TONE_SOFT.warning)}>El IVA de las líneas ({money(calc.lineTax)}) difiere del total de las ventas ({money(calc.taxTotal)}) en {money(diff)}. El total oficial es el de las ventas.</div>}
    </>
  )
}

// ============================================================================ f) cartera por edades

function AgingReport({ aging }: { aging: { bucket: string; amount: number; count: number }[] }) {
  const total = aging.reduce((s, a) => s + a.amount, 0)
  const docs = aging.reduce((s, a) => s + a.count, 0)
  const current = aging.find((a) => a.bucket === 'Corriente')?.amount ?? 0
  const overdue = total - current
  const max = Math.max(0, ...aging.map((a) => a.amount))
  const rows = aging.map((a) => ({ ...a, id: a.bucket, share: total ? a.amount / total : 0 }))
  const download = () =>
    exportCsv(
      'cartera_por_edades',
      rows.map((r) => ({ rango: agingLabel(r.bucket), count: r.count, amount: r.amount, share: Math.round(r.share * 10000) / 100 })),
      [
        { key: 'rango', label: 'Rango de mora' },
        { key: 'count', label: 'Facturas' },
        { key: 'amount', label: 'Valor' },
        { key: 'share', label: '% de la cartera' },
      ],
    )
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={HandCoins} label="Cartera por cobrar" value={money(total)} hint={`${qty(docs)} facturas con saldo`} />
        <KpiCard icon={Wallet} label="Al día" value={money(current)} tone="success" hint={total ? `${pct(current / total)} de la cartera` : undefined} />
        <KpiCard icon={Receipt} label="Vencida" value={money(overdue)} tone="danger" hint={total ? `${pct(overdue / total)} de la cartera` : undefined} />
        <KpiCard icon={CalendarDays} label="Corte" value={date(today())} tone="info" hint="Saldos a la fecha de hoy" />
      </div>
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2" title="Cartera por edades" subtitle="Días de mora desde el vencimiento">
          {aging.map((a) => (
            <RankRow key={a.bucket} label={agingLabel(a.bucket)} value={a.amount} max={max} right={`${money(a.amount)} · ${a.count}`} color={AGING_COLOR[a.bucket]} />
          ))}
        </Card>
        <Card className="xl:col-span-3" title="Detalle por rango" padded={false} actions={<ExportButton onClick={download} />}>
          <div className="pt-4">
            <DataTable
              rows={rows}
              columns={[
                { key: 'bucket', header: 'Rango', render: (r) => <span className="font-semibold">{agingLabel(r.bucket)}</span> },
                { key: 'count', header: 'Facturas', align: 'right', render: (r) => qty(r.count) },
                { key: 'amount', header: 'Valor', align: 'right', render: (r) => <span className="font-semibold">{money(r.amount)}</span> },
                { key: 'share', header: '% cartera', align: 'right', hideSm: true, render: (r) => <span className="text-muted">{pct(r.share, 1)}</span> },
              ]}
              footer={<span>Total: <strong className="text-ink">{money(total)}</strong></span>}
            />
          </div>
        </Card>
      </div>
    </>
  )
}
