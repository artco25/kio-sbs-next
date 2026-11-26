import { Pencil, Plus, Warehouse as WHIcon } from 'lucide-react'
import { useState } from 'react'
import { RecordForm, type FieldDef } from '../../components/RecordForm'
import { Badge, Button, Card, DataTable, EmptyState, ErrorBox, IconButton, PageHeader, type Column } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { type Row } from '../../lib/records'
import { useGql } from '../../lib/useGql'

interface Site { id: string; name: string }
interface WarehouseItem {
  id: string
  name: string
  code: string | null
  kind: string | null
  siteId: string | null
  active: boolean
  isDefault: boolean
}

const Q = `{ warehouses{ id name code kind siteId active isDefault } sites{ id name } }`
const KIND: Record<string, string> = { main: 'CEDI/Principal', store: 'Bodega sede', transit: 'Tránsito', virtual: 'Virtual', returns: 'Devoluciones' }

export default function Warehouses() {
  const { can } = useAuth()
  const canWrite = can('warehouses', 'write')
  const { data, loading, error } = useGql<{ warehouses: WarehouseItem[]; sites: Site[] }>(Q)
  const [form, setForm] = useState<{ open: boolean; initial: Row | null }>({ open: false, initial: null })
  const items = data?.warehouses ?? []
  const sites = data?.sites ?? []
  const siteName = (id: string | null) => sites.find((s) => s.id === id)?.name ?? '—'

  const open = (w?: WarehouseItem) => setForm({ open: true, initial: w ? { id: w.id, name: w.name, code: w.code, kind: w.kind ?? 'store', site_id: w.siteId, active: w.active, is_default: w.isDefault } : null })

  const fields: FieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, full: true },
    { key: 'code', label: 'Código', placeholder: 'BOD-01' },
    { key: 'site_id', label: 'Sede', type: 'select', options: [{ value: '', label: 'Sin sede' }, ...sites.map((s) => ({ value: s.id, label: s.name }))] },
    { key: 'kind', label: 'Tipo', type: 'select', options: Object.entries(KIND).map(([value, label]) => ({ value, label })), defaultValue: 'store' },
    { key: 'active', label: 'Activa', type: 'boolean', defaultValue: true },
    { key: 'is_default', label: 'Bodega principal', type: 'boolean', defaultValue: false },
  ]

  const columns: Column<WarehouseItem>[] = [
    { key: 'name', header: 'Bodega', render: (w) => <div><div className="font-semibold text-ink flex items-center gap-2">{w.name}{w.isDefault && <Badge tone="brand">Principal</Badge>}</div><div className="text-xs text-muted">{w.code || '—'}</div></div> },
    { key: 'site', header: 'Sede', render: (w) => siteName(w.siteId) },
    { key: 'kind', header: 'Tipo', render: (w) => <Badge tone="neutral">{KIND[w.kind ?? ''] ?? w.kind ?? '—'}</Badge> },
    { key: 'status', header: 'Estado', render: (w) => <Badge tone={w.active ? 'success' : 'neutral'}>{w.active ? 'Activa' : 'Inactiva'}</Badge> },
    { key: 'act', header: '', align: 'right', render: (w) => canWrite ? <div className="flex justify-end"><IconButton icon={Pencil} label="Editar" onClick={() => open(w)} /></div> : null },
  ]

  return (
    <>
      <PageHeader title="Bodegas" subtitle="Bodegas y CEDI por sede. El stock se controlará por bodega." actions={canWrite ? <Button icon={Plus} onClick={() => open()}>Nueva bodega</Button> : undefined} />
      <ErrorBox error={error} />
      <Card padded={false} title="Bodegas registradas" subtitle={`${items.length} bodegas`}>
        <div className="pt-4">
          <DataTable columns={columns} rows={items} loading={loading} empty={<EmptyState icon={WHIcon} title="Sin bodegas" />} />
        </div>
      </Card>
      <RecordForm open={form.open} onClose={() => setForm((f) => ({ ...f, open: false }))} table="warehouses" title={form.initial ? String(form.initial.name ?? 'Editar bodega') : 'Nueva bodega'} subtitle="Configuración de bodega" fields={fields} initial={form.initial} canDelete={canWrite && !!form.initial && !form.initial.is_default} />
    </>
  )
}
