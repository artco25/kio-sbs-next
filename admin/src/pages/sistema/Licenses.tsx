import { Building2, Copy, KeyRound, Pencil, Plus, Power, RefreshCw, Server, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { KpiCard } from '../../components/charts'
import { Badge, Button, Card, Field, IconButton, IconTile, Input, Modal, PageHeader, Select, Textarea, useFeedback, type Tone } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { qty } from '../../lib/format'
import { gql } from '../../lib/gql'
import { SUITES } from '../../lib/suites'

type License = {
  id: string
  kind: 'hosted' | 'remote'
  companyId: string | null
  companyName: string | null
  customer: string | null
  licenseKey: string
  status: string
  state: string
  stateMessage: string | null
  startsAt: string | null
  endsAt: string | null
  maxDevices: number | null
  maxUsers: number | null
  modules: string[] | null
  notes: string | null
  devicesUsed: number | null
  usersUsed: number | null
  lastCheckAt: string | null
}
type Company = { id: string; name: string }

const FIELDS = `id kind companyId companyName customer licenseKey status state stateMessage startsAt endsAt maxDevices maxUsers modules notes devicesUsed usersUsed lastCheckAt`
const STATE_LABEL: Record<string, [string, Tone]> = {
  active: ['Activa', 'success'],
  suspended: ['Suspendida', 'danger'],
  expired: ['Vencida', 'warning'],
  not_started: ['Aún no inicia', 'info'],
}

type Mode = 'remote' | 'hosted' | 'newCompany' | 'edit'
const EMPTY = { customer: '', companyId: '', companyName: '', adminName: '', adminEmail: '', adminPassword: '', startsAt: '', endsAt: '', maxDevices: '', maxUsers: '', modules: [] as string[], notes: '' }

function LicenseModal({ mode, license, companies, onClose, onSaved }: { mode: Mode | null; license: License | null; companies: Company[]; onClose: () => void; onSaved: (created?: License) => void }) {
  const { toast } = useFeedback()
  const [f, setF] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof EMPTY, v: string | string[]) => setF((x) => ({ ...x, [k]: v }))

  useEffect(() => {
    if (!mode) return
    setF(license && mode === 'edit'
      ? { ...EMPTY, customer: license.customer ?? '', startsAt: license.startsAt ?? '', endsAt: license.endsAt ?? '', maxDevices: license.maxDevices?.toString() ?? '', maxUsers: license.maxUsers?.toString() ?? '', modules: license.modules ?? [], notes: license.notes ?? '' }
      : EMPTY)
  }, [mode, license])

  async function save() {
    const common = {
      startsAt: f.startsAt || null,
      endsAt: f.endsAt || null,
      maxDevices: f.maxDevices ? Number(f.maxDevices) : null,
      maxUsers: f.maxUsers ? Number(f.maxUsers) : null,
      modules: f.modules.length ? f.modules : null,
      notes: f.notes || null,
    }
    setSaving(true)
    try {
      let created: License | undefined
      if (mode === 'newCompany') {
        if (!f.companyName.trim() || !f.adminName.trim() || !f.adminEmail.trim() || !f.adminPassword) throw new Error('Empresa, administrador, correo y contraseña son obligatorios')
        const d = await gql<{ createLicensedCompany: License }>(`mutation($i:LicensedCompanyInput!){ createLicensedCompany(input:$i){ ${FIELDS} } }`, { i: { companyName: f.companyName.trim(), adminName: f.adminName.trim(), adminEmail: f.adminEmail.trim(), adminPassword: f.adminPassword, ...common } })
        created = d.createLicensedCompany
      } else {
        const input = mode === 'edit' ? { id: license!.id, customer: f.customer || null, status: license!.status, ...common } : { kind: mode, companyId: mode === 'hosted' ? f.companyId : null, customer: f.customer, ...common }
        if (mode === 'hosted' && !f.companyId) throw new Error('Selecciona la empresa')
        if (mode === 'remote' && !f.customer.trim()) throw new Error('Escribe el nombre del cliente')
        const d = await gql<{ saveLicense: License }>(`mutation($i:LicenseInput!){ saveLicense(input:$i){ ${FIELDS} } }`, { i: input })
        created = mode === 'edit' ? undefined : d.saveLicense
      }
      toast(mode === 'edit' ? 'Licencia actualizada' : 'Licencia creada')
      onSaved(created)
      onClose()
    } catch (e) { toast((e as Error).message, 'error') } finally { setSaving(false) }
  }

  const title = { remote: 'Nueva licencia · instalación del cliente', hosted: 'Licenciar empresa existente', newCompany: 'Nueva empresa con licencia', edit: 'Editar licencia' }[mode ?? 'edit']
  const toggleModule = (k: string) => set('modules', f.modules.includes(k) ? f.modules.filter((x) => x !== k) : [...f.modules, k])

  return (
    <Modal open={!!mode} onClose={onClose} title={title} subtitle="Se valida en cada inicio de sesión y sincronización." size="lg">
      <div className="space-y-4">
        {(mode === 'remote' || mode === 'edit') && license?.kind !== 'hosted' && (
          <Field label="Cliente" required><Input value={f.customer} onChange={(e) => set('customer', e.target.value)} placeholder="Nombre del cliente / negocio" /></Field>
        )}
        {mode === 'hosted' && (
          <Field label="Empresa" required>
            <Select value={f.companyId} onChange={(e) => set('companyId', e.target.value)}>
              <option value="">Selecciona…</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
        {mode === 'newCompany' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Empresa" required className="sm:col-span-2"><Input value={f.companyName} onChange={(e) => set('companyName', e.target.value)} /></Field>
            <Field label="Administrador" required><Input value={f.adminName} onChange={(e) => set('adminName', e.target.value)} /></Field>
            <Field label="Correo del administrador" required><Input type="email" value={f.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} /></Field>
            <Field label="Contraseña inicial" required hint="Mínimo 8, con letras y números"><Input type="text" value={f.adminPassword} onChange={(e) => set('adminPassword', e.target.value)} /></Field>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Inicia"><Input type="date" value={f.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></Field>
          <Field label="Termina (inclusive)" hint="Vacío = sin vencimiento"><Input type="date" value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} /></Field>
          <Field label="Máximo de cajas / equipos" hint="Vacío = ilimitado"><Input type="number" min={1} value={f.maxDevices} onChange={(e) => set('maxDevices', e.target.value)} /></Field>
          <Field label="Máximo de usuarios" hint="Vacío = ilimitado"><Input type="number" min={1} value={f.maxUsers} onChange={(e) => set('maxUsers', e.target.value)} /></Field>
        </div>
        <Field label="Módulos habilitados" hint="Sin marcar = todos">
          <div className="flex flex-wrap gap-2">
            {SUITES.filter((s) => s.key !== 'sistema').map((s) => (
              <label key={s.key} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${f.modules.includes(s.key) ? 'border-brand-700 bg-brand-50 text-brand-700' : 'border-line text-muted'}`}>
                <input type="checkbox" className="sr-only" checked={f.modules.includes(s.key)} onChange={() => toggleModule(s.key)} />
                {s.label}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Notas"><Textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button icon={ShieldCheck} loading={saving} onClick={save}>{mode === 'edit' ? 'Guardar cambios' : 'Crear licencia'}</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function Licenses() {
  const { platformRole } = useAuth()
  const { toast, confirm } = useFeedback()
  const [rows, setRows] = useState<License[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<Mode | null>(null)
  const [current, setCurrent] = useState<License | null>(null)
  const [justCreated, setJustCreated] = useState<License | null>(null)
  const canManage = platformRole === 'owner' || platformRole === 'admin'

  async function load() {
    setLoading(true)
    try {
      const [l, c] = await Promise.all([
        gql<{ licenses: License[] }>(`{ licenses { ${FIELDS} } }`),
        gql<{ platformCompanies: Company[] }>(`{ platformCompanies { id name } }`),
      ])
      setRows(l.licenses)
      setCompanies(c.platformCompanies)
    } catch (e) { toast((e as Error).message, 'error') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const free = useMemo(() => companies.filter((c) => !rows.some((r) => r.companyId === c.id)), [companies, rows])
  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((r) => r.state === 'active').length,
    remote: rows.filter((r) => r.kind === 'remote').length,
    direct: free.length,
  }), [rows, free])

  const copy = async (k: string) => { try { await navigator.clipboard.writeText(k); toast('Llave copiada') } catch { toast(k) } }

  async function toggle(l: License) {
    const turnOff = l.status === 'active'
    if (!(await confirm({ title: turnOff ? 'Suspender licencia' : 'Reactivar licencia', message: turnOff ? 'El cliente perderá el acceso en su próxima conexión (en una instalación propia, en unos 10 minutos).' : 'El cliente recuperará el acceso.', confirmLabel: turnOff ? 'Suspender' : 'Reactivar', danger: turnOff }))) return
    try {
      await gql(`mutation($id:ID!,$a:Boolean!){ setLicenseStatus(id:$id, active:$a){ id } }`, { id: l.id, a: !turnOff })
      toast(turnOff ? 'Licencia suspendida' : 'Licencia reactivada')
      await load()
    } catch (e) { toast((e as Error).message, 'error') }
  }
  async function regen(l: License) {
    if (!(await confirm({ title: 'Generar llave nueva', message: 'La llave actual dejará de funcionar. Tendrás que configurar la nueva en la instalación del cliente.', confirmLabel: 'Generar', danger: true }))) return
    try {
      await gql(`mutation($i:LicenseInput!){ saveLicense(input:$i){ id } }`, { i: { id: l.id, status: l.status, startsAt: l.startsAt, endsAt: l.endsAt, maxDevices: l.maxDevices, maxUsers: l.maxUsers, modules: l.modules, notes: l.notes, regenerateKey: true } })
      toast('Llave regenerada')
      await load()
    } catch (e) { toast((e as Error).message, 'error') }
  }
  async function remove(l: License) {
    if (!(await confirm({ title: 'Eliminar licencia', message: l.kind === 'hosted' ? 'La empresa pasará a ser directa (sin límites).' : 'La instalación del cliente dejará de validar y quedará bloqueada.', confirmLabel: 'Eliminar', danger: true }))) return
    try { await gql(`mutation($id:ID!){ deleteLicense(id:$id) }`, { id: l.id }); toast('Licencia eliminada'); await load() } catch (e) { toast((e as Error).message, 'error') }
  }

  return (
    <>
      <PageHeader
        title="Licencias"
        subtitle="Controla quién puede usar el sistema: vigencia, cajas, usuarios y módulos. Las empresas sin licencia son directas (sin límites)."
        actions={canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Server} onClick={() => { setCurrent(null); setMode('remote') }}>Instalación de cliente</Button>
            <Button variant="secondary" icon={Building2} onClick={() => { setCurrent(null); setMode('hosted') }}>Licenciar empresa</Button>
            <Button icon={Plus} onClick={() => { setCurrent(null); setMode('newCompany') }}>Nueva empresa</Button>
          </div>
        ) : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={KeyRound} label="Licencias" value={qty(stats.total)} hint={`${stats.active} activas`} />
        <KpiCard icon={Server} tone="info" label="Instalaciones de clientes" value={qty(stats.remote)} hint="validan contra este servidor" />
        <KpiCard icon={Building2} tone="success" label="Empresas licenciadas aquí" value={qty(stats.total - stats.remote)} hint="alojadas en este backend" />
        <KpiCard icon={ShieldCheck} tone="warning" label="Empresas directas" value={qty(stats.direct)} hint="sin licencia ni límites" />
      </div>

      {justCreated && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-300 bg-brand-50 p-4 text-sm">
          <KeyRound size={18} className="text-brand-700" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-ink">Licencia creada. Entrega esta llave al cliente:</div>
            <code className="break-all text-brand-700">{justCreated.licenseKey}</code>
          </div>
          <Button variant="secondary" icon={Copy} onClick={() => copy(justCreated.licenseKey)}>Copiar</Button>
          <Button variant="ghost" onClick={() => setJustCreated(null)}>Cerrar</Button>
        </div>
      )}

      <div className="mt-6">
        <Card padded={false} title="Licencias emitidas" subtitle={`${rows.length} licencias`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Vigencia</th>
                  <th className="px-4 py-3 text-right">Cajas</th>
                  <th className="px-4 py-3 text-right">Usuarios</th>
                  <th className="px-4 py-3">Módulos</th>
                  <th className="px-4 py-3">Llave</th>
                  {canManage && <th className="px-4 py-3 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td className="px-5 py-8 text-muted" colSpan={8}>Cargando...</td></tr>}
                {!loading && rows.map((l) => {
                  const [label, tone] = STATE_LABEL[l.state] ?? [l.state, 'neutral' as Tone]
                  return (
                    <tr key={l.id} className="border-b border-line/60 last:border-0">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <IconTile icon={l.kind === 'remote' ? Server : Building2} tone={l.state === 'active' ? 'brand' : 'neutral'} size={36} />
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-ink">{l.companyName || l.customer}</div>
                            <div className="truncate text-xs text-muted">{l.kind === 'remote' ? `Instalación propia${l.lastCheckAt ? ` · visto ${new Date(l.lastCheckAt).toLocaleString('es-CO')}` : ' · sin conexión aún'}` : 'Alojada aquí'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><Badge tone={tone} dot>{label}</Badge></td>
                      <td className="px-4 py-3 text-muted">{l.startsAt || '—'} → {l.endsAt || 'sin fin'}</td>
                      <td className="px-4 py-3 text-right">{l.devicesUsed ?? '—'} / {l.maxDevices ?? '∞'}</td>
                      <td className="px-4 py-3 text-right">{l.usersUsed ?? '—'} / {l.maxUsers ?? '∞'}</td>
                      <td className="px-4 py-3 text-muted">{l.modules ? l.modules.join(', ') : 'Todos'}</td>
                      <td className="px-4 py-3">
                        <button className="flex items-center gap-1.5 font-mono text-xs text-brand-700 hover:underline" onClick={() => copy(l.licenseKey)} title="Copiar llave">
                          {l.licenseKey.slice(0, 11)}… <Copy size={13} />
                        </button>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <IconButton icon={Power} label={l.status === 'active' ? 'Suspender' : 'Reactivar'} tone={l.status === 'active' ? 'danger' : 'success'} onClick={() => toggle(l)} />
                            <IconButton icon={Pencil} label="Editar" onClick={() => { setCurrent(l); setMode('edit') }} />
                            <IconButton icon={RefreshCw} label="Generar llave nueva" onClick={() => regen(l)} />
                            {platformRole === 'owner' && <IconButton icon={Trash2} label="Eliminar" tone="danger" onClick={() => remove(l)} />}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
                {!loading && !rows.length && <tr><td className="px-5 py-8 text-muted" colSpan={8}>Aún no hay licencias. Tus empresas actuales siguen funcionando sin límites.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <LicenseModal mode={mode} license={current} companies={free} onClose={() => setMode(null)} onSaved={(created) => { if (created) setJustCreated(created); void load() }} />
    </>
  )
}
