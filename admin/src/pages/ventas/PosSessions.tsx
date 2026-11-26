import { ChefHat, CookingPot, Scale, ShoppingBag, Store, Tag, WifiOff } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Donut, KpiCard } from '../../components/charts'
import { Badge, Button, Card, DataTable, EmptyState, ErrorBox, Field, IconTile, Input, Modal, NameCell, PageHeader, Spinner, StatusBadge, useFeedback } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { dateTime, money, qty, relative, toNum } from '../../lib/format'
import { addDays, docNumber, nowLocal, saveRecord, today, uuid } from '../../lib/records'
import { useGql } from '../../lib/useGql'
import { PaymentState } from '../Dashboard'
import { METHOD_COLOR, METHOD_LABEL, MiniStat } from './_shared'

interface Session {
  id: string
  number: string
  terminal: string | null
  status: string
  openedAt: string | null
  closedAt: string | null
  openingCash: number
  expectedCash: number
  countedCash: number
  difference: number
  salesTotal: number
  salesCount: number
  user: { name: string } | null
}

interface Data {
  posSessions: Session[]
  todayPos: { total: number; amount: number }
  monthPos: { total: number; amount: number }
  kitchen: { items: KitchenSale[] }
}

interface KitchenSale {
  id: string
  number: string
  date: string
  status: string
  kitchenStatus: string | null
  tableRef: string | null
  notes: string | null
}

const Q = `query($today:String,$d30:String,$since:String){
  posSessions(limit:100){ id number terminal status openedAt closedAt openingCash expectedCash countedCash difference salesTotal salesCount user{ name } }
  todayPos: sales(channel:"pos", status:"confirmada", from:$today, limit:1){ total amount }
  monthPos: sales(channel:"pos", status:"confirmada", from:$d30, limit:1){ total amount }
  kitchen: sales(channel:"pos", from:$since, limit:500){ items{ id number date status kitchenStatus tableRef notes } }
}`

/** 'YYYY-MM-DDTHH:MM:SS' local → minutos transcurridos. */
const minutesSince = (d: string, now: number) => Math.max(0, Math.floor((now - new Date(d).getTime()) / 60_000))

function Diff({ s }: { s: Session }) {
  if (s.status !== 'cerrada') return <span className="text-muted">—</span>
  const d = toNum(s.difference)
  if (Math.abs(d) < 0.5) return <Badge tone="success">Cuadrada</Badge>
  return <Badge tone={d < 0 ? 'danger' : 'warning'}>{d > 0 ? '+' : ''}{money(d)}</Badge>
}

export default function PosSessions() {
  const { me, can } = useAuth()
  const { toast } = useFeedback()
  const [selected, setSelected] = useState<Session | null>(null)
  const [openBox, setOpenBox] = useState(false)
  const [opening, setOpening] = useState(false)
  const [terminal, setTerminal] = useState('')
  const [openingCash, setOpeningCash] = useState('0')
  const params = useMemo(() => ({ today: today(), d30: addDays(today(), -29), since: addDays(today(), -1) }), [])
  const { data, loading, error, reload } = useGql<Data>(Q, params)

  // La cocina se refresca sola cada 30 s
  useEffect(() => {
    const t = setInterval(() => void reload(), 30_000)
    return () => clearInterval(t)
  }, [reload])

  const sessions = data?.posSessions ?? []
  const open = sessions.filter((s) => s.status === 'abierta')
  const closed = sessions.filter((s) => s.status === 'cerrada')
  const diffTotal = closed.reduce((s, x) => s + toNum(x.difference), 0)
  const ticket = data?.monthPos.total ? data.monthPos.amount / data.monthPos.total : 0
  const salesSeries = [...sessions].reverse().slice(-14).map((s) => toNum(s.salesTotal))

  async function submitOpen() {
    if (!terminal.trim()) return toast('Indica el nombre de la caja/terminal.', 'error')
    const base = Math.max(0, Number(openingCash || 0))
    setOpening(true)
    try {
      await saveRecord('pos_sessions', { id: uuid(), number: docNumber('CJ'), terminal: terminal.trim(), user_id: me!.user.id, opened_at: nowLocal(), opening_cash: base, status: 'abierta' })
      toast('Caja abierta')
      setOpenBox(false)
      setTerminal('')
      setOpeningCash('0')
      reload()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setOpening(false)
    }
  }

  return (
    <>
      <PageHeader title="Punto de venta" subtitle="Sesiones de caja, arqueos y pedidos en cocina." actions={can('pos_sessions', 'write') ? <Button icon={Store} onClick={() => setOpenBox(true)}>Abrir caja</Button> : undefined} />
      <ErrorBox error={error} />

      <div className="mb-6 flex items-start gap-4 rounded-2xl border border-brand-100 bg-brand-50 px-5 py-4">
        <IconTile icon={WifiOff} size={40} />
        <p className="text-sm text-ink-soft">
          <span className="font-bold text-ink">Las cajas trabajan sin internet.</span> Son la app de escritorio KIO SBS: venden y cierran con su base local y envían los datos cuando recuperan la conexión (esta pantalla se actualiza en cuanto sincronizan, normalmente en menos de 90 segundos).
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Store} label="Cajas abiertas" value={String(open.length)} tone="success" hint={open.length ? open.map((s) => s.terminal || s.number).join(' · ') : 'Ninguna caja abierta'} />
        <KpiCard icon={ShoppingBag} label="Ventas de hoy en caja" value={money(data?.todayPos.amount ?? 0)} series={salesSeries} hint={`${qty(data?.todayPos.total ?? 0)} ventas`} />
        <KpiCard icon={Scale} label="Diferencia de arqueo" value={money(diffTotal)} tone={Math.abs(diffTotal) < 0.5 ? 'success' : diffTotal < 0 ? 'danger' : 'warning'} hint={`Acumulada en ${closed.length} cierres`} />
        <KpiCard icon={Tag} label="Ticket promedio POS" value={money(ticket)} tone="info" hint="Últimos 30 días" />
      </div>

      <Card className="mt-6" title="Sesiones de caja" subtitle="Toca una sesión para ver su detalle" padded={false}>
        <div className="pt-4">
          <DataTable<Session>
            rows={sessions}
            loading={loading}
            onRowClick={setSelected}
            footer={`${sessions.length} sesiones recientes`}
            columns={[
              { key: 'number', header: 'Sesión', render: (s) => <span className="font-semibold text-brand-700">{s.number}</span> },
              { key: 'terminal', header: 'Terminal', hideSm: true, render: (s) => s.terminal ?? '—' },
              { key: 'user', header: 'Cajero', render: (s) => <NameCell name={s.user?.name ?? '—'} /> },
              { key: 'openedAt', header: 'Apertura', hideSm: true, render: (s) => <span className="text-muted">{relative(s.openedAt)}</span> },
              { key: 'closedAt', header: 'Cierre', hideSm: true, render: (s) => <span className="text-muted">{s.closedAt ? relative(s.closedAt) : '—'}</span> },
              { key: 'openingCash', header: 'Base', align: 'right', hideSm: true, render: (s) => money(s.openingCash) },
              { key: 'sales', header: 'Ventas', align: 'right', render: (s) => <span className="font-semibold">{money(s.salesTotal)}</span> },
              { key: 'expected', header: 'Esperado', align: 'right', hideSm: true, render: (s) => (s.status === 'cerrada' ? money(s.expectedCash) : '—') },
              { key: 'counted', header: 'Contado', align: 'right', hideSm: true, render: (s) => (s.status === 'cerrada' ? money(s.countedCash) : '—') },
              { key: 'difference', header: 'Diferencia', align: 'right', render: (s) => <Diff s={s} /> },
              { key: 'status', header: 'Estado', render: (s) => <StatusBadge status={s.status} /> },
            ]}
            empty={<EmptyState icon={Store} title="Aún no hay sesiones de caja" message="Cuando una caja abra turno y sincronice, aparecerá aquí." />}
          />
        </div>
      </Card>

      <KitchenBoard sales={data?.kitchen.items ?? []} />

      <SessionModal session={selected} onClose={() => setSelected(null)} onChanged={reload} />

      <Modal open={openBox} onClose={() => setOpenBox(false)} title="Abrir caja" subtitle="Registra la base inicial y el terminal." footer={<><Button variant="secondary" onClick={() => setOpenBox(false)}>Cancelar</Button><Button loading={opening} onClick={submitOpen}>Abrir caja</Button></>}>
        <div className="space-y-4">
          <Field label="Terminal / caja" required>
            <Input value={terminal} onChange={(e) => setTerminal(e.target.value)} placeholder="Ej. Caja 1" />
          </Field>
          <Field label="Base inicial" hint="Efectivo con el que inicia la caja.">
            <Input type="number" min={0} value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  )
}

// ============================================================================ cocina

function KitchenBoard({ sales }: { sales: KitchenSale[] }) {
  const { can } = useAuth()
  const { toast } = useFeedback()
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const orders = sales
    .filter((s) => s.status !== 'anulada' && (s.kitchenStatus === 'pendiente' || s.kitchenStatus === 'preparando'))
    .sort((a, b) => a.date.localeCompare(b.date))

  async function mark(id: string, status: 'preparando' | 'listo') {
    setBusy(id)
    try {
      await saveRecord('sales', { id, kitchen_status: status })
      toast(status === 'listo' ? 'Pedido listo' : 'Pedido en preparación')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="mt-6" title="Pedidos en cocina" subtitle={orders.length ? `${orders.length} pendientes · se actualiza cada 30 segundos` : 'Pedidos de las cajas pendientes o en preparación'}>
      {orders.length === 0 ? (
        <EmptyState icon={ChefHat} title="Cocina al día" message="No hay pedidos pendientes ni en preparación." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map((o) => {
            const min = minutesSince(o.date, now)
            const tone = min >= 20 ? 'danger' : min >= 10 ? 'warning' : 'neutral'
            return (
              <div key={o.id} className="flex flex-col rounded-2xl border border-line bg-white p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-brand-700">{o.number}</p>
                    <p className="text-xs text-muted">{o.tableRef ? `Mesa / ref. ${o.tableRef}` : 'Sin mesa'}</p>
                  </div>
                  <Badge tone={tone}>
                    {min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`}
                  </Badge>
                </div>
                <KitchenLines id={o.id} />
                {o.notes && <p className="mt-2 rounded-xl bg-canvas px-3 py-2 text-xs text-ink-soft">{o.notes}</p>}
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                  <StatusBadge status={o.kitchenStatus} />
                  {can('sales', 'write') && (
                    <div className="flex gap-2">
                      {o.kitchenStatus === 'pendiente' && (
                        <Button size="sm" variant="secondary" icon={CookingPot} loading={busy === o.id} onClick={() => mark(o.id, 'preparando')}>
                          Preparando
                        </Button>
                      )}
                      <Button size="sm" variant="success" icon={ChefHat} loading={busy === o.id} onClick={() => mark(o.id, 'listo')}>
                        Listo
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function KitchenLines({ id }: { id: string }) {
  const { data } = useGql<{ sale: { lines: { id: string; name: string; qty: number }[] } | null }>('query($id:ID!){ sale(id:$id){ lines{ id name qty } } }', { id })
  if (!data) return <div className="mt-3 h-10" />
  return (
    <ul className="mt-3 space-y-1 text-sm">
      {data.sale?.lines.map((l) => (
        <li key={l.id} className="flex gap-2">
          <span className="w-8 shrink-0 font-bold text-ink">{qty(l.qty)}×</span>
          <span className="text-ink-soft">{l.name}</span>
        </li>
      ))}
    </ul>
  )
}

// ============================================================================ detalle de sesión

interface Detail {
  posSession: { byMethod: { method: string; amount: number; count: number }[] } | null
  sales: { total: number; amount: number; items: { id: string; number: string; date: string; status: string; paymentMode: string; total: number; paid: number; partner: { name: string } | null }[] }
}

const DETAIL_Q = `query($id:ID!){
  posSession(id:$id){ byMethod{ method amount count } }
  sales(posSessionId:$id, limit:200){ total amount items{ id number date status paymentMode total paid partner{ name } } }
}`

function SessionModal({ session, onClose, onChanged }: { session: Session | null; onClose: () => void; onChanged: () => void }) {
  const navigate = useNavigate()
  const { toast } = useFeedback()
  const { can } = useAuth()
  const { data, loading, error } = useGql<Detail>(DETAIL_Q, { id: session?.id ?? '' }, { skip: !session })
  const [counted, setCounted] = useState('')
  const [closing, setClosing] = useState(false)
  useEffect(() => { setCounted(''); setClosing(false) }, [session?.id])
  if (!session) return null
  const byMethod = data?.posSession?.byMethod ?? []
  const cash = byMethod.find((m) => m.method === 'efectivo')?.amount ?? 0
  const isOpen = session.status !== 'cerrada'
  const expected = isOpen ? toNum(session.openingCash) + toNum(cash) : toNum(session.expectedCash)
  const countedNum = counted.trim() === '' ? NaN : Number(counted)
  const diff = Number.isFinite(countedNum) ? countedNum - expected : NaN

  async function closeSession() {
    if (!session) return
    if (!Number.isFinite(countedNum) || countedNum < 0) return toast('Ingresa el efectivo contado.', 'error')
    setClosing(true)
    try {
      await saveRecord('pos_sessions', {
        id: session.id,
        status: 'cerrada',
        closed_at: nowLocal(),
        expected_cash: expected,
        counted_cash: countedNum,
        difference: countedNum - expected,
      })
      toast('Caja cerrada')
      onChanged()
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setClosing(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Sesión ${session.number}`}
      subtitle={`${session.terminal ?? 'Sin terminal'} · ${session.user?.name ?? '—'} · abierta ${dateTime(session.openedAt)}${session.closedAt ? ` · cerrada ${dateTime(session.closedAt)}` : ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cerrar ventana</Button>
          {isOpen && can('pos_sessions', 'write') && <Button variant="danger" loading={closing} onClick={closeSession}>Cerrar caja</Button>}
        </>
      }
    >
      <ErrorBox error={error} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <MiniStat label="Base" value={money(session.openingCash)} />
        <MiniStat label="Ventas" value={money(session.salesTotal)} hint={`${session.salesCount} ventas`} />
        <MiniStat label={isOpen ? 'Efectivo esperado' : 'Esperado'} value={money(expected)} hint={isOpen ? 'Base + cobros en efectivo' : undefined} />
        <MiniStat label="Contado" value={isOpen ? (Number.isFinite(countedNum) ? money(countedNum) : '—') : money(session.countedCash)} />
        <MiniStat label="Diferencia" value={isOpen ? (Number.isFinite(diff) ? money(diff) : '—') : money(session.difference)} tone={(isOpen ? !Number.isFinite(diff) || Math.abs(diff) < 0.5 : Math.abs(toNum(session.difference)) < 0.5) ? 'neutral' : (isOpen ? diff < 0 : toNum(session.difference) < 0) ? 'danger' : 'warning'} hint={isOpen ? (Number.isFinite(diff) ? (diff < 0 ? 'Faltante' : diff > 0 ? 'Sobrante' : 'Caja cuadrada') : 'Ingresa el conteo') : toNum(session.difference) < 0 ? 'Faltante' : toNum(session.difference) > 0 ? 'Sobrante' : 'Caja cuadrada'} />
      </div>

      {isOpen && can('pos_sessions', 'write') && (
        <div className="mt-4 rounded-2xl border border-line bg-canvas p-4">
          <Field label="Efectivo contado al cerrar" hint="Cuenta el efectivo físico en caja. La diferencia se calcula contra el esperado.">
            <Input type="number" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} placeholder={String(expected)} />
          </Field>
        </div>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <h3 className="mb-3 text-[15px] font-bold text-ink">Cobros por medio de pago</h3>
            {byMethod.length ? (
              <Donut height={170} data={byMethod.map((m, i) => ({ name: METHOD_LABEL[m.method] ?? m.method, value: m.amount, color: METHOD_COLOR[i % METHOD_COLOR.length] }))} />
            ) : (
              <p className="text-sm text-muted">Esta sesión no tiene cobros registrados.</p>
            )}
          </div>
          <div className="lg:col-span-3">
            <h3 className="mb-3 text-[15px] font-bold text-ink">Ventas de la sesión</h3>
            <div className="overflow-hidden rounded-2xl border border-line">
              <DataTable
                pageSize={8}
                rows={data?.sales.items ?? []}
                onRowClick={(r) => navigate(`/ventas/pedidos/${r.id}`)}
                footer={data && data.sales.total > data.sales.items.length ? `Mostrando ${data.sales.items.length} de ${data.sales.total}` : undefined}
                columns={[
                  { key: 'number', header: 'Documento', render: (r) => <span className="font-semibold text-brand-700">{r.number}</span> },
                  { key: 'date', header: 'Hora', hideSm: true, render: (r) => <span className="text-muted">{relative(r.date)}</span> },
                  { key: 'total', header: 'Total', align: 'right', render: (r) => <span className="font-semibold">{money(r.total)}</span> },
                  { key: 'state', header: 'Estado', render: (r) => <PaymentState sale={r} /> },
                ]}
                empty={<p className="px-5 py-8 text-center text-sm text-muted">Sin ventas en esta sesión.</p>}
              />
            </div>
            <p className="mt-3 text-xs text-muted">El efectivo esperado al cierre también descuenta los gastos de caja menor que calcula la caja.</p>
          </div>
        </div>
      )}
    </Modal>
  )
}
