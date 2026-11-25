import { CircleAlert, CircleCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { CHART } from '../../components/charts'
import { Badge, cn, ICON } from '../../components/ui'
import { money, toNum } from '../../lib/format'
import { addDays, today } from '../../lib/records'

// ============================================================================ periodos

export type PeriodKey = 'hoy' | '7' | '30' | 'mes' | '90' | 'anio'
export const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: 'mes', label: 'Este mes' },
  { value: '90', label: 'Últimos 90 días' },
  { value: 'anio', label: 'Este año' },
]

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T12:00:00`) - Date.parse(`${a.slice(0, 10)}T12:00:00`)) / 86_400_000)

export function periodDates(r: PeriodKey) {
  const to = today()
  switch (r) {
    case 'hoy':
      return { from: to, to }
    case 'mes':
      return { from: `${to.slice(0, 7)}-01`, to }
    case 'anio':
      return { from: `${to.slice(0, 4)}-01-01`, to }
    default:
      return { from: addDays(to, -(Number(r) - 1)), to }
  }
}

/** Periodo inmediatamente anterior de la misma duración. */
export function previousDates(p: { from: string; to: string }) {
  const len = daysBetween(p.from, p.to) + 1
  const to = addDays(p.from, -1)
  return { from: addDays(to, -(len - 1)), to }
}

/** Suma por día entre `from` y `to` (para sparklines); si son muchos días se agrupa. */
export function dailySeries(items: { date?: string | null; value: number }[], from: string, to: string): number[] {
  const n = Math.min(400, Math.max(1, daysBetween(from, to) + 1))
  const days = new Array<number>(n).fill(0)
  for (const it of items) {
    if (!it.date) continue
    const i = daysBetween(from, it.date)
    if (i >= 0 && i < n) days[i] += it.value
  }
  if (n <= 45) return days
  const step = Math.ceil(n / 45)
  const out: number[] = []
  for (let i = 0; i < n; i += step) out.push(days.slice(i, i + step).reduce((s, v) => s + v, 0))
  return out
}

// ============================================================================ medios de pago

export const METHOD_LABEL: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta débito/crédito', transferencia: 'Transferencia', nequi: 'Nequi / Daviplata' }
export const METHOD_OPTIONS = Object.entries(METHOD_LABEL).map(([value, label]) => ({ value, label }))
export const METHOD_COLOR = [CHART.brand, CHART.brand2, CHART.soft, '#C7D2FE', '#1E1B4B']

// ============================================================================ presentación

export function ChannelBadge({ channel }: { channel?: string | null }) {
  if (channel === 'pos') return <Badge tone="brand">Caja POS</Badge>
  if (channel === 'pedido') return <Badge tone="info">Pedido</Badge>
  return <Badge>{channel ? channel[0].toUpperCase() + channel.slice(1) : '—'}</Badge>
}

/** Días de mora de una fecha de vencimiento (>0 vencida, ≤0 al día). */
export function daysLate(due?: string | null) {
  if (!due) return 0
  return daysBetween(due, today())
}

export function MiniStat({ label, value, tone = 'neutral', hint }: { label: string; value: ReactNode; tone?: 'neutral' | 'danger' | 'success' | 'warning'; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-canvas px-4 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn('mt-0.5 font-display text-base font-extrabold tabular-nums', tone === 'danger' && 'text-danger', tone === 'success' && 'text-success', tone === 'warning' && 'text-warning', tone === 'neutral' && 'text-ink')}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}

// ============================================================================ crédito (igual que checkCredit de Flutter)

export interface CreditPartner {
  id: string
  name: string | null
  docNumber?: string | null
  creditLimit: number
  paymentTermDays: number
  blocked: boolean
  balance: number
  overdue: number
  availableCredit: number | null
}

export const CREDIT_FIELDS = 'id name docNumber creditLimit paymentTermDays blocked balance overdue availableCredit'

/** Mensaje de bloqueo para vender a crédito, o null si se puede. */
export function creditProblem(p: CreditPartner | null | undefined, amount: number): string | null {
  if (!p) return 'Selecciona el cliente para vender a crédito'
  const name = p.name ?? 'El cliente'
  if (p.blocked) return `${name} está bloqueado en cartera`
  if (toNum(p.overdue) > 0) return `${name} tiene cartera vencida por ${money(p.overdue)}`
  const limit = toNum(p.creditLimit)
  if (limit > 0 && toNum(p.balance) + amount > limit) return `Supera el cupo de crédito: disponible ${money(limit - toNum(p.balance))}`
  return null
}

/** Tarjeta con saldo, vencido y cupo disponible del cliente. */
export function CreditCard({ partner, amount, credit }: { partner: CreditPartner; amount: number; credit: boolean }) {
  const limit = toNum(partner.creditLimit)
  const problem = credit ? creditProblem(partner, amount) : null
  const available = limit > 0 ? limit - toNum(partner.balance) : null
  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Saldo" value={money(partner.balance)} />
        <MiniStat label="Vencido" value={money(partner.overdue)} tone={toNum(partner.overdue) > 0 ? 'danger' : 'neutral'} />
        <MiniStat label="Cupo disponible" value={available == null ? 'Sin límite' : money(available)} tone={available != null && available <= 0 ? 'danger' : 'neutral'} hint={limit > 0 ? `de ${money(limit)}` : undefined} />
      </div>
      <div className="flex flex-wrap gap-2">
        {partner.blocked && (
          <Badge tone="danger" dot>
            Bloqueado en cartera
          </Badge>
        )}
        {toNum(partner.overdue) > 0 && (
          <Badge tone="danger" dot>
            Cartera vencida
          </Badge>
        )}
        {!partner.blocked && toNum(partner.overdue) <= 0 && (
          <Badge tone="success" dot>
            Al día
          </Badge>
        )}
        <Badge tone="neutral">Plazo {toNum(partner.paymentTermDays) > 0 ? toNum(partner.paymentTermDays) : 30} días</Badge>
      </div>
      {credit &&
        (problem ? (
          <div className="flex items-start gap-2.5 rounded-2xl border border-danger/20 bg-danger-soft px-3.5 py-3 text-sm text-danger">
            <CircleAlert {...ICON} className="mt-0.5 shrink-0" />
            <span>{problem}. No se puede confirmar a crédito.</span>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-2xl bg-success-soft px-3.5 py-3 text-sm text-success">
            <CircleCheck {...ICON} className="mt-0.5 shrink-0" />
            <span>Crédito disponible para este pedido.</span>
          </div>
        ))}
    </div>
  )
}
