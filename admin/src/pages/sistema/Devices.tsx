import { CloudOff, Laptop, MonitorSmartphone, Monitor, Pencil, RefreshCw, Smartphone, Tag, Wifi, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { KpiCard } from '../../components/charts'
import { Badge, Button, Card, type Column, DataTable, EmptyState, ErrorBox, Field, IconButton, IconTile, Modal, NameCell, PageHeader, Select, type Tone, useFeedback } from '../../components/ui'
import { money, qty, relative } from '../../lib/format'
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
  terminalCode: string | null
  section: string | null
  macAddress: string | null
  hardwareId: string | null
  user: { name: string } | null
}

interface SiteLite { id: string; name: string }
interface PosSessionLite {
  id: string
  terminal: string | null
  status: string
  openedAt: string
  closedAt: string | null
  openingAmount: number
  closingAmount: number | null
  salesTotal: number
  salesCount: number
  openedBy: { name: string } | null
  closedBy: { name: string } | null
}

const Q = `{ devices{ id name platform appVersion lastSyncAt lastCursor pending siteId terminalCode section macAddress hardwareId user{ name } } sites{ id name } }`
const HISTORY_Q = `query($terminal:String){ posSessions(terminal:$terminal, limit:50){ id terminal status openedAt closedAt openingAmount closingAmount salesTotal salesCount openedBy{ name } closedBy{ name } } }`

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
  const [historyDevice, setHistoryDevice] = useState<DeviceItem | null>(null)
  const [history, setHistory] = useState<PosSessionLite[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
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

  async function openHistory(d: DeviceItem) {
    setHistoryDevice(d)
    setHistory([])
    const terminal = d.terminalCode?.trim()
    if (!terminal) return
    setHistoryLoading(true)
    try {
      const res = await gql<{ posSessions: PosSessionLite[] }>(HISTORY_Q, { terminal })
      setHistory(res.posSessions ?? [])
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setHistoryLoading(false) }
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
    {
      key: 'terminal',
      header: 'Caja / terminal',
      render: (d) => (
        <button type="button" className="text-left" onClick={() => openHistory(d)}>
          <div className="font-semibold text-brand-700 hover:underline">{d.terminalCode || 'Sin código'}</div>
          <div className="text-xs text-muted">{d.section ? `Sección ${d.section}` : 'Sin sección'}{d.macAddress ? ` · MAC ${d.macAddress}` : ''}</div>
        </button>
      ),
    },
    { key: 'user', header: 'Usuario', hideSm: true, render: (d) => (d.user ? <NameCell name={d.user.name} /> : <span className="text-muted">—</span>) },
    { key: 'site', header: 'Sede', hideSm: true, render: (d) => <span>{siteName(d.siteId)}</span> },
    { key: 'version', header: 'Versión', hideSm: true, render: (d) => (d.appVersion ? <Badge tone="neutral">v{d.appVersion}</Badge> : '—') },
    {
      key: 'sync',
      header: 'Último sync',
      render: (d) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="whitespace-nowrap font-medium text-ink">{d.lastSyncAt ? relative(new Date(ts(d.lastSyncAt) ?? 0).toISOString()) : 'Nunca'}</span>
            {online(d) ? <Badge tone="success" dot>En línea</Badge> : d.lastSyncAt ? <Badge tone="neutral">Sin señal reciente</Badge> : null}
          </div>
          <div className="text-xs text-muted">{d.lastSyncAt ? new Date(ts(d.lastSyncAt) ?? 0).toLocaleString() : 'Sin sincronización'} · cursor {qty(d.lastCursor)}</div>
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

      <Modal open={!!historyDevice} onClose={() => setHistoryDevice(null)} title={`Historial de caja ${historyDevice?.terminalCode || ''}`} subtitle={historyDevice?.name || 'Dispositivo POS'}>
        <div className="space-y-4">
          <div className="grid gap-3 rounded-2xl bg-canvas/60 p-4 text-sm sm:grid-cols-2">
            <div><span className="text-muted">Terminal/código:</span> <span className="font-semibold text-ink">{historyDevice?.terminalCode || '—'}</span></div>
            <div><span className="text-muted">Sección:</span> <span className="font-semibold text-ink">{historyDevice?.section || '—'}</span></div>
            <div><span className="text-muted">MAC:</span> <span className="font-semibold text-ink">{historyDevice?.macAddress || '—'}</span></div>
            <div><span className="text-muted">Hardware ID:</span> <span className="font-semibold text-ink break-all">{historyDevice?.hardwareId || '—'}</span></div>
          </div>
          {!historyDevice?.terminalCode ? (
            <p className="text-sm text-muted">Este equipo aún no tiene código de caja/terminal configurado. Se asignará cuando la app POS envíe su configuración.</p>
          ) : historyLoading ? (
            <p className="text-sm text-muted">Cargando historial...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted">No hay sesiones de caja registradas para este terminal.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-muted"><th className="py-2 pr-3">Apertura</th><th className="py-2 pr-3">Estado</th><th className="py-2 pr-3">Abrió</th><th className="py-2 pr-3 text-right">Ventas</th><th className="py-2 text-right">Total</th></tr></thead>
                <tbody>
                  {history.map((s) => (
                    <tr key={s.id} className="border-b border-line/60">
                      <td className="py-2 pr-3 whitespace-nowrap">{new Date(/z|[+-]\d\d:?\d\d$/i.test(s.openedAt) ? s.openedAt : `${s.openedAt.replace(' ','T')}Z`).toLocaleString()}</td>
                      <td className="py-2 pr-3"><Badge tone={s.status === 'abierta' ? 'warning' : 'success'}>{s.status}</Badge></td>
                      <td className="py-2 pr-3">{s.openedBy?.name || '—'}</td>
                      <td className="py-2 pr-3 text-right">{qty(s.salesCount)}</td>
                      <td className="py-2 text-right font-medium">{money(s.salesTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
