import { CalendarCheck, CalendarDays, Check, Clock, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { KpiCard } from '../../components/charts'
import { type FieldDef, RecordForm } from '../../components/RecordForm'
import { Badge, Card, type Column, DataTable, EmptyState, ErrorBox, IconButton, NameCell, PageHeader, StatusBadge, Tabs, useFeedback, Button } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { gql } from '../../lib/gql'
import { date, qty } from '../../lib/format'
import { addDays, invalidate, type Row, today } from '../../lib/records'
import { useGql } from '../../lib/useGql'
import { LEAVE_TYPES, useEmployees } from './_shared'

interface LeaveItem {
  id: string
  type: string | null
  dateFrom: string | null
  dateTo: string | null
  days: number
  paid: boolean
  status: string | null
  notes: string | null
  employee: { id: string; name: string | null; position: string | null } | null
}

const Q = `{ leaveRequests{ id type dateFrom dateTo days paid status notes employee{ id name position } } }`

type TabKey = 'todas' | 'solicitada' | 'aprobada' | 'rechazada'

/** Días entre dos fechas (inclusive). Vacaciones y permisos cuentan días hábiles (lun–vie); el resto, calendario. */
function countDays(from: string, to: string, type: string) {
  const calendar = type === 'incapacidad' || type === 'licencia'
  let n = 0
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = new Date(`${d}T12:00:00`).getDay()
    if (calendar || (wd !== 0 && wd !== 6)) n++
  }
  return n
}

export default function Leaves() {
  const { can, isFinance } = useAuth()
  const { toast, confirm } = useFeedback()
  const canWrite = can('leave_requests', 'write')
  const [tab, setTab] = useState<TabKey>('solicitada')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const { data, loading, error } = useGql<{ leaveRequests: LeaveItem[] }>(Q)
  const { data: employees } = useEmployees(true)
  const items = useMemo(() => data?.leaveRequests ?? [], [data])

  const now = today()
  const year = now.slice(0, 4)
  const pending = items.filter((l) => l.status === 'solicitada').length
  const away = items.filter((l) => l.status === 'aprobada' && (l.dateFrom ?? '') <= now && (l.dateTo ?? '') >= now).length
  const approvedDays = items.filter((l) => l.status === 'aprobada' && (l.dateFrom ?? '').startsWith(year)).reduce((a, l) => a + l.days, 0)

  const count = (s: TabKey) => (s === 'todas' ? items.length : items.filter((l) => l.status === s).length)
  const rows = useMemo(() => (tab === 'todas' ? items : items.filter((l) => l.status === tab)), [items, tab])

  async function decide(l: LeaveItem, approve: boolean) {
    const ok = await confirm({
      title: approve ? 'Aprobar solicitud' : 'Rechazar solicitud',
      message: `${approve ? 'Se aprobará' : 'Se rechazará'} ${LEAVE_TYPES[l.type ?? ''] ?? 'la solicitud'} de ${l.employee?.name ?? 'el empleado'} (${date(l.dateFrom)} → ${date(l.dateTo)}, ${qty(l.days)} días).`,
      confirmLabel: approve ? 'Aprobar' : 'Rechazar',
      danger: !approve,
    })
    if (!ok) return
    setBusy(l.id)
    try {
      await gql('mutation($id:ID!,$a:Boolean!){ approveLeave(id:$id, approve:$a){ id status } }', { id: l.id, a: approve })
      invalidate()
      toast(approve ? 'Solicitud aprobada' : 'Solicitud rechazada')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const fields = useMemo<FieldDef[]>(
    () => [
      { key: 'employee_id', label: 'Empleado', type: 'select', required: true, full: true, options: (employees ?? []).filter((e) => e.active).map((e) => ({ value: e.id, label: `${e.name ?? '—'}${e.position ? ` · ${e.position}` : ''}` })) },
      { key: 'type', label: 'Tipo', type: 'select', required: true, defaultValue: 'vacaciones', options: Object.entries(LEAVE_TYPES).map(([value, label]) => ({ value, label })) },
      { key: 'paid', label: 'Remunerado', type: 'boolean', defaultValue: 1 },
      { key: 'date_from', label: 'Desde', type: 'date', required: true, defaultValue: today() },
      { key: 'date_to', label: 'Hasta', type: 'date', required: true, defaultValue: today() },
      { key: 'days', label: 'Días', type: 'number', hint: 'Si lo dejas vacío se calcula: días hábiles (lun–vie) y, en incapacidad o licencia, días calendario.' },
      { key: 'notes', label: 'Motivo / observaciones', type: 'textarea' },
    ],
    [employees],
  )

  const validate = (v: Row) => {
    const from = String(v.date_from)
    const to = String(v.date_to)
    if (to < from) return 'La fecha final es anterior a la inicial'
    const overlap = items.find((l) => l.employee?.id === v.employee_id && (l.status === 'solicitada' || l.status === 'aprobada') && (l.dateFrom ?? '') <= to && (l.dateTo ?? '') >= from)
    if (overlap) return `El empleado ya tiene una ${LEAVE_TYPES[overlap.type ?? ''] ?? 'ausencia'} (${overlap.status}) que se cruza con esas fechas`
    if (!(Number(v.days) > 0)) v.days = countDays(from, to, String(v.type))
    return null
  }

  const columns: Column<LeaveItem>[] = [
    { key: 'employee', header: 'Empleado', render: (l) => <NameCell name={l.employee?.name ?? '—'} sub={l.employee?.position} /> },
    {
      key: 'type',
      header: 'Tipo',
      render: (l) => (
        <div className="min-w-0">
          <div className="font-medium">{LEAVE_TYPES[l.type ?? ''] ?? l.type ?? '—'}</div>
          {l.notes && <div className="max-w-56 truncate text-xs text-muted">{l.notes}</div>}
        </div>
      ),
    },
    { key: 'dates', header: 'Fechas', render: (l) => <span className="whitespace-nowrap">{date(l.dateFrom)} → {date(l.dateTo)}</span> },
    { key: 'days', header: 'Días', align: 'right', render: (l) => <span className="font-semibold">{qty(l.days)}</span> },
    { key: 'paid', header: 'Remunerado', hideSm: true, render: (l) => <Badge tone={l.paid ? 'success' : 'neutral'}>{l.paid ? 'Sí' : 'No'}</Badge> },
    { key: 'status', header: 'Estado', render: (l) => <StatusBadge status={l.status} /> },
    {
      key: 'act',
      header: '',
      align: 'right',
      render: (l) =>
        isFinance && l.status === 'solicitada' ? (
          <div className="flex justify-end gap-1">
            <IconButton icon={Check} label="Aprobar" tone="success" disabled={busy === l.id} onClick={() => decide(l, true)} />
            <IconButton icon={X} label="Rechazar" tone="danger" disabled={busy === l.id} onClick={() => decide(l, false)} />
          </div>
        ) : null,
    },
  ]

  return (
    <>
      <PageHeader
        title="Vacaciones y permisos"
        subtitle="Solicitudes de ausencia del personal y su aprobación."
        actions={
          canWrite && (
            <Button icon={Plus} onClick={() => setOpen(true)}>
              Nueva solicitud
            </Button>
          )
        }
      />
      <ErrorBox error={error} />

      <div className="mb-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard icon={Clock} tone="warning" label="Por aprobar" value={qty(pending)} hint="Solicitudes en espera" />
        <KpiCard icon={CalendarDays} tone="info" label="Ausentes hoy" value={qty(away)} hint="Con ausencia aprobada" />
        <KpiCard icon={CalendarCheck} tone="success" label={`Días aprobados en ${year}`} value={qty(approvedDays)} hint="Suma de solicitudes aprobadas" />
      </div>

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'solicitada', label: 'Por aprobar', count: count('solicitada') },
            { key: 'aprobada', label: 'Aprobadas', count: count('aprobada') },
            { key: 'rechazada', label: 'Rechazadas', count: count('rechazada') },
            { key: 'todas', label: 'Todas', count: count('todas') },
          ]}
        />
      </div>

      <Card padded={false}>
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          empty={<EmptyState icon={CalendarDays} title="Sin solicitudes" message={tab === 'solicitada' ? 'No hay solicitudes pendientes de aprobación.' : 'No hay solicitudes en este estado.'} />}
        />
      </Card>

      <RecordForm
        open={open}
        onClose={() => setOpen(false)}
        table="leave_requests"
        title="Nueva solicitud"
        subtitle="Queda en estado solicitada hasta que un administrador o contador la apruebe."
        fields={fields}
        initial={null}
        extra={{ status: 'solicitada' }}
        validate={validate}
      />
    </>
  )
}
