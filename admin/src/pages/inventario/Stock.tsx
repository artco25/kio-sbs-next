import { ArrowRightLeft, Boxes, ClipboardCheck, Download, ListFilter, Package, PackageMinus, PackagePlus, PackageX, Tags, Warehouse } from 'lucide-react'
import { useMemo, useState } from 'react'
import { KpiCard } from '../../components/charts'
import { Badge, Button, Card, DataTable, EmptyState, ErrorBox, FilterSelect, IconButton, NameCell, PageHeader, SearchInput, Tabs, Toolbar, type Column } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { date, money, qty } from '../../lib/format'
import { exportCsv, today } from '../../lib/records'
import { useGql } from '../../lib/useGql'
import {
  CategoryBadge,
  inventoryHistory,
  inventoryTotals,
  KIND_OPTIONS,
  KindBadge,
  MOVE_FIELDS,
  MOVE_KIND,
  PRODUCT_FIELDS,
  SignedQty,
  StockActionModal,
  stockLevel,
  stockValue,
  unitLabel,
  useCategoryOptions,
  type Move,
  type Prod,
  type StockMode,
} from './_shared'

type Tab = 'existencias' | 'movimientos'
type LevelFilter = 'todos' | 'out' | 'low' | 'ok'

const LEVEL_OPTIONS: { value: LevelFilter; label: string }[] = [
  { value: 'todos', label: 'Todos los estados' },
  { value: 'out', label: 'Agotados' },
  { value: 'low', label: 'Bajo el mínimo' },
  { value: 'ok', label: 'Con existencia' },
]

const PRODUCTS_CATS_Q = `query{ categories{ id name } warehouses{ id name active } products(limit:500){ total items{ ${PRODUCT_FIELDS} } } }`
const MOVES_Q = `query($p:ID,$k:String){ stockMoves(productId:$p, kind:$k, limit:500){ ${MOVE_FIELDS} } }`

function LevelBadge({ p }: { p: Prod }) {
  const lvl = stockLevel(p)
  if (lvl === 'out') return <Badge tone="danger" dot>Agotado</Badge>
  if (lvl === 'low') return <Badge tone="warning" dot>Bajo el mínimo</Badge>
  return <Badge tone="success" dot>Normal</Badge>
}

export default function Stock() {
  const { can } = useAuth()
  const canStock = can('stock_moves', 'write')
  const [tab, setTab] = useState<Tab>('existencias')
  const [modal, setModal] = useState<{ mode: StockMode; product: Prod | null } | null>(null)

  // filtros de existencias
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [level, setLevel] = useState<LevelFilter>('todos')
  // filtros de movimientos
  const [kind, setKind] = useState('')
  const [productId, setProductId] = useState('')

  const prods = useGql<{ products: { items: Prod[] }; categories: { id: string; name: string | null }[]; warehouses: { id: string; name: string | null; active: boolean }[] }>(PRODUCTS_CATS_Q)
  const allMoves = useGql<{ stockMoves: Move[] }>(MOVES_Q, { p: null, k: null })
  const hasMoveFilter = !!(kind || productId)
  const filtered = useGql<{ stockMoves: Move[] }>(MOVES_Q, { p: productId || null, k: kind || null }, { skip: !hasMoveFilter })

  const items = prods.data?.products.items ?? []
  const warehouses = (prods.data?.warehouses ?? []).filter((w) => w.active)
  const tracked = useMemo(() => items.filter((p) => p.trackStock), [items])
  const moves = allMoves.data?.stockMoves ?? []
  const tableMoves = hasMoveFilter ? (filtered.data?.stockMoves ?? []) : moves
  const catOptions = useCategoryOptions(prods.data?.categories)
  const productOptions = useMemo(
    () => [{ value: '', label: 'Todos los productos' }, ...[...items].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'es')).map((p) => ({ value: p.id, label: p.name ?? 'Sin nombre' }))],
    [items],
  )

  const totals = useMemo(() => inventoryTotals(items), [items])
  const hist = useMemo(() => inventoryHistory(items, moves), [items, moves])
  const monthStart = `${today().slice(0, 7)}-01`
  const monthMoves = moves.filter((m) => (m.date ?? '') >= monthStart)
  const monthIn = monthMoves.filter((m) => m.qty > 0).length
  const monthOut = monthMoves.filter((m) => m.qty < 0).length

  const stockRows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return tracked.filter((p) => {
      if (cat && p.category?.id !== cat) return false
      const lvl = stockLevel(p)
      if (level === 'out' && lvl !== 'out') return false
      if (level === 'low' && lvl !== 'low') return false
      if (level === 'ok' && lvl !== 'ok') return false
      if (term && !`${p.name ?? ''} ${p.sku ?? ''} ${p.barcode ?? ''}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [tracked, q, cat, level])

  const stockColumns: Column<Prod>[] = [
    { key: 'name', header: 'Producto', render: (p) => <NameCell name={p.name ?? 'Sin nombre'} sub={p.sku ?? undefined} /> },
    { key: 'category', header: 'Categoría', hideSm: true, render: (p) => <CategoryBadge category={p.category} /> },
    {
      key: 'stock',
      header: 'Existencia',
      align: 'right',
      render: (p) => (
        <span className={stockLevel(p) === 'out' ? 'font-bold text-danger' : 'font-bold'}>
          {qty(p.stock)} <span className="text-xs font-medium text-muted">{unitLabel(p.unit)}</span>
        </span>
      ),
    },
    { key: 'min', header: 'Mínimo', align: 'right', hideSm: true, render: (p) => <span className="text-muted">{qty(p.minStock)}</span> },
    { key: 'cost', header: 'Costo unit.', align: 'right', hideSm: true, render: (p) => <span className="text-muted">{money(p.cost)}</span> },
    { key: 'value', header: 'Valor a costo', align: 'right', render: (p) => <span className="font-semibold">{money(stockValue(p))}</span> },
    { key: 'level', header: 'Estado', render: (p) => <LevelBadge p={p} /> },
    ...(canStock
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (p: Prod) => (
              <div className="flex justify-end gap-0.5">
                <IconButton icon={PackagePlus} label="Registrar entrada" onClick={() => setModal({ mode: 'entrada', product: p })} />
                <IconButton icon={ClipboardCheck} label="Conteo físico" onClick={() => setModal({ mode: 'conteo', product: p })} />
              </div>
            ),
          },
        ]
      : []),
  ]

  const moveColumns: Column<Move>[] = [
    { key: 'date', header: 'Fecha', render: (m) => <span className="whitespace-nowrap text-muted">{date(m.date)}</span> },
    { key: 'product', header: 'Producto', render: (m) => <NameCell name={m.product?.name ?? 'Producto eliminado'} sub={m.product?.sku ?? undefined} /> },
    { key: 'kind', header: 'Tipo', render: (m) => <KindBadge kind={m.kind} /> },
    { key: 'qty', header: 'Cantidad', align: 'right', render: (m) => <SignedQty value={m.qty} unit={m.product?.unit} /> },
    { key: 'cost', header: 'Costo unit.', align: 'right', hideSm: true, render: (m) => <span className="text-muted">{money(m.unitCost)}</span> },
    { key: 'notes', header: 'Notas', hideSm: true, render: (m) => <span className="line-clamp-1 text-muted">{m.notes ?? '—'}</span> },
  ]

  const exportCurrent = () =>
    tab === 'existencias'
      ? exportCsv(
          'existencias',
          stockRows.map((p) => ({ name: p.name, sku: p.sku, category: p.category?.name, unit: p.unit, stock: p.stock, min: p.minStock, cost: p.cost, value: Math.round(stockValue(p)), status: stockLevel(p) === 'out' ? 'Agotado' : stockLevel(p) === 'low' ? 'Bajo el mínimo' : 'Normal' })),
          [
            { key: 'name', label: 'Producto' },
            { key: 'sku', label: 'SKU' },
            { key: 'category', label: 'Categoría' },
            { key: 'unit', label: 'Unidad' },
            { key: 'stock', label: 'Existencia' },
            { key: 'min', label: 'Mínimo' },
            { key: 'cost', label: 'Costo unitario' },
            { key: 'value', label: 'Valor a costo' },
            { key: 'status', label: 'Estado' },
          ],
        )
      : exportCsv(
          'movimientos_inventario',
          tableMoves.map((m) => ({ date: m.date, product: m.product?.name, sku: m.product?.sku, kind: MOVE_KIND[m.kind ?? '']?.label ?? m.kind, qty: m.qty, cost: m.unitCost, notes: m.notes })),
          [
            { key: 'date', label: 'Fecha' },
            { key: 'product', label: 'Producto' },
            { key: 'sku', label: 'SKU' },
            { key: 'kind', label: 'Tipo' },
            { key: 'qty', label: 'Cantidad' },
            { key: 'cost', label: 'Costo unitario' },
            { key: 'notes', label: 'Notas' },
          ],
        )

  const loadingMoves = hasMoveFilter ? filtered.loading : allMoves.loading

  return (
    <>
      <PageHeader
        title="Existencias y movimientos"
        subtitle="Controla cuánto tienes de cada producto y el historial de entradas, salidas y ajustes."
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={exportCurrent}>
              Exportar CSV
            </Button>
            {canStock && (
              <>
                <Button variant="secondary" icon={ClipboardCheck} onClick={() => setModal({ mode: 'conteo', product: null })}>
                  Conteo físico
                </Button>
                <Button variant="secondary" icon={PackageMinus} onClick={() => setModal({ mode: 'salida', product: null })}>
                  Registrar salida
                </Button>
                <Button icon={PackagePlus} onClick={() => setModal({ mode: 'entrada', product: null })}>
                  Registrar entrada
                </Button>
              </>
            )}
          </>
        }
      />
      <ErrorBox error={prods.error ?? allMoves.error ?? filtered.error} />

      <div className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={Warehouse} label="Valor del inventario" value={money(totals.value)} series={hist.value} tone="info" hint="A costo" />
          <KpiCard icon={Boxes} label="Unidades en existencia" value={qty(totals.units)} series={hist.units} hint={`${qty(tracked.length)} productos con control`} />
          <KpiCard icon={PackageX} label="Productos agotados" value={qty(totals.out)} tone={totals.out > 0 ? 'danger' : 'success'} hint={`${qty(totals.low - totals.out)} más bajo el mínimo`} />
          <KpiCard icon={ArrowRightLeft} label="Movimientos del mes" value={qty(monthMoves.length)} series={hist.moves} tone="warning" hint={`${qty(monthIn)} entradas · ${qty(monthOut)} salidas`} />
        </div>

        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'existencias', label: 'Existencias', icon: Package, count: tracked.length },
            { key: 'movimientos', label: 'Movimientos', icon: ArrowRightLeft, count: moves.length },
          ]}
        />

        {tab === 'existencias' ? (
          <Card padded={false} className="pt-5">
            <Toolbar>
              <SearchInput value={q} onChange={setQ} placeholder="Buscar producto o SKU…" />
              <FilterSelect icon={Tags} value={cat} onChange={setCat} options={catOptions} />
              <FilterSelect icon={ListFilter} value={level} onChange={setLevel} options={LEVEL_OPTIONS} />
            </Toolbar>
            <DataTable<Prod>
              columns={stockColumns}
              rows={stockRows}
              loading={prods.loading}
              footer={stockRows.length ? `Valor filtrado a costo: ${money(stockRows.reduce((s, p) => s + stockValue(p), 0))}` : undefined}
              empty={<EmptyState icon={Package} title={tracked.length ? 'Sin resultados' : 'No hay productos con control de inventario'} message={tracked.length ? 'Ningún producto coincide con los filtros.' : 'Activa "Controla inventario" en un producto para ver aquí su existencia.'} />}
            />
          </Card>
        ) : (
          <Card padded={false} className="pt-5">
            <Toolbar>
              <FilterSelect icon={ArrowRightLeft} value={kind} onChange={setKind} options={KIND_OPTIONS} />
              <FilterSelect icon={Package} value={productId} onChange={setProductId} options={productOptions} />
              {hasMoveFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setKind('')
                    setProductId('')
                  }}
                >
                  Quitar filtros
                </Button>
              )}
            </Toolbar>
            <DataTable<Move>
              columns={moveColumns}
              rows={tableMoves}
              loading={loadingMoves}
              footer={tableMoves.length ? `${qty(tableMoves.length)} movimientos${tableMoves.length >= 500 ? ' (se muestran los 500 más recientes)' : ''}` : undefined}
              empty={<EmptyState icon={ArrowRightLeft} title="Sin movimientos" message={hasMoveFilter ? 'No hay movimientos con esos filtros.' : 'Registra una entrada, salida o conteo para empezar el historial.'} />}
            />
          </Card>
        )}
      </div>

      <StockActionModal
        open={!!modal}
        onClose={() => setModal(null)}
        mode={modal?.mode ?? 'entrada'}
        product={modal?.product ?? null}
        products={items}
        warehouses={warehouses}
        onDone={() => {
          prods.reload()
          allMoves.reload()
          filtered.reload()
        }}
      />
    </>
  )
}
