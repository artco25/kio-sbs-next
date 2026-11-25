/**
 * Liquidación simplificada de nómina colombiana (port de apps/flutter/lib/services/payroll.dart).
 * Las filas de entrada y de salida usan snake_case, igual que las tablas de schema/tables.json.
 */
import type { Row } from '../../lib/records'

export interface NoveltyType {
  key: string
  label: string
  /** 'horas' | 'días' | 'valor' */
  unit: 'horas' | 'días' | 'valor'
  /** 'devengo' | 'dias' | 'deduccion' */
  kind: 'devengo' | 'dias' | 'deduccion'
  /** Factor sobre el valor hora (horas extra y recargos). */
  factor?: number
  /** 1 = se suma el recargo dominical parametrizado. */
  base: number
  salarial: boolean
}

const nt = (key: string, label: string, o: Partial<Omit<NoveltyType, 'key' | 'label'>> = {}): NoveltyType => ({
  key,
  label,
  unit: 'horas',
  kind: 'devengo',
  base: 0,
  salarial: true,
  ...o,
})

/** Tipos de novedad. Recargos según Ley 2466 de 2025 (dominical/festivo parametrizable en payroll_params). */
export const kNoveltyTypes: NoveltyType[] = [
  nt('HED', 'Hora extra diurna', { factor: 1.25 }),
  nt('HEN', 'Hora extra nocturna', { factor: 1.75 }),
  nt('RN', 'Recargo nocturno', { factor: 0.35 }),
  nt('RDF', 'Recargo dominical/festivo', { factor: 0, base: 1 }),
  nt('HEDDF', 'Hora extra diurna dominical/festiva', { factor: 1.25, base: 1 }),
  nt('HENDF', 'Hora extra nocturna dominical/festiva', { factor: 1.75, base: 1 }),
  nt('bonificacion', 'Bonificación salarial', { unit: 'valor' }),
  nt('comision', 'Comisión', { unit: 'valor' }),
  nt('no_salarial', 'Pago no salarial', { unit: 'valor', salarial: false }),
  nt('ausencia', 'Ausencia no remunerada', { unit: 'días', kind: 'dias' }),
  nt('licencia_nr', 'Licencia no remunerada', { unit: 'días', kind: 'dias' }),
  nt('prestamo', 'Descuento préstamo', { unit: 'valor', kind: 'deduccion' }),
  nt('deduccion', 'Otra deducción', { unit: 'valor', kind: 'deduccion' }),
]

export const noveltyType = (k: unknown) => kNoveltyTypes.find((t) => t.key === k)

/** Tarifa ARL por clase de riesgo (Decreto 1772 de 1994). */
export const kArlRates: Record<number, number> = { 1: 0.00522, 2: 0.01044, 3: 0.02436, 4: 0.0435, 5: 0.0696 }

// ---------------------------------------------------------------------------------- utilidades

const n = (v: unknown) => {
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}
const asBool = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true'
const asStr = (v: unknown) => (v == null ? '' : String(v))
/** Equivale a `double.roundToDouble()` de Dart (mitad se aleja de cero). */
const round = (v: number) => (v < 0 ? -Math.round(-v) : Math.round(v))
const pad = (x: number) => String(x).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const dayNumber = (s: string) => Math.floor(new Date(`${s.slice(0, 10)}T12:00:00Z`).getTime() / 86_400_000)

/** Periodos: 'YYYY-MM' (mensual) o 'YYYY-MM-Q1' / 'YYYY-MM-Q2' (quincenal). */
export function periodRange(period: string): { from: string; to: string; days: number } {
  const y = Number(period.slice(0, 4))
  const m = Number(period.slice(5, 7))
  const last = new Date(y, m, 0).getDate()
  if (period.endsWith('Q1')) return { from: ymd(y, m, 1), to: ymd(y, m, 15), days: 15 }
  if (period.endsWith('Q2')) return { from: ymd(y, m, 16), to: ymd(y, m, last), days: 15 }
  return { from: ymd(y, m, 1), to: ymd(y, m, last), days: 30 }
}

export interface DetailItem {
  id?: string
  concepto: string
  cantidad?: number
  valor: number
  tipo: 'dias' | 'deduccion' | 'devengo'
}

/**
 * Devuelve la fila de `payslips` (sin id, number ni status).
 * - `employee`: fila de employees (snake_case).
 * - `params`: fila de payroll_params (snake_case; los porcentajes como fracción, ej. 0.04).
 * - `novelties`: filas de payroll_novelties del rango del periodo (snake_case).
 */
export function computePayslip({ employee, params, period, novelties }: { employee: Row; params: Row; period: string; novelties: Row[] }): Row {
  const range = periodRange(period)
  const salary = n(employee.salary)
  const smmlv = n(params.smmlv)
  const integral = asBool(employee.integral_salary)
  const hourly = salary / Math.max(1, n(params.hours_divisor))
  const sunday = n(params.sunday_surcharge)

  // Días laborados: periodo comercial (30/15) menos ingreso/retiro dentro del periodo y ausencias no remuneradas.
  let days = range.days
  const start = asStr(employee.start_date)
  const end = asStr(employee.end_date)
  if (start && start > range.from) days -= dayNumber(start) - dayNumber(range.from)
  if (end && end < range.to) days -= dayNumber(range.to) - dayNumber(end)

  const detail: DetailItem[] = []
  let overtime = 0
  let salarial = 0
  let noSalarial = 0
  let deductions = 0
  for (const nov of novelties) {
    const t = noveltyType(nov.type)
    if (!t) continue
    const q = n(nov.quantity)
    const amount = n(nov.amount)
    const id = nov.id ? { id: String(nov.id) } : {}
    if (t.kind === 'dias') {
      days -= q
      detail.push({ ...id, concepto: t.label, cantidad: q, valor: -((salary / 30) * q), tipo: 'dias' })
    } else if (t.kind === 'deduccion') {
      deductions += amount
      detail.push({ ...id, concepto: t.label, valor: amount, tipo: 'deduccion' })
    } else if (t.unit === 'horas') {
      const v = q * hourly * ((t.factor ?? 0) + t.base * sunday)
      overtime += v
      detail.push({ ...id, concepto: t.label, cantidad: q, valor: v, tipo: 'devengo' })
    } else if (t.salarial) {
      salarial += amount
      detail.push({ ...id, concepto: t.label, valor: amount, tipo: 'devengo' })
    } else {
      noSalarial += amount
      detail.push({ ...id, concepto: t.label, valor: amount, tipo: 'devengo' })
    }
  }
  days = Math.min(Math.max(days, 0), range.days)

  const basic = (salary / 30) * days
  // Auxilio de transporte: hasta 2 SMMLV y no aplica a salario integral.
  const transport = !integral && asBool(employee.transport_aid) && salary <= 2 * smmlv ? (n(params.transport_aid) / 30) * days : 0

  // IBC: devengos salariales (70 % si es integral), mínimo proporcional a 1 SMMLV.
  let ibc = (basic + overtime + salarial) * (integral ? 0.7 : 1)
  ibc = Math.max(ibc, (smmlv / 30) * days)
  const health = ibc * n(params.health_pct)
  const pension = ibc * n(params.pension_pct)
  // Fondo de solidaridad pensional sobre IBC mensualizado.
  const monthlyIbc = days === 0 ? 0 : (ibc * 30) / days
  const ratio = smmlv === 0 ? 0 : monthlyIbc / smmlv
  const fspPct = ratio < 4 ? 0 : ratio < 16 ? 0.01 : ratio < 17 ? 0.012 : ratio < 18 ? 0.014 : ratio < 19 ? 0.016 : ratio < 20 ? 0.018 : 0.02
  const solidarity = ibc * fspPct

  const totalEarnings = basic + transport + overtime + salarial + noSalarial
  const totalDeductions = health + pension + solidarity + deductions

  // Costo empleador estimado: pensión 12 %, ARL, caja 4 % y provisiones de prestaciones.
  // Se asume exoneración de salud empleador, SENA e ICBF (art. 114-1 E.T.) para salarios < 10 SMMLV.
  const arl = ibc * (kArlRates[Math.trunc(n(employee.arl_risk))] ?? kArlRates[1])
  const exonerated = salary < 10 * smmlv
  const employerSS = ibc * 0.12 + arl + ibc * 0.04 + (exonerated ? 0 : ibc * 0.085 + ibc * 0.05)
  const prestBase = basic + overtime + salarial + transport
  const provisions = integral ? basic * 0.0417 : prestBase * 0.0833 * 2 + prestBase * 0.0833 * 0.12 + basic * 0.0417
  const employerCost = totalEarnings + employerSS + provisions

  return {
    employee_id: employee.id,
    period,
    date_from: range.from,
    date_to: range.to,
    days,
    basic: round(basic),
    transport: round(transport),
    overtime: round(overtime),
    other_earnings: round(salarial + noSalarial),
    total_earnings: round(totalEarnings),
    health: round(health),
    pension: round(pension),
    solidarity: round(solidarity),
    other_deductions: round(deductions),
    total_deductions: round(totalDeductions),
    net: round(totalEarnings - totalDeductions),
    employer_cost: round(employerCost),
    detail: JSON.stringify({
      novedades: detail,
      ibc: round(ibc),
      valor_hora: round(hourly),
      empleador: {
        pension_12: round(ibc * 0.12),
        arl: round(arl),
        caja_4: round(ibc * 0.04),
        provisiones: round(provisions),
        exonerado_114_1: exonerated,
      },
    }),
  }
}

/** Interpreta el campo `detail` de un desprendible (el API lo devuelve como objeto; la BD como texto). */
export interface PayslipDetail {
  novedades?: DetailItem[]
  ibc?: number
  valor_hora?: number
  empleador?: { pension_12?: number; arl?: number; caja_4?: number; provisiones?: number; exonerado_114_1?: boolean }
}
export function parseDetail(d: unknown): PayslipDetail {
  if (!d) return {}
  if (typeof d === 'string') {
    try {
      return JSON.parse(d) as PayslipDetail
    } catch {
      return {}
    }
  }
  return d as PayslipDetail
}
