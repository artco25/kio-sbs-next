import { useCallback, useEffect, useRef, useState } from 'react'
import { gql, GqlError } from './gql'

/**
 * Ejecuta una consulta GraphQL y la repite cuando cambian las variables o cuando cualquier
 * pantalla guarda algo (evento 'kio:invalidate' que dispara records.ts).
 *
 *   const { data, loading, error, reload } = useGql<{ products: ProductPage }>(Q, { search })
 */
export function useGql<T>(query: string, variables: Record<string, unknown> = {}, opts: { skip?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<GqlError | null>(null)
  const [loading, setLoading] = useState(!opts.skip)
  const key = JSON.stringify(variables)
  const seq = useRef(0)

  const run = useCallback(async () => {
    if (opts.skip) return
    const n = ++seq.current
    setLoading(true)
    try {
      const d = await gql<T>(query, JSON.parse(key) as Record<string, unknown>)
      if (n === seq.current) {
        setData(d)
        setError(null)
      }
    } catch (e) {
      if (n === seq.current) setError(e instanceof GqlError ? e : new GqlError(String(e)))
    } finally {
      if (n === seq.current) setLoading(false)
    }
  }, [query, key, opts.skip])

  useEffect(() => {
    void run()
    const h = () => void run()
    window.addEventListener('kio:invalidate', h)
    return () => window.removeEventListener('kio:invalidate', h)
  }, [run])

  return { data, error, loading, reload: run }
}

/** Valor con retardo (para buscadores). */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
