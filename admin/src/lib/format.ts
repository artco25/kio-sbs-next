const num = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })
const int = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

export const toNum = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** "$ 26.878" (formato KIO: símbolo adelante, sin decimales). */
export function money(v: unknown) {
  const n = Math.round(toNum(v))
  return `${n < 0 ? '−' : ''}$ ${int.format(Math.abs(n))}`
}

/** "$ 1,2 M" / "$ 350 mil" para ejes de gráficos y tarjetas compactas. */
export function moneyShort(v: unknown) {
  const n = toNum(v)
  if (Math.abs(n) >= 1e6) return `$ ${(n / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`
  if (Math.abs(n) >= 1e3) return `$ ${Math.round(n / 1e3)} mil`
  return money(n)
}

export const qty = (v: unknown) => num.format(toNum(v))
export const pct = (v: unknown, digits = 0) => `${(toNum(v) * 100).toLocaleString('es-CO', { maximumFractionDigits: digits })} %`

export function delta(current: number, previous: number): number | null {
  if (!previous) return null
  return (current - previous) / Math.abs(previous)
}

const parse = (v: unknown) => {
  if (!v) return null
  const s = String(v)
  const d = new Date(s.length === 10 ? `${s}T12:00:00` : s)
  return Number.isNaN(d.getTime()) ? null : d
}

export function date(v: unknown) {
  const d = parse(v)
  return d ? d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

export function dateTime(v: unknown) {
  const d = parse(v)
  if (!d) return '—'
  return d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

/** "Hoy, 10:24 a. m." / "Ayer, 6:33 p. m." / fecha corta. */
export function relative(v: unknown) {
  const d = parse(v)
  if (!d) return '—'
  const now = new Date()
  const time = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000)
  if (days === 0) return `Hoy, ${time}`
  if (days === 1) return `Ayer, ${time}`
  return dateTime(d.toISOString())
}

export const monthLabel = (ym: string) => {
  const d = parse(`${ym}-01`)
  return d ? d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '') : ym
}

export const initials = (name: unknown) =>
  String(name ?? '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?'
