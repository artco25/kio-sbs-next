/** Cliente GraphQL del worker kio-sbs-api. Lecturas en camelCase; escrituras con columnas snake_case (ver records.ts). */
export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) || 'http://127.0.0.1:8797').replace(/\/+$/, '')

const TOKEN_KEY = 'kio_sbs_token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* almacenamiento no disponible */
  }
}

export class GqlError extends Error {
  code?: string
  offline: boolean
  constructor(message: string, code?: string, offline = false) {
    super(message)
    this.code = code
    this.offline = offline
  }
}

export async function gql<T = Record<string, unknown>>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = getToken()
  let res: Response
  try {
    res = await fetch(`${API_URL}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ query, variables }),
    })
  } catch {
    throw new GqlError('No hay conexión con el servidor', 'OFFLINE', true)
  }
  const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message: string; extensions?: { code?: string } }[] }
  if (body.errors?.length) {
    const e = body.errors[0]
    const code = e.extensions?.code
    if (code === 'UNAUTHENTICATED' && token) window.dispatchEvent(new Event('kio:unauthorized'))
    throw new GqlError(e.message, code)
  }
  if (!body.data) throw new GqlError(`Respuesta inválida del servidor (HTTP ${res.status})`)
  return body.data
}
