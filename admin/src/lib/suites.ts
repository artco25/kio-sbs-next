import { IdCard, Landmark, Settings, ShoppingBag, Store, type LucideIcon } from 'lucide-react'
import type { Tone } from '../components/ui'

export type SuiteKey = 'comercial' | 'pos' | 'financiero' | 'personal' | 'sistema'

/** Suites de KIO SBS: el usuario entra a una suite y ve sólo sus módulos. */
export const SUITES: { key: SuiteKey; label: string; description: string; icon: LucideIcon; tone: Tone }[] = [
  { key: 'comercial', label: 'Comercial', description: 'Ventas, clientes, cartera, productos e inventario', icon: ShoppingBag, tone: 'brand' },
  { key: 'pos', label: 'Punto de venta', description: 'Cajas, sesiones, arqueos y pedidos de cocina', icon: Store, tone: 'warning' },
  { key: 'financiero', label: 'Financiero', description: 'Recibos de caja, caja menor, cartera e informes', icon: Landmark, tone: 'info' },
  { key: 'personal', label: 'Personal y nómina', description: 'Empleados, novedades, vacaciones y liquidación', icon: IdCard, tone: 'success' },
  { key: 'sistema', label: 'Sistema', description: 'Usuarios, roles y permisos, equipos y empresa', icon: Settings, tone: 'neutral' },
]

export const suiteOf = (k: string | null | undefined) => SUITES.find((s) => s.key === k)

const KEY = 'kio_sbs_suite'
export function getCurrentSuite(): SuiteKey | null {
  try {
    return (localStorage.getItem(KEY) as SuiteKey | null) ?? null
  } catch {
    return null
  }
}
export function setCurrentSuite(s: SuiteKey) {
  try {
    localStorage.setItem(KEY, s)
  } catch {
    /* sin almacenamiento */
  }
  window.dispatchEvent(new Event('kio:suite'))
}
