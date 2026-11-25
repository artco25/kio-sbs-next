import type { LucideIcon } from 'lucide-react'
import { useId } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { money, moneyShort } from '../lib/format'
import { cn, Delta, IconTile, type Tone } from './ui'

export const CHART = {
  brand: '#4338CA',
  brand2: '#6366F1',
  soft: '#A5B4FC',
  softer: '#E0E7FF',
  danger: '#DC2626',
  success: '#16A34A',
  grid: '#ECEEFB',
  axis: '#A3A6C2',
}

const tooltipStyle = {
  contentStyle: { borderRadius: 14, border: '1px solid #ECEEFB', boxShadow: '0 12px 30px -12px rgb(30 27 75 / .25)', fontSize: 12 },
  labelStyle: { color: '#1E1B4B', fontWeight: 700 },
}

/** Línea mínima de tendencia para tarjetas KPI. */
export function Sparkline({ data, color = CHART.brand2, height = 44 }: { data: number[]; color?: string; height?: number }) {
  const id = useId().replace(/:/g, '')
  const points = data.map((v, i) => ({ i, v }))
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#sp${id})`} isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function KpiCard({ icon, label, value, delta, series, tone = 'brand', hint, inverse }: { icon: LucideIcon; label: string; value: string; delta?: number | null; series?: number[]; tone?: Tone; hint?: string; inverse?: boolean }) {
  const down = delta != null && (inverse ? delta > 0 : delta < 0)
  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-start gap-3">
        <IconTile icon={icon} tone={tone} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-muted">{label}</p>
          <p className="mt-0.5 truncate font-display text-[22px] font-extrabold tracking-tight text-ink">{value}</p>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0 text-xs text-muted">
          {delta != null ? (
            <span className="flex flex-col gap-0.5 whitespace-nowrap">
              <Delta value={delta} inverse={inverse} />
              <span>vs periodo anterior</span>
            </span>
          ) : (
            hint
          )}
        </div>
        {series && series.length > 1 && (
          <div className="w-28 shrink-0">
            <Sparkline data={series} color={down ? CHART.danger : CHART.brand2} />
          </div>
        )}
      </div>
    </div>
  )
}

export function AreaTrend({ data, xKey, series, height = 280, format = moneyShort }: { data: Record<string, unknown>[]; xKey: string; series: { key: string; label: string; color: string }[]; height?: number; format?: (v: unknown) => string }) {
  const id = useId().replace(/:/g, '')
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`a${id}${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: CHART.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => format(v)} tick={{ fill: CHART.axis, fontSize: 12 }} axisLine={false} tickLine={false} width={72} />
          <Tooltip {...tooltipStyle} formatter={(v, n) => [money(v), series.find((s) => s.key === n)?.label ?? String(n)]} />
          {series.map((s) => (
            <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2.25} fill={`url(#a${id}${s.key})`} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Bars({ data, xKey, series, height = 260, format = moneyShort, horizontal }: { data: Record<string, unknown>[]; xKey: string; series: { key: string; label: string; color: string }[]; height?: number; format?: (v: unknown) => string; horizontal?: boolean }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={4}>
          <CartesianGrid stroke={CHART.grid} vertical={!!horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" tickFormatter={(v) => format(v)} tick={{ fill: CHART.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey={xKey} tick={{ fill: '#3B3A63', fontSize: 12 }} axisLine={false} tickLine={false} width={130} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={{ fill: CHART.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => format(v)} tick={{ fill: CHART.axis, fontSize: 12 }} axisLine={false} tickLine={false} width={72} />
            </>
          )}
          <Tooltip {...tooltipStyle} cursor={{ fill: '#EEF0FF' }} formatter={(v, n) => [format === moneyShort ? money(v) : format(v), series.find((s) => s.key === n)?.label ?? String(n)]} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} fill={s.color} radius={horizontal ? [0, 8, 8, 0] : [8, 8, 0, 0]} maxBarSize={28} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Donut({ data, height = 220 }: { data: { name: string; value: number; color: string }[]; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div style={{ height, width: height }} className="relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="none">
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} formatter={(v) => money(v)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted">Total</span>
          <span className="font-display text-lg font-extrabold">{moneyShort(total)}</span>
        </div>
      </div>
      <ul className="min-w-40 flex-1 space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
            <span className="flex-1 text-ink-soft">{d.name}</span>
            <span className="font-semibold">{money(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RadarCompare({ data, height = 280 }: { data: { metric: string; actual: number; anterior: number }[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="68%" margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="#DFE2F5" />
          <PolarAngleAxis dataKey="metric" tick={{ fill: '#3B3A63', fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar name="Periodo anterior" dataKey="anterior" stroke={CHART.soft} fill={CHART.soft} fillOpacity={0.25} />
          <Radar name="Este periodo" dataKey="actual" stroke={CHART.brand} fill={CHART.brand2} fillOpacity={0.3} dot={{ r: 3, fill: CHART.brand }} />
          <Tooltip {...tooltipStyle} formatter={(v) => `${Math.round(Number(v))}`} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const HEAT = ['#F3F4FF', '#E0E7FF', '#C7D2FE', '#A5B4FC', '#818CF8', '#6366F1', '#4338CA']

/** Mapa de calor de ventas: días × franjas de 2 horas (6 a. m. – 10 p. m.). */
export function Heatmap({ cells }: { cells: { weekday: number; hour: number; amount: number; count: number }[] }) {
  const hours = [6, 8, 10, 12, 14, 16, 18, 20]
  const max = Math.max(0, ...cells.map((c) => c.amount))
  const order = [1, 2, 3, 4, 5, 6, 0]
  const get = (d: number, h: number) => cells.find((c) => c.weekday === d && c.hour === h)
  const label = (h: number) => (h === 12 ? '12 m.' : h < 12 ? `${h} a. m.` : `${h - 12} p. m.`)
  return (
    <div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `64px repeat(${order.length}, minmax(0, 1fr))` }}>
        <span />
        {order.map((d) => (
          <span key={d} className="text-center text-xs font-semibold text-muted">
            {DAYS[d]}
          </span>
        ))}
        {hours.map((h) => (
          <div key={h} className="contents">
            <span className="flex items-center text-[11px] text-subtle">{label(h)}</span>
            {order.map((d) => {
              const c = get(d, h)
              const lvl = !c || max === 0 ? 0 : Math.min(HEAT.length - 1, 1 + Math.floor((c.amount / max) * (HEAT.length - 2)))
              return <span key={d} title={c ? `${DAYS[d]} ${label(h)}: ${money(c.amount)} · ${c.count} ventas` : `${DAYS[d]} ${label(h)}: sin ventas`} className="h-7 rounded-md transition hover:ring-2 hover:ring-brand-300" style={{ background: HEAT[lvl] }} />
            })}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-muted">
        Menos
        {HEAT.slice(1).map((c) => (
          <span key={c} className="h-3 w-3 rounded" style={{ background: c }} />
        ))}
        Más
      </div>
    </div>
  )
}

/** Barra horizontal de ranking (top productos, edades de cartera). */
export function RankRow({ label, value, max, right, color = 'bg-brand-600' }: { label: string; value: number; max: number; right?: string; color?: string }) {
  return (
    <div className="py-2">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span className="truncate font-medium text-ink">{label}</span>
        <span className="shrink-0 font-semibold text-ink">{right ?? money(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-brand-50">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} />
      </div>
    </div>
  )
}
