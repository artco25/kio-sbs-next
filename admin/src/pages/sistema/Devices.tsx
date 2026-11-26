import { CloudOff, Laptop, MonitorSmartphone, Monitor, Pencil, RefreshCw, Smartphone, Tag, Wifi, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { KpiCard } from '../../components/charts'
import { Badge, Button, Card, type Column, DataTable, EmptyState, ErrorBox, Field, IconButton, IconTile, Modal, NameCell, PageHeader, Select, type Tone, useFeedback } from '../../components/ui'
import { qty, relative } from '../../lib/format'
import { gql } from '../../lib/gql'
import { useGql } from '../../lib/useGql'

interface DeviceItem {
  id: string
  name: string | null
  platform: string | null
  appVersion: string | null
  lastSyncAt: string | null
  lastCursor: number
  pending: number
  siteId: string | null
  user: { name: string } | null
}

interface SiteLite { id: string; name: string }

const Q = `{ devices{ id name platform appVersion lastSyncAt lastCursor pending siteId user{ name } } sites{ id name } }`

const PLATFORM: Record<string, { label: string; icon: LucideIcon; tone: Tone }> = {
  windows: { label: 'Windows', icon: Monitor, tone: 'brand' },
  linux: { label: 'Linux', icon: Laptop, tone: 'info' },
  android: { label: 'Android', icon: Smartphone, tone: 'success' },
  ios: { label: 'iOS', icon: Smartphone, tone: 'warning' },
}

const ts = (v: string | null) => {
  if (!v) return null
  const s = /[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v.replace(' ', 'T')}Z`
  const t = new Date(s).getTime()
  return Number.isNaN(t) ? null : t
}

const MIN = 60_000

export default function Devices() {
  const { toast } = useFeedback()
  const { data, loading, error, reload } = useGql<{ devices: DeviceItem[]; sites: SiteLite[] }>(Q)
  const [editing, setEditing] = useState<DeviceItem | null>(null)
  const [siteId, setSiteId] = useState('')
  const [saving, setSaving] = useState(false)
  // El estado en línea depende de la hora: refresca cada 30 s.
  useEffect(() => {
    const t = setInterval(() => void reload(), 30_000)
    return () => clearInterval(t)
  }, [reload])

  const devices = useMemo(() => [...(data?.devices ?? [])].sort((a, b) => (ts(b.lastSyncAt) ?? 0) - (ts(a.lastSyncAt) ?? 0)), [data])
  const sites = data?.sites ?? []
  const siteName = (id: string | null) => sites.find((s) => s.id === id)?.name ?? '—'
  const now = Date.now()
  const online = (d: DeviceItem) => {
    const t = ts(d.lastSyncAt)
    return t != null && now - t < 5 * MIN
  }
  const synced24 = devices.filter((d) => {
    const t = ts(d.lastSyncAt)
    return t != null && now - t < 24 * 60 * MIN
  }).length
  const withPending = devices.filter((d) => d.pending > 0).length
  const versions = new Set(devices.map((d) => d.appVersion).filter(Boolean)).size

  async function saveSite() {
    if (!editing) return
    setSaving(true)
    try {
      await gql('mutation($id:ID!,$siteId:ID){ assignDeviceSite(id:$id, siteId:$siteId){ id siteId } }', { id: editing.id, siteId: siteId || null })
      toast('Sede asignada')
      setEditing(null)
      await reload()
    } catch (e) { toast((e as Error).message, 'error') } finally { setSaving(false) }
  }

  const columns: Column<DeviceItem>[] = [
    {
      key: 'device',
      header: 'Equipo',
      render: (d) => {
        const p = PLATFORM[(d.platform ?? '').toLowerCase()] ?? { label: d.platform ?? 'Equipo', icon: MonitorSmartphone, tone: 'neutral' as Tone }
        return (
          <div className="flex min-w-0 items-center gap-3">
            <IconTile icon={p.icon} tone={p.tone} />
            <div className="min-w-0">
              <div className="truncate font-semibold text-ink">{d.name || 'Equipo sin nombre'}</div>
              <div className="truncate text-xs text-muted">{p.label}</div>
            </div>
          </div>
        )
      },
    },
    { key: 'user', header: 'Usuario', hideSm: true, render: (d) => (d.user ? <NameCell name={d.user.name} /> : <span className="text-muted">—</span>) },
    { key: 'site', header: 'Sede', hideSm: true, render: (d) => <span>{siteName(d.siteId)}</span> },
    { key: 'version', header: 'Versión', hideSm: true, render: (d) => (d.appVersion ? <Badge tone="neutral">v{d.appVersion}</Badge> : '—') },
    {
      key: 'sync',
      header: 'Último sync',
      render: (d) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="whitespace-nowrap">{d.lastSyncAt ? relative(new Date(ts(d.lastSyncAt) ?? 0).toISOString()) : 'Nunca'}</span>
          {online(d) && (
            <Badge tone="success" dot>
              En línea
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'pending',
      header: 'Pendientes',
      align: 'right',
      render: (d) => (d.pending > 0 ? <Badge tone="warning">{qty(d.pending)} por enviar</Badge> : <Badge tone="success">Al día</Badge>),
    },
    { key: 'act', header: '', align: 'right', render: (d) => <IconButton icon={Pencil} label="Asignar sede" onClick={() => { setEditing(d); setSiteId(d.siteId ?? '') }} /> },
  ]

  return (
    <>
      <PageHeader title="Cajas y dispositivos" subtitle="Equipos que sincronizan con tu empresa: cajas POS y apps móviles." />
      <ErrorBox error={error} />

      <div className="mb-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={MonitorSmartphone} label="Equipos" value={qty(devices.length)} hint={`${devices.filter(online).length} en línea ahora`} />
        <KpiCard icon={RefreshCw} tone="success" label="Sincronizados en 24 h" value={qty(synced24)} hint={`${devices.length - synced24} sin sincronizar`} />
        <KpiCard icon={CloudOff} tone="warning" label="Con cambios pendientes" value={qty(withPending)} hint="Datos aún sin enviar al servidor" />
        <KpiCard icon={Tag} tone="info" label="Versiones distintas" value={qty(versions)} hint={versions > 1 ? 'Conviene actualizar los equipos' : 'Todos en la misma versión'} />
      </div>

      <Card padded={false} title="Equipos registrados" subtitle={`${devices.length} ${devices.length === 1 ? 'equipo' : 'equipos'}`}>
        <div className="pt-4">
          <DataTable
            columns={columns}
            rows={devices}
            loading={loading}
            empty={<EmptyState icon={MonitorSmartphone} title="Aún no hay equipos" message="Cuando una caja o app inicie sesión y sincronice, aparecerá aquí." />}
          />
        </div>
      </Card>

      <Card className="mt-6" title="Cómo funciona la sincronización">
        <div className="flex items-start gap-4">
          <IconTile icon={Wifi} />
          <div className="space-y-2 text-sm text-muted">
            <p>
              Las cajas y apps trabajan <span className="font-semibold text-ink">sin conexión</span>: guardan cada venta, pago y movimiento en el propio equipo y los envían al servidor
              automáticamente cada <span className="font-semibold text-ink">90 segundos</span>, junto con los cambios que hagas desde este panel.
            </p>
            <p>
              Un equipo aparece <span className="font-semibold text-ink">en línea</span> si sincronizó hace menos de 5 minutos. Los <span className="font-semibold text-ink">pendientes</span> son cambios
              locales que esperan conexión; se enviarán solos al recuperarla, así que no hace falta intervenir.
            </p>
          </div>
        </div>
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Asignar sede" subtitle={editing?.name || 'Dispositivo'}>
        <div className="space-y-4">
          <Field label="Sede">
            <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Sin sede</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button loading={saving} onClick={saveSite}>Guardar</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
