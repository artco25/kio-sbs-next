import { CircleCheck, ClipboardList, Clock, Download, Lock, Pencil, Plus, Timer, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { KpiCard } from '../../components/charts'
import { type FieldDef, RecordForm } from '../../components/RecordForm'
import { Badge, Button, Card, type Column, DataTable, EmptyState, ErrorBox, FilterSelect, ICON, NameCell, PageHeader, SearchInput, type Tone, Toolbar, useFeedback } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { date, money, qty } from '../../lib/format'
import { exportCsv, type Row, today } from '../../lib/records'
import { useGql } from '../../lib/useGql'
import { monthName, MonthInput, useEmployees } from './_shared'
import { kNoveltyTypes, noveltyType } from './payroll'

interface NoveltyItem {
  id: string
  employeeId: string | null
  period: string | null
  date: string | null
  type: string | null
  quantity: number
  amount: number
  payslipId: string | null
  notes: string | null
  employee: { name: string | null } | null
}

const Q = `query($p:String){ novelties(period:$p){ id employeeId period date type quantity amount payslipId notes employee{ name } } }`

const KIND_TONE: Record<string, Tone> = { devengo: 'brand', dias: 'warning', deduccion: 'danger' }
type StateFilter = 'todas' | 'pendiente' | 'liquidada'

export default function Novelties() {
  const { can } = useAuth()
  const { toast } = useFeedback()
  const canWrite = can('payroll_novelties', 'write')
  const [period, setPeriod] = useState(today().slice(0, 7))
  const [search, setSearch] = useState('')
  const [type, setType] = useState('todos')
  const [state, setState] = useState<StateFilter>('todas')
  const [form, setForm] = useState<{ open: boolean; initial: Row | null }>({ open: false, initial: null })

  const { data, loading, error } = useGql<{ novelties: NoveltyItem[] }>(Q, { p: period })
  const { data: employees } = useEmployees()
  const items = useMemo(() => data?.novelties ?? [], [data])

  const isSettled = (n: NoveltyItem) => !!n.payslipId
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((n) => {
      if (type !== 'todos' && n.type !== type) return false
      if (state === 'pendiente' && isSettled(n)) return false
      if (state === 'liquidada' && !isSettled(n)) return false
      return !q || (n.employee?.name ?? '').toLowerCase().includes(q)
    })
  }, [items, search, type, state])

  const pending = items.filter((n) => !isSettled(n)).length
  const hours = items.reduce((a, n) => a + (noveltyType(n.type)?.unit === 'horas' ? n.quantity : 0), 0)
  const value = items.reduce((a, n) => {
    const t = noveltyType(n.type)
    if (!t || t.unit !== 'valor') return a
    return a + (t.kind === 'deduccion' ? -n.amount : n.amount)
  }, 0)

  const openForm = (n: NoveltyItem | null) => {
    if (!n) {
      const d = today()
      return setForm({ open: true, initial: { date: d.startsWith(period) ? d : `${period}-01` } })
    }
    if (isSettled(n)) return toast('La novedad ya fue liquidada en una nómina confirmada y no se puede editar', 'error')
    setForm({ open: true, initial: { id: n.id, employee_id: n.employeeId, type: n.type, date: n.date, quantity: n.quantity || '', amount: n.amount || '', notes: n.notes } })
  }

  // Empleados activos (y el de la novedad en edición, aunque ya esté retirado).
  const fields = useMemo<FieldDef[]>(() => {
    const current = form.initial?.employee_id
    const opts = (employees ?? []).filter((e) => e.active || e.id === current).map((e) => ({ value: e.id, label: `${e.name ?? '—'}${e.docNumber ? ` · ${e.docNumber}` : ''}` }))
    return [
      { key: 'employee_id', label: 'Empleado', type: 'select', required: true, full: true, options: opts },
      { key: 'type', label: 'Tipo de novedad', type: 'select', required: true, options: kNoveltyTypes.map((t) => ({ value: t.key, label: `${t.label} (${t.unit})` })) },
      { key: 'date', label: 'Fecha', type: 'date', required: true },
      { key: 'quantity', label: 'Cantidad (horas o días)', type: 'number', hint: 'Obligatoria en novedades por horas o días.' },
      { key: 'amount', label: 'Valor', type: 'money', hint: 'Obligatorio en novedades por valor.' },
      { key: 'notes', label: 'Observaciones', type: 'textarea' },
    ]
  }, [employees, form.initial])

  const validate = (v: Row) => {
    const t = noveltyType(v.type)
    if (!t) return 'Selecciona el tipo de novedad'
    if (t.unit === 'valor' && !(Number(v.amount) > 0)) return 'Indica el valor de la novedad'
    if (t.unit !== 'valor' && !(Number(v.quantity) > 0)) return `Indica la cantidad de ${t.unit}`
    v.period = String(v.date).slice(0, 7)
    return null
  }

  const columns: Column<NoveltyItem>[] = [
    { key: 'employee', header: 'Empleado', render: (n) => <NameCell name={n.employee?.name ?? '—'} /> },
    {
      key: 'type',
      header: 'Novedad',
      render: (n) => {
        const t = noveltyType(n.type)
        return (
          <div className="min-w-0">
            <Badge tone={KIND_TONE[t?.kind ?? 'devengo']}>{t?.label ?? n.type ?? '—'}</Badge>
            {n.notes && <div className="mt-1 max-w-64 truncate text-xs text-muted">{n.notes}</div>}
          </div>
        )
      },
    },
    { key: 'date', header: 'Fecha', hideSm: true, render: (n) => date(n.date) },
    { key: 'qty', header: 'Cantidad', align: 'right', render: (n) => (n.quantity ? `${qty(n.quantity)} ${noveltyType(n.type)?.unit ?? ''}` : '—') },
    { key: 'amount', header: 'Valor', align: 'right', hideSm: true, render: (n) => (n.amount ? <span className={noveltyType(n.type)?.kind === 'deduccion' ? 'text-danger' : ''}>{money(n.amount)}</span> : '—') },
    {
      key: 'state',
      header: 'Estado',
      render: (n) => (isSettled(n) ? <Badge tone="success" dot>Liquidada</Badge> : <Badge tone="warning" dot>Pendiente</Badge>),
    },
    {
      key: 'act',
      header: '',
      align: 'right',
      render: (n) =>
        isSettled(n) ? <Lock {...ICON} className="ml-auto text-subtle" aria-label="Liquidada" /> : canWrite ? <Pencil {...ICON} className="ml-auto text-muted" aria-label="Editar" /> : null,
    },
  ]

  const exportRows = () =>
    exportCsv(
      `novedades_${period}`,
      rows.map((n) => ({
        employee: n.employee?.name,
        type: noveltyType(n.type)?.label ?? n.type,
        date: n.date,
        quantity: n.quantity || '',
        amount: n.amount || '',
        state: isSettled(n) ? 'Liquidada' : 'Pendiente',
        notes: n.notes,
      })),
      [
        { key: 'employee', label: 'Empleado' },
        { key: 'type', label: 'Novedad' },
        { key: 'date', label: 'Fecha' },
        { key: 'quantity', label: 'Cantidad' },
        { key: 'amount', label: 'Valor' },
        { key: 'state', label: 'Estado' },
        { key: 'notes', label: 'Observaciones' },
      ],
    )

  return (
    <>
      <PageHeader
        title="Novedades de nómina"
        subtitle="Horas extra, recargos, bonificaciones, ausencias y descuentos del periodo."
        actions={
          <>
            <MonthInput value={period} onChange={setPeriod} />
            {canWrite && (
              <Button icon={Plus} onClick={() => openForm(null)}>
                Nueva novedad
              </Button>
            )}
          </>
        }
      />
      <ErrorBox error={error} />

      <div className="mb-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={ClipboardList} label="Novedades del periodo" value={qty(items.length)} hint={monthName(period)} />
        <KpiCard icon={Clock} tone="warning" label="Pendientes de liquidar" value={qty(pending)} hint="Entran en la próxima liquidación" />
        <KpiCard icon={Timer} tone="info" label="Horas registradas" value={`${qty(hours)} h`} hint="Extras y recargos" />
        <KpiCard icon={Wallet} tone="success" label="Valor neto en bonos y descuentos" value={money(value)} hint="Devengos menos deducciones" />
      </div>

      <Card padded={false} title={`Novedades de ${monthName(period)}`} subtitle={`${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}`}>
        <div className="pt-4">
          <Toolbar
            actions={
              <Button variant="secondary" icon={Download} onClick={exportRows} disabled={!rows.length}>
                Exportar CSV
              </Button>
            }
          >
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar empleado…" />
            <FilterSelect value={type} onChange={setType} options={[{ value: 'todos', label: 'Todos los tipos' }, ...kNoveltyTypes.map((t) => ({ value: t.key, label: t.label }))]} />
            <FilterSelect
              value={state}
              onChange={setState}
              icon={CircleCheck}
              options={[
                { value: 'todas', label: 'Todos los estados' },
                { value: 'pendiente', label: 'Pendientes' },
                { value: 'liquidada', label: 'Liquidadas' },
              ]}
            />
          </Toolbar>
          <DataTable
            columns={columns}
            rows={rows}
            loading={loading}
            onRowClick={canWrite ? openForm : undefined}
            empty={
              <EmptyState
                icon={ClipboardList}
                title={items.length ? 'Sin resultados' : 'No hay novedades en este periodo'}
                message={items.length ? 'Prueba con otros filtros.' : 'Registra horas extra, bonificaciones, ausencias o descuentos para incluirlos en la nómina.'}
                action={canWrite && !items.length ? <Button icon={Plus} onClick={() => openForm(null)}>Nueva novedad</Button> : undefined}
              />
            }
          />
        </div>
      </Card>

      <RecordForm
        open={form.open}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        table="payroll_novelties"
        title={form.initial?.id ? 'Editar novedad' : 'Nueva novedad'}
        subtitle="El periodo se toma del mes de la fecha."
        fields={fields}
        initial={form.initial}
        validate={validate}
      />
    </>
  )
}
