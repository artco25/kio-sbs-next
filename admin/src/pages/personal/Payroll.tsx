import { Banknote, Building2, Calculator, CheckCheck, Download, FileText, Minus, Pencil, Plus, Printer, Settings2, Trash2, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { KpiCard } from '../../components/charts'
import { type FieldDef, RecordForm } from '../../components/RecordForm'
import { Button, Card, type Column, DataTable, EmptyState, ErrorBox, FilterSelect, ICON, IconTile, Modal, NameCell, PageHeader, StatusBadge, Tabs, useFeedback } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { date, money, pct, qty } from '../../lib/format'
import { gql } from '../../lib/gql'
import { deleteRecord, docNumber, exportCsv, type Row, saveRecords, today } from '../../lib/records'
import { useGql } from '../../lib/useGql'
import { MonthInput, periodLabel, snake, useEmployees } from './_shared'
import { computePayslip, noveltyType, parseDetail, periodRange } from './payroll'

// ============================================================================ tipos y consultas

interface Slip {
  id: string
  number: string | null
  period: string | null
  dateFrom: string | null
  dateTo: string | null
  days: number
  basic: number
  transport: number
  overtime: number
  otherEarnings: number
  totalEarnings: number
  health: number
  pension: number
  solidarity: number
  otherDeductions: number
  totalDeductions: number
  net: number
  employerCost: number
  status: string | null
  detail: unknown
  employee: { id: string; name: string | null; docType: string | null; docNumber: string | null; position: string | null } | null
}

interface Params {
  year: number
  smmlv: number
  transportAid: number
  uvt: number
  healthPct: number
  pensionPct: number
  hoursDivisor: number
  sundaySurcharge: number
  notes: string | null
}

interface NoveltyRow {
  id: string
  employeeId: string | null
  date: string | null
  type: string | null
  quantity: number
  amount: number
  payslipId: string | null
}

const SLIP_FIELDS = `id number period dateFrom dateTo days basic transport overtime otherEarnings totalEarnings health pension solidarity otherDeductions totalDeductions net employerCost status detail employee{ id name docType docNumber position }`
const Q_SLIPS = `query($p:String){ payslips(period:$p){ ${SLIP_FIELDS} } }`
const PARAM_FIELDS = 'year smmlv transportAid uvt healthPct pensionPct hoursDivisor sundaySurcharge notes'
const Q_PARAM = `query($y:Int){ payrollParams(year:$y){ ${PARAM_FIELDS} } }`
const Q_NOV = `query($from:String,$to:String){ novelties(from:$from,to:$to){ id employeeId date type quantity amount payslipId } }`
const THIS_YEAR = new Date().getFullYear()
const Q_PARAMS_ALL = `{ ${Array.from({ length: 9 }, (_, i) => THIS_YEAR + 1 - i)
  .map((y) => `y${y}: payrollParams(year:${y}){ ${PARAM_FIELDS} }`)
  .join(' ')} }`

type PeriodKind = '' | 'Q1' | 'Q2'

// ============================================================================ página

export default function Payroll() {
  const { can } = useAuth()
  const [tab, setTab] = useState<'liquidacion' | 'parametros'>('liquidacion')
  if (!can('payslips')) return null
  return (
    <>
      <PageHeader title="Nómina" subtitle="Liquidación de desprendibles de pago y parámetros legales del año.">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'liquidacion', label: 'Liquidación', icon: Calculator },
            { key: 'parametros', label: 'Parámetros', icon: Settings2 },
          ]}
        />
      </PageHeader>
      {tab === 'liquidacion' ? <Liquidation goParams={() => setTab('parametros')} /> : <ParamsView />}
    </>
  )
}

// ============================================================================ liquidación

function Liquidation({ goParams }: { goParams: () => void }) {
  const { can } = useAuth()
  const { toast, confirm } = useFeedback()
  const canWrite = can('payslips', 'write')
  const [month, setMonth] = useState(today().slice(0, 7))
  const [kind, setKind] = useState<PeriodKind>('')
  const [busy, setBusy] = useState<'liq' | 'conf' | null>(null)
  const [view, setView] = useState<Slip | null>(null)

  const period = kind ? `${month}-${kind}` : month
  const range = periodRange(period)
  const year = Number(month.slice(0, 4))

  const { data, loading, error } = useGql<{ payslips: Slip[] }>(Q_SLIPS, { p: period })
  const { data: pdata } = useGql<{ payrollParams: Params | null }>(Q_PARAM, { y: year })
  const { data: employees, extended } = useEmployees(true)
  const slips = useMemo(() => [...(data?.payslips ?? [])].sort((a, b) => (a.employee?.name ?? '').localeCompare(b.employee?.name ?? '')), [data])
  const params = pdata?.payrollParams ?? null

  const sum = (k: keyof Slip) => slips.reduce((a, s) => a + (Number(s[k]) || 0), 0)
  const drafts = slips.filter((s) => s.status === 'borrador')
  const freq = kind ? 'quincenal' : 'mensual'
  const eligible = (employees ?? []).filter((e) => (e.payFrequency || 'mensual') === freq && (!e.startDate || e.startDate <= range.to) && (!e.endDate || e.endDate >= range.from))

  async function liquidate() {
    if (!params) return toast(`Configura los parámetros de nómina de ${year}`, 'error')
    if (!eligible.length) return toast(`No hay empleados activos con pago ${freq} en este periodo`, 'error')
    setBusy('liq')
    try {
      const [existing, novs] = await Promise.all([gql<{ payslips: Slip[] }>(Q_SLIPS, { p: period }), gql<{ novelties: NoveltyRow[] }>(Q_NOV, { from: range.from, to: range.to })])
      const base = docNumber('NOM')
      const changes: { table: string; row: Row }[] = []
      let skipped = 0
      eligible.forEach((e, i) => {
        const prev = existing.payslips.find((s) => s.employee?.id === e.id)
        if (prev?.status === 'confirmada') {
          skipped++
          return
        }
        const mine = novs.novelties.filter((n) => n.employeeId === e.id && !n.payslipId).map((n) => snake(n))
        const slip = computePayslip({ employee: snake(e), params: snake(params), period, novelties: mine })
        changes.push({ table: 'payslips', row: { ...slip, id: prev?.id ?? crypto.randomUUID(), number: prev?.number ?? `${base}-${i + 1}`, status: 'borrador' } })
      })
      if (!changes.length) return toast('Todos los desprendibles del periodo ya están confirmados', 'error')
      await saveRecords(changes)
      toast(`${changes.length} desprendible${changes.length === 1 ? '' : 's'} liquidado${changes.length === 1 ? '' : 's'} en borrador${skipped ? ` (${skipped} confirmados se conservaron)` : ''}`)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  async function confirmAll() {
    if (!drafts.length) return
    const ok = await confirm({
      title: 'Confirmar nómina',
      message: `Se confirmarán ${drafts.length} desprendibles de ${periodLabel(period)} por un neto de ${money(drafts.reduce((a, s) => a + s.net, 0))} y sus novedades quedarán liquidadas.`,
      confirmLabel: 'Confirmar nómina',
    })
    if (!ok) return
    setBusy('conf')
    try {
      const { novelties } = await gql<{ novelties: NoveltyRow[] }>(Q_NOV, { from: range.from, to: range.to })
      const pending = novelties.filter((n) => !n.payslipId && noveltyType(n.type))
      const changes: { table: string; row: Row }[] = []
      let stale = 0
      for (const d of drafts) {
        changes.push({ table: 'payslips', row: { id: d.id, status: 'confirmada' } })
        const items = parseDetail(d.detail).novedades ?? []
        const included = new Set(items.map((i) => i.id).filter(Boolean))
        const legacy = items.length > 0 && included.size === 0 // liquidado desde la app (sin ids): se enlazan todas las del rango
        for (const n of pending.filter((x) => x.employeeId === d.employee?.id)) {
          if (legacy || included.has(n.id)) changes.push({ table: 'payroll_novelties', row: { id: n.id, payslip_id: d.id } })
          else stale++
        }
      }
      if (stale) return toast(`Hay ${stale} novedad${stale === 1 ? '' : 'es'} registrada${stale === 1 ? '' : 's'} después de liquidar. Vuelve a liquidar antes de confirmar.`, 'error')
      await saveRecords(changes)
      toast('Nómina confirmada')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const exportRows = () =>
    exportCsv(
      `nomina_${period}`,
      slips.map((s) => ({ ...s, employee_name: s.employee?.name, doc: s.employee?.docNumber, status: s.status })),
      [
        { key: 'number', label: 'Número' },
        { key: 'employee_name', label: 'Empleado' },
        { key: 'doc', label: 'Documento' },
        { key: 'days', label: 'Días' },
        { key: 'basic', label: 'Básico' },
        { key: 'transport', label: 'Aux. transporte' },
        { key: 'overtime', label: 'Extras y recargos' },
        { key: 'otherEarnings', label: 'Otros devengos' },
        { key: 'totalEarnings', label: 'Total devengado' },
        { key: 'health', label: 'Salud' },
        { key: 'pension', label: 'Pensión' },
        { key: 'solidarity', label: 'Solidaridad' },
        { key: 'otherDeductions', label: 'Otras deducciones' },
        { key: 'totalDeductions', label: 'Total deducciones' },
        { key: 'net', label: 'Neto' },
        { key: 'employerCost', label: 'Costo empleador' },
        { key: 'status', label: 'Estado' },
      ],
    )

  const columns: Column<Slip>[] = [
    { key: 'emp', header: 'Empleado', render: (s) => <NameCell name={s.employee?.name ?? '—'} sub={s.employee?.position || s.number} /> },
    { key: 'days', header: 'Días', align: 'right', hideSm: true, render: (s) => qty(s.days) },
    { key: 'earn', header: 'Devengado', align: 'right', hideSm: true, render: (s) => money(s.totalEarnings) },
    { key: 'ded', header: 'Deducciones', align: 'right', hideSm: true, render: (s) => <span className="text-danger">{money(s.totalDeductions)}</span> },
    { key: 'net', header: 'Neto', align: 'right', render: (s) => <span className="font-bold text-ink">{money(s.net)}</span> },
    { key: 'status', header: 'Estado', render: (s) => <StatusBadge status={s.status} /> },
  ]

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <MonthInput value={month} onChange={setMonth} />
        <FilterSelect
          value={kind}
          onChange={setKind}
          options={[
            { value: '', label: 'Mensual' },
            { value: 'Q1', label: '1.ª quincena' },
            { value: 'Q2', label: '2.ª quincena' },
          ]}
        />
        {canWrite && (
          <Button icon={Calculator} loading={busy === 'liq'} onClick={liquidate}>
            Liquidar
          </Button>
        )}
        <span className="text-sm text-muted">
          {range.from} a {range.to} · {eligible.length} empleado{eligible.length === 1 ? '' : 's'} con pago {freq}
        </span>
      </div>
      <ErrorBox error={error} />

      {pdata && !params && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/20 bg-warning-soft px-4 py-3 text-sm text-warning">
          <span>No hay parámetros de nómina para {year}. Configúralos para poder liquidar.</span>
          <Button size="sm" variant="secondary" onClick={goParams}>
            Ir a parámetros
          </Button>
        </div>
      )}
      {params && params.year !== year && (
        <div className="mb-5 rounded-2xl border border-info/20 bg-info-soft px-4 py-3 text-sm text-info">Se usarán los parámetros de {params.year}, el último año configurado. Crea los de {year} en la pestaña Parámetros.</div>
      )}
      {employees && !extended && (
        <div className="mb-5 rounded-2xl border border-info/20 bg-info-soft px-4 py-3 text-sm text-info">
          El API aún no expone riesgo ARL ni salario integral de los empleados: la liquidación asume riesgo clase I y salario no integral (afecta sólo el costo empleador estimado y el IBC de salarios integrales).
        </div>
      )}

      <div className="mb-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Banknote} tone="success" label="Total devengado" value={money(sum('totalEarnings'))} hint={`${slips.length} desprendibles`} />
        <KpiCard icon={Minus} tone="danger" label="Deducciones" value={money(sum('totalDeductions'))} hint="Salud, pensión y otras" />
        <KpiCard icon={Wallet} label="Neto a pagar" value={money(sum('net'))} hint={drafts.length ? `${drafts.length} en borrador` : slips.length ? 'Nómina confirmada' : undefined} />
        <KpiCard icon={Building2} tone="info" label="Costo empleador (estimado)" value={money(sum('employerCost'))} hint="Seguridad social y provisiones" />
      </div>

      <Card
        padded={false}
        title={<span className="capitalize">{periodLabel(period)}</span>}
        subtitle={drafts.length ? `${drafts.length} en borrador: revisa y confirma la nómina.` : 'Desprendibles del periodo'}
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={exportRows} disabled={!slips.length}>
              Exportar CSV
            </Button>
            {canWrite && drafts.length > 0 && (
              <Button variant="success" icon={CheckCheck} loading={busy === 'conf'} onClick={confirmAll}>
                Confirmar nómina
              </Button>
            )}
          </>
        }
      >
        <div className="pt-4">
          <DataTable
            columns={columns}
            rows={slips}
            loading={loading}
            onRowClick={setView}
            empty={
              <EmptyState
                icon={FileText}
                title="Aún no se ha liquidado este periodo"
                message="Pulsa Liquidar para calcular los desprendibles en borrador con las novedades del periodo."
                action={canWrite ? <Button icon={Calculator} loading={busy === 'liq'} onClick={liquidate}>Liquidar</Button> : undefined}
              />
            }
          />
        </div>
      </Card>

      <PayslipModal slip={view} canDelete={canWrite} onClose={() => setView(null)} />
    </>
  )
}

// ============================================================================ desprendible

function PayslipModal({ slip, onClose, canDelete }: { slip: Slip | null; onClose: () => void; canDelete: boolean }) {
  const { toast, confirm } = useFeedback()
  if (!slip) return null

  async function remove() {
    if (!slip || !(await confirm({ title: 'Eliminar borrador', message: 'Se eliminará este desprendible en borrador. Podrás volver a liquidarlo.', confirmLabel: 'Eliminar', danger: true }))) return
    try {
      await deleteRecord('payslips', slip.id)
      toast('Borrador eliminado')
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Desprendible de pago"
      subtitle={`${slip.number ?? ''} · ${periodLabel(slip.period)}`}
      footer={
        <>
          {canDelete && slip.status === 'borrador' && (
            <Button variant="ghost" icon={Trash2} className="mr-auto text-danger hover:bg-danger-soft hover:text-danger" onClick={remove}>
              Eliminar borrador
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button icon={Printer} onClick={() => window.print()}>
            Imprimir
          </Button>
        </>
      }
    >
      <PayslipSheet slip={slip} />
      <PrintCopy slip={slip} />
    </Modal>
  )
}

/** Copia oculta en pantalla que es lo único visible al imprimir (el resto de la página se oculta). */
function PrintCopy({ slip }: { slip: Slip }) {
  const [root] = useState(() => Object.assign(document.createElement('div'), { className: 'payslip-print-root' }))
  useEffect(() => {
    document.body.appendChild(root)
    return () => {
      root.remove()
    }
  }, [root])
  return createPortal(
    <>
      <style>{`.payslip-print-root{display:none}@media print{body>*:not(.payslip-print-root){display:none!important}.payslip-print-root{display:block!important;padding:8mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:10mm}}`}</style>
      <PayslipSheet slip={slip} print />
    </>,
    root,
  )
}

function PayslipSheet({ slip, print }: { slip: Slip; print?: boolean }) {
  const { me } = useAuth()
  const d = parseDetail(slip.detail)
  const items = d.novedades ?? []
  const ibc = d.ibc ?? 0
  const line = (label: string, value: number, opts: { neg?: boolean; bold?: boolean } = {}) => (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className={opts.bold ? 'font-bold text-ink' : 'text-ink-soft'}>{label}</span>
      <span className={`tabular-nums ${opts.bold ? 'font-bold' : 'font-medium'} ${opts.neg ? 'text-danger' : 'text-ink'}`}>
        {opts.neg && value ? '− ' : ''}
        {money(value)}
      </span>
    </div>
  )
  const title = (t: string) => <p className="mt-4 mb-1 text-[11px] font-bold tracking-wider text-muted uppercase">{t}</p>
  const ratio = (v: number) => (ibc > 0 ? ` (${pct(v / ibc, 1)})` : '')

  return (
    <div className="text-ink">
      {print && (
        <div className="mb-4 border-b border-line pb-3">
          <p className="text-lg font-extrabold">{me?.company.name}</p>
          <p className="text-sm text-muted">{[me?.company.nit && `NIT ${me.company.nit}`, me?.company.address, me?.company.city].filter(Boolean).join(' · ')}</p>
          <p className="mt-2 text-base font-bold">Desprendible de pago · {periodLabel(slip.period)}</p>
        </div>
      )}
      {!print && me?.company.nit && <p className="mb-3 text-sm text-muted">{me.company.name} · NIT {me.company.nit}</p>}
      <div className="rounded-2xl bg-canvas p-4">
        <NameCell name={slip.employee?.name ?? '—'} sub={`${slip.employee?.docType ?? ''} ${slip.employee?.docNumber ?? ''}${slip.employee?.position ? ` · ${slip.employee.position}` : ''}`.trim()} />
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
          <span>{slip.number}</span>
          <span>
            {date(slip.dateFrom)} a {date(slip.dateTo)}
          </span>
          <span>{qty(slip.days)} días</span>
          <StatusBadge status={slip.status} />
        </div>
      </div>

      {title('Devengos')}
      {line('Salario básico', slip.basic)}
      {slip.transport > 0 && line('Auxilio de transporte', slip.transport)}
      {slip.overtime > 0 && line('Horas extra y recargos', slip.overtime)}
      {slip.otherEarnings > 0 && line('Otros devengos', slip.otherEarnings)}
      <div className="border-t border-line">{line('Total devengado', slip.totalEarnings, { bold: true })}</div>

      {title('Deducciones')}
      {line(`Salud${ratio(slip.health)}`, slip.health, { neg: true })}
      {line(`Pensión${ratio(slip.pension)}`, slip.pension, { neg: true })}
      {slip.solidarity > 0 && line('Fondo de solidaridad pensional', slip.solidarity, { neg: true })}
      {slip.otherDeductions > 0 && line('Otras deducciones', slip.otherDeductions, { neg: true })}
      <div className="border-t border-line">{line('Total deducciones', slip.totalDeductions, { bold: true, neg: true })}</div>

      <div className="mt-4 flex items-center justify-between rounded-2xl bg-brand-50 px-4 py-3">
        <span className="text-sm font-bold tracking-wide text-brand-700 uppercase">Neto a pagar</span>
        <span className="font-display text-2xl font-extrabold text-brand-700">{money(slip.net)}</span>
      </div>

      {items.length > 0 && (
        <>
          {title('Novedades incluidas')}
          <ul className="space-y-0.5 text-sm text-ink-soft">
            {items.map((n, i) => (
              <li key={n.id ?? i} className="flex justify-between gap-4">
                <span>
                  {n.concepto}
                  {n.cantidad != null ? ` (${qty(n.cantidad)})` : ''}
                </span>
                <span className="tabular-nums">{money(n.valor)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-4 text-xs text-muted">
        IBC {money(ibc)} · valor hora {money(d.valor_hora ?? 0)}. Cálculo simplificado; no reemplaza la nómina electrónica DIAN.
      </p>
      {!print && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-line px-3 py-2 text-xs text-muted print:hidden">
          <span>Costo empleador estimado</span>
          <span className="font-semibold text-ink-soft">{money(slip.employerCost)}</span>
        </div>
      )}
      {print && (
        <div className="mt-16 grid grid-cols-2 gap-10 text-center text-xs text-muted">
          <div className="border-t border-ink pt-1">Firma del empleador</div>
          <div className="border-t border-ink pt-1">Firma del empleado</div>
        </div>
      )}
    </div>
  )
}

// ============================================================================ parámetros

const PARAM_FORM: FieldDef[] = [
  { key: 'year', label: 'Año', type: 'integer', required: true },
  { key: 'smmlv', label: 'Salario mínimo (SMMLV)', type: 'money', required: true },
  { key: 'transport_aid', label: 'Auxilio de transporte', type: 'money', required: true },
  { key: 'uvt', label: 'UVT', type: 'money' },
  { key: 'health_pct', label: 'Salud empleado', type: 'percent', defaultValue: 0.04 },
  { key: 'pension_pct', label: 'Pensión empleado', type: 'percent', defaultValue: 0.04 },
  { key: 'hours_divisor', label: 'Horas mensuales (divisor del valor hora)', type: 'number', defaultValue: 210 },
  { key: 'sunday_surcharge', label: 'Recargo dominical/festivo', type: 'percent', defaultValue: 0.9 },
  { key: 'notes', label: 'Fuente / notas', type: 'textarea' },
]

function ParamsView() {
  const { me, can } = useAuth()
  const canWrite = can('payroll_params', 'write')
  const { data, loading, error } = useGql<Record<string, Params | null>>(Q_PARAMS_ALL)
  const [form, setForm] = useState<{ open: boolean; initial: Row | null }>({ open: false, initial: null })

  const rows = useMemo(() => {
    const m = new Map<number, Params>()
    for (const p of Object.values(data ?? {})) if (p) m.set(p.year, p)
    return [...m.values()].sort((a, b) => b.year - a.year)
  }, [data])

  const companyId = me?.company.id ?? ''
  const idFor = (year: unknown) => `pp-${year}-${companyId}`
  const isNew = !form.initial?.id

  function openNew() {
    const next = rows.some((p) => p.year === THIS_YEAR) ? (rows[0]?.year ?? THIS_YEAR) + 1 : THIS_YEAR
    const base = rows[0] ? snake(rows[0]) : {}
    setForm({ open: true, initial: { ...base, year: next } })
  }
  const openEdit = (p: Params) => setForm({ open: true, initial: { ...snake(p), id: idFor(p.year) } })

  const fields = useMemo(() => PARAM_FORM.map((f) => (f.key === 'year' ? { ...f, disabled: !isNew } : f)), [isNew])

  const validate = (v: Row) => {
    const year = Number(v.year)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return 'Año inválido'
    if (!(Number(v.smmlv) > 0)) return 'Indica el salario mínimo'
    if (!(Number(v.hours_divisor) > 0)) return 'Las horas mensuales deben ser mayores que cero'
    if (isNew && rows.some((p) => p.year === year)) return `Ya existen parámetros para ${year}; edítalos desde la tabla`
    v.id = idFor(year) // id determinista por año y empresa: dos equipos no crean dos juegos del mismo año
    return null
  }

  const columns: Column<Params>[] = [
    { key: 'year', header: 'Año', render: (p) => <span className="font-extrabold text-ink">{p.year}</span> },
    { key: 'smmlv', header: 'SMMLV', align: 'right', render: (p) => money(p.smmlv) },
    { key: 'transport', header: 'Aux. transporte', align: 'right', render: (p) => money(p.transportAid) },
    { key: 'uvt', header: 'UVT', align: 'right', hideSm: true, render: (p) => money(p.uvt) },
    { key: 'health', header: 'Salud / pensión', align: 'right', hideSm: true, render: (p) => `${pct(p.healthPct, 1)} / ${pct(p.pensionPct, 1)}` },
    { key: 'hours', header: 'Horas/mes', align: 'right', hideSm: true, render: (p) => qty(p.hoursDivisor) },
    { key: 'sunday', header: 'Recargo dominical', align: 'right', hideSm: true, render: (p) => pct(p.sundaySurcharge, 1) },
    { key: 'act', header: '', align: 'right', render: () => (canWrite ? <Pencil {...ICON} className="ml-auto text-muted" /> : null) },
  ]

  return (
    <>
      <ErrorBox error={error} />
      <div className="mb-6 flex items-start gap-4 rounded-2xl border border-line bg-white p-5 shadow-card">
        <IconTile icon={Settings2} />
        <div className="text-sm text-muted">
          <p className="font-semibold text-ink">Valores legales que usa la liquidación</p>
          <p className="mt-1">Si no hay parámetros del año liquidado se usan los del último año configurado. Verifícalos con los decretos vigentes antes de confirmar la nómina.</p>
        </div>
      </div>
      <Card
        padded={false}
        title="Parámetros anuales"
        subtitle={`${rows.length} ${rows.length === 1 ? 'año configurado' : 'años configurados'}`}
        actions={
          canWrite && (
            <Button icon={Plus} onClick={openNew}>
              Nuevo año
            </Button>
          )
        }
      >
        <div className="pt-4">
          <DataTable
            columns={columns}
            rows={rows.map((p) => ({ ...p, id: String(p.year) }))}
            loading={loading}
            onRowClick={canWrite ? openEdit : undefined}
            empty={<EmptyState icon={Settings2} title="Sin parámetros" message="Crea los parámetros del año para poder liquidar la nómina." action={canWrite ? <Button icon={Plus} onClick={openNew}>Nuevo año</Button> : undefined} />}
          />
        </div>
      </Card>
      {rows[0]?.notes && (
        <p className="mt-4 text-xs text-muted">
          Fuente {rows[0].year}: {rows[0].notes}
        </p>
      )}

      <RecordForm
        open={form.open}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        table="payroll_params"
        title={isNew ? 'Nuevos parámetros' : `Parámetros ${form.initial?.year}`}
        subtitle="Los porcentajes se escriben como en la ley (4 = 4 %)."
        fields={fields}
        initial={form.initial}
        extra={{ id: idFor(form.initial?.year) }}
        validate={validate}
        canDelete={false}
      />
    </>
  )
}
