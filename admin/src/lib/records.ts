import { gql } from './gql'

/**
 * Escrituras del admin web. Usan la mutación `saveRecords` del worker api, que aplica las mismas
 * reglas que el sync de las apps (rol, columnas en lista blanca, LWW) y asigna revisión para que
 * los equipos POS/móviles reciban el cambio en su siguiente sincronización (≤ 90 s).
 *
 * IMPORTANTE: los nombres de columna van en snake_case, tal como en schema/tables.json
 * (ej. { table: 'products', row: { id, name, category_id, tax_rate, track_stock: 1 } }).
 */
export type Row = Record<string, unknown>
export interface Change {
  table: string
  row: Row
}

export const uuid = () => crypto.randomUUID()

const pad = (n: number) => String(n).padStart(2, '0')
/** Fecha-hora local sin zona: 'YYYY-MM-DDTHH:MM:SS' (formato de sales.date, payments.date, etc.). */
export function nowLocal(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
/** Fecha local 'YYYY-MM-DD'. */
export const today = (d = new Date()) => nowLocal(d).slice(0, 10)
export const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return today(d)
}

/** Consecutivo de documentos creados desde la web (las apps usan su propio prefijo de terminal). */
export function docNumber(prefix: string) {
  return `${prefix}-W-${Date.now().toString(36).toUpperCase().slice(-6)}`
}

/** Notifica a las vistas abiertas que deben recargar sus datos. */
export function invalidate() {
  window.dispatchEvent(new Event('kio:invalidate'))
}

/** Guarda hasta 40 registros de forma atómica (ej. venta + líneas + pagos + movimientos). */
export async function saveRecords(changes: Change[]): Promise<string[]> {
  const withIds = changes.map((c) => ({ table: c.table, row: { ...c.row, id: (c.row.id as string) ?? uuid(), updated_at: new Date().toISOString() } }))
  const ids: string[] = []
  for (let i = 0; i < withIds.length; i += 40) {
    const r = await gql<{ saveRecords: string[] }>('mutation($c:[RecordInput!]!){ saveRecords(changes:$c) }', { c: withIds.slice(i, i + 40) })
    ids.push(...r.saveRecords)
  }
  invalidate()
  return ids
}

export async function saveRecord(table: string, row: Row): Promise<string> {
  const [id] = await saveRecords([{ table, row }])
  return id
}

export async function deleteRecord(table: string, id: string) {
  await gql('mutation($t:String!,$id:ID!){ deleteRecord(table:$t, id:$id) }', { t: table, id })
  invalidate()
}

/** Descarga un CSV compatible con Excel en español (separador ';', UTF-8 con BOM). */
export function exportCsv(filename: string, rows: Row[], columns: { key: string; label: string }[]) {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [columns.map((c) => c.label).join(';'), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(';'))]
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${filename}_${today()}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
