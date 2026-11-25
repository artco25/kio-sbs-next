import { CalendarDays, CircleCheck, CircleX, Download, FilePen, Hourglass, Pencil, Plus, Send, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Donut, KpiCard } from '../../components/charts'
import { RecordForm, type FieldDef } from '../../components/RecordForm'
import { Badge, Button, Card, DataTable, EmptyState, ErrorBox, Field, FilterSelect, IconButton, Modal, NameCell, PageHeader, SearchInput, StatusBadge, Tabs, Textarea, Toolbar, useFeedback } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { date, delta, money, qty, toNum } from '../../lib/format'
import { gql } from '../../lib/gql'
import { docNumber, exportCsv, invalidate, saveRecord, today, type Row } from '../../lib/records'
import { useGql } from '../../lib/useGql'
import { categoryLabel, dailySeries, DetailItem, DetailList, EXPENSE_CATEGORIES, monthBounds, monthOptions, PALETTE, prevMonth } from './_shared'

interface Expense {
  id: string
  number: string | null
  date: string | null
  concept: string | null
  category: string | null
  amount: number
  tax: number
  status: string | null
  approvedAt: string | null
  notes: string | null
  partner: { id: string; name: string | null } | null
  requestedBy: { id: string; name: string } | null
  approvedBy: { id: string; name: string } | null
}

const F = `id number date concept category amount tax status approvedAt notes partner{ id name } requestedBy{ id name } approvedBy{ id name }`
const Q = `query($from:String,$to:String,$pf:String,$pt:String){
  month: expenses(from:$from, to:$to, limit:500){ ${F} }
  sent: expenses(status:"enviada", limit:500){ ${F} }
  draft: expenses(status:"borrador", limit:500){ ${F} }
  prev: expenses(status:"aprobada", from:$pf, to:$pt, limit:500){ amount }
}`
const SUPPLIERS_Q = `{ partners(suppliers:true, limit:500){ items{ id name } } }`
const DECIDE = `mutation($id:ID!,$a:Boolean!,$n:String){ approveExpense(id:$id, approve:$a, notes:$n){ id status } }`

type TabKey = 'todos' | 'borrador' | 'enviada' | 'aprobada' | 'rechazada'

export default function Expenses() {
  const { me, can, isFinance } = useAuth()
  const { toast, confirm } = useFeedback()
  const canWrite = can('expenses', 'write')
  const [ym, setYm] = useState(() => today().slice(0, 7))
  const [tab, setTab] = useState<TabKey>('todos')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [form, setForm] = useState<{ initial: Row | null; extra: Row } | null>(null)
  const [decision, setDecision] = useState<{ exp: Expense; approve: boolean } | null>(null)
  const [detail, setDetail] = useState<Expense | null>(null)

  const months = useMemo(() => monthOptions(12), [])
  const { from, to } = useMemo(() => monthBounds(ym), [ym])
  const pm = useMemo(() => monthBounds(prevMonth(ym)), [ym])
  const { data, loading, error } = useGql<{ month: Expense[]; sent: Expense[]; draft: Expense[]; prev: { amount: number }[] }>(Q, { from, to, pf: pm.from, pt: pm.to })
  const suppliers = useGql<{ partners: { items: { id: string; name: string | null }[] } }>(SUPPLIERS_Q, {}, { skip: !canWrite })

  // Gastos del mes + borradores y enviadas de cualquier mes (requieren acción).
  const all = useMemo(() => {
    const m = new Map<string, Expense>()
    for (const e of [...(data?.month ?? []), ...(data?.sent ?? []), ...(data?.draft ?? [])]) m.set(e.id, e)
    return [...m.values()].sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
  }, [data])

  const inMonth = useMemo(() => data?.month ?? [], [data])
  const stats = useMemo(() => {
    const sum = (r: Expense[]) => r.reduce((s, x) => s + toNum(x.amount), 0)
    const approved = inMonth.filter((e) => e.status === 'aprobada')
    const sent = data?.sent ?? []
    const draft = data?.draft ?? []
    const rejected = inMonth.filter((e) => e.status === 'rechazada')
    return {
      approved: sum(approved),
      approvedN: approved.length,
      prev: (data?.prev ?? []).reduce((s, x) => s + toNum(x.amount), 0),
      sent: sum(sent),
      sentN: sent.length,
      draft: sum(draft),
      draftN: draft.length,
      rejected: sum(rejected),
      rejectedN: rejected.length,
      series: dailySeries(approved, from, to, (e) => e.date ?? '', (e) => toNum(e.amount)),
      byCat: [...approved.reduce((m, e) => m.set(e.category ?? 'otros', (m.get(e.category ?? 'otros') ?? 0) + toNum(e.amount)), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]),
    }
  }, [inMonth, data, from, to])

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { todos: all.length, borrador: 0, enviada: 0, aprobada: 0, rechazada: 0 }
    for (const e of all) if (e.status && e.status in c) c[e.status as TabKey]++
    return c
  }, [all])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter((e) => {
      if (tab !== 'todos' && e.status !== tab) return false
      if (category !== 'all' && e.category !== category) return false
      if (!q) return true
      return [e.concept, e.number, e.partner?.name, e.notes].some((v) => String(v ?? '').toLowerCase().includes(q))
    })
  }, [all, tab, category, search])

  const pending = useMemo(() => (data?.sent ?? []).slice().sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? ''))).slice(0, 5), [data])

  // ------------------------------------------------------------------ acciones

  function openNew() {
    if (!me) return
    setForm({ initial: null, extra: { status: 'borrador', number: docNumber('CM'), requested_by: me.user.id } })
  }
  function openEdit(e: Expense) {
    setDetail(null)
    setForm({ initial: { id: e.id, concept: e.concept, date: e.date, category: e.category, amount: e.amount, tax: e.tax, partner_id: e.partner?.id ?? '', notes: e.notes }, extra: {} })
  }
  async function send(e: Expense) {
    const ok = await confirm({ title: 'Enviar a aprobación', message: `El gasto "${e.concept}" por ${money(e.amount)} quedará pendiente de aprobación y ya no se podrá editar.`, confirmLabel: 'Enviar' })
    if (!ok) return
    try {
      await saveRecord('expenses', { id: e.id, status: 'enviada' })
      toast('Gasto enviado a aprobación')
      setDetail(null)
    } catch (er) {
      toast((er as Error).message, 'error')
    }
  }

  function download() {
    exportCsv(
      'caja_menor_gastos',
      rows.map((e) => ({
        number: e.number,
        date: e.date,
        concept: e.concept,
        category: categoryLabel(e.category),
        partner: e.partner?.name,
        amount: e.amount,
        tax: e.tax,
        status: e.status,
        requestedBy: e.requestedBy?.name,
        approvedBy: e.approvedBy?.name,
      })),
      [
        { key: 'number', label: 'Número' },
        { key: 'date', label: 'Fecha' },
        { key: 'concept', label: 'Concepto' },
        { key: 'category', label: 'Categoría' },
        { key: 'partner', label: 'Proveedor' },
        { key: 'amount', label: 'Valor' },
        { key: 'tax', label: 'IVA' },
        { key: 'status', label: 'Estado' },
        { key: 'requestedBy', label: 'Solicitó' },
        { key: 'approvedBy', label: 'Aprobó' },
      ],
    )
  }

  const fields: FieldDef[] = useMemo(() => {
    const isNew = !form?.initial?.id
    const f: FieldDef[] = [
      { key: 'concept', label: 'Concepto', required: true, full: true, placeholder: 'Ej. Taxi para entrega a cliente' },
      { key: 'date', label: 'Fecha del gasto', type: 'date', required: true, defaultValue: today() },
      { key: 'category', label: 'Categoría', type: 'select', required: true, defaultValue: 'otros', options: EXPENSE_CATEGORIES },
      { key: 'amount', label: 'Valor', type: 'money', required: true },
      { key: 'tax', label: 'IVA incluido', type: 'money', hint: 'Opcional. Parte del valor que corresponde a IVA.' },
      { key: 'partner_id', label: 'Proveedor', type: 'select', options: (suppliers.data?.partners.items ?? []).map((p) => ({ value: p.id, label: p.name ?? '—' })) },
      { key: 'receipt_ref', label: isNew ? 'Soporte (factura / recibo)' : 'Soporte (vacío conserva el actual)', placeholder: 'Ej. FV-10233' },
      { key: 'notes', label: 'Notas', type: 'textarea' },
    ]
    return f
  }, [form, suppliers.data])

  return (
    <>
      <PageHeader
        title="Caja menor y gastos"
        subtitle="Flujo de gastos: borrador, envío a aprobación y decisión del área financiera."
        actions={
          <>
            <FilterSelect icon={CalendarDays} value={ym} onChange={setYm} options={months} />
            {canWrite && (
              <Button icon={Plus} onClick={openNew}>
                Nuevo gasto
              </Button>
            )}
          </>
        }
      />
      <ErrorBox error={error} />

      <div className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={CircleCheck} label="Aprobado del mes" value={money(stats.approved)} delta={delta(stats.approved, stats.prev)} inverse series={stats.series} tone="success" hint={`${qty(stats.approvedN)} gastos`} />
          <KpiCard icon={Hourglass} label="Por aprobar" value={money(stats.sent)} tone="info" hint={`${qty(stats.sentN)} pendientes (todos los meses)`} />
          <KpiCard icon={FilePen} label="En borrador" value={money(stats.draft)} tone="warning" hint={`${qty(stats.draftN)} sin enviar (todos los meses)`} />
          <KpiCard icon={CircleX} label="Rechazado del mes" value={money(stats.rejected)} tone="danger" hint={`${qty(stats.rejectedN)} gastos`} />
        </div>

        <div className="grid gap-6 xl:grid-cols-5">
          <Card className="xl:col-span-3" title="Gastos aprobados por categoría" subtitle="Mes seleccionado">
            {stats.byCat.length ? <Donut height={200} data={stats.byCat.map(([c, v], i) => ({ name: categoryLabel(c), value: v, color: PALETTE[i % PALETTE.length] }))} /> : <p className="text-sm text-muted">No hay gastos aprobados en este mes.</p>}
          </Card>
          <Card className="xl:col-span-2" title="Pendientes de aprobación" subtitle={pending.length ? 'Los más antiguos primero' : undefined}>
            {pending.length === 0 ? (
              <p className="text-sm text-muted">No hay gastos esperando aprobación.</p>
            ) : (
              <ul className="divide-y divide-line">
                {pending.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                    <button className="min-w-0 flex-1 text-left" onClick={() => setDetail(e)}>
                      <p className="truncate text-sm font-semibold text-ink">{e.concept}</p>
                      <p className="truncate text-xs text-muted">
                        {date(e.date)} · {e.requestedBy?.name ?? categoryLabel(e.category)}
                      </p>
                    </button>
                    <span className="shrink-0 text-sm font-bold">{money(e.amount)}</span>
                    {isFinance && (
                      <span className="flex shrink-0">
                        <IconButton icon={CircleCheck} label="Aprobar" tone="success" onClick={() => setDecision({ exp: e, approve: true })} />
                        <IconButton icon={CircleX} label="Rechazar" tone="danger" onClick={() => setDecision({ exp: e, approve: false })} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div>
          <div className="mb-4 overflow-x-auto">
            <Tabs<TabKey>
              value={tab}
              onChange={setTab}
              tabs={[
                { key: 'todos', label: 'Todos', count: counts.todos },
                { key: 'borrador', label: 'Borradores', count: counts.borrador },
                { key: 'enviada', label: 'Por aprobar', count: counts.enviada },
                { key: 'aprobada', label: 'Aprobados', count: counts.aprobada },
                { key: 'rechazada', label: 'Rechazados', count: counts.rechazada },
              ]}
            />
          </div>
          <Card padded={false} className="pt-5">
            <Toolbar
              actions={
                <Button variant="secondary" icon={Download} onClick={download} disabled={!rows.length}>
                  Exportar CSV
                </Button>
              }
            >
              <SearchInput value={search} onChange={setSearch} placeholder="Buscar por concepto, número o proveedor…" />
              <FilterSelect value={category} onChange={setCategory} options={[{ value: 'all', label: 'Todas las categorías' }, ...EXPENSE_CATEGORIES]} />
            </Toolbar>
            <DataTable<Expense>
              rows={rows}
              loading={loading}
              onRowClick={setDetail}
              footer={<span>{qty(rows.length)} gastos · <strong className="text-ink">{money(rows.reduce((s, e) => s + toNum(e.amount), 0))}</strong></span>}
              columns={[
                { key: 'concept', header: 'Gasto', render: (e) => <NameCell avatar={false} name={e.concept ?? '—'} sub={e.number} /> },
                { key: 'category', header: 'Categoría', hideSm: true, render: (e) => <Badge>{categoryLabel(e.category)}</Badge> },
                { key: 'partner', header: 'Proveedor', hideSm: true, render: (e) => e.partner?.name ?? <span className="text-muted">—</span> },
                { key: 'date', header: 'Fecha', render: (e) => <span className="text-muted">{date(e.date)}</span> },
                { key: 'amount', header: 'Valor', align: 'right', render: (e) => <span className="font-semibold">{money(e.amount)}</span> },
                { key: 'status', header: 'Estado', render: (e) => <StatusBadge status={e.status} /> },
                { key: 'actions', header: 'Acciones', align: 'right', render: (e) => <RowActions e={e} canWrite={canWrite} isFinance={isFinance} onEdit={openEdit} onSend={send} onDecide={(approve) => setDecision({ exp: e, approve })} /> },
              ]}
              empty={<EmptyState icon={Wallet} title="No hay gastos en esta vista" message="Cambia de estado, mes o filtros, o registra un gasto nuevo." action={canWrite ? <Button icon={Plus} onClick={openNew}>Nuevo gasto</Button> : undefined} />}
            />
          </Card>
        </div>
      </div>

      <RecordForm
        open={!!form}
        onClose={() => setForm(null)}
        table="expenses"
        title={form?.initial?.id ? 'Editar borrador' : 'Nuevo gasto'}
        subtitle={form?.initial?.id ? 'Sólo los borradores se pueden modificar.' : 'Se guarda como borrador; luego lo envías a aprobación.'}
        fields={fields}
        initial={form?.initial}
        extra={form?.extra}
        validate={(v) => {
          if (toNum(v.amount) <= 0) return 'El valor debe ser mayor que cero'
          if (toNum(v.tax) < 0 || toNum(v.tax) > toNum(v.amount)) return 'El IVA no puede superar el valor del gasto'
          if (v.id && v.receipt_ref == null) delete v.receipt_ref // no borrar el soporte existente (el API no lo expone)
          return null
        }}
      />

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.concept ?? 'Gasto'}
        subtitle={detail?.number ?? undefined}
        footer={
          detail && (
            <>
              <Button variant="secondary" onClick={() => setDetail(null)}>
                Cerrar
              </Button>
              {canWrite && detail.status === 'borrador' && (
                <>
                  <Button variant="secondary" icon={Pencil} onClick={() => openEdit(detail)}>
                    Editar
                  </Button>
                  <Button icon={Send} onClick={() => send(detail)}>
                    Enviar a aprobación
                  </Button>
                </>
              )}
              {isFinance && detail.status === 'enviada' && (
                <>
                  <Button variant="danger" icon={CircleX} onClick={() => setDecision({ exp: detail, approve: false })}>
                    Rechazar
                  </Button>
                  <Button variant="success" icon={CircleCheck} onClick={() => setDecision({ exp: detail, approve: true })}>
                    Aprobar
                  </Button>
                </>
              )}
            </>
          )
        }
      >
        {detail && (
          <DetailList>
              <DetailItem label="Valor"><span className="text-lg font-extrabold">{money(detail.amount)}</span></DetailItem>
              <DetailItem label="Estado"><StatusBadge status={detail.status} /></DetailItem>
              <DetailItem label="Categoría">{categoryLabel(detail.category)}</DetailItem>
              <DetailItem label="IVA incluido">{detail.tax ? money(detail.tax) : null}</DetailItem>
              <DetailItem label="Fecha">{date(detail.date)}</DetailItem>
              <DetailItem label="Proveedor">{detail.partner?.name}</DetailItem>
              <DetailItem label="Solicitó">{detail.requestedBy?.name}</DetailItem>
              <DetailItem label="Decidió">{detail.approvedBy ? `${detail.approvedBy.name} · ${date(detail.approvedAt)}` : null}</DetailItem>
              <DetailItem label="Notas"><span className="whitespace-pre-line">{detail.notes}</span></DetailItem>
            </DetailList>
        )}
      </Modal>

      <DecisionModal state={decision} onClose={() => setDecision(null)} onDone={() => setDetail(null)} />
    </>
  )
}

function RowActions({ e, canWrite, isFinance, onEdit, onSend, onDecide }: { e: Expense; canWrite: boolean; isFinance: boolean; onEdit: (e: Expense) => void; onSend: (e: Expense) => void; onDecide: (approve: boolean) => void }) {
  return (
    <span className="inline-flex" onClick={(ev) => ev.stopPropagation()}>
      {canWrite && e.status === 'borrador' && (
        <>
          <IconButton icon={Pencil} label="Editar" onClick={() => onEdit(e)} />
          <IconButton icon={Send} label="Enviar a aprobación" onClick={() => onSend(e)} />
        </>
      )}
      {isFinance && e.status === 'enviada' && (
        <>
          <IconButton icon={CircleCheck} label="Aprobar" tone="success" onClick={() => onDecide(true)} />
          <IconButton icon={CircleX} label="Rechazar" tone="danger" onClick={() => onDecide(false)} />
        </>
      )}
    </span>
  )
}

function DecisionModal({ state, onClose, onDone }: { state: { exp: Expense; approve: boolean } | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useFeedback()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const approve = state?.approve ?? true
  const missing = !approve && !note.trim()

  const close = () => {
    setNote('')
    onClose()
  }

  async function submit() {
    if (!state) return
    setSaving(true)
    try {
      await gql(DECIDE, { id: state.exp.id, a: state.approve, n: note.trim() || null })
      invalidate()
      toast(state.approve ? 'Gasto aprobado' : 'Gasto rechazado')
      onDone()
      close()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={!!state}
      onClose={close}
      size="sm"
      title={approve ? 'Aprobar gasto' : 'Rechazar gasto'}
      subtitle={state ? `${state.exp.concept} · ${money(state.exp.amount)}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button variant={approve ? 'success' : 'danger'} icon={approve ? CircleCheck : CircleX} loading={saving} disabled={missing} onClick={submit}>
            {approve ? 'Aprobar' : 'Rechazar'}
          </Button>
        </>
      }
    >
      <Field label={approve ? 'Nota (opcional)' : 'Motivo del rechazo'} required={!approve}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={approve ? 'Ej. Soporte verificado' : 'Explica por qué se rechaza'} />
      </Field>
      <p className="mt-3 text-xs text-muted">La nota se agrega a las observaciones del gasto y queda visible para quien lo solicitó.</p>
    </Modal>
  )
}
