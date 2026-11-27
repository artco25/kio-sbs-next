import { ArrowRight, Building2, CircleAlert, Eye, EyeOff, IdCard, Landmark, Lock, Mail, MapPin, ShoppingBag, Store, TrendingUp, UserRound, Warehouse } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../components/ui'
import { ME_FIELDS, useAuth, type Me } from '../lib/auth'
import { gql } from '../lib/gql'

const AXES = [
  { icon: ShoppingBag, label: 'Comercial', text: 'Clientes, pedidos, cartera' },
  { icon: Store, label: 'Punto de venta', text: 'Cajas offline y cocina' },
  { icon: Landmark, label: 'Financiero', text: 'Recibos, gastos, informes' },
  { icon: IdCard, label: 'Personal y nómina', text: 'Empleados y liquidación' },
]

export default function Login() {
  const { login, setSession } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [signupEnabled, setSignupEnabled] = useState(false)
  const [company, setCompany] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessType, setBusinessType] = useState('retail')
  const [city, setCity] = useState('')
  const [hasCedi, setHasCedi] = useState(false)
  const [storeCount, setStoreCount] = useState('1')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    gql<{ signupEnabled: boolean }>('{ signupEnabled }')
      .then((d) => setSignupEnabled(d.signupEnabled))
      .catch(() => setSignupEnabled(false))
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const d = await gql<{ signup: { token: string; me: Me } }>(
          `mutation($i:SignupInput!){ signup(input:$i){ token me { ${ME_FIELDS} } } }`,
          { i: { companyName: company.trim(), name: name.trim(), email: email.trim(), password, businessType, city: city.trim() || null, hasCedi, storeCount: Math.max(1, Number(storeCount || 1)) } },
        )
        setSession(d.signup.token, d.signup.me)
      } else await login(email.trim(), password)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-full bg-white lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800">
            <img src="/artix_mark.svg" alt="" className="h-5 w-6 brightness-0 invert" />
          </span>
          <span className="font-display text-lg font-extrabold text-ink">KIO SBS</span>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">{mode === 'login' ? 'Bienvenido de nuevo' : 'Crea tu empresa'}</h1>
          <p className="mt-2 text-sm text-muted">{mode === 'login' ? 'Ingresa a la administración de tu negocio.' : 'Regístrate gratis y empieza a vender en minutos. Serás el administrador.'}</p>

          <form onSubmit={submit} className="mt-9 space-y-4">
            {mode === 'signup' && (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">Nombre de tu empresa</span>
                  <div className="relative">
                    <Building2 size={17} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle" />
                    <input className="input h-12 pl-11" required value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Panadería La Espiga" />
                  </div>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">Tu nombre</span>
                  <div className="relative">
                    <UserRound size={17} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle" />
                    <input className="input h-12 pl-11" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Laura Martínez" />
                  </div>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">Tipo de negocio</span>
                  <div className="relative">
                    <Store size={17} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle" />
                    <select className="input h-12 pl-11" value={businessType} onChange={(e) => setBusinessType(e.target.value)}>
                      <option value="retail">Comercio / Retail</option>
                      <option value="restaurant">Restaurante / Comida</option>
                      <option value="service">Servicios</option>
                      <option value="beauty">Belleza / Cuidado personal</option>
                      <option value="full">Mixto / Otro</option>
                    </select>
                  </div>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">Ciudad / ubicación</span>
                  <div className="relative">
                    <MapPin size={17} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle" />
                    <input className="input h-12 pl-11" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bogotá, Colombia" />
                  </div>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">N° de tiendas</span>
                    <div className="relative">
                      <Store size={17} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle" />
                      <input className="input h-12 pl-11" type="number" min={1} max={50} value={storeCount} onChange={(e) => setStoreCount(e.target.value)} />
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">¿Tienes CEDI?</span>
                    <button type="button" onClick={() => setHasCedi((v) => !v)} className={`input flex h-12 w-full items-center gap-2 px-3 text-left ${hasCedi ? 'border-brand-300 bg-brand-50 text-brand-800' : ''}`}>
                      <Warehouse size={17} strokeWidth={1.75} className={hasCedi ? 'text-brand-600' : 'text-subtle'} />
                      <span className="text-sm font-medium">{hasCedi ? 'Sí, tengo CEDI' : 'No, solo tienda(s)'}</span>
                    </button>
                  </label>
                </div>
              </>
            )}
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">Correo electrónico</span>
              <div className="relative">
                <Mail size={17} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle" />
                <input className="input h-12 pl-11" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.co" />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">Contraseña</span>
              <div className="relative">
                <Lock size={17} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle" />
                <input className="input h-12 pr-11 pl-11" type={show ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'signup' ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg p-1 text-muted hover:text-brand-700" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {show ? <EyeOff size={17} strokeWidth={1.75} /> : <Eye size={17} strokeWidth={1.75} />}
                </button>
              </div>
            </label>
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger">
                <CircleAlert size={17} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}
            {mode === 'signup' && <p className="-mt-1 text-xs text-muted">Mínimo 8 caracteres con letras y números.</p>}
            <Button type="submit" size="lg" loading={busy} className="w-full">
              {mode === 'login' ? 'Iniciar sesión' : 'Crear mi empresa'} <ArrowRight size={17} />
            </Button>
          </form>
          {signupEnabled && (
            <p className="mt-6 text-center text-sm text-muted">
              {mode === 'login' ? '¿Aún no tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
              <button
                type="button"
                className="font-semibold text-brand-600 hover:underline"
                onClick={() => {
                  setMode(mode === 'login' ? 'signup' : 'login')
                  setError('')
                }}
              >
                {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
              </button>
            </p>
          )}
        </div>
        <p className="text-xs text-subtle">© {new Date().getFullYear()} ARTIX · KIO SBS</p>
      </div>

      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-950 via-brand-800 to-brand-500 p-12 lg:flex lg:flex-col lg:justify-center">
        <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-brand-300/20 blur-2xl" />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="relative mx-auto w-full max-w-lg">
          <p className="text-sm font-semibold tracking-wider text-brand-200 uppercase">Small Business Solution</p>
          <h2 className="mt-3 font-display text-4xl leading-tight font-extrabold text-white">Todo tu negocio, en un solo lugar.</h2>
          <p className="mt-4 text-brand-100/90">Las cajas y apps trabajan sin internet; aquí ves y administras todo en tiempo real.</p>

          <div className="mt-10 rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-brand-100">Ventas del mes</p>
                <p className="mt-1 font-display text-3xl font-extrabold text-white">$ 48.120.500</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold text-[#86EFAC]">
                <TrendingUp size={14} /> 12,4%
              </span>
            </div>
            <svg viewBox="0 0 300 70" className="mt-4 h-16 w-full">
              <defs>
                <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#A5B4FC" stopOpacity=".5" />
                  <stop offset="1" stopColor="#A5B4FC" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 55 C30 50 45 30 75 38 S120 20 150 28 S205 8 235 18 S280 6 300 4 L300 70 L0 70Z" fill="url(#lg)" />
              <path d="M0 55 C30 50 45 30 75 38 S120 20 150 28 S205 8 235 18 S280 6 300 4" fill="none" stroke="#E0E7FF" strokeWidth="2.5" />
            </svg>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {AXES.map((a) => (
              <div key={a.label} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
                  <a.icon size={18} strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-sm font-bold text-white">{a.label}</p>
                  <p className="text-xs text-brand-100/80">{a.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
