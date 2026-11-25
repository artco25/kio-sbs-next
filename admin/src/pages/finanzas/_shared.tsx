import { Banknote, CreditCard, Landmark, Smartphone, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { CHART } from '../../components/charts'
import { gql, GqlError } from '../../lib/gql'
import { addDays, today } from '../../lib/records'

// ============================================================================ medios de pago

export const METHODS = ['efectivo', 'tarjeta', 'transferencia', 'nequi'] as const
export const METHOD_LABEL: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', nequi: 'Nequi / Daviplata' }
export const METHOD_ICON: Record<string, LucideIcon> = { efectivo: Banknote, tarjeta: CreditCard, transferencia: Landmark, nequi: Smartphone }
export const METHOD_OPTIONS = METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))

/** Tonos índigo para series categóricas (donuts). */
export const PALETTE = [CHART.brand, CHART.brand2, CHART.soft, '#3730A3', '#818CF8', '#C7D2FE', '#1E1B4B']

// ============================================================================ gastos

export const EXPENSE_CATEGORIES = [
  { value: 'transporte', label: 'Transporte y viáticos' },
  { value: 'papeleria', label: 'Papelería' },
  { value: 'aseo', label: 'Aseo y cafetería' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'servicios', label: 'Servicios públicos' },
  { value: 'compras', label: 'Compras menores' },
  { value: 'otros', label: 'Otros' },
]
export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label]))
export const categoryLabel = (c: unknown) => CATEGORY_LABEL[String(c ?? '')] ?? (c ? String(c) : 'Sin categoría')

// ============================================================================ fechas y periodos

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

/** 'YYYY-MM' -> 'Noviembre 2026'. */
export const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`

/** Mes actual y los n-1 anteriores, como opciones de selector. */
export function monthOptions(n = 12) {
  const base = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { value: ym, label: monthName(ym) }
  })
}

/** Primer y último día de un mes 'YYYY-MM'. */
export function monthBounds(ym: string) {
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(5, 7))
  const last = new Date(y, m, 0).getDate()
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` }
}

export const prevMonth = (ym: string) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export type RangeKey = 'hoy' | '7' | '30' | 'mes' | '90' | 'anio'
export const RANGES: { value: RangeKey; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: 'mes', label: 'Este mes' },
  { value: '90', label: 'Últimos 90 días' },
  { value: 'anio', label: 'Este año' },
]

export function rangeDates(r: RangeKey) {
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

/** Periodo inmediatamente anterior y de igual duración. */
export function previousRange(from: string, to: string) {
  const span = Math.max(1, Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86_400_000) + 1)
  return { from: addDays(from, -span), to: addDays(from, -1) }
}

/** Lista continua de días 'YYYY-MM-DD' entre dos fechas (máx. 400). */
export function daysBetween(from: string, to: string) {
  const out: string[] = []
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d)
  return out
}

/** Serie diaria continua (para sparklines) a partir de filas con fecha. */
export function dailySeries<T>(rows: T[], from: string, to: string, day: (r: T) => string, value: (r: T) => number) {
  const acc = new Map<string, number>()
  for (const r of rows) {
    const k = day(r).slice(0, 10)
    acc.set(k, (acc.get(k) ?? 0) + value(r))
  }
  return daysBetween(from, to).map((d) => acc.get(d) ?? 0)
}

// ============================================================================ datos paginados

/**
 * Carga todas las páginas de una consulta con `{ total items }` (sales, products, partners).
 * La consulta debe declarar `$limit:Int, $offset:Int` y usarlos. Se recarga con 'kio:invalidate'.
 */
export function usePaged<T>(query: string, variables: Record<string, unknown>, field: string, opts: { skip?: boolean; maxItems?: number } = {}) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(!opts.skip)
  const [error, setError] = useState<GqlError | null>(null)
  const [truncated, setTruncated] = useState(false)
  const key = JSON.stringify(variables)
  const seq = useRef(0)
  const max = opts.maxItems ?? 5000

  const run = useCallback(async () => {
    if (opts.skip) return
    const n = ++seq.current
    setLoading(true)
    try {
      const acc: T[] = []
      let total = 0
      do {
        const d = await gql<Record<string, { total: number; items: T[] }>>(query, { ...(JSON.parse(key) as Record<string, unknown>), limit: 500, offset: acc.length })
        const page = d[field]
        total = page.total
        if (!page.items.length) break
        acc.push(...page.items)
      } while (acc.length < total && acc.length < max)
      if (n === seq.current) {
        setItems(acc)
        setTruncated(acc.length < total)
        setError(null)
      }
    } catch (e) {
      if (n === seq.current) setError(e instanceof GqlError ? e : new GqlError(String(e)))
    } finally {
      if (n === seq.current) setLoading(false)
    }
  }, [query, key, field, max, opts.skip])

  useEffect(() => {
    void run()
    const h = () => void run()
    window.addEventListener('kio:invalidate', h)
    return () => window.removeEventListener('kio:invalidate', h)
  }, [run])

  return { items, loading, error, truncated, reload: run }
}

// ============================================================================ presentación

/** Rejilla de pares etiqueta / valor para modales de detalle (usar con DetailItem). */
export function DetailList({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">{children}</dl>
}

export function DetailItem({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-ink">{children || '—'}</dd>
    </div>
  )
}

/** Parsea un valor monetario digitado ("1500", "1500,50"). NaN si es inválido. */
export function parseAmount(v: string) {
  const s = v.trim()
  if (!s) return 0
  return Number(s.replace(',', '.'))
}
