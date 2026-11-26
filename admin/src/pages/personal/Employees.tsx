import { Banknote, Bus, Download, Pencil, Plus, FileText, TrendingUp, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { KpiCard } from '../../components/charts'
import { type FieldDef, RecordForm } from '../../components/RecordForm'
import { Badge, Button, Card, type Column, DataTable, EmptyState, ErrorBox, FilterSelect, ICON, Modal, NameCell, PageHeader, SearchInput, StatusBadge, Toolbar } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { date, money, qty } from '../../lib/format'
import { exportCsv, type Row, today } from '../../lib/records'
import { useGql } from '../../lib/useGql'
import { CONTRACT_LABEL, DOC_TYPES, type EmployeeRow, LEAVE_TYPES, periodLabel, snake, useEmployees } from './_shared'

type StateFilter = 'activos' | 'retirados' | 'todos'

const FIELDS_BASE: FieldDef[] = [
  { key: 'name', label: 'Nombre completo', required: true, full: true },
  { key: 'doc_type', label: 'Tipo de documento', type: 'select', required: true, options: DOC_TYPES, defaultValue: 'CC' },
  { key: 'doc_number', label: 'Número de documento', required: true },
  { key: 'email', label: 'Correo', type: 'email' },
  { key: 'phone', label: 'Teléfono', type: 'tel' },
  { key: 'position', label: 'Cargo' },
  { key: 'department', label: 'Área' },
  { key: 'salary', label: 'Salario mensual', type: 'money', required: true },
  { key: 'start_date', label: 'Fecha de ingreso', type: 'date', required: true },
  { key: 'end_date', label: 'Fecha de retiro', type: 'date', hint: 'Déjala vacía mientras el empleado siga vinculado.' },
  {
    key: 'contract_type',
    label: 'Contrato',
    type: 'select',
    required: true,
    defaultValue: 'indefinido',
    options: Object.entries(CONTRACT_LABEL).map(([value, label]) => ({ value, label })),
  },
  {
    key: 'pay_frequency',
    label: 'Periodicidad de pago',
    type: 'select',
    required: true,
    defaultValue: 'mensual',
    options: [
      { value: 'mensual', label: 'Mensual' },
      { value: 'quincenal', label: 'Quincenal' },
    ],
  },
  { key: 'eps', label: 'EPS' },
  { key: 'afp', label: 'Fondo de pensiones' },
]
const FIELDS_EXT: FieldDef[] = [
  {
    key: 'arl_risk',
    label: 'Riesgo ARL',
    type: 'select',
    required: true,
    defaultValue: '1',
    options: ['I', 'II', 'III', 'IV', 'V'].map((r, i) => ({ value: String(i + 1), label: `Clase ${r}` })),
  },
  { key: 'bank_name', label: 'Banco' },
  { key: 'bank_account', label: 'Cuenta bancaria' },
]
const FIELDS_FLAGS: FieldDef[] = [
  { key: 'transport_aid', label: 'Auxilio de transporte', type: 'boolean', defaultValue: 1, hint: 'Aplica hasta 2 SMMLV.' },
  { key: 'integral_salary', label: 'Salario integral', type: 'boolean', hint: 'Sin auxilio; IBC al 70 %.' },
  { key: 'active', label: 'Activo', type: 'boolean', defaultValue: 1 },
]

interface Detail {
  employee: {
    payslips: { id: string; number: string | null; period: string | null; days: number; totalEarnings: number; totalDeductions: number; net: number; status: string | null }[]
    leaveRequests: { id: string; type: string | null; dateFrom: string | null; dateTo: string | null; days: number; paid: boolean; status: string | null }[]
  } | null
}
const Q_DETAIL = `query($id:ID!){ employee(id:$id){
  payslips(limit:24){ id number period days totalEarnings totalDeductions net status }
  leaveRequests{ id type dateFrom dateTo days paid status }
} }`

export default function Employees() {
  const { can, isAdmin } = useAuth()
  const canWrite = can('employees', 'write')
  const { data, loading, error, extended } = useEmployees()
  const usersQ = useGql<{ users: { id: string; name: string | null; email: string }[] }>('query{ users{ id name email } }')
  const [filter, setFilter] = useState<StateFilter>('activos')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<{ open: boolean; initial: Row | null }>({ open: false, initial: null })
  const [detail, setDetail] = useState<EmployeeRow | null>(null)

  const all = useMemo(() => data ?? [], [data])
  const active = useMemo(() => all.filter((e) => e.active), [all])
  const payroll = active.reduce((a, e) => a + e.salary, 0)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter((e) => {
      if (filter === 'activos' && !e.active) return false
      if (filter === 'retirados' && e.active) return false
      if (!q) return true
      return [e.name, e.docNumber, e.position, e.department, e.email].some((v) => (v ?? '').toLowerCase().includes(q))
    })
  }, [all, filter, search])

  const openForm = (e: EmployeeRow | null) => {
    if (!e) return setForm({ open: true, initial: { start_date: today() } })
    const r = snake(e)
    r.arl_risk = e.arlRisk != null ? String(e.arlRisk) : undefined
    setForm({ open: true, initial: r })
  }

  const isNew = !form.initial?.id
  // Sin lectura de los campos extendidos no se editan (evita sobrescribirlos con vacíos).
  const userOptions = useMemo(() => [{ value: '', label: '— Sin usuario vinculado —' }, ...(usersQ.data?.users ?? []).map((u) => ({ value: u.id, label: `${u.name ?? u.email} (${u.email})` }))], [usersQ.data])
  const fields = useMemo(() => {
    const base: FieldDef[] = [...FIELDS_BASE, { key: 'user_id', label: 'Usuario del sistema', type: 'select', options: userOptions, hint: 'Vincula este empleado con un usuario para accesos/reportes.' }]
    return [...base, ...(isNew || extended ? FIELDS_EXT : []), ...FIELDS_FLAGS.filter((f) => f.key !== 'integral_salary' || isNew || extended)]
  }, [isNew, extended, userOptions])

  const validate = (v: Row) => {
    const salary = Number(v.salary)
    if (!(salary > 0)) return 'El salario debe ser mayor que cero'
    if (v.end_date && String(v.end_date) < String(v.start_date)) return 'La fecha de retiro es anterior a la de ingreso'
    if ('arl_risk' in v) v.arl_risk = Math.min(5, Math.max(1, Number(v.arl_risk) || 1))
    const dup = all.find((e) => e.id !== v.id && e.docNumber === v.doc_number && (e.docType ?? 'CC') === v.doc_type)
    if (dup) return `Ya existe un empleado con ese documento (${dup.name})`
    if (v.end_date && v.active === 1) v.active = 0
    if (v.user_id === '') v.user_id = null
    return null
  }

  const columns: Column<EmployeeRow>[] = [
    { key: 'name', header: 'Empleado', render: (e) => <NameCell name={e.name ?? '—'} sub={`${e.docType ?? ''} ${e.docNumber ?? ''}`.trim()} /> },
    {
      key: 'position',
      header: 'Cargo / área',
      render: (e) => (
        <div className="min-w-0">
          <div className="truncate">{e.position || '—'}</div>
          <div className="truncate text-xs text-muted">{e.department || '—'}</div>
        </div>
      ),
    },
    { key: 'start', header: 'Ingreso', hideSm: true, render: (e) => date(e.startDate) },
    {
      key: 'freq',
      header: 'Pago',
      hideSm: true,
      render: (e) => (
        <div className="flex items-center gap-2">
          <Badge tone="info">{e.payFrequency === 'quincenal' ? 'Quincenal' : 'Mensual'}</Badge>
          {!e.active && <StatusBadge status="inactivo" />}
        </div>
      ),
    },
    { key: 'salary', header: 'Salario', align: 'right', render: (e) => <span className="font-semibold">{money(e.salary)}</span> },
  ]

  const exportRows = () =>
    exportCsv(
      'empleados',
      rows.map((e) => ({ ...snake(e), active: e.active ? 'Sí' : 'No', transport_aid: e.transportAid ? 'Sí' : 'No' })),
      [
        { key: 'name', label: 'Nombre' },
        { key: 'doc_type', label: 'Tipo documento' },
        { key: 'doc_number', label: 'Documento' },
        { key: 'email', label: 'Correo' },
        { key: 'phone', label: 'Teléfono' },
        { key: 'position', label: 'Cargo' },
        { key: 'department', label: 'Área' },
        { key: 'salary', label: 'Salario' },
        { key: 'start_date', label: 'Ingreso' },
        { key: 'end_date', label: 'Retiro' },
        { key: 'contract_type', label: 'Contrato' },
        { key: 'pay_frequency', label: 'Periodicidad' },
        { key: 'eps', label: 'EPS' },
        { key: 'afp', label: 'Pensiones' },
        { key: 'transport_aid', label: 'Aux. transporte' },
        { key: 'active', label: 'Activo' },
      ],
    )

  return (
    <>
      <PageHeader
        title="Empleados"
        subtitle="Plantilla de personal, salarios y datos de vinculación."
        actions={
          canWrite && (
            <Button icon={UserPlus} onClick={() => openForm(null)}>
              Nuevo empleado
            </Button>
          )
        }
      />
      <ErrorBox error={error} />

      <div className="mb-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Users} label="Empleados activos" value={qty(active.length)} hint={`${all.length - active.length} retirados`} />
        <KpiCard icon={Banknote} tone="success" label="Nómina mensual" value={money(payroll)} hint="Suma de salarios básicos activos" />
        <KpiCard icon={TrendingUp} tone="info" label="Salario promedio" value={money(active.length ? payroll / active.length : 0)} hint="Por empleado activo" />
        <KpiCard icon={Bus} tone="warning" label="Con auxilio de transporte" value={qty(active.filter((e) => e.transportAid).length)} hint={`de ${active.length} activos`} />
      </div>

      <Card padded={false} title="Personal" subtitle={`${rows.length} ${rows.length === 1 ? 'empleado' : 'empleados'}`}>
        <div className="pt-4">
        <Toolbar
          actions={
            <Button variant="secondary" icon={Download} onClick={exportRows} disabled={!rows.length}>
              Exportar CSV
            </Button>
          }
        >
          <SearchInput value={search} onChange={setSearch} placeholder="Nombre, documento o cargo…" />
          <FilterSelect
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'activos', label: 'Activos' },
              { value: 'retirados', label: 'Retirados' },
              { value: 'todos', label: 'Todos' },
            ]}
          />
        </Toolbar>
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          onRowClick={setDetail}
          empty={
            <EmptyState
              icon={Users}
              title={all.length ? 'Sin resultados' : 'Aún no hay empleados'}
              message={all.length ? 'Prueba con otro filtro o término de búsqueda.' : 'Registra a tu primer empleado para liquidar nómina.'}
              action={canWrite && !all.length ? <Button icon={Plus} onClick={() => openForm(null)}>Nuevo empleado</Button> : undefined}
            />
          }
        />
        </div>
      </Card>

      <EmployeeDetail
        employee={detail}
        onClose={() => setDetail(null)}
        onEdit={
          canWrite
            ? (e) => {
                setDetail(null)
                openForm(e)
              }
            : undefined
        }
      />

      <RecordForm
        open={form.open}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        table="employees"
        title={isNew ? 'Nuevo empleado' : String(form.initial?.name ?? 'Editar empleado')}
        subtitle={isNew ? 'Completa los datos de vinculación.' : 'Los cambios llegan a las cajas en el próximo sync.'}
        fields={fields}
        initial={form.initial}
        validate={validate}
        canDelete={isAdmin}
      />
    </>
  )
}

function EmployeeDetail({ employee: e, onClose, onEdit }: { employee: EmployeeRow | null; onClose: () => void; onEdit?: (e: EmployeeRow) => void }) {
  const { data, loading, error } = useGql<Detail>(Q_DETAIL, { id: e?.id ?? '' }, { skip: !e })
  if (!e) return null
  const d = data?.employee

  const info: [string, string][] = [
    ['Cargo', e.position || '—'],
    ['Área', e.department || '—'],
    ['Contrato', CONTRACT_LABEL[e.contractType ?? ''] ?? e.contractType ?? '—'],
    ['Periodicidad', e.payFrequency === 'quincenal' ? 'Quincenal' : 'Mensual'],
    ['Ingreso', date(e.startDate)],
    ['Retiro', e.endDate ? date(e.endDate) : '—'],
    ['EPS', e.eps || '—'],
    ['Pensiones', e.afp || '—'],
    ['Correo', e.email || '—'],
    ['Teléfono', e.phone || '—'],
    ['Auxilio de transporte', e.transportAid ? 'Sí' : 'No'],
    ...(e.arlRisk != null ? ([['Riesgo ARL', `Clase ${e.arlRisk}`]] as [string, string][]) : []),
  ]

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={<NameCell name={e.name ?? '—'} sub={`${e.docType ?? ''} ${e.docNumber ?? ''}`.trim()} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          {onEdit && (
            <Button icon={Pencil} onClick={() => onEdit(e)}>
              Editar empleado
            </Button>
          )}
        </>
      }
    >
      <ErrorBox error={error} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <StatusBadge status={e.active ? 'activo' : 'inactivo'} />
        <span className="text-sm text-muted">Salario mensual</span>
        <span className="font-display text-xl font-extrabold text-ink">{money(e.salary)}</span>
      </div>
      <dl className="grid gap-x-6 gap-y-3 rounded-2xl bg-canvas p-4 sm:grid-cols-3">
        {info.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[11px] font-bold tracking-wider text-muted uppercase">{k}</dt>
            <dd className="truncate text-sm font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-6 mb-2 flex items-center gap-2 text-[15px] font-bold text-ink">
        <FileText {...ICON} className="text-brand-700" /> Desprendibles de pago
      </h3>
      <div className="overflow-hidden rounded-2xl border border-line">
        <DataTable
          pageSize={6}
          loading={loading}
          rows={d?.payslips ?? []}
          empty={<EmptyState title="Sin desprendibles" message="Aún no se ha liquidado nómina para este empleado." />}
          columns={[
            { key: 'period', header: 'Periodo', render: (p) => <span className="capitalize">{periodLabel(p.period)}</span> },
            { key: 'number', header: 'Número', hideSm: true, render: (p) => p.number ?? '—' },
            { key: 'earn', header: 'Devengado', align: 'right', hideSm: true, render: (p) => money(p.totalEarnings) },
            { key: 'net', header: 'Neto', align: 'right', render: (p) => <span className="font-semibold">{money(p.net)}</span> },
            { key: 'status', header: 'Estado', render: (p) => <StatusBadge status={p.status} /> },
          ]}
        />
      </div>

      <h3 className="mt-6 mb-2 text-[15px] font-bold text-ink">Vacaciones y permisos</h3>
      <div className="overflow-hidden rounded-2xl border border-line">
        <DataTable
          pageSize={6}
          loading={loading}
          rows={d?.leaveRequests ?? []}
          empty={<EmptyState title="Sin solicitudes" message="Este empleado no tiene ausencias registradas." />}
          columns={[
            { key: 'type', header: 'Tipo', render: (l) => LEAVE_TYPES[l.type ?? ''] ?? l.type ?? '—' },
            { key: 'dates', header: 'Fechas', render: (l) => `${date(l.dateFrom)} → ${date(l.dateTo)}` },
            { key: 'days', header: 'Días', align: 'right', render: (l) => qty(l.days) },
            { key: 'status', header: 'Estado', render: (l) => <StatusBadge status={l.status} /> },
          ]}
        />
      </div>
    </Modal>
  )
}
