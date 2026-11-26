import { Activity, ArrowRightLeft, BarChart3, Boxes, Package, RotateCcw, ShoppingBag, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AreaTrend, Bars, CHART, Donut, KpiCard } from '../../components/charts'
import { Badge, Button, Card, DataTable, EmptyState, ErrorBox, FilterSelect, PageHeader, Tabs } from '../../components/ui'
import { delta, money, qty, toNum } from '../../lib/format'
import { useGql } from '../../lib/useGql'
import { dailySeries, PERIODS, periodDates, previousDates, type PeriodKey } from '../ventas/_shared'

interface Product { id: string; name: string; sku: string | null; stock: number; minStock: number; price: number; cost: number; trackStock: boolean; active: boolean }
interface Sale { id: string; date: string; status: string; total: number; channel: string }
interface Move { productId: string | null; qty: number; kind: string | null; date: string; warehouseId: string | null }
interface Req { id: string; status: string; fromWarehouseId: string; toWarehouseId: string; requestedAt: string | null; createdAt: string | null; lines: { productId: string; qtyRequested: number }[] }
interface Wh { id: string; name: string }
interface Ws { warehouseId: string; productId: string; qty: number; minQty: number }

interface Data {
  products: { items: Product[] }
  sales: { total: number; amount: number; items: Sale[] }
  prevSales: { total: number; amount: number }
  returns: { total: number; amount: number; items: Sale[] }
  saleMoves: Move[]
  returnMoves: Move[]
  requisitions: Req[]
  warehouses: Wh[]
  warehouseStocks: Ws[]
}

const Q = `query($from:String,$to:String,$pfrom:String,$pto:String){
  products(limit:500){ items{ id name sku stock minStock price cost trackStock active } }
  sales(from:$from,to:$to,status:"confirmada",limit:500){ total amount items{ id date status total channel } }
  prevSales: sales(from:$pfrom,to:$pto,status:"confirmada",limit:1){ total amount }
  returns: sales(from:$from,to:$to,status:"devuelta",limit:500){ total amount items{ id date status total channel } }
  saleMoves: stockMoves(kind:"venta",limit:500){ productId qty kind date warehouseId }
  returnMoves: stockMoves(kind:"devolucion",limit:500){ productId qty kind date warehouseId }
  requisitions{ id status fromWarehouseId toWarehouseId requestedAt createdAt lines{ productId qtyRequested } }
  warehouses{ id name }
  warehouseStocks{ warehouseId productId qty minQty }
}`

type Tab = 'resumen' | 'abc' | 'requisiciones'

export default function Analytics() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<PeriodKey>('30')
  const [tab, setTab] = useState<Tab>('resumen')
  const dates = useMemo(() => periodDates(period), [period])
  const prev = useMemo(() => previousDates(dates), [dates])
  const { data, loading, error } = useGql<Data>(Q, { ...dates, pfrom: prev.from, pto: prev.to })

  const products = data?.products.items ?? []
  const pmap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const whmap = useMemo(() => new Map((data?.warehouses ?? []).map((w) => [w.id, w.name])), [data])

  const salesSeries = useMemo(() => dailySeries((data?.sales.items ?? []).map((s) => ({ date: s.date, value: toNum(s.total) })), dates.from, dates.to), [data, dates])
  const returnSeries = useMemo(() => dailySeries((data?.returns.items ?? []).map((s) => ({ date: s.date, value: toNum(s.total) })), dates.from, dates.to), [data, dates])

  const soldByProduct = useMemo(() => {
    const m = new Map<string, number>()
    for (const mv of data?.saleMoves ?? []) {
      if (!mv.productId) continue
      const d = mv.date?.slice(0, 10)
      if (d && (d < dates.from || d > dates.to)) continue
      m.set(mv.productId, (m.get(mv.productId) ?? 0) + Math.abs(toNum(mv.qty)))
    }
    return m
  }, [data, dates])

  const returnedByProduct = useMemo(() => {
    const m = new Map<string, number>()
    for (const mv of data?.returnMoves ?? []) {
      if (!mv.productId) continue
      const d = mv.date?.slice(0, 10)
      if (d && (d < dates.from || d > dates.to)) continue
      m.set(mv.productId, (m.get(mv.productId) ?? 0) + Math.abs(toNum(mv.qty)))
    }
    return m
  }, [data, dates])

  const topProducts = useMemo(() => {
    return [...soldByProduct.entries()]
      .map(([id, units]) => {
        const p = pmap.get(id)
        const revenue = units * toNum(p?.price)
        return { id, name: p?.name ?? 'Producto', sku: p?.sku ?? '—', units, revenue, stock: toNum(p?.stock), minStock: toNum(p?.minStock) }
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
  }, [soldByProduct, pmap])

  const abc = useMemo(() => {
    const rows = [...soldByProduct.entries()].map(([id, units]) => {
      const p = pmap.get(id)
      const value = units * toNum(p?.price)
      const cost = units * toNum(p?.cost)
      const margin = value - cost
      return { id, name: p?.name ?? 'Producto', sku: p?.sku ?? '—', units, value, margin, stock: toNum(p?.stock) }
    }).sort((a, b) => b.value - a.value)
    const total = rows.reduce((s, r) => s + r.value, 0) || 1
    let cum = 0
    return rows.map((r) => {
      cum += r.value
      const pct = cum / total
      const cls = pct <= 0.8 ? 'A' : pct <= 0.95 ? 'B' : 'C'
      return { ...r, share: (r.value / total) * 100, cum: pct * 100, cls }
    })
  }, [soldByProduct, pmap])

  const abcCounts = useMemo(() => {
    const c = { A: 0, B: 0, C: 0 }
    for (const r of abc) c[r.cls as 'A' | 'B' | 'C']++
    return c
  }, [abc])

  const lowStockPlan = useMemo(() => {
    const byWh = data?.warehouseStocks ?? []
    return byWh
      .filter((ws) => toNum(ws.qty) <= toNum(ws.minQty))
      .map((ws) => {
        const p = pmap.get(ws.productId)
        const sold = soldByProduct.get(ws.productId) ?? 0
        const suggested = Math.max(0, Math.ceil(toNum(ws.minQty) * 2 - toNum(ws.qty) + sold * 0.3))
        return {
          id: `${ws.warehouseId}-${ws.productId}`,
          warehouse: whmap.get(ws.warehouseId) ?? ws.warehouseId,
          product: p?.name ?? ws.productId,
          sku: p?.sku ?? '—',
          qty: toNum(ws.qty),
          minQty: toNum(ws.minQty),
          sold,
          suggested,
        }
      })
      .sort((a, b) => a.qty - b.qty)
      .slice(0, 30)
  }, [data, pmap, whmap, soldByProduct])

  const reqStats = useMemo(() => {
    const reqs = data?.requisitions ?? []
    const byStatus: Record<string, number> = {}
    for (const r of reqs) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
    const pending = reqs.filter((r) => ['draft', 'requested', 'approved'].includes(r.status))
    return { total: reqs.length, byStatus, pending: pending.length }
  }, [data])

  const totalSales = toNum(data?.sales.amount)
  const totalReturns = toNum(data?.returns.amount)
  const returnRate = totalSales > 0 ? (totalReturns / (totalSales + totalReturns)) * 100 : 0
  const soldUnits = [...soldByProduct.values()].reduce((a, b) => a + b, 0)
  const invUnits = products.filter((p) => p.trackStock).reduce((a, p) => a + toNum(p.stock), 0)
  const rotation = invUnits > 0 ? soldUnits / invUnits : 0

  return (
    <>
      <PageHeader title="Analítica comercial" subtitle="Ventas, devoluciones, rotación, ABC y planeación de requisiciones." actions={<FilterSelect icon={Activity} value={period} onChange={setPeriod} options={PERIODS} />} />
      <ErrorBox error={error} />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={ShoppingBag} label="Ventas confirmadas" value={money(totalSales)} delta={delta(totalSales, toNum(data?.prevSales.amount))} series={salesSeries} />
        <KpiCard icon={RotateCcw} label="Devoluciones" value={money(totalReturns)} hint={`${qty(data?.returns.total ?? 0)} devoluciones · ${returnRate.toFixed(1)}% tasa`} series={returnSeries} tone="warning" />
        <KpiCard icon={TrendingUp} label="Rotación (aprox.)" value={`${rotation.toFixed(2)}x`} hint={`${qty(soldUnits)} uds vendidas / ${qty(invUnits)} uds inventario`} tone="info" />
        <KpiCard icon={Boxes} label="Requisiciones pendientes" value={qty(reqStats.pending)} hint={`${qty(reqStats.total)} total`} tone={reqStats.pending > 0 ? 'warning' : 'neutral'} />
      </div>

      <div className="mt-6 mb-4">
        <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ key: 'resumen', label: 'Resumen' }, { key: 'abc', label: 'ABC / Top productos' }, { key: 'requisiciones', label: 'Planeación requisiciones' }]} />
      </div>

      {tab === 'resumen' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Ventas vs devoluciones" subtitle="Monto diario en el periodo">
            <AreaTrend data={salesSeries.map((v, i) => ({ label: String(i + 1), ventas: v, devoluciones: returnSeries[i] ?? 0 }))} xKey="label" series={[{ key: 'ventas', label: 'Ventas', color: CHART.brand }, { key: 'devoluciones', label: 'Devoluciones', color: CHART.soft }]} />
          </Card>
          <Card title="Productos más vendidos" subtitle="Por valor vendido (aprox.)">
            {topProducts.length ? <Bars horizontal height={Math.max(180, topProducts.length * 40)} data={topProducts.map((p) => ({ name: p.name.slice(0, 22), valor: Math.round(p.revenue) }))} xKey="name" series={[{ key: 'valor', label: 'Valor', color: CHART.brand2 }]} /> : <EmptyState icon={Package} title="Sin datos de ventas" message="No hay movimientos de venta en el periodo." />}
          </Card>
          <Card title="Clasificación ABC" subtitle="Participación por valor vendido">
            <div className="flex items-center gap-6">
              <div className="w-40 shrink-0"><Donut data={[{ name: 'A', value: abcCounts.A, color: CHART.brand }, { name: 'B', value: abcCounts.B, color: '#F59E0B' }, { name: 'C', value: abcCounts.C, color: CHART.soft }]} /></div>
              <div className="space-y-2 text-sm">
                <div><Badge tone="success">A</Badge> <span className="ml-2 font-semibold">{abcCounts.A}</span> productos · 80% del valor</div>
                <div><Badge tone="warning">B</Badge> <span className="ml-2 font-semibold">{abcCounts.B}</span> productos · 15% siguiente</div>
                <div><Badge tone="neutral">C</Badge> <span className="ml-2 font-semibold">{abcCounts.C}</span> productos · 5% restante</div>
              </div>
            </div>
          </Card>
          <Card title="Devoluciones por producto" subtitle="Unidades devueltas en el periodo">
            <DataTable rows={[...returnedByProduct.entries()].map(([id, units]) => ({ id, name: pmap.get(id)?.name ?? id, units })).sort((a, b) => b.units - a.units).slice(0, 8)} loading={loading}
              columns={[{ key: 'name', header: 'Producto', render: (r: any) => r.name }, { key: 'units', header: 'Uds devueltas', align: 'right', render: (r: any) => <span className="font-semibold text-danger">{qty(r.units)}</span> }]}
              empty={<p className="px-5 py-8 text-center text-sm text-muted">Sin devoluciones en el periodo.</p>} />
          </Card>
        </div>
      )}

      {tab === 'abc' && (
        <Card padded={false} title="Análisis ABC y top productos" subtitle="Clasificación por valor vendido en el periodo seleccionado.">
          <DataTable rows={abc.slice(0, 50)} loading={loading}
            columns={[
              { key: 'cls', header: 'ABC', render: (r: any) => <Badge tone={r.cls === 'A' ? 'success' : r.cls === 'B' ? 'warning' : 'neutral'}>{r.cls}</Badge> },
              { key: 'name', header: 'Producto', render: (r: any) => <div><div className="font-semibold">{r.name}</div><div className="text-xs text-muted">{r.sku}</div></div> },
              { key: 'units', header: 'Uds vendidas', align: 'right', render: (r: any) => qty(r.units) },
              { key: 'value', header: 'Valor vendido', align: 'right', render: (r: any) => <span className="font-semibold">{money(r.value)}</span> },
              { key: 'share', header: 'Participación', align: 'right', render: (r: any) => `${r.share.toFixed(1)}%` },
              { key: 'cum', header: 'Acumulado', align: 'right', hideSm: true, render: (r: any) => `${r.cum.toFixed(1)}%` },
              { key: 'stock', header: 'Stock actual', align: 'right', render: (r: any) => qty(r.stock) },
            ]}
            empty={<EmptyState icon={BarChart3} title="Sin datos" message="No hay ventas en el periodo para clasificar." />} />
        </Card>
      )}

      {tab === 'requisiciones' && (
        <div className="grid gap-6">
          <div className="grid gap-5 sm:grid-cols-3">
            <Card><div className="p-5"><p className="text-xs font-semibold text-muted uppercase">Requisiciones totales</p><p className="mt-2 text-2xl font-extrabold">{qty(reqStats.total)}</p></div></Card>
            <Card><div className="p-5"><p className="text-xs font-semibold text-muted uppercase">Pendientes</p><p className="mt-2 text-2xl font-extrabold text-warning">{qty(reqStats.pending)}</p></div></Card>
            <Card><div className="p-5"><p className="text-xs font-semibold text-muted uppercase">Por estado</p><div className="mt-2 flex flex-wrap gap-2">{Object.entries(reqStats.byStatus).map(([k, v]) => <Badge key={k} tone="neutral">{k}: {v}</Badge>)}</div></div></Card>
          </div>
          <Card padded={false} title="Planeación de reposición" subtitle="Productos con stock en o bajo mínimo por bodega. Sugerencia simple: cubrir mínimo x2 + 30% de ventas del periodo." actions={<Button variant="secondary" icon={ArrowRightLeft} onClick={() => navigate('/inventario/requisiciones')}>Ir a requisiciones</Button>}>
            <DataTable rows={lowStockPlan} loading={loading}
              columns={[
                { key: 'warehouse', header: 'Bodega', render: (r: any) => r.warehouse },
                { key: 'product', header: 'Producto', render: (r: any) => <div><div className="font-semibold">{r.product}</div><div className="text-xs text-muted">{r.sku}</div></div> },
                { key: 'qty', header: 'Stock', align: 'right', render: (r: any) => <span className={r.qty <= 0 ? 'font-semibold text-danger' : 'font-semibold text-warning'}>{qty(r.qty)}</span> },
                { key: 'minQty', header: 'Mínimo', align: 'right', render: (r: any) => qty(r.minQty) },
                { key: 'sold', header: 'Vendido período', align: 'right', hideSm: true, render: (r: any) => qty(r.sold) },
                { key: 'suggested', header: 'Sugerido reponer', align: 'right', render: (r: any) => <span className="font-semibold text-brand-700">{qty(r.suggested)}</span> },
              ]}
              empty={<EmptyState icon={Boxes} title="Sin alertas de reposición" message="No hay productos bajo mínimo por bodega." />} />
          </Card>
        </div>
      )}
    </>
  )
}
