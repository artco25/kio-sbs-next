import { Bell, Building2, Check, ChevronDown, ChevronsUpDown, LayoutGrid, LifeBuoy, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ROLE_LABEL, useAuth } from '../lib/auth'
import { getCurrentSuite, setCurrentSuite, suiteOf, SUITES, type SuiteKey } from '../lib/suites'
import { useGql } from '../lib/useGql'
import { allowedModules, MODULES } from '../modules'
import { Avatar, cn, ICON, IconTile, Spinner } from './ui'

/** Soporte ARTIX por WhatsApp. */
export const SUPPORT_URL =
  'https://api.whatsapp.com/send/?phone=573043032354&text=Hola%2C+soy+ARTIX+de+la+web.+Me+gustar%C3%ADa+contarles+sobre+un+proyecto.&type=phone_number&app_absent=0'

const COLLAPSE_KEY = 'kio_sbs_sidebar'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

/** Suite activa: guardada en localStorage. Se auto-corrige por ruta o si es inválida. */
function useSuite(): SuiteKey | null {
  const auth = useAuth()
  const location = useLocation()
  const [suite, setSuite] = useState<SuiteKey | null>(() => getCurrentSuite())
  const suiteRef = useRef(suite)
  suiteRef.current = suite
  const authRef = useRef(auth)
  authRef.current = auth

  useEffect(() => {
    const h = () => setSuite(getCurrentSuite())
    window.addEventListener('kio:suite', h)
    return () => window.removeEventListener('kio:suite', h)
  }, [])

  // Suite inválida para el usuario -> primera disponible.
  useEffect(() => {
    const valid = !!suite && auth.hasSuite(suite)
    if (!valid) {
      const first = SUITES.find((s) => auth.hasSuite(s.key))
      if (first) setCurrentSuite(first.key)
    }
  }, [suite, auth])

  // Ruta fuera de la suite activa -> cambiar suite según ruta (solo al navegar).
  useEffect(() => {
    const mod = MODULES.find((m) => location.pathname === m.path || location.pathname.startsWith(`${m.path}/`))
    if (!mod || mod.path === '/panel') return
    const cur = suiteRef.current
    const a = authRef.current
    const valid = !!cur && a.hasSuite(cur)
    if (valid && !mod.suites.includes(cur)) {
      const s = mod.suites.find((x) => a.hasSuite(x))
      if (s) setCurrentSuite(s)
    }
  }, [location.pathname])

  return suite && auth.hasSuite(suite) ? suite : null
}

function SuiteSwitcher({ suite, collapsed, onPick }: { suite: SuiteKey | null; collapsed: boolean; onPick: (s: SuiteKey) => void }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const cur = suiteOf(suite)
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={collapsed ? `Suite: ${cur?.label ?? ''}` : undefined}
        className={cn('flex w-full items-center gap-3 rounded-2xl border border-line bg-canvas/60 transition hover:border-brand-200 hover:bg-brand-50', collapsed ? 'justify-center p-2' : 'px-3 py-2.5')}
      >
        {cur && <IconTile icon={cur.icon} tone={cur.tone} size={34} />}
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[11px] font-semibold tracking-wider text-subtle uppercase">Suite</span>
              <span className="block truncate text-sm font-bold text-ink">{cur?.label ?? 'Elegir suite'}</span>
            </span>
            <ChevronsUpDown size={16} className="text-muted" />
          </>
        )}
      </button>
      {open && (
        <div className={cn('absolute z-50 w-64 rounded-2xl border border-line bg-white p-1.5 shadow-pop', collapsed ? 'top-0 left-full ml-3' : 'left-0 mt-2')}>
          {SUITES.filter((s) => auth.hasSuite(s.key)).map((s) => (
            <button
              key={s.key}
              onClick={() => {
                onPick(s.key)
                setOpen(false)
              }}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-brand-50"
            >
              <IconTile icon={s.icon} tone={s.tone} size={32} />
              <span className="flex-1 text-sm font-semibold text-ink">{s.label}</span>
              {s.key === suite && <Check size={16} className="text-brand-600" />}
            </button>
          ))}
          <div className="my-1 h-px bg-line" />
          <button
            onClick={() => {
              setOpen(false)
              navigate('/')
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink-soft hover:bg-brand-50"
          >
            <LayoutGrid {...ICON} className="text-muted" /> Ver todas las suites
          </button>
        </div>
      )}
    </div>
  )
}

function Sidebar({ collapsed, onToggle, onNavigate }: { collapsed: boolean; onToggle?: () => void; onNavigate?: () => void }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const suite = useSuite()
  const items = allowedModules(auth).filter((m) => suite && m.suites.includes(suite))

  const choose = (s: SuiteKey) => {
    setCurrentSuite(s)
    const first = allowedModules(auth).find((m) => m.suites.includes(s) && m.path !== '/panel')
    navigate(auth.isFinance || !first ? '/panel' : first.path)
    onNavigate?.()
  }

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex items-center gap-3 pt-5 pb-4', collapsed ? 'flex-col px-2' : 'px-5')}>
        <button onClick={() => navigate('/')} className="flex min-w-0 flex-1 items-center gap-3" title="Inicio de suites">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 shadow-[0_8px_18px_-8px_rgb(67_56_202/0.8)]">
            <img src="/artix_mark.svg" alt="" className="h-5 w-6 brightness-0 invert" />
          </span>
          {!collapsed && (
            <span className="min-w-0 text-left leading-tight">
              <span className="block font-display text-[17px] font-extrabold tracking-tight text-ink">KIO SBS</span>
              <span className="block truncate text-[11px] font-medium text-muted">{auth.me?.company.name}</span>
            </span>
          )}
        </button>
        {onToggle && (
          <button
            onClick={onToggle}
            className="rounded-lg p-1.5 text-muted transition hover:bg-brand-50 hover:text-brand-700"
            title={collapsed ? 'Expandir menú' : 'Contraer menú'}
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
          >
            {collapsed ? <PanelLeftOpen {...ICON} /> : <PanelLeftClose {...ICON} />}
          </button>
        )}
      </div>

      <div className={cn('pb-3', collapsed ? 'px-2' : 'px-4')}>
        <SuiteSwitcher suite={suite} collapsed={collapsed} onPick={choose} />
      </div>

      <nav className={cn('scrollbar-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-4', collapsed ? 'px-2' : 'px-3')}>
        {items.map((m) => (
          <NavLink
            key={m.path}
            to={m.path}
            onClick={onNavigate}
            title={collapsed ? m.label : undefined}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-xl py-2.5 text-[14px] font-medium transition',
                collapsed ? 'justify-center px-2' : 'px-3',
                isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-soft hover:bg-canvas hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                <m.icon {...ICON} className={cn('shrink-0', isActive ? 'text-brand-700' : 'text-muted group-hover:text-ink')} />
                {!collapsed && <span className="truncate">{m.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className={cn('border-t border-line py-4', collapsed ? 'px-2' : 'px-4')}>
        <a
          href={SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Contactar soporte por WhatsApp"
          className={cn('flex items-center gap-3 rounded-2xl transition hover:bg-brand-50', collapsed ? 'justify-center p-2.5' : 'border border-line px-3.5 py-3')}
        >
          <LifeBuoy size={18} strokeWidth={1.75} className="shrink-0 text-brand-600" />
          {!collapsed && (
            <span className="text-xs">
              <span className="block font-semibold text-ink">¿Necesitas ayuda?</span>
              <span className="text-brand-600">Contactar soporte</span>
            </span>
          )}
        </a>
      </div>
    </div>
  )
}

function QuickSearch() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const items = useMemo(() => {
    const t = q.trim().toLowerCase()
    return allowedModules(auth)
      .filter((m) => !t || m.label.toLowerCase().includes(t))
      .slice(0, 8)
  }, [q, auth])
  const go = (path: string, suites: SuiteKey[]) => {
    const s = suites.find((x) => auth.hasSuite(x))
    if (s && path !== '/panel') setCurrentSuite(s)
    navigate(path)
    setQ('')
  }
  return (
    <div className="relative hidden md:block">
      <Search size={16} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && items[0]) {
            go(items[0].path, items[0].suites)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        placeholder="Ir a un módulo…"
        className="input w-64 rounded-full bg-canvas pl-10"
      />
      {open && items.length > 0 && (
        <div className="absolute top-12 right-0 z-40 w-72 rounded-2xl border border-line bg-white p-1.5 shadow-pop">
          {items.map((m) => (
            <button key={m.path} onMouseDown={() => go(m.path, m.suites)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-brand-50">
              <m.icon {...ICON} className="text-brand-600" />
              <span className="flex-1">{m.label}</span>
              <span className="text-[11px] text-subtle">{suiteOf(m.suites.find((s) => auth.hasSuite(s)))?.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const PENDING = `{ expenses(status: "enviada", limit: 50) { id } }`
const PENDING_LEAVES = `{ leaveRequests(status: "solicitada") { id } }`

function Notifications() {
  const auth = useAuth()
  const navigate = useNavigate()
  const exp = useGql<{ expenses: { id: string }[] }>(PENDING, {}, { skip: !auth.isFinance || !auth.can('expenses') })
  const lv = useGql<{ leaveRequests: { id: string }[] }>(PENDING_LEAVES, {}, { skip: !auth.isFinance || !auth.can('leave_requests') })
  const nExp = exp.data?.expenses.length ?? 0
  const nLv = lv.data?.leaveRequests.length ?? 0
  const total = nExp + nLv
  const [open, setOpen] = useState(false)
  const go = (path: string, suite: SuiteKey) => {
    if (auth.hasSuite(suite)) setCurrentSuite(suite)
    navigate(path)
    setOpen(false)
  }
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-soft transition hover:bg-brand-50 hover:text-brand-700" aria-label="Notificaciones">
        <Bell {...ICON} />
        {total > 0 && <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">{total}</span>}
      </button>
      {open && (
        <div className="absolute top-12 right-0 z-40 w-72 rounded-2xl border border-line bg-white p-2 shadow-pop" onMouseLeave={() => setOpen(false)}>
          <p className="px-3 pt-1 pb-2 text-xs font-bold tracking-wider text-subtle uppercase">Pendientes de aprobar</p>
          {total === 0 && <p className="px-3 pb-3 text-sm text-muted">Todo al día.</p>}
          {nExp > 0 && (
            <button onClick={() => go('/finanzas/caja-menor', 'financiero')} className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-brand-50">
              <b>{nExp}</b> gastos de caja menor
            </button>
          )}
          {nLv > 0 && (
            <button onClick={() => go('/personal/ausencias', 'personal')} className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-brand-50">
              <b>{nLv}</b> solicitudes de vacaciones o permisos
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function UserMenu() {
  const { me, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  if (!me) return null
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-3 rounded-full py-1 pr-2 pl-1 transition hover:bg-brand-50">
        <Avatar name={me.user.name} size={38} />
        <div className="hidden text-left leading-tight sm:block">
          <p className="text-sm font-bold text-ink">{me.user.name}</p>
          <p className="text-xs text-muted">{me.roleName ?? ROLE_LABEL[me.user.role]}</p>
        </div>
        <ChevronDown size={16} className="text-muted" />
      </button>
      {open && (
        <div className="absolute top-14 right-0 z-40 w-64 rounded-2xl border border-line bg-white p-2 shadow-pop">
          <div className="px-3 py-2">
            <p className="text-sm font-bold">{me.company.name}</p>
            <p className="truncate text-xs text-muted">{me.user.email}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          <button
            onClick={() => {
              navigate('/')
              setOpen(false)
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-brand-50"
          >
            <LayoutGrid {...ICON} className="text-muted" /> Cambiar de suite
          </button>
          {isAdmin && (
            <button
              onClick={() => {
                setCurrentSuite('sistema')
                navigate('/sistema/empresa')
                setOpen(false)
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-brand-50"
            >
              <Building2 {...ICON} className="text-muted" /> Datos de la empresa
            </button>
          )}
          <button onClick={() => void logout()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-danger hover:bg-danger-soft">
            <LogOut {...ICON} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}

export function Layout() {
  const { me } = useAuth()
  const [drawer, setDrawer] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })
  const location = useLocation()
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [location.pathname])
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      } catch {
        /* sin almacenamiento */
      }
      return !c
    })

  return (
    <div className="h-screen bg-canvas lg:p-3">
      <div className="mx-auto flex h-full max-w-[1680px] overflow-hidden bg-white lg:rounded-[26px] lg:border lg:border-line lg:shadow-card">
        {/* Menú lateral: alto de la pantalla, scroll propio y plegable */}
        <aside className={cn('hidden h-full shrink-0 border-r border-line transition-[width] duration-200 lg:block', collapsed ? 'w-[84px]' : 'w-[264px]')}>
          <Sidebar collapsed={collapsed} onToggle={toggle} />
        </aside>

        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-brand-950/40" onClick={() => setDrawer(false)} />
            <div className="absolute inset-y-0 left-0 w-[280px] bg-white shadow-pop">
              <button className="absolute top-6 right-4 z-10 text-muted" onClick={() => setDrawer(false)} aria-label="Cerrar menú">
                <X {...ICON} />
              </button>
              <Sidebar collapsed={false} onNavigate={() => setDrawer(false)} />
            </div>
          </div>
        )}

        <main className="flex min-w-0 flex-1 flex-col bg-canvas/40">
          <header className="flex shrink-0 items-center gap-3 border-b border-line bg-white px-4 py-3.5 sm:px-8">
            <button className="rounded-xl p-2 text-ink-soft hover:bg-brand-50 lg:hidden" onClick={() => setDrawer(true)} aria-label="Abrir menú">
              <Menu {...ICON} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-bold text-ink">
                {greeting()}, {me?.user.name.split(' ')[0]}
              </p>
              <p className="hidden truncate text-[13px] text-muted sm:block">Esto es lo que está pasando hoy en {me?.company.name}.</p>
            </div>
            <QuickSearch />
            <Notifications />
            <div className="hidden h-8 w-px bg-line sm:block" />
            <UserMenu />
          </header>
          <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
            <Suspense
              fallback={
                <div className="flex justify-center py-24">
                  <Spinner />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
