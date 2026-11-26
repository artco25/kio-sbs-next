import { CheckCircle2, PackageCheck, Plus, Send, Truck, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, Card, DataTable, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Select, Textarea, useFeedback, type Column } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { date } from '../../lib/format'
import { gql } from '../../lib/gql'
import { saveRecord } from '../../lib/records'
import { useGql } from '../../lib/useGql'

interface Wh { id: string; name: string | null }
interface Prod { id: string; name: string | null; sku: string | null }
interface Line { id: string; productId: string; qtyRequested: number; qtyDispatched: number; qtyReceived: number; notes: string | null; product: Prod | null }
interface Req {
  id: string; status: string; notes: string | null; createdAt: string; requestedAt: string | null; dispatchedAt: string | null; receivedAt: string | null;
  fromWarehouseId: string; toWarehouseId: string; fromWarehouse: Wh | null; toWarehouse: Wh | null; lines: Line[]
}

const Q = `query{ requisitions{ id status notes createdAt requestedAt dispatchedAt receivedAt fromWarehouseId toWarehouseId fromWarehouse{ id name } toWarehouse{ id name } lines{ id productId qtyRequested qtyDispatched qtyReceived notes product{ id name sku } } } warehouses{ id name active } products(limit:500){ items{ id name sku trackStock active } } }`

const STATUS: Record<string, { label: string; tone: 'neutral' | 'warning' | 'info' | 'brand' | 'success' | 'danger' }> = {
  draft: { label: 'Borrador', tone: 'neutral' },
  requested: { label: 'Solicitada', tone: 'warning' },
  approved: { label: 'Aprobada', tone: 'info' },
  dispatched: { label: 'Despachada', tone: 'brand' },
  received: { label: 'Recibida', tone: 'success' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
}

export default function Requisitions() {
  const { can } = useAuth()
  const canWrite = can('requisitions', 'write')
  const { toast } = useFeedback()
  const { data, loading, error, reload } = useGql<{ requisitions: Req[]; warehouses: Wh[]; products: { items: (Prod & { trackStock: boolean; active: boolean })[] } }>(Q)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<{ product_id: string; qty_requested: string }[]>([{ product_id: '', qty_requested: '1' }])

  const reqs = data?.requisitions ?? []
  const warehouses = (data?.warehouses ?? []).filter((w: any) => w.active !== false)
  const products = (data?.products?.items ?? []).filter((p: any) => p.active !== false)

  const reset = () => { setFromId(warehouses[0]?.id ?? ''); setToId(warehouses[1]?.id ?? ''); setNotes(''); setLines([{ product_id: '', qty_requested: '1' }]) }

  async function createReq() {
    if (!fromId || !toId) return toast('Selecciona bodega origen y destino.', 'error')
    if (fromId === toId) return toast('Origen y destino deben ser diferentes.', 'error')
    const clean = lines.map((l) => ({ ...l, qty_requested: Number(l.qty_requested) })).filter((l) => l.product_id && l.qty_requested > 0)
    if (!clean.length) return toast('Agrega al menos una línea con producto y cantidad.', 'error')
    setSaving(true)
    try {
      const id = await saveRecord('requisitions', { from_warehouse_id: fromId, to_warehouse_id: toId, status: 'draft', notes: notes.trim() || null })
      for (const l of clean) {
        await saveRecord('requisition_lines', { requisition_id: id, product_id: l.product_id, qty_requested: l.qty_requested, qty_dispatched: 0, qty_received: 0 })
      }
      toast('Requisición creada')
      setOpen(false)
      reset()
      reload()
    } catch (e) { toast((e as Error).message, 'error') } finally { setSaving(false) }
  }

  async function process(id: string, action: string) {
    setSaving(true)
    try {
      await gql(`mutation($id:ID!,$action:String!){ processRequisition(id:$id, action:$action){ id status } }`, { id, action })
      toast('Requisición actualizada')
      reload()
    } catch (e) { toast((e as Error).message, 'error') } finally { setSaving(false) }
  }

  const columns: Column<Req>[] = [
    { key: 'date', header: 'Fecha', render: (r) => <span className="text-muted whitespace-nowrap">{date(r.createdAt)}</span> },
    { key: 'route', header: 'Origen → Destino', render: (r) => <div><div className="font-semibold text-ink">{r.fromWarehouse?.name ?? r.fromWarehouseId} → {r.toWarehouse?.name ?? r.toWarehouseId}</div><div className="text-xs text-muted">{r.lines.length} línea(s)</div></div> },
    { key: 'status', header: 'Estado', render: (r) => { const s = STATUS[r.status] ?? { label: r.status, tone: 'neutral' as const }; return <Badge tone={s.tone}>{s.label}</Badge> } },
    { key: 'notes', header: 'Notas', hideSm: true, render: (r) => <span className="text-muted line-clamp-1">{r.notes ?? '—'}</span> },
    {
      key: 'actions', header: '', align: 'right', render: (r) => canWrite ? (
        <div className="flex justify-end gap-1 flex-wrap">
          {r.status === 'draft' && <Button size="sm" variant="secondary" icon={Send} loading={saving} onClick={() => process(r.id, 'request')}>Solicitar</Button>}
          {['draft', 'requested'].includes(r.status) && <Button size="sm" variant="secondary" icon={CheckCircle2} loading={saving} onClick={() => process(r.id, 'approve')}>Aprobar</Button>}
          {['requested', 'approved'].includes(r.status) && <Button size="sm" variant="secondary" icon={Truck} loading={saving} onClick={() => process(r.id, 'dispatch')}>Despachar</Button>}
          {r.status === 'dispatched' && <Button size="sm" icon={PackageCheck} loading={saving} onClick={() => process(r.id, 'receive')}>Recibir</Button>}
          {!['received', 'cancelled'].includes(r.status) && <Button size="sm" variant="ghost" icon={XCircle} loading={saving} onClick={() => process(r.id, 'cancel')}>Cancelar</Button>}
        </div>
      ) : null
    },
  ]

  return (
    <>
      <PageHeader title="Requisiciones" subtitle="Solicitudes y traslados entre bodegas/tiendas." actions={canWrite ? <Button icon={Plus} onClick={() => { reset(); setOpen(true) }}>Nueva requisición</Button> : undefined} />
      <ErrorBox error={error} />
      <Card padded={false} title="Requisiciones" subtitle={`${reqs.length} registros`}>
        <div className="pt-4">
          <DataTable columns={columns} rows={reqs} loading={loading} empty={<EmptyState icon={Truck} title="Sin requisiciones" message="Crea una requisición para mover stock entre bodegas." />} />
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Nueva requisición" subtitle="Solicita productos desde una bodega origen hacia una bodega destino." size="lg"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button loading={saving} onClick={createReq}>Crear requisición</Button></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Bodega origen (surte)" required>
            <Select value={fromId} onChange={(e) => setFromId(e.target.value)}><option value="">Selecciona…</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name ?? w.id}</option>)}</Select>
          </Field>
          <Field label="Bodega destino (recibe)" required>
            <Select value={toId} onChange={(e) => setToId(e.target.value)}><option value="">Selecciona…</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name ?? w.id}</option>)}</Select>
          </Field>
          <Field label="Notas" className="sm:col-span-2"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo o referencia" /></Field>
        </div>
        <div className="mt-4 space-y-2">
          <div className="text-sm font-semibold text-ink">Líneas</div>
          {lines.map((l, idx) => (
            <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_auto]">
              <Select value={l.product_id} onChange={(e) => setLines((s) => s.map((x, i) => i === idx ? { ...x, product_id: e.target.value } : x))}>
                <option value="">Producto…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` · ${p.sku}` : ''}</option>)}
              </Select>
              <Input inputMode="decimal" value={l.qty_requested} onChange={(e) => setLines((s) => s.map((x, i) => i === idx ? { ...x, qty_requested: e.target.value } : x))} placeholder="Cantidad" />
              <Button variant="ghost" size="sm" onClick={() => setLines((s) => s.filter((_, i) => i !== idx))}>Quitar</Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setLines((s) => [...s, { product_id: '', qty_requested: '1' }])}>Agregar línea</Button>
        </div>
      </Modal>
    </>
  )
}
