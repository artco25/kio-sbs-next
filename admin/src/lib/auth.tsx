import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getToken, gql, setToken } from './gql'

export type Role = 'admin' | 'contador' | 'cajero' | 'vendedor'

export interface Me {
  user: { id: string; name: string; email: string | null; role: Role; posTerminal: string | null; platformRole: string | null; siteId: string | null }
  company: { id: string; name: string; nit: string | null; address: string | null; city: string | null; phone: string | null; email: string | null; receiptFooter: string | null; currency: string; plan: string }
  permissions: Record<string, { read: boolean; write: boolean }>
  /** Suites a las que puede ingresar (comercial, pos, financiero, personal, sistema). */
  suites: string[]
  roleName: string | null
  platformRole: string | null
}

export const ME_FIELDS = `user { id name email role posTerminal platformRole siteId } company { id name nit address city phone email receiptFooter currency plan } permissions suites roleName platformRole`
const ME_KEY = 'kio_sbs_me'

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Dueño / Gerente',
  contador: 'Auxiliar contable',
  cajero: 'Cajero',
  vendedor: 'Vendedor',
}

interface AuthState {
  me: Me | null
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  /** Guarda la sesión devuelta por login/signup. */
  setSession: (token: string, me: Me) => void
  hasSuite: (suite: string) => boolean
  logout: () => Promise<void>
  refresh: () => Promise<void>
  /** Permiso por tabla de schema/tables.json (ej. can('products', 'write')). */
  can: (table: string, mode?: 'read' | 'write') => boolean
  isAdmin: boolean
  isFinance: boolean
  platformRole: 'owner' | 'admin' | 'viewer' | null
  isPlatform: boolean
  isPlatformOwner: boolean
}

const Ctx = createContext<AuthState | null>(null)

function loadCached(): Me | null {
  try {
    const raw = localStorage.getItem(ME_KEY)
    return raw ? (JSON.parse(raw) as Me) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(() => (getToken() ? loadCached() : null))
  const [ready, setReady] = useState(false)

  const store = (m: Me | null) => {
    setMe(m)
    try {
      if (m) localStorage.setItem(ME_KEY, JSON.stringify(m))
      else localStorage.removeItem(ME_KEY)
    } catch {
      /* sin almacenamiento */
    }
  }

  const refresh = useCallback(async () => {
    if (!getToken()) return
    const d = await gql<{ me: Me }>(`{ me { ${ME_FIELDS} } }`)
    store(d.me)
  }, [])

  useEffect(() => {
    refresh()
      .catch(() => {
        /* token inválido: el evento kio:unauthorized limpia la sesión */
      })
      .finally(() => setReady(true))
    const onUnauthorized = () => {
      setToken(null)
      store(null)
    }
    window.addEventListener('kio:unauthorized', onUnauthorized)
    return () => window.removeEventListener('kio:unauthorized', onUnauthorized)
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const d = await gql<{ login: { token: string; me: Me } }>(
      `mutation($e:String!,$p:String!){ login(email:$e,password:$p){ token me { ${ME_FIELDS} } } }`,
      { e: email, p: password },
    )
    setToken(d.login.token)
    store(d.login.me)
  }, [])

  const setSession = useCallback((token: string, m: Me) => {
    setToken(token)
    store(m)
  }, [])

  const logout = useCallback(async () => {
    try {
      await gql('mutation { logout }')
    } catch {
      /* igual se cierra localmente */
    }
    setToken(null)
    store(null)
  }, [])

  const value = useMemo<AuthState>(() => {
    const role = me?.user.role
    const pr = (me?.platformRole ?? me?.user.platformRole ?? null) as 'owner' | 'admin' | 'viewer' | null
    return {
      me,
      ready,
      login,
      setSession,
      hasSuite: (s) => !!me?.suites?.includes(s),
      logout,
      refresh,
      can: (table, mode = 'read') => !!me?.permissions?.[table]?.[mode],
      isAdmin: role === 'admin',
      isFinance: role === 'admin' || role === 'contador',
      platformRole: pr,
      isPlatform: !!pr,
      isPlatformOwner: pr === 'owner',
    }
  }, [me, ready, login, setSession, logout, refresh])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth fuera de AuthProvider')
  return v
}
