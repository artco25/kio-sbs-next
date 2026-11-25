import { useCallback, useEffect, useRef, useState } from 'react'
import { Input } from '../../components/ui'
import { gql, GqlError } from '../../lib/gql'

// ============================================================================ tipos (lecturas GraphQL, camelCase)

export interface EmployeeRow {
  id: string
  name: string | null
  docType: string | null
  docNumber: string | null
  email: string | null
  phone: string | null
  position: string | null
  department: string | null
  salary: number
  startDate: string | null
  endDate: string | null
  contractType: string | null
  payFrequency: string | null
  transportAid: boolean
  eps: string | null
  afp: string | null
  active: boolean
  /** Sólo si el API expone estos campos (ver `useEmployees().extended`). */
  arlRisk?: number | null
  integralSalary?: boolean | null
  bankName?: string | null
  bankAccount?: string | null
}

export const EMPLOYEE_BASE = 'id name docType docNumber email phone position department salary startDate endDate contractType payFrequency transportAid eps afp active'
export const EMPLOYEE_EXT = 'arlRisk integralSalary bankName bankAccount'

let extSupported: boolean | null = null

/**
 * Empleados (todos, o sólo activos/retirados). Intenta leer también arlRisk, integralSalary, bankName y bankAccount;
 * si el esquema aún no los expone cae a los campos básicos y `extended` queda en false.
 */
export function useEmployees(active?: boolean) {
  const [data, setData] = useState<EmployeeRow[] | null>(null)
  const [error, setError] = useState<GqlError | null>(null)
  const [loading, setLoading] = useState(true)
  const [extended, setExtended] = useState<boolean>(extSupported ?? false)
  const seq = useRef(0)

  const run = useCallback(async () => {
    const k = ++seq.current
    setLoading(true)
    const q = (fields: string) => `query($a:Boolean){ employees(active:$a){ ${fields} } }`
    const vars = { a: active ?? null }
    try {
      let list: EmployeeRow[]
      let ext = extSupported !== false
      try {
        list = (await gql<{ employees: EmployeeRow[] }>(q(ext ? `${EMPLOYEE_BASE} ${EMPLOYEE_EXT}` : EMPLOYEE_BASE), vars)).employees
        extSupported = ext
      } catch (e) {
        if (!ext || (e instanceof GqlError && e.offline)) throw e
        ext = false
        extSupported = false
        list = (await gql<{ employees: EmployeeRow[] }>(q(EMPLOYEE_BASE), vars)).employees
      }
      if (k === seq.current) {
        setData(list)
        setExtended(ext)
        setError(null)
      }
    } catch (e) {
      if (k === seq.current) setError(e instanceof GqlError ? e : new GqlError(String(e)))
    } finally {
      if (k === seq.current) setLoading(false)
    }
  }, [active])

  useEffect(() => {
    void run()
    const h = () => void run()
    window.addEventListener('kio:invalidate', h)
    return () => window.removeEventListener('kio:invalidate', h)
  }, [run])

  return { data, error, loading, extended, reload: run }
}

// ============================================================================ utilidades

/** camelCase → snake_case de las claves de un objeto (para pasar lecturas a computePayslip / RecordForm). */
export function snake(o: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) out[k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = typeof v === 'boolean' ? (v ? 1 : 0) : v
  return out
}

/** Selector de mes (YYYY-MM) con el estilo de los campos del kit. */
export function MonthInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return <Input type="month" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className={className ?? 'w-44 font-medium'} />
}

export const monthName = (ym: string) => {
  const d = new Date(`${ym}-01T12:00:00`)
  return Number.isNaN(d.getTime()) ? ym : d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
}

export const DOC_TYPES = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'PPT', label: 'Permiso por protección temporal' },
  { value: 'PP', label: 'Pasaporte' },
]

export const CONTRACT_LABEL: Record<string, string> = { indefinido: 'Término indefinido', fijo: 'Término fijo', obra: 'Obra o labor', aprendizaje: 'Aprendizaje' }

export const LEAVE_TYPES: Record<string, string> = { vacaciones: 'Vacaciones', permiso: 'Permiso', licencia: 'Licencia', incapacidad: 'Incapacidad', calamidad: 'Calamidad doméstica' }

/** 'YYYY-MM' → "noviembre de 2026"; 'YYYY-MM-Q1' → "1.ª quincena de noviembre de 2026". */
export function periodLabel(period: string | null | undefined) {
  if (!period) return '—'
  const base = monthName(period.slice(0, 7))
  if (period.endsWith('Q1')) return `1.ª quincena · ${base}`
  if (period.endsWith('Q2')) return `2.ª quincena · ${base}`
  return base
}
