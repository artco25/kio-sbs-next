import { Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { deleteRecord, saveRecord, type Row } from '../lib/records'
import { Button, cn, Field, Input, Modal, Select, Switch, Textarea, useFeedback } from './ui'

export type FieldType = 'text' | 'email' | 'tel' | 'number' | 'money' | 'percent' | 'integer' | 'date' | 'textarea' | 'select' | 'boolean' | 'color'

/** Campo de un formulario de registro. `key` = columna snake_case de schema/tables.json. */
export interface FieldDef {
  key: string
  label: string
  type?: FieldType
  required?: boolean
  options?: { value: string; label: string }[]
  hint?: string
  full?: boolean
  placeholder?: string
  defaultValue?: unknown
  disabled?: boolean
}

const COLORS = ['#4338CA', '#6366F1', '#0284C7', '#16A34A', '#D97706', '#DC2626', '#DB2777', '#7C3AED', '#1E1B4B']

/**
 * Modal genérico para crear/editar un registro de cualquier tabla sincronizable.
 * `initial` usa snake_case (como en la BD). Si trae `id`, se edita; si no, se crea.
 */
export function RecordForm({
  open,
  onClose,
  table,
  title,
  subtitle,
  fields,
  initial,
  extra,
  validate,
  onSaved,
  canDelete = true,
  children,
}: {
  open: boolean
  onClose: () => void
  table: string
  title: string
  subtitle?: string
  fields: FieldDef[]
  initial?: Row | null
  /** Valores fijos que se agregan al guardar (ej. status, number). */
  extra?: Row
  /** Devuelve un mensaje de error o null. Puede modificar `values`. */
  validate?: (values: Row) => string | null
  onSaved?: (id: string, values: Row) => void
  canDelete?: boolean
  children?: ReactNode
}) {
  const { toast, confirm } = useFeedback()
  const [values, setValues] = useState<Row>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const isNew = !initial?.id

  useEffect(() => {
    if (!open) return
    const v: Row = {}
    for (const f of fields) {
      const raw = initial?.[f.key] ?? f.defaultValue ?? (f.type === 'boolean' ? 0 : '')
      v[f.key] = f.type === 'percent' && raw !== '' ? Math.round(Number(raw) * 10000) / 100 : raw
    }
    setValues(v)
    setErrors({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }))

  async function submit() {
    const errs: Record<string, string> = {}
    const out: Row = {}
    for (const f of fields) {
      let v = values[f.key]
      if (f.required && (v === '' || v == null)) errs[f.key] = 'Obligatorio'
      if (['number', 'money', 'percent', 'integer'].includes(f.type ?? '')) {
        if (v === '' || v == null) v = 0
        else {
          const n = Number(String(v).replace(',', '.'))
          if (!Number.isFinite(n)) errs[f.key] = 'Número inválido'
          v = f.type === 'percent' ? n / 100 : f.type === 'integer' ? Math.trunc(n) : n
        }
      } else if (f.type === 'boolean') v = v ? 1 : 0
      else if (typeof v === 'string') v = v.trim() === '' ? null : v.trim()
      if (f.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) errs[f.key] = 'Correo inválido'
      out[f.key] = v
    }
    setErrors(errs)
    if (Object.keys(errs).length) return
    const merged: Row = { ...(extra ?? {}), ...out, ...(isNew ? {} : { id: initial!.id }) }
    const msg = validate?.(merged)
    if (msg) {
      toast(msg, 'error')
      return
    }
    setSaving(true)
    try {
      const id = await saveRecord(table, merged)
      toast(isNew ? 'Registro creado' : 'Cambios guardados')
      onSaved?.(id, merged)
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!(await confirm({ title: 'Eliminar registro', message: 'Se eliminará también en las cajas y apps al sincronizar. ¿Continuar?', confirmLabel: 'Eliminar', danger: true }))) return
    try {
      await deleteRecord(table, initial!.id as string)
      toast('Registro eliminado')
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      size="lg"
      footer={
        <>
          {!isNew && canDelete && (
            <Button variant="ghost" icon={Trash2} className="mr-auto text-danger hover:bg-danger-soft hover:text-danger" onClick={remove}>
              Eliminar
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={saving} onClick={submit}>
            {isNew ? 'Crear' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} required={f.required} hint={f.hint} error={errors[f.key]} className={cn((f.full || f.type === 'textarea') && 'sm:col-span-2')}>
            {renderInput(f, values[f.key], (v) => set(f.key, v))}
          </Field>
        ))}
      </div>
      {children}
    </Modal>
  )
}

function renderInput(f: FieldDef, value: unknown, onChange: (v: unknown) => void) {
  const v = value == null ? '' : String(value)
  switch (f.type) {
    case 'textarea':
      return <Textarea value={v} disabled={f.disabled} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />
    case 'select':
      return (
        <Select value={v} disabled={f.disabled} onChange={(e) => onChange(e.target.value)}>
          {!f.required && <option value="">—</option>}
          {f.required && v === '' && <option value="">Selecciona…</option>}
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )
    case 'boolean':
      return (
        <div className="flex h-10 items-center">
          <Switch checked={!!Number(value)} disabled={f.disabled} onChange={(c) => onChange(c ? 1 : 0)} label={<span className="text-muted">{Number(value) ? 'Sí' : 'No'}</span>} />
        </div>
      )
    case 'color':
      return (
        <div className="flex h-10 flex-wrap items-center gap-2">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => onChange(c)} className={cn('h-7 w-7 rounded-full ring-offset-2 transition', v === c ? 'ring-2 ring-brand-500' : 'hover:scale-110')} style={{ background: c }} aria-label={c} />
          ))}
        </div>
      )
    case 'date':
      return <Input type="date" value={v.slice(0, 10)} disabled={f.disabled} onChange={(e) => onChange(e.target.value)} />
    case 'number':
    case 'money':
    case 'percent':
    case 'integer':
      return (
        <div className="relative">
          {f.type === 'money' && <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-muted">$</span>}
          <Input inputMode="decimal" value={v} disabled={f.disabled} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} className={cn(f.type === 'money' && 'pl-7', f.type === 'percent' && 'pr-8')} />
          {f.type === 'percent' && <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-muted">%</span>}
        </div>
      )
    default:
      return <Input type={f.type ?? 'text'} value={v} disabled={f.disabled} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />
  }
}
