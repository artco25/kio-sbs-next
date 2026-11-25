import { Eye, Minus, Monitor, Pencil, ShieldCheck, UserCheck, UserPlus, Users as UsersIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { KpiCard } from '../../components/charts'
import { Badge, Button, Card, type Column, DataTable, EmptyState, ErrorBox, Field, ICON, IconButton, Input, Modal, NameCell, PageHeader, Select, StatusBadge, Switch, type Tone, useFeedback } from '../../components/ui'
import { ROLE_LABEL, type Role, useAuth } from '../../lib/auth'
import { relative, qty } from '../../lib/format'
import { gql } from '../../lib/gql'
import { invalidate } from '../../lib/records'
import { useGql } from '../../lib/useGql'

interface UserItem {
  id: string
  name: string
  email: string | null
  role: Role
  active: boolean
  posTerminal: string | null
  lastLoginAt: string | null
  employeeId: string | null
  roleId: string | null
  roleName: string | null
}

interface CustomRoleLite {
  id: string
  name: string
  baseRole: Role
  suites: string[]
}

const Q = `{ users{ id name email role active posTerminal lastLoginAt employeeId roleId roleName } roles{ id name baseRole suites } }`
const ROLES = Object.keys(ROLE_LABEL) as Role[]
const ROLE_TONE: Record<Role, Tone> = { admin: 'brand', contador: 'info', cajero: 'warning', vendedor: 'success' }

/**
 * Permisos por rol y tabla (copia de kio-sbs-bk/schema/tables.json). Un carácter por rol en el orden
 * admin, contador, cajero, vendedor: w = lectura y escritura, r = sólo lectura, - = sin acceso.
 */
const PERMS: [table: string, label: string, axis: string, code: string][] = [
  ['partners', 'Contactos', 'Comercial', 'wwww'],
  ['categories', 'Categorías', 'Comercial', 'wwrr'],
  ['products', 'Productos', 'Comercial', 'wwrr'],
  ['stock_moves', 'Movimientos de inventario', 'Comercial', 'wwww'],
  ['sales', 'Ventas y pedidos', 'Comercial', 'wwww'],
  ['sale_lines', 'Líneas de venta', 'Comercial', 'wwww'],
  ['pos_sessions', 'Sesiones de caja', 'Punto de venta', 'wrwr'],
  ['payments', 'Pagos y recibos de caja', 'Financiero', 'wwww'],
  ['expenses', 'Caja menor y gastos', 'Financiero', 'wwww'],
  ['employees', 'Empleados', 'Personal', 'ww--'],
  ['payroll_novelties', 'Novedades de nómina', 'Personal', 'ww--'],
  ['leave_requests', 'Vacaciones y permisos', 'Personal', 'ww--'],
  ['payslips', 'Desprendibles de nómina', 'Personal', 'ww--'],
  ['payroll_params', 'Parámetros de nómina', 'Personal', 'wwrr'],
]

const passwordError = (pw: string) => (pw.length < 8 ? 'Mínimo 8 caracteres' : !/[A-Za-z]/.test(pw) || !/\d/.test(pw) ? 'Debe combinar letras y números' : '')

export default function Users() {
  const { me } = useAuth()
  const { data, loading, error } = useGql<{ users: UserItem[]; roles: CustomRoleLite[] }>(Q)
  const [editing, setEditing] = useState<UserItem | 'new' | null>(null)
  const users = data?.users ?? []
  const roles = data?.roles ?? []

  const weekAgo = Date.now() - 7 * 86_400_000
  const columns: Column<UserItem>[] = [
    { key: 'name', header: 'Usuario', render: (u) => <NameCell name={u.name} sub={u.email} /> },
    { key: 'role', header: 'Rol', render: (u) => <Badge tone={u.roleName ? 'brand' : ROLE_TONE[u.role] ?? 'neutral'}>{u.roleName ?? ROLE_LABEL[u.role] ?? u.role}</Badge> },
    { key: 'terminal', header: 'Terminal de caja', hideSm: true, render: (u) => (u.posTerminal ? <span className="font-mono text-[13px]">{u.posTerminal}</span> : <span className="text-muted">—</span>) },
    { key: 'last', header: 'Último ingreso', hideSm: true, render: (u) => (u.lastLoginAt ? relative(u.lastLoginAt) : <span className="text-muted">Nunca</span>) },
    { key: 'status', header: 'Estado', render: (u) => <StatusBadge status={u.active ? 'activo' : 'inactivo'} /> },
    { key: 'act', header: '', align: 'right', render: (u) => <IconButton icon={Pencil} label="Editar usuario" onClick={() => setEditing(u)} /> },
  ]

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle={`Quién puede entrar a ${me?.company.name ?? 'la empresa'} y con qué rol. Los roles y las suites se definen en Roles y permisos.`}
        actions={
          <Button icon={UserPlus} onClick={() => setEditing('new')}>
            Nuevo usuario
          </Button>
        }
      />
      <ErrorBox error={error} />

      <div className="mb-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={UsersIcon} label="Usuarios" value={qty(users.length)} hint={`${users.filter((u) => !u.active).length} inactivos`} />
        <KpiCard icon={UserCheck} tone="success" label="Activos" value={qty(users.filter((u) => u.active).length)} hint="Pueden iniciar sesión" />
        <KpiCard icon={ShieldCheck} tone="info" label="Administradores" value={qty(users.filter((u) => u.role === 'admin' && u.active).length)} hint="Acceso total" />
        <KpiCard icon={Monitor} tone="warning" label="Con caja asignada" value={qty(users.filter((u) => u.posTerminal).length)} hint={`${users.filter((u) => u.lastLoginAt && new Date(u.lastLoginAt).getTime() > weekAgo).length} ingresaron esta semana`} />
      </div>

      <Card padded={false} title="Equipo" subtitle={`${users.length} ${users.length === 1 ? 'usuario' : 'usuarios'}`}>
        <div className="pt-4">
          <DataTable columns={columns} rows={users} loading={loading} onRowClick={setEditing} empty={<EmptyState icon={UsersIcon} title="Sin usuarios" />} />
        </div>
      </Card>

      <UserModal target={editing} onClose={() => setEditing(null)} selfId={me?.user.id} roles={roles} />
    </>
  )
}

// ============================================================================ matriz de permisos

function Cell({ mode }: { mode: string }) {
  if (mode === 'w') return <Pencil {...ICON} className="mx-auto text-brand-700" aria-label="Lectura y escritura" />
  if (mode === 'r') return <Eye {...ICON} className="mx-auto text-info" aria-label="Sólo lectura" />
  return <Minus {...ICON} className="mx-auto text-subtle" aria-label="Sin acceso" />
}

export function PermissionMatrix() {
  const rows = useMemo(() => PERMS.map(([id, label, axis, code]) => ({ id, label, axis, code })), [])
  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: 'table',
      header: 'Módulo',
      render: (r) => (
        <div>
          <div className="font-semibold text-ink">{r.label}</div>
          <div className="text-xs text-muted">{r.axis}</div>
        </div>
      ),
    },
    ...ROLES.map<Column<(typeof rows)[number]>>((role, i) => ({ key: role, header: ROLE_LABEL[role], align: 'center', render: (r) => <Cell mode={r.code[i]} /> })),
  ]
  return (
    <Card
      className="mt-6"
      padded={false}
      title="Matriz de permisos"
      subtitle="Lo que cada rol puede hacer en las apps y en este panel."
      actions={
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Pencil {...ICON} size={15} className="text-brand-700" /> Lectura y escritura
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Eye {...ICON} size={15} className="text-info" /> Sólo lectura
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Minus {...ICON} size={15} className="text-subtle" /> Sin acceso
          </span>
        </div>
      }
    >
      <div className="pt-4">
        <DataTable columns={columns} rows={rows} pageSize={20} />
      </div>
    </Card>
  )
}

// ============================================================================ crear / editar

function UserModal({ target, onClose, selfId, roles }: { target: UserItem | 'new' | null; onClose: () => void; selfId?: string; roles: CustomRoleLite[] }) {
  if (!target) return null
  // El formulario se monta sólo mientras está abierto: el estado inicial sale del usuario elegido.
  return <UserForm key={target === 'new' ? 'new' : target.id} target={target} onClose={onClose} isSelf={target !== 'new' && target.id === selfId} roles={roles} />
}

function UserForm({ target, onClose, isSelf, roles }: { target: UserItem | 'new'; onClose: () => void; isSelf: boolean; roles: CustomRoleLite[] }) {
  const { toast } = useFeedback()
  const u = target === 'new' ? null : target
  const [name, setName] = useState(u?.name ?? '')
  const [email, setEmail] = useState(u?.email ?? '')
  // Un solo selector: 'base:<rol>' (rol base) o 'role:<id>' (rol personalizado de la empresa)
  const [roleKey, setRoleKey] = useState<string>(u?.roleId ? `role:${u.roleId}` : `base:${u?.role ?? 'vendedor'}`)
  const [terminal, setTerminal] = useState(u?.posTerminal ?? '')
  const [active, setActive] = useState(u?.active ?? true)
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const custom = roleKey.startsWith('role:') ? roles.find((r) => r.id === roleKey.slice(5)) : undefined

  async function submit() {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Obligatorio'
    if (!u && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Correo inválido'
    if (!u || password) {
      const pe = passwordError(password)
      if (pe) errs.password = pe
    }
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      if (!u) {
        await gql('mutation($i:UserInput!){ createUser(input:$i){ id } }', {
          i: { name: name.trim(), email: email.trim().toLowerCase(), password, role: roleKey.startsWith('base:') ? roleKey.slice(5) : custom?.baseRole ?? 'vendedor', roleId: custom?.id ?? null, posTerminal: terminal.trim() || null },
        })
        toast('Usuario creado')
      } else {
        const input: Record<string, unknown> = { name: name.trim(), active, posTerminal: terminal.trim() || null }
        if (!isSelf) {
          if (custom) input.roleId = custom.id
          else {
            input.roleId = null
            input.role = roleKey.slice(5)
          }
        }
        if (password) input.password = password
        await gql('mutation($id:ID!,$i:UserUpdate!){ updateUser(id:$id, input:$i){ id } }', { id: u.id, i: input })
        toast(password ? 'Cambios guardados; se cerraron sus sesiones abiertas' : 'Cambios guardados')
      }
      invalidate()
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={u ? 'Editar usuario' : 'Nuevo usuario'}
      subtitle={u ? u.email ?? undefined : 'Recibirá acceso con el correo y la contraseña que definas.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={saving} onClick={submit}>
            {u ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" required error={errors.name} className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Correo" required={!u} error={errors.email} className="sm:col-span-2">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!u} />
        </Field>
        <Field label="Rol" required hint={isSelf ? 'No puedes cambiar tu propio rol.' : custom ? `Entra a: ${custom.suites.join(', ')}` : undefined}>
          <Select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} disabled={isSelf}>
            <optgroup label="Roles base">
              {ROLES.map((r) => (
                <option key={r} value={`base:${r}`}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </optgroup>
            {roles.length > 0 && (
              <optgroup label="Roles de la empresa">
                {roles.map((r) => (
                  <option key={r.id} value={`role:${r.id}`}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>
        <Field label="Terminal de caja" hint="Prefijo de la caja POS (opcional).">
          <Input value={terminal} onChange={(e) => setTerminal(e.target.value)} placeholder="Ej. C1" />
        </Field>
        <Field label={u ? 'Nueva contraseña' : 'Contraseña'} required={!u} error={errors.password} hint={u ? 'Déjala vacía para conservar la actual.' : 'Mínimo 8 caracteres con letras y números.'} className="sm:col-span-2">
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {u && (
          <div className="sm:col-span-2">
            <Switch checked={active} onChange={setActive} disabled={isSelf} label={<span className="text-muted">{active ? 'Usuario activo' : 'Usuario inactivo: no puede iniciar sesión'}</span>} />
            {isSelf && <p className="mt-1 text-xs text-muted">No puedes desactivar tu propia cuenta.</p>}
          </div>
        )}
      </div>
    </Modal>
  )
}
