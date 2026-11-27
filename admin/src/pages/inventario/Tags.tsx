import { Package, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { RecordForm, type FieldDef } from '../../components/RecordForm'
import { Button, Card, EmptyState, ErrorBox, IconButton, IconTile, PageHeader, Spinner, useFeedback } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { qty } from '../../lib/format'
import { deleteRecord, type Row } from '../../lib/records'
import { useGql } from '../../lib/useGql'

interface TagRow { id: string; name: string | null; color: string | null; active: boolean }
interface Data { tags: TagRow[]; productTags: { id: string; productId: string; tagId: string }[] }

const Q = `query{ tags{ id name color active } productTags{ id productId tagId } }`
const FALLBACK = '#6366F1'

export default function Tags() {
  const { can } = useAuth()
  const { toast, confirm } = useFeedback()
  const canWrite = can('tags', 'write')
  const { data, loading, error } = useGql<Data>(Q)
  const [form, setForm] = useState<{ open: boolean; initial: Row | null; usage: number }>({ open: false, initial: null, usage: 0 })

  const tags = data?.tags ?? []
  const pts = data?.productTags ?? []
  const usage = useMemo(() => {
    const m = new Map<string, number>()
    for (const pt of pts) m.set(pt.tagId, (m.get(pt.tagId) ?? 0) + 1)
    return m
  }, [pts])

  const open = (t?: TagRow) => setForm({ open: true, usage: t ? (usage.get(t.id) ?? 0) : 0, initial: t ? { id: t.id, name: t.name, color: t.color ?? FALLBACK, active: t.active ? 1 : 0 } : null })
  const fields: FieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, full: true, placeholder: 'Ej. Promo, Nuevo, Sin azúcar' },
    { key: 'color', label: 'Color', type: 'color', full: true, defaultValue: FALLBACK },
    { key: 'active', label: 'Activo', type: 'boolean', defaultValue: 1 },
  ]

  async function remove(t: TagRow) {
    const n = usage.get(t.id) ?? 0
    if (n > 0) {
      const ok = await confirm({ title: 'Etiqueta en uso', message: `"${t.name}" está asignada a ${n} producto(s). Se quitará de esos productos al eliminarla. ¿Continuar?`, confirmLabel: 'Eliminar', danger: true })
      if (!ok) return
    } else if (!(await confirm({ title: 'Eliminar etiqueta', message: `Se eliminará "${t.name}".`, confirmLabel: 'Eliminar', danger: true }))) return
    try {
      await deleteRecord('tags', t.id)
      toast('Etiqueta eliminada')
    } catch (e) { toast((e as Error).message, 'error') }
  }

  return (
    <>
      <PageHeader title="Etiquetas" subtitle="Clasifica productos con etiquetas flexibles para filtros, promos y análisis." actions={canWrite && <Button icon={Plus} onClick={() => open()}>Nueva etiqueta</Button>} />
      <ErrorBox error={error} />
      {loading && !data ? <div className="flex justify-center py-24"><Spinner /></div> : tags.length === 0 ? (
        <Card><EmptyState icon={Tag} title="Aún no tienes etiquetas" message="Crea etiquetas para clasificar productos con múltiples etiquetas." action={canWrite ? <Button icon={Plus} onClick={() => open()}>Crear primera etiqueta</Button> : undefined} /></Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {tags.map((t) => {
            const n = usage.get(t.id) ?? 0
            return (
              <article key={t.id} className="card relative flex flex-col overflow-hidden p-5">
                <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: t.color || FALLBACK }} />
                <div className="flex items-start gap-3">
                  <IconTile icon={Tag} />
                  <div className="min-w-0 flex-1">
                    <h3 className="flex items-center gap-2 truncate text-[15px] font-bold text-ink">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color || FALLBACK }} />
                      <span className="truncate">{t.name ?? 'Sin nombre'}</span>
                    </h3>
                    <p className="text-xs text-muted">{t.active ? 'Activa' : 'Inactiva'}</p>
                  </div>
                  {canWrite && <div className="-mt-1 -mr-2 flex shrink-0"><IconButton icon={Pencil} label="Editar" onClick={() => open(t)} /><IconButton icon={Trash2} label="Eliminar" tone="danger" onClick={() => remove(t)} /></div>}
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm text-muted"><Package size={16} /><span>{qty(n)} producto(s)</span></div>
              </article>
            )
          })}
          {canWrite && <button type="button" onClick={() => open()} className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-[20px] border-2 border-dashed border-line-strong p-5 text-muted transition hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-700"><IconTile icon={Plus} /><span className="text-sm font-semibold">Nueva etiqueta</span></button>}
        </div>
      )}

      <RecordForm open={form.open} onClose={() => setForm((f) => ({ ...f, open: false }))} table="tags" title={form.initial ? (form.initial.name as string) : 'Nueva etiqueta'} subtitle={form.initial ? 'Editar etiqueta' : 'Crea una etiqueta para clasificar productos'} fields={fields} initial={form.initial} />
    </>
  )
}
