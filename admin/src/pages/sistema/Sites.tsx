import { Building2, MapPin, Pencil, Plus, Store, Warehouse } from 'lucide-react'
import { useState } from 'react'
import { RecordForm, type FieldDef } from '../../components/RecordForm'
import { Badge, Button, Card, DataTable, EmptyState, ErrorBox, IconButton, PageHeader, type Column } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { type Row } from '../../lib/records'
import { useGql } from '../../lib/useGql'

interface Site {
  id: string
  name: string
  code: string | null
  kind: string | null
  businessType: string | null
  catalogMode: string | null
  city: string | null
  address: string | null
  phone: string | null
  active: boolean
  isDefault: boolean
}

interface WarehouseItem { id: string; siteId: string | null }
const Q = `{ sites{ id name code kind businessType catalogMode city address phone active isDefault } warehouses{ id siteId } }`

const KIND: Record<string, string> = { store: 'Tienda', restaurant: 'Restaurante', salon: 'Salón', warehouse: 'Bodega', cedi: 'CEDI', mixed: 'Mixta' }
const BT: Record<string, string> = { retail: 'Retail', restaurant: 'Restaurante', service: 'Servicios', full: 'Full' }
const CM: Record<string, string> = { product: 'Productos', service: 'Servicios', mixed: 'Mixto' }

export default function Sites() {
  const { can } = useAuth()
  const canWrite = can('sites', 'write')
  const { data, loading, error } = useGql<{ sites: Site[]; warehouses: WarehouseItem[] }>(Q)
  const [form, setForm] = useState<{ open: boolean; initial: Row | null }>({ open: false, initial: null })
  const sites = data?.sites ?? []
  const wh = data?.warehouses ?? []

  const open = (s?: Site) => setForm({ open: true, initial: s ? { id: s.id, name: s.name, code: s.code, kind: s.kind ?? 'store', business_type: s.businessType ?? 'full', catalog_mode: s.catalogMode ?? 'mixed', city: s.city, address: s.address, phone: s.phone, active: s.active, is_default: s.isDefault } : null })

  const fields: FieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, full: true },
    { key: 'code', label: 'Código', placeholder: 'SEDE-01' },
    { key: 'kind', label: 'Tipo de sede', type: 'select', options: Object.entries(KIND).map(([value, label]) => ({ value, label })), defaultValue: 'store' },
    { key: 'business_type', label: 'Modelo de negocio', type: 'select', options: Object.entries(BT).map(([value, label]) => ({ value, label })), defaultValue: 'full' },
    { key: 'catalog_mode', label: 'Catálogo', type: 'select', options: Object.entries(CM).map(([value, label]) => ({ value, label })), defaultValue: 'mixed' },
    { key: 'city', label: 'Ciudad' },
    { key: 'address', label: 'Dirección', full: true },
    { key: 'phone', label: 'Teléfono' },
    { key: 'active', label: 'Activa', type: 'boolean', defaultValue: true },
    { key: 'is_default', label: 'Sede principal', type: 'boolean', defaultValue: false },
  ]

  const columns: Column<Site>[] = [
    { key: 'name', header: 'Sede', render: (s) => <div><div className="font-semibold text-ink flex items-center gap-2">{s.name}{s.isDefault && <Badge tone="brand">Principal</Badge>}</div><div className="text-xs text-muted">{s.code || '—'} · {s.city || 'Sin ciudad'}</div></div> },
    { key: 'kind', header: 'Tipo', render: (s) => <Badge tone="neutral">{KIND[s.kind ?? ''] ?? s.kind ?? '—'}</Badge> },
    { key: 'bt', header: 'Modelo', render: (s) => <span>{BT[s.businessType ?? ''] ?? s.businessType ?? '—'}</span> },
    { key: 'cm', header: 'Catálogo', hideSm: true, render: (s) => <span>{CM[s.catalogMode ?? ''] ?? s.catalogMode ?? '—'}</span> },
    { key: 'wh', header: 'Bodegas', align: 'right', render: (s) => <span>{wh.filter((w) => w.siteId === s.id).length}</span> },
    { key: 'status', header: 'Estado', render: (s) => <Badge tone={s.active ? 'success' : 'neutral'}>{s.active ? 'Activa' : 'Inactiva'}</Badge> },
    { key: 'act', header: '', align: 'right', render: (s) => canWrite ? <div className="flex justify-end"><IconButton icon={Pencil} label="Editar" onClick={() => open(s)} /></div> : null },
  ]

  return (
    <>
      <PageHeader title="Sedes" subtitle="Puntos de operación de la empresa. Cada sede puede tener su modelo de negocio y bodegas." actions={canWrite ? <Button icon={Plus} onClick={() => open()}>Nueva sede</Button> : undefined} />
      <ErrorBox error={error} />
      <div className="grid gap-5 sm:grid-cols-3 mb-6">
        <Card className="p-5"><div className="flex items-center gap-3"><Store className="h-5 w-5 text-brand-700" /><div><div className="text-2xl font-bold text-ink">{sites.length}</div><div className="text-sm text-muted">Sedes</div></div></div></Card>
        <Card className="p-5"><div className="flex items-center gap-3"><Building2 className="h-5 w-5 text-success" /><div><div className="text-2xl font-bold text-ink">{sites.filter((s) => s.active).length}</div><div className="text-sm text-muted">Activas</div></div></div></Card>
        <Card className="p-5"><div className="flex items-center gap-3"><Warehouse className="h-5 w-5 text-info" /><div><div className="text-2xl font-bold text-ink">{wh.length}</div><div className="text-sm text-muted">Bodegas</div></div></div></Card>
      </div>
      <Card padded={false} title="Sedes registradas" subtitle={`${sites.length} sedes`}>
        <div className="pt-4">
          <DataTable columns={columns} rows={sites} loading={loading} empty={<EmptyState icon={MapPin} title="Sin sedes" />} />
        </div>
      </Card>
      <RecordForm open={form.open} onClose={() => setForm((f) => ({ ...f, open: false }))} table="sites" title={form.initial ? String(form.initial.name ?? 'Editar sede') : 'Nueva sede'} subtitle="Configuración de sede" fields={fields} initial={form.initial} canDelete={canWrite && !!form.initial && !form.initial.is_default && wh.filter((w) => w.siteId === form.initial?.id).length === 0} />
    </>
  )
}
