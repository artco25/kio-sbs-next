import clsx from 'clsx'
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Inbox, Loader2, Search, X, type LucideIcon } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { initials } from '../lib/format'

export const cn = clsx

/** Tamaño y trazo únicos para toda la iconografía (Lucide). */
export const ICON = { size: 18, strokeWidth: 1.75 } as const

// ============================================================================ botones

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
const VARIANT: Record<Variant, string> = {
  primary: 'bg-gradient-to-b from-brand-500 to-brand-700 text-white shadow-[0_8px_20px_-8px_rgb(67_56_202/0.7)] hover:brightness-110',
  secondary: 'bg-white text-ink border border-line-strong hover:bg-brand-50 hover:border-brand-200',
  ghost: 'text-ink-soft hover:bg-brand-50 hover:text-brand-700',
  danger: 'bg-danger text-white hover:brightness-110',
  success: 'bg-success text-white hover:brightness-110',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  icon?: LucideIcon
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', icon: Icon, loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-5 text-[15px]',
        VARIANT[variant],
        className,
      )}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon ? <Icon size={16} strokeWidth={2} /> : null}
      {children}
    </button>
  )
}

export function IconButton({ icon: Icon, label, className, tone = 'default', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; tone?: 'default' | 'danger' | 'success' }) {
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40',
        tone === 'danger' && 'hover:bg-danger-soft hover:text-danger',
        tone === 'success' && 'hover:bg-success-soft hover:text-success',
        className,
      )}
    >
      <Icon {...ICON} />
    </button>
  )
}

// ============================================================================ superficies

export function Card({ title, subtitle, actions, children, className, bodyClassName, padded = true }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; bodyClassName?: string; padded?: boolean }) {
  return (
    <section className={cn('card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            {title && <h3 className="text-[15px] font-bold text-ink">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(padded && 'p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

export function IconTile({ icon: Icon, tone = 'brand', size = 40 }: { icon: LucideIcon; tone?: Tone; size?: number }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-xl', TONE_SOFT[tone])} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.48)} strokeWidth={1.75} />
    </span>
  )
}

export function PageHeader({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-extrabold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </div>
  )
}

export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: { key: K; label: string; count?: number; icon?: LucideIcon }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-2xl border border-line bg-white p-1 shadow-card">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-semibold transition',
            t.key === value ? 'bg-brand-50 text-brand-700' : 'text-muted hover:text-ink',
          )}
        >
          {t.icon && <t.icon size={16} strokeWidth={1.75} />}
          {t.label}
          {t.count != null && <span className={cn('rounded-full px-1.5 text-[11px]', t.key === value ? 'bg-brand-100' : 'bg-canvas')}>{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ============================================================================ estados

export type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
export const TONE_SOFT: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-[#F1F2F8] text-ink-soft',
}

export function Badge({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', TONE_SOFT[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/** Estados de documentos de KIO SBS con su color y etiqueta. */
export const STATUS: Record<string, { label: string; tone: Tone }> = {
  borrador: { label: 'Borrador', tone: 'neutral' },
  confirmada: { label: 'Confirmada', tone: 'success' },
  anulada: { label: 'Anulada', tone: 'danger' },
  pagada: { label: 'Pagada', tone: 'success' },
  parcial: { label: 'Pago parcial', tone: 'warning' },
  por_cobrar: { label: 'Por cobrar', tone: 'warning' },
  vencida: { label: 'Vencida', tone: 'danger' },
  enviada: { label: 'Por aprobar', tone: 'info' },
  aprobada: { label: 'Aprobada', tone: 'success' },
  rechazada: { label: 'Rechazada', tone: 'danger' },
  solicitada: { label: 'Solicitada', tone: 'info' },
  abierta: { label: 'Abierta', tone: 'success' },
  cerrada: { label: 'Cerrada', tone: 'neutral' },
  pendiente: { label: 'Pendiente', tone: 'warning' },
  preparando: { label: 'Preparando', tone: 'info' },
  listo: { label: 'Listo', tone: 'success' },
  activo: { label: 'Activo', tone: 'success' },
  inactivo: { label: 'Inactivo', tone: 'neutral' },
  bloqueado: { label: 'Bloqueado', tone: 'danger' },
}

export function StatusBadge({ status }: { status?: string | null }) {
  const s = STATUS[status ?? ''] ?? { label: status ? status[0].toUpperCase() + status.slice(1) : '—', tone: 'neutral' as Tone }
  return <Badge tone={s.tone}>{s.label}</Badge>
}

const AVATAR_TONES = ['bg-brand-100 text-brand-700', 'bg-success-soft text-success', 'bg-warning-soft text-warning', 'bg-info-soft text-info', 'bg-[#FCE7F3] text-[#DB2777]', 'bg-[#EDE9FE] text-[#7C3AED]']

export function Avatar({ name, size = 32 }: { name: unknown; size?: number }) {
  const s = String(name ?? '')
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold', AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length])} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(s)}
    </span>
  )
}

export function NameCell({ name, sub, avatar = true }: { name: ReactNode; sub?: ReactNode; avatar?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {avatar && <Avatar name={typeof name === 'string' ? name : ''} />}
      <div className="min-w-0">
        <div className="truncate font-semibold text-ink">{name}</div>
        {sub && <div className="truncate text-xs text-muted">{sub}</div>}
      </div>
    </div>
  )
}

export function Delta({ value, inverse }: { value: number | null | undefined; inverse?: boolean }) {
  if (value == null || !Number.isFinite(value)) return null
  const good = inverse ? value <= 0 : value >= 0
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-bold', good ? 'text-success' : 'text-danger')}>
      <Icon size={14} strokeWidth={2.25} />
      {Math.abs(value * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })}%
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin text-brand-500', className)} size={22} />
}

export function EmptyState({ icon: Icon = Inbox, title, message, action }: { icon?: LucideIcon; title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <IconTile icon={Icon} size={52} />
      <p className="mt-4 font-display text-[15px] font-bold text-ink">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorBox({ error }: { error: { message: string } | null | undefined }) {
  if (!error) return null
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
      <CircleAlert size={18} strokeWidth={1.75} />
      {error.message}
    </div>
  )
}

// ============================================================================ formularios

export function Field({ label, hint, error, children, className, required }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn('input', className)} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cn('input h-auto min-h-[84px] py-2.5', className)} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cn('input appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236B6F8E%27 stroke-width=%272%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', className)}>
      {children}
    </select>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!checked)} className="inline-flex items-center gap-3 text-sm text-ink disabled:opacity-50">
      <span className={cn('relative h-6 w-11 rounded-full transition', checked ? 'bg-brand-600' : 'bg-line-strong')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
      {label}
    </button>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative w-full sm:w-72', className)}>
      <Search size={16} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input pl-10" />
    </div>
  )
}

/** Filtro tipo "pastilla" con menú nativo (ej. "Todos los estados"). */
export function FilterSelect<V extends string>({ value, onChange, options, icon: Icon }: { value: V; onChange: (v: V) => void; options: { value: V; label: string }[]; icon?: LucideIcon }) {
  return (
    <div className="relative">
      {Icon && <Icon size={15} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />}
      <Select value={value} onChange={(e) => onChange(e.target.value as V)} className={cn('w-auto min-w-40 font-medium', Icon && 'pl-9')}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  )
}

// ============================================================================ tabla

export interface Column<T> {
  key: string
  header: ReactNode
  render?: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
  /** Ocultar en pantallas pequeñas */
  hideSm?: boolean
}

export function DataTable<T extends { id?: string | null }>({
  columns,
  rows,
  loading,
  onRowClick,
  empty,
  pageSize = 15,
  footer,
}: {
  columns: Column<T>[]
  rows: T[]
  loading?: boolean
  onRowClick?: (row: T) => void
  empty?: ReactNode
  pageSize?: number
  footer?: ReactNode
}) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  useEffect(() => {
    setPage(0)
  }, [rows.length])
  const slice = rows.slice(page * pageSize, page * pageSize + pageSize)

  return (
    <div>
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-y border-line bg-canvas/60 text-left">
              {columns.map((c) => (
                <th key={c.key} className={cn('px-5 py-3 text-[11px] font-bold tracking-wider text-muted uppercase', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.hideSm && 'hidden md:table-cell')}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={(r.id as string) ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn('border-b border-line last:border-0 transition', onRowClick && 'cursor-pointer hover:bg-brand-50/50')}>
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-5 py-3.5 align-middle text-ink', c.align === 'right' && 'text-right tabular-nums', c.align === 'center' && 'text-center', c.hideSm && 'hidden md:table-cell', c.className)}>
                    {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {loading && rows.length === 0 && (
          <div className="flex justify-center py-14">
            <Spinner />
          </div>
        )}
        {!loading && rows.length === 0 && (empty ?? <EmptyState title="No hay registros" message="Cuando agregues información aparecerá aquí." />)}
      </div>
      {(rows.length > pageSize || footer) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm text-muted">
          <div>{footer}</div>
          {rows.length > pageSize && (
            <div className="flex items-center gap-2">
              <span>
                {page * pageSize + 1}–{Math.min(rows.length, (page + 1) * pageSize)} de {rows.length}
              </span>
              <IconButton icon={ChevronLeft} label="Anterior" disabled={page === 0} onClick={() => setPage((p) => p - 1)} />
              <IconButton icon={ChevronRight} label="Siguiente" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Barra de herramientas sobre una tabla (búsqueda + filtros + acciones). */
export function Toolbar({ children, actions }: { children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4">
      <div className="flex flex-1 flex-wrap items-center gap-2.5">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// ============================================================================ modales

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-950/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={cn('flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-pop sm:rounded-3xl', size === 'sm' && 'sm:max-w-md', size === 'md' && 'sm:max-w-xl', size === 'lg' && 'sm:max-w-3xl', size === 'xl' && 'sm:max-w-5xl')}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
          <div>
            <h2 className="text-lg font-bold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          <IconButton icon={X} label="Cerrar" onClick={onClose} />
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-6 pb-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ============================================================================ toasts y confirmación

interface ToastItem {
  id: number
  message: string
  tone: 'success' | 'error'
}
interface Feedback {
  toast: (message: string, tone?: 'success' | 'error') => void
  confirm: (opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>
}
const FeedbackCtx = createContext<Feedback | null>(null)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [dialog, setDialog] = useState<{ title: string; message: string; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null)

  const toast = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])
  const confirm = useCallback<Feedback['confirm']>((opts) => new Promise((resolve) => setDialog({ ...opts, resolve })), [])
  const value = useMemo(() => ({ toast, confirm }), [toast, confirm])
  const close = (v: boolean) => {
    dialog?.resolve(v)
    setDialog(null)
  }

  return (
    <FeedbackCtx.Provider value={value}>
      {children}
      {createPortal(
        <div className="fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
          {toasts.map((t) => (
            <div key={t.id} className="flex items-start gap-3 rounded-2xl bg-brand-950 px-4 py-3 text-sm text-white shadow-pop">
              {t.tone === 'success' ? <CircleCheck size={18} className="mt-0.5 shrink-0 text-[#86EFAC]" /> : <CircleAlert size={18} className="mt-0.5 shrink-0 text-[#FCA5A5]" />}
              <span>{t.message}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
      <Modal
        open={!!dialog}
        onClose={() => close(false)}
        size="sm"
        title={dialog?.title ?? ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              Cancelar
            </Button>
            <Button variant={dialog?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
              {dialog?.confirmLabel ?? 'Confirmar'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">{dialog?.message}</p>
      </Modal>
    </FeedbackCtx.Provider>
  )
}

export function useFeedback() {
  const v = useContext(FeedbackCtx)
  if (!v) throw new Error('useFeedback fuera de FeedbackProvider')
  return v
}
