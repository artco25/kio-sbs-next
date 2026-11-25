import { Boxes, Package, Pencil, Plus, Tags, Trash2, Warehouse } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Donut, KpiCard, RankRow } from '../../components/charts'
import { RecordForm, type FieldDef } from '../../components/RecordForm'
import { Button, Card, EmptyState, ErrorBox, IconButton, IconTile, PageHeader, Spinner, useFeedback } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { money, pct, qty } from '../../lib/format'
import { deleteRecord, type Row } from '../../lib/records'
import { useGql } from '../../lib/useGql'
import { stockValue } from './_shared'

interface Cat {
  id: string
  name: string | null
  color: string | null
  sequence: number
  productCount: number
}
interface Data {
  categories: Cat[]
  products: { total: number; items: { id: string; stock: number; cost: number; trackStock: boolean; category: { id: string } | null }[] }
}

const Q = `query{
  categories{ id name color sequence productCount }
  products(limit:500){ total items{ id stock cost trackStock category{ id } } }
}`

const FALLBACK = '#6366F1'

export default function Categories() {
  const { can } = useAuth()
  const { toast, confirm } = useFeedback()
  const navigate = useNavigate()
  const canWrite = can('categories', 'write')
  const { data, loading, error } = useGql<Data>(Q)
  const [form, setForm] = useState<{ open: boolean; initial: Row | null; productCount: number }>({ open: false, initial: null, productCount: 0 })

  const cats = data?.categories ?? []
  const products = data?.products.items ?? []

  const stats = useMemo(() => {
    const value = new Map<string, number>()
    let uncategorized = 0
    for (const p of products) {
      const id = p.category?.id
      if (!id) uncategorized++
      else value.set(id, (value.get(id) ?? 0) + stockValue(p))
    }
    return { value, uncategorized, total: [...value.values()].reduce((s, v) => s + v, 0) }
  }, [products])

  const maxValue = Math.max(0, ...cats.map((c) => stats.value.get(c.id) ?? 0))
  const withProducts = cats.reduce((s, c) => s + c.productCount, 0)
  const nextSequence = cats.reduce((m, c) => Math.max(m, c.sequence), 0) + 1

  const open = (c?: Cat) =>
    setForm({
      open: true,
      productCount: c?.productCount ?? 0,
      initial: c ? { id: c.id, name: c.name, color: c.color ?? FALLBACK, sequence: c.sequence } : null,
    })

  const fields: FieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, full: true, placeholder: 'Ej. Bebidas' },
    { key: 'color', label: 'Color', type: 'color', full: true, defaultValue: FALLBACK, hint: 'Se usa en las etiquetas de productos y en el POS' },
    { key: 'sequence', label: 'Orden', type: 'integer', defaultValue: nextSequence, hint: 'Posición en el listado y en la caja' },
  ]

  async function remove(c: Cat) {
    if (c.productCount > 0) {
      const go = await confirm({
        title: 'No se puede eliminar',
        message: `"${c.name}" tiene ${c.productCount} ${c.productCount === 1 ? 'producto' : 'productos'}. Mueve esos productos a otra categoría antes de eliminarla.`,
        confirmLabel: 'Ver productos',
      })
      if (go) navigate(`/inventario/productos?categoria=${c.id}`)
      return
    }
    if (!(await confirm({ title: 'Eliminar categoría', message: `Se eliminará "${c.name}" también en las cajas y apps al sincronizar. ¿Continuar?`, confirmLabel: 'Eliminar', danger: true }))) return
    try {
      await deleteRecord('categories', c.id)
      toast('Categoría eliminada')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const donut = cats
    .map((c) => ({ name: c.name ?? 'Sin nombre', value: stats.value.get(c.id) ?? 0, color: c.color || FALLBACK }))
    .filter((d) => d.value > 0)

  return (
    <>
      <PageHeader
        title="Categorías"
        subtitle="Organiza tu catálogo y mira cuánto inventario tienes en cada grupo."
        actions={
          canWrite && (
            <Button icon={Plus} onClick={() => open()}>
              Nueva categoría
            </Button>
          )
        }
      />
      <ErrorBox error={error} />

      {loading && !data ? (
        <div className="flex justify-center py-24">
          <Spinner />
        </div>
      ) : cats.length === 0 ? (
        <Card>
          <EmptyState icon={Tags} title="Aún no tienes categorías" message="Agrupa tus productos por categoría para encontrarlos más rápido en el POS y ver el valor del inventario de cada grupo." action={canWrite ? <Button icon={Plus} onClick={() => open()}>Crear primera categoría</Button> : undefined} />
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={Tags} label="Categorías" value={qty(cats.length)} hint="Grupos de productos" />
            <KpiCard icon={Package} label="Productos categorizados" value={qty(withProducts)} tone="info" hint={`${qty(data?.products.total ?? 0)} productos en total`} />
            <KpiCard icon={Boxes} label="Sin categoría" value={qty(stats.uncategorized)} tone={stats.uncategorized > 0 ? 'warning' : 'success'} hint={stats.uncategorized > 0 ? 'Asígnales una categoría' : 'Todo está clasificado'} />
            <KpiCard icon={Warehouse} label="Valor del inventario" value={money(stats.total)} tone="success" hint="A costo, productos categorizados" />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <div className="grid gap-5 sm:grid-cols-2 xl:col-span-2">
              {cats.map((c) => {
                const value = stats.value.get(c.id) ?? 0
                const share = stats.total ? value / stats.total : 0
                return (
                  <article key={c.id} className="card group relative flex flex-col overflow-hidden p-5">
                    <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: c.color || FALLBACK }} />
                    <div className="flex items-start gap-3">
                      <IconTile icon={Tags} />
                      <div className="min-w-0 flex-1">
                        <h3 className="flex items-center gap-2 truncate text-[15px] font-bold text-ink">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color || FALLBACK }} />
                          <span className="truncate">{c.name ?? 'Sin nombre'}</span>
                        </h3>
                        <p className="text-xs text-muted">Orden {c.sequence}</p>
                      </div>
                      {canWrite && (
                        <div className="-mt-1 -mr-2 flex shrink-0">
                          <IconButton icon={Pencil} label="Editar categoría" onClick={() => open(c)} />
                          <IconButton icon={Trash2} label="Eliminar categoría" tone="danger" onClick={() => remove(c)} />
                        </div>
                      )}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted">Productos</p>
                        <p className="font-display text-xl font-extrabold text-ink">{qty(c.productCount)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted">Valor del inventario</p>
                        <p className="truncate font-display text-xl font-extrabold text-ink">{money(value)}</p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <RankRow label="Participación en el inventario" value={value} max={maxValue} right={pct(share)} />
                    </div>
                    <Button variant="secondary" size="sm" className="mt-3 self-start" onClick={() => navigate(`/inventario/productos?categoria=${c.id}`)}>
                      Ver productos
                    </Button>
                  </article>
                )
              })}
              {canWrite && (
                <button type="button" onClick={() => open()} className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-[20px] border-2 border-dashed border-line-strong p-5 text-muted transition hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-700">
                  <IconTile icon={Plus} />
                  <span className="text-sm font-semibold">Nueva categoría</span>
                </button>
              )}
            </div>

            <Card title="Inventario por categoría" subtitle="Valor a costo de cada grupo">
              {donut.length ? <Donut data={donut} height={180} /> : <p className="text-sm text-muted">Aún no hay existencias valorizadas en tus categorías.</p>}
            </Card>
          </div>
        </div>
      )}

      <RecordForm
        open={form.open}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        table="categories"
        title={form.initial ? (form.initial.name as string) : 'Nueva categoría'}
        subtitle={form.initial ? 'Editar categoría' : 'Agrupa productos afines'}
        fields={fields}
        initial={form.initial}
        canDelete={canWrite && form.productCount === 0}
      />
    </>
  )
}
