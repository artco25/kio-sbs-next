import { CloudOff, Laptop, MonitorSmartphone, Monitor, RefreshCw, Smartphone, Tag, Wifi, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { KpiCard } from '../../components/charts'
import { Badge, Card, type Column, DataTable, EmptyState, ErrorBox, IconTile, NameCell, PageHeader, type Tone } from '../../components/ui'
import { qty, relative } from '../../lib/format'
import { useGql } from '../../lib/useGql'

interface DeviceItem {
  id: string
  name: string | null
  platform: string | null
  appVersion: string | null
  lastSyncAt: string | null
  lastCursor: number
  pending: number
  user: { name: string } | null
}

const Q = `{ devices{ id name platform appVersion lastSyncAt lastCursor pending user{ name } } }`

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
  const { data, loading, error, reload } = useGql<{ devices: DeviceItem[] }>(Q)
  // El estado en línea depende de la hora: refresca cada 30 s.
  useEffect(() => {
    const t = setInterval(() => void reload(), 30_000)
    return () => clearInterval(t)
  }, [reload])

  const devices = useMemo(() => [...(data?.devices ?? [])].sort((a, b) => (ts(b.lastSyncAt) ?? 0) - (ts(a.lastSyncAt) ?? 0)), [data])
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
    </>
  )
}
