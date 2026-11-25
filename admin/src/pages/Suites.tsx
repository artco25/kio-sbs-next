import { ArrowRight, Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn, IconTile } from '../components/ui'
import { ROLE_LABEL, useAuth } from '../lib/auth'
import { setCurrentSuite, SUITES } from '../lib/suites'
import { allowedModules } from '../modules'

/** Inicio: el usuario ingresa por suite (sólo las habilitadas para su rol). */
export default function Suites() {
  const auth = useAuth()
  const navigate = useNavigate()
  const modules = allowedModules(auth)

  const enter = (key: (typeof SUITES)[number]['key']) => {
    setCurrentSuite(key)
    const first = modules.find((m) => m.suites.includes(key) && m.path !== '/panel')
    navigate(auth.isFinance || !first ? '/panel' : first.path)
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[28px] font-extrabold tracking-tight text-ink">¿A qué suite quieres ingresar?</h1>
        <p className="mt-1 text-sm text-muted">
          {auth.me?.company.name} · {auth.me?.roleName ?? (auth.me ? ROLE_LABEL[auth.me.user.role] : '')} — elige la suite con la que vas a trabajar. Puedes cambiarla luego desde el menú.
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {SUITES.map((s) => {
          const allowed = auth.hasSuite(s.key)
          const mods = modules.filter((m) => m.suites.includes(s.key) && m.path !== '/panel')
          return (
            <button
              key={s.key}
              disabled={!allowed}
              onClick={() => enter(s.key)}
              className={cn(
                'card group flex flex-col p-6 text-left transition',
                allowed ? 'hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-pop' : 'cursor-not-allowed opacity-55',
              )}
            >
              <div className="flex items-start justify-between">
                <IconTile icon={s.icon} tone={s.tone} size={48} />
                {allowed ? (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition group-hover:bg-brand-600 group-hover:text-white">
                    <ArrowRight size={17} strokeWidth={2} />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-muted">
                    <Lock size={13} /> Sin acceso
                  </span>
                )}
              </div>
              <h2 className="mt-5 text-lg font-extrabold text-ink">{s.label}</h2>
              <p className="mt-1 text-sm text-muted">{s.description}</p>
              {allowed && mods.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {mods.slice(0, 5).map((m) => (
                    <span key={m.path} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-soft">
                      <m.icon size={13} strokeWidth={1.75} className="text-brand-600" />
                      {m.label}
                    </span>
                  ))}
                  {mods.length > 5 && <span className="rounded-full px-2 py-1 text-xs text-muted">+{mods.length - 5}</span>}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
