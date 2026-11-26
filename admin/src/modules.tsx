import {
  ArrowRightLeft,
  Banknote,
  Building2,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  Crown,
  Download,
  HandCoins,
  IdCard,
  LayoutDashboard,
  MapPin,
  MonitorSmartphone,
  Package,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tags,
  Truck,
  UserRound,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { useAuth } from './lib/auth'
import type { SuiteKey } from './lib/suites'

type Auth = ReturnType<typeof useAuth>

export interface Module {
  path: string
  label: string
  icon: LucideIcon
  /** Suites en las que aparece el módulo (el usuario debe tener acceso a alguna). */
  suites: SuiteKey[]
  page: LazyExoticComponent<ComponentType>
  visible: (a: Auth) => boolean
  /** Rutas hijas (ej. editor de pedido) que no aparecen en el menú. */
  children?: { path: string; page: LazyExoticComponent<ComponentType> }[]
}

const ALL: SuiteKey[] = ['comercial', 'pos', 'inventario', 'financiero', 'personal', 'sistema']

/** Módulos del admin de KIO SBS agrupados por suite. */
export const MODULES: Module[] = [
  { path: '/panel', label: 'Panel', icon: LayoutDashboard, suites: ALL, page: lazy(() => import('./pages/Dashboard')), visible: () => true },

  // Comercial
  {
    path: '/ventas/pedidos',
    label: 'Ventas y pedidos',
    icon: ShoppingBag,
    suites: ['comercial', 'pos'],
    page: lazy(() => import('./pages/ventas/Orders')),
    visible: (a) => a.can('sales'),
    children: [{ path: '/ventas/pedidos/:id', page: lazy(() => import('./pages/ventas/OrderEditor')) }],
  },
  { path: '/ventas/clientes', label: 'Clientes y proveedores', icon: UserRound, suites: ['comercial'], page: lazy(() => import('./pages/ventas/Partners')), visible: (a) => a.can('partners') },
  { path: '/ventas/cartera', label: 'Cartera', icon: HandCoins, suites: ['comercial', 'financiero'], page: lazy(() => import('./pages/ventas/Receivables')), visible: (a) => a.can('sales') },
  { path: '/inventario/productos', label: 'Productos', icon: Package, suites: ['comercial', 'inventario'], page: lazy(() => import('./pages/inventario/Products')), visible: (a) => a.can('products') },
  { path: '/inventario/categorias', label: 'Categorías', icon: Tags, suites: ['comercial', 'inventario'], page: lazy(() => import('./pages/inventario/Categories')), visible: (a) => a.can('categories') },
  { path: '/inventario/existencias', label: 'Existencias y movimientos', icon: ArrowRightLeft, suites: ['comercial', 'inventario'], page: lazy(() => import('./pages/inventario/Stock')), visible: (a) => a.can('stock_moves') },
  { path: '/inventario/requisiciones', label: 'Requisiciones', icon: Truck, suites: ['inventario'], page: lazy(() => import('./pages/inventario/Requisitions')), visible: (a) => a.can('requisitions') },

  // Punto de venta
  { path: '/ventas/cajas', label: 'Cajas y sesiones', icon: Store, suites: ['pos'], page: lazy(() => import('./pages/ventas/PosSessions')), visible: (a) => a.can('pos_sessions') },

  // Financiero
  { path: '/finanzas/recibos', label: 'Recibos de caja', icon: ReceiptText, suites: ['financiero', 'pos'], page: lazy(() => import('./pages/finanzas/Payments')), visible: (a) => a.can('payments') },
  { path: '/finanzas/caja-menor', label: 'Caja menor y gastos', icon: Wallet, suites: ['financiero', 'pos'], page: lazy(() => import('./pages/finanzas/Expenses')), visible: (a) => a.can('expenses') },
  { path: '/finanzas/informes', label: 'Informes', icon: ChartColumn, suites: ['financiero'], page: lazy(() => import('./pages/finanzas/Reports')), visible: (a) => a.isFinance },

  // Personal y nómina
  { path: '/personal/empleados', label: 'Empleados', icon: IdCard, suites: ['personal'], page: lazy(() => import('./pages/personal/Employees')), visible: (a) => a.can('employees') },
  { path: '/personal/novedades', label: 'Novedades', icon: ClipboardList, suites: ['personal'], page: lazy(() => import('./pages/personal/Novelties')), visible: (a) => a.can('payroll_novelties') },
  { path: '/personal/ausencias', label: 'Vacaciones y permisos', icon: CalendarDays, suites: ['personal'], page: lazy(() => import('./pages/personal/Leaves')), visible: (a) => a.can('leave_requests') },
  { path: '/personal/nomina', label: 'Nómina', icon: Banknote, suites: ['personal'], page: lazy(() => import('./pages/personal/Payroll')), visible: (a) => a.can('payslips') },

  // Sistema
  { path: '/sistema/plataforma', label: 'Plataforma', icon: Crown, suites: ['sistema'], page: lazy(() => import('./pages/sistema/Platform')), visible: (a) => a.isPlatform },
  { path: '/sistema/sedes', label: 'Sedes', icon: MapPin, suites: ['sistema'], page: lazy(() => import('./pages/sistema/Sites')), visible: (a) => a.isAdmin },
  { path: '/inventario/bodegas', label: 'Bodegas', icon: Warehouse, suites: ['inventario'], page: lazy(() => import('./pages/sistema/Warehouses')), visible: (a) => a.can('warehouses') },
  { path: '/inventario/cajas', label: 'Cajas y dispositivos', icon: MonitorSmartphone, suites: ['inventario'], page: lazy(() => import('./pages/sistema/Devices')), visible: (a) => a.can('devices') },
  { path: '/sistema/usuarios', label: 'Usuarios', icon: Users, suites: ['sistema'], page: lazy(() => import('./pages/sistema/Users')), visible: (a) => a.isAdmin },
  { path: '/sistema/roles', label: 'Roles y permisos', icon: ShieldCheck, suites: ['sistema'], page: lazy(() => import('./pages/sistema/Roles')), visible: (a) => a.isAdmin },
  { path: '/sistema/descargas', label: 'Descargar POS', icon: Download, suites: ['sistema'], page: lazy(() => import('./pages/sistema/Downloads')), visible: (a) => a.isAdmin },
  { path: '/sistema/empresa', label: 'Empresa', icon: Building2, suites: ['sistema'], page: lazy(() => import('./pages/sistema/Company')), visible: (a) => a.isAdmin },
]

/** Módulos que el usuario puede abrir (permiso + al menos una de sus suites). */
export const allowedModules = (a: Auth) => MODULES.filter((m) => m.visible(a) && m.suites.some((s) => a.hasSuite(s)))
