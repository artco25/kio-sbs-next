import { Building2, Crown, Eye, LogIn, Plus, Shield, Trash2, UserCog, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KpiCard } from '../../components/charts'
import { Badge, Button, Card, Field, IconButton, IconTile, Input, Modal, PageHeader, Select, useFeedback, type Tone } from '../../components/ui'
import { ME_FIELDS, useAuth } from '../../lib/auth'
import { money, qty, relative } from '../../lib/format'
import { gql } from '../../lib/gql'

type PlatformCompany = {
  id: string
  name: string
  nit: string | null
  email: string | null
  phone: string | null
  city: string | null
  plan: string
  active: boolean
  createdAt: string | null
  usersCount: number
  salesCount: number
  salesTotal: number
  lastActivityAt: string | null
}

type PlatformUser = {
  id: string
  name: string
  email: string | null
  role: string
  active: boolean
  platformRole: 'owner' | 'admin' | 'viewer' | null
  lastLoginAt: string | null
}

const Q_COMPANIES = `{ platformCompanies { id name nit email phone city plan active createdAt usersCount salesCount salesTotal lastActivityAt } }`
const Q_USERS = `{ platformUsers { id name email role active platformRole lastLoginAt } }`

const PR_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin plataforma', viewer: 'Solo lectura' }
const PR_TONE: Record<string, Tone> = { owner: 'warning', admin: 'brand', viewer: 'neutral' }

function UserModal({ open, onClose, onSaved, currentRole }: { open: boolean; onClose: () => void; onSaved: () => void; currentRole: string | null }) {
  const { toast } = useFeedback()
  const [form, setForm] = useState({ name: '', email: '', password: '', platformRole: 'viewer' })
  const [saving, setSaving] = useState(false)
  const options = currentRole === 'owner'
    ? [{ value: 'owner', label: 'Owner (igual que tú)' }, { value: 'admin', label: 'Admin plataforma' }, { value: 'viewer', label: 'Solo lectura' }]
    : [{ value: 'admin', label: 'Admin plataforma' }, { value: 'viewer', label: 'Solo lectura' }]

  useEffect(() => { if (open) setForm({ name: '', email: '', password: '', platformRole: 'viewer' }) }, [open])

  async function save() {
    if (!form.name.trim() || !form.email.trim() || !form.password) return toast('Nombre, correo y contraseña son obligatorios', 'error')
    setSaving(true)
    try {
      await gql(`mutation($i:PlatformUserInput!){ createPlatformUser(input:$i){ id } }`, { i: { ...form, name: form.name.trim(), email: form.email.trim() } })
      toast('Usuario de plataforma creado')
      onSaved()
      onClose()
    } catch (e) { toast((e as Error).message, 'error') } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo usuario de plataforma" subtitle="Puede ver empresas y, según su nivel, gestionar usuarios de plataforma.">
      <div className="space-y-4">
        <Field label="Nombre" required><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
        <Field label="Correo" required><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
        <Field label="Contraseña" required><Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></Field>
        <Field label="Nivel de acceso">
          <Select value={form.platformRole} onChange={(e) => setForm((f) => ({ ...f, platformRole: e.target.value }))}>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button icon={Plus} loading={saving} onClick={save}>Crear usuario</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function Platform() {
  const { platformRole, startImpersonation } = useAuth()
  const { toast, confirm } = useFeedback()
  const navigate = useNavigate()
  const [companies, setCompanies] = useState<PlatformCompany[]>([])
  const [users, setUsers] = useState<PlatformUser[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [c, u] = await Promise.all([
        gql<{ platformCompanies: PlatformCompany[] }>(Q_COMPANIES),
        gql<{ platformUsers: PlatformUser[] }>(Q_USERS),
      ])
      setCompanies(c.platformCompanies)
      setUsers(u.platformUsers)
    } catch (e) { toast((e as Error).message, 'error') } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  async function enterCompany(c: PlatformCompany) {
    if (!(await confirm({ title: 'Entrar a empresa', message: `Vas a entrar como administrador a "${c.name}". Podrás operar dentro de esa empresa.`, confirmLabel: 'Entrar' }))) return
    try {
      const d = await gql<{ switchCompany: { token: string; me: any } }>(`mutation($id:ID!){ switchCompany(companyId:$id){ token me { ${ME_FIELDS} } } }`, { id: c.id })
      startImpersonation(d.switchCompany.token, d.switchCompany.me)
      navigate('/panel')
    } catch (e) { toast((e as Error).message, 'error') }
  }

  async function removeCompany(c: PlatformCompany) {
    if (!(await confirm({ title: 'Eliminar empresa', message: `Se eliminará "${c.name}" y todos sus datos relacionados (usuarios, productos, ventas, inventario, etc.). Esta acción no se puede deshacer.`, confirmLabel: 'Eliminar empresa', danger: true }))) return
    try {
      await gql(`mutation($id:ID!){ deleteCompany(id:$id) }`, { id: c.id })
      toast('Empresa eliminada')
      await load()
    } catch (e) { toast((e as Error).message, 'error') }
  }

  const totals = useMemo(() => ({
    companies: companies.length,
    active: companies.filter((c) => c.active).length,
    sales: companies.reduce((a, c) => a + c.salesTotal, 0),
    users: companies.reduce((a, c) => a + c.usersCount, 0),
  }), [companies])

  const canManage = platformRole === 'owner' || platformRole === 'admin'
  const isOwner = platformRole === 'owner'

  return (
    <>
      <PageHeader
        title="Plataforma"
        subtitle="Vista global de empresas y usuarios de plataforma. Aislamiento entre empresas se mantiene para usuarios normales."
        actions={canManage ? <Button icon={Plus} onClick={() => setOpen(true)}>Usuario plataforma</Button> : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Building2} label="Empresas" value={qty(totals.companies)} hint={`${totals.active} activas`} />
        <KpiCard icon={Users} tone="info" label="Usuarios totales" value={qty(totals.users)} hint="en todas las empresas" />
        <KpiCard icon={Shield} tone="success" label="Ventas confirmadas" value={money(totals.sales)} hint="acumulado global" />
        <KpiCard icon={Crown} tone="warning" label="Usuarios plataforma" value={qty(users.length)} hint={platformRole ? PR_LABEL[platformRole] : ''} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card padded={false} title="Empresas" subtitle={`${companies.length} empresas registradas`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">Empresa</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3 text-right">Usuarios</th>
                  <th className="px-4 py-3 text-right">Ventas</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Última actividad</th>
                  {isOwner && <th className="px-4 py-3 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td className="px-5 py-8 text-muted" colSpan={isOwner ? 7 : 6}>Cargando...</td></tr>}
                {!loading && companies.map((c) => (
                  <tr key={c.id} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <IconTile icon={Building2} tone={c.active ? 'brand' : 'neutral'} size={36} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-ink">{c.name}</div>
                          <div className="truncate text-xs text-muted">{c.nit || c.email || c.city || 'Sin datos'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge tone="neutral">{c.plan || 'sbs_base'}</Badge></td>
                    <td className="px-4 py-3 text-right font-medium">{qty(c.usersCount)}</td>
                    <td className="px-4 py-3 text-right font-medium">{qty(c.salesCount)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">{money(c.salesTotal)}</td>
                    <td className="px-4 py-3 text-muted">{c.lastActivityAt ? relative(c.lastActivityAt) : '—'}</td>
                    {isOwner && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <IconButton icon={LogIn} label="Entrar a empresa" onClick={() => enterCompany(c)} />
                          <IconButton icon={Trash2} label="Eliminar empresa" tone="danger" onClick={() => removeCompany(c)} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {!loading && !companies.length && <tr><td className="px-5 py-8 text-muted" colSpan={isOwner ? 7 : 6}>No hay empresas.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Usuarios de plataforma" subtitle="Acceso cross-company">
          <div className="space-y-3">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-2xl border border-line p-3">
                <IconTile icon={u.platformRole === 'owner' ? Crown : u.platformRole === 'admin' ? UserCog : Eye} tone={PR_TONE[u.platformRole ?? 'viewer']} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{u.name}</div>
                  <div className="truncate text-xs text-muted">{u.email}</div>
                </div>
                <Badge tone={PR_TONE[u.platformRole ?? 'viewer']}>{PR_LABEL[u.platformRole ?? 'viewer']}</Badge>
              </div>
            ))}
            {!users.length && !loading && <div className="text-sm text-muted">Sin usuarios de plataforma.</div>}
          </div>
        </Card>
      </div>

      <UserModal open={open} onClose={() => setOpen(false)} onSaved={load} currentRole={platformRole} />
    </>
  )
}
