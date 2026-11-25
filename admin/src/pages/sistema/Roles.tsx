import { Eye, Minus, Pencil, Plus, ShieldCheck, Trash2, Users as UsersIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { KpiCard } from '../../components/charts'
import { Badge, Button, Card, cn, EmptyState, ErrorBox, Field, ICON, IconButton, IconTile, Input, Modal, PageHeader, Select, Textarea, useFeedback } from '../../components/ui'
import { ROLE_LABEL, type Role } from '../../lib/auth'
import { gql } from '../../lib/gql'
import { invalidate } from '../../lib/records'
import { SUITES, type SuiteKey } from '../../lib/suites'
import { useGql } from '../../lib/useGql'
import { PermissionMatrix } from './Users'

type Mode = '' | 'r' | 'w'

interface RoleItem {
  id: string
  name: string
  description: string | null
  baseRole: Role
  suites: SuiteKey[]
  permissions: Record<string, Mode>
  userCount: number
}

interface SuiteInfo {
  key: SuiteKey
  label: string
  tables: string[]
}

const Q = `{ roles{ id name description baseRole suites permissions userCount } suites{ key label tables } }`

/** Etiqueta de cada módulo (tabla de schema/tables.json) en la matriz del rol. */
const TABLE_LABEL: Record<string, string> = {
  partners: 'Contactos (clientes y proveedores)',
  products: 'Productos',
  categories: 'Categorías',
  stock_moves: 'Movimientos de inventario',
  sales: 'Ventas y pedidos',
  sale_lines: 'Líneas de venta',
  payments: 'Pagos y recibos de caja',
  pos_sessions: 'Sesiones de caja POS',
  expenses: 'Caja menor y gastos',
  employees: 'Empleados',
  payroll_novelties: 'Novedades de nómina',
  leave_requests: 'Vacaciones y permisos',
  payslips: 'Desprendibles de nómina',
  payroll_params: 'Parámetros de nómina',
}

const BASE_HINT: Record<Role, string> = {
  admin: 'Aprueba gastos y permisos, gestiona cupos y bloqueos de cartera.',
  contador: 'Aprueba gastos y permisos, gestiona cupos y bloqueos de cartera.',
  cajero: 'No aprueba; no modifica ventas confirmadas ni cajas cerradas.',
  vendedor: 'No aprueba; no modifica ventas confirmadas ni cupos de crédito.',
}

/** Plantillas para crear roles rápido. */
const TEMPLATES: { label: string; baseRole: Role; suites: SuiteKey[]; permissions: Record<string, Mode> }[] = [
  {
    label: 'Cajero de mostrador',
    baseRole: 'cajero',
    suites: ['pos'],
    permissions: { pos_sessions: 'w', sales: 'w', sale_lines: 'w', payments: 'w', stock_moves: 'w', products: 'r', categories: 'r', partners: 'r', expenses: 'w' },
  },
  {
    label: 'Vendedor en ruta',
    baseRole: 'vendedor',
    suites: ['comercial'],
    permissions: { partners: 'w', sales: 'w', sale_lines: 'w', payments: 'w', stock_moves: 'r', products: 'r', categories: 'r' },
  },
  {
    label: 'Auxiliar de inventario',
    baseRole: 'vendedor',
    suites: ['comercial'],
    permissions: { products: 'w', categories: 'w', stock_moves: 'w', partners: 'r' },
  },
  {
    label: 'Gestión humana',
    baseRole: 'contador',
    suites: ['personal'],
    permissions: { employees: 'w', payroll_novelties: 'w', leave_requests: 'w', payslips: 'w', payroll_params: 'w' },
  },
  {
    label: 'Auxiliar contable',
    baseRole: 'contador',
    suites: ['financiero', 'comercial'],
    permissions: { payments: 'w', expenses: 'w', sales: 'r', sale_lines: 'r', partners: 'r', products: 'r', stock_moves: 'r' },
  },
]

export default function Roles() {
  const { data, loading, error } = useGql<{ roles: RoleItem[]; suites: SuiteInfo[] }>(Q)
  const { toast, confirm } = useFeedback()
  const [editing, setEditing] = useState<RoleItem | 'new' | null>(null)
  const roles = data?.roles ?? []

  async function remove(r: RoleItem) {
    if (!(await confirm({ title: 'Eliminar rol', message: `Se eliminará el rol "${r.name}".`, confirmLabel: 'Eliminar', danger: true }))) return
    try {
      await gql('mutation($id:ID!){ deleteRole(id:$id) }', { id: r.id })
      toast('Rol eliminado')
      invalidate()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Roles y permisos"
        subtitle="Crea roles para tu empresa: eligen a qué suites entra cada persona y qué puede ver o editar en cada módulo."
        actions={
          <Button icon={Plus} onClick={() => setEditing('new')}>
            Nuevo rol
          </Button>
        }
      />
      <ErrorBox error={error} />

      <div className="mb-6 grid gap-5 sm:grid-cols-3">
        <KpiCard icon={ShieldCheck} label="Roles de la empresa" value={String(roles.length)} hint="Además de los 4 roles base" />
        <KpiCard icon={UsersIcon} tone="success" label="Usuarios con rol personalizado" value={String(roles.reduce((s, r) => s + r.userCount, 0))} />
        <KpiCard icon={Pencil} tone="info" label="Suites disponibles" value={String(data?.suites.length ?? 5)} hint="Comercial, POS, Financiero, Personal, Sistema" />
      </div>

      {roles.length === 0 && !loading ? (
        <Card>
          <EmptyState
            icon={ShieldCheck}
            title="Aún no has creado roles"
            message="Los usuarios usan los roles base. Crea un rol para dar acceso por suite, por ejemplo un cajero que sólo entra al Punto de venta."
            action={
              <Button icon={Plus} onClick={() => setEditing('new')}>
                Crear el primer rol
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((r) => (
            <section key={r.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-bold text-ink">{r.name}</h3>
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{r.description || 'Sin descripción'}</p>
                </div>
                <div className="flex shrink-0">
                  <IconButton icon={Pencil} label="Editar rol" onClick={() => setEditing(r)} />
                  <IconButton icon={Trash2} label="Eliminar rol" tone="danger" onClick={() => void remove(r)} />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {r.suites.map((k) => {
                  const s = SUITES.find((x) => x.key === k)
                  return s ? (
                    <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-soft">
                      <s.icon size={13} strokeWidth={1.75} className="text-brand-600" /> {s.label}
                    </span>
                  ) : null
                })}
              </div>
              <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted">
                <Badge tone="neutral">Base: {ROLE_LABEL[r.baseRole]}</Badge>
                <span>
                  {r.userCount} {r.userCount === 1 ? 'usuario' : 'usuarios'}
                </span>
              </div>
            </section>
          ))}
        </div>
      )}

      <PermissionMatrix />

      {editing && <RoleEditor key={editing === 'new' ? 'new' : editing.id} role={editing === 'new' ? null : editing} suites={data?.suites ?? []} onClose={() => setEditing(null)} />}
    </>
  )
}

// ============================================================================ editor

function RoleEditor({ role, suites, onClose }: { role: RoleItem | null; suites: SuiteInfo[]; onClose: () => void }) {
  const { toast } = useFeedback()
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [baseRole, setBaseRole] = useState<Role>(role?.baseRole ?? 'vendedor')
  const [selected, setSelected] = useState<SuiteKey[]>(role?.suites ?? [])
  const [perms, setPerms] = useState<Record<string, Mode>>(role?.permissions ?? {})
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Módulos visibles = unión de las tablas de las suites elegidas
  const tables = useMemo(() => {
    const set = new Set<string>()
    for (const k of selected) for (const t of suites.find((s) => s.key === k)?.tables ?? []) set.add(t)
    return [...set]
  }, [selected, suites])

  // Al quitar una suite se descartan los permisos de tablas que ya no pertenecen a ninguna
  useEffect(() => {
    setPerms((p) => Object.fromEntries(Object.entries(p).filter(([t]) => tables.includes(t))) as Record<string, Mode>)
  }, [tables])

  const toggleSuite = (k: SuiteKey) => setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))
  const setMode = (t: string, m: Mode) => setPerms((p) => ({ ...p, [t]: m }))
  const setAll = (m: Mode) => setPerms(Object.fromEntries(tables.map((t) => [t, m])) as Record<string, Mode>)

  function applyTemplate(i: number) {
    const t = TEMPLATES[i]
    if (!t) return
    setName((n) => n || t.label)
    setBaseRole(t.baseRole)
    setSelected(t.suites)
    setPerms(t.permissions)
  }

  async function submit() {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Obligatorio'
    if (selected.length === 0) errs.suites = 'Elige al menos una suite'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      const clean = Object.fromEntries(Object.entries(perms).filter(([, m]) => m === 'r' || m === 'w'))
      await gql('mutation($i:RoleInput!){ saveRole(input:$i){ id } }', {
        i: { id: role?.id ?? null, name: name.trim(), description: description.trim() || null, baseRole, suites: selected, permissions: clean },
      })
      toast(role ? 'Rol actualizado' : 'Rol creado')
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
      size="xl"
      title={role ? `Editar rol: ${role.name}` : 'Nuevo rol'}
      subtitle="Define a qué suites entra y qué puede hacer en cada módulo."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={saving} onClick={submit}>
            {role ? 'Guardar cambios' : 'Crear rol'}
          </Button>
        </>
      }
    >
      {!role && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-ink-soft">Empezar desde una plantilla:</span>
          {TEMPLATES.map((t, i) => (
            <button key={t.label} onClick={() => applyTemplate(i)} className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-ink-soft transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre del rol" required error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Cajero de mostrador" autoFocus />
        </Field>
        <Field label="Rol base" hint={BASE_HINT[baseRole]}>
          <Select value={baseRole} onChange={(e) => setBaseRole(e.target.value as Role)}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Descripción" className="sm:col-span-2">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Para qué sirve este rol" className="min-h-[60px]" />
        </Field>
      </div>

      <div className="mt-6">
        <p className="text-[13px] font-semibold text-ink-soft">Suites a las que puede ingresar</p>
        {errors.suites && <p className="mt-1 text-xs text-danger">{errors.suites}</p>}
        <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SUITES.map((s) => {
            const on = selected.includes(s.key)
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleSuite(s.key)}
                className={cn('flex items-start gap-3 rounded-2xl border p-3.5 text-left transition', on ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-line hover:border-brand-200')}
              >
                <IconTile icon={s.icon} tone={on ? 'brand' : 'neutral'} size={38} />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-ink">{s.label}</span>
                  <span className="block text-xs text-muted">{s.description}</span>
                </span>
              </button>
            )
          })}
        </div>
        {selected.includes('sistema') && <p className="mt-2 text-xs text-muted">La suite Sistema (usuarios, roles, empresa) sólo funciona para el rol base Dueño / Gerente.</p>}
      </div>

      <div className="mt-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-ink-soft">Permisos por módulo</p>
          {tables.length > 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setAll('r')}>
                Todo consultar
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAll('w')}>
                Todo editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAll('')}>
                Limpiar
              </Button>
            </div>
          )}
        </div>
        {tables.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-5 text-center text-sm text-muted">Elige una o más suites para configurar sus módulos.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line">
            {tables.map((t, i) => {
              const m = perms[t] ?? ''
              return (
                <div key={t} className={cn('flex flex-wrap items-center justify-between gap-3 px-4 py-2.5', i > 0 && 'border-t border-line')}>
                  <span className="text-sm font-medium text-ink">{TABLE_LABEL[t] ?? t}</span>
                  <div className="inline-flex rounded-xl border border-line bg-canvas p-0.5">
                    {(
                      [
                        ['', 'Sin acceso', Minus],
                        ['r', 'Consultar', Eye],
                        ['w', 'Editar', Pencil],
                      ] as const
                    ).map(([v, label, Icon]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setMode(t, v)}
                        className={cn('inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-semibold transition', m === v ? 'bg-white text-brand-700 shadow-card' : 'text-muted hover:text-ink')}
                      >
                        <Icon {...ICON} size={14} /> {label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
