import { Banknote, Clock, Download, HandCoins, MapPin, Mail, Pencil, Phone, Plus, Receipt, TriangleAlert, UserRound, Users, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KpiCard } from '../../components/charts'
import { RecordForm, type FieldDef } from '../../components/RecordForm'
import { Avatar, Badge, Button, Card, DataTable, EmptyState, ErrorBox, IconButton, Modal, NameCell, PageHeader, SearchInput, StatusBadge, Tabs, Toolbar, type Column } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { date, money, qty } from '../../lib/format'
import { exportCsv, type Row } from '../../lib/records'
import { useGql } from '../../lib/useGql'

interface Partner {
  id: string
  name: string | null
  docType: string | null
  docNumber: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  isCustomer: boolean
  isSupplier: boolean
  creditLimit: number
  paymentTermDays: number
  blocked: boolean
  notes: string | null
  balance: number
  overdue: number
  availableCredit: number | null
  sales: { status: string | null }[]
}

interface SaleLite {
  id: string
  number: string | null
  date: string | null
  total: number
  balance: number
  status: string | null
}

const Q = `query{
  partners(limit:500){ total items{
    id name docType docNumber email phone address city isCustomer isSupplier creditLimit paymentTermDays blocked notes
    balance overdue availableCredit sales(limit:10){ status }
  } }
}`

type Tab = 'todos' | 'clientes' | 'proveedores' | 'saldo' | 'bloqueados'

const DOC_TYPES = [
  { value: 'CC', label: 'CC · Cédula de ciudadanía' },
  { value: 'NIT', label: 'NIT' },
  { value: 'CE', label: 'CE · Cédula de extranjería' },
  { value: 'PP', label: 'PP · Pasaporte' },
]

const hasPurchases = (p: Partner) => p.sales.some((s) => s.status === 'confirmada')
const hasBalance = (p: Partner) => p.balance > 0.5

const toRow = (p: Partner): Row => ({
  id: p.id,
  name: p.name,
  doc_type: p.docType,
  doc_number: p.docNumber,
  email: p.email,
  phone: p.phone,
  address: p.address,
  city: p.city,
  is_customer: p.isCustomer ? 1 : 0,
  is_supplier: p.isSupplier ? 1 : 0,
  credit_limit: p.creditLimit,
  payment_term_days: p.paymentTermDays,
  blocked: p.blocked ? 1 : 0,
  notes: p.notes,
})

function TypeBadges({ p }: { p: Partner }) {
  if (!p.isCustomer && !p.isSupplier) return <Badge>Contacto</Badge>
  return (
    <span className="inline-flex flex-wrap gap-1">
      {p.isCustomer && <Badge tone="success">Cliente</Badge>}
      {p.isSupplier && <Badge tone="info">Proveedor</Badge>}
    </span>
  )
}

export default function Partners() {
  const { can, isFinance } = useAuth()
  const canWrite = can('partners', 'write')
  const { data, loading, error } = useGql<{ partners: { total: number; items: Partner[] } }>(Q)
  const [tab, setTab] = useState<Tab>('todos')
  const [q, setQ] = useState('')
  const [form, setForm] = useState<{ open: boolean; initial: Row | null }>({ open: false, initial: null })
  const [detailId, setDetailId] = useState<string | null>(null)

  const items = data?.partners.items ?? []
  const receivable = items.reduce((s, p) => s + (hasBalance(p) ? p.balance : 0), 0)
  const overdue = items.reduce((s, p) => s + p.overdue, 0)
  const buyers = items.filter(hasPurchases).length
  const debtors = items.filter(hasBalance).length
  const overdueCount = items.filter((p) => p.overdue > 0.5).length

  const counts: Record<Tab, number> = useMemo(
    () => ({
      todos: items.length,
      clientes: items.filter((p) => p.isCustomer).length,
      proveedores: items.filter((p) => p.isSupplier).length,
      saldo: items.filter(hasBalance).length,
      bloqueados: items.filter((p) => p.blocked).length,
    }),
    [items],
  )

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return items.filter((p) => {
      if (tab === 'clientes' && !p.isCustomer) return false
      if (tab === 'proveedores' && !p.isSupplier) return false
      if (tab === 'saldo' && !hasBalance(p)) return false
      if (tab === 'bloqueados' && !p.blocked) return false
      return !term || `${p.name ?? ''} ${p.docNumber ?? ''} ${p.email ?? ''} ${p.phone ?? ''} ${p.city ?? ''}`.toLowerCase().includes(term)
    })
  }, [items, tab, q])

  const fields: FieldDef[] = [
    { key: 'name', label: 'Nombre o razón social', required: true, full: true },
    { key: 'doc_type', label: 'Tipo de documento', type: 'select', options: DOC_TYPES, defaultValue: 'CC' },
    { key: 'doc_number', label: 'Número de documento' },
    { key: 'email', label: 'Correo electrónico', type: 'email' },
    { key: 'phone', label: 'Teléfono', type: 'tel' },
    { key: 'address', label: 'Dirección' },
    { key: 'city', label: 'Ciudad' },
    { key: 'is_customer', label: 'Es cliente', type: 'boolean', defaultValue: 1 },
    { key: 'is_supplier', label: 'Es proveedor', type: 'boolean' },
    { key: 'credit_limit', label: 'Cupo de crédito', type: 'money', disabled: !isFinance, hint: isFinance ? '0 = sin cupo definido' : 'Sólo administración o contabilidad puede cambiarlo' },
    { key: 'payment_term_days', label: 'Plazo de pago (días)', type: 'integer', defaultValue: 30, disabled: !isFinance },
    { key: 'blocked', label: 'Bloqueado en cartera', type: 'boolean', disabled: !isFinance, hint: isFinance ? 'No podrá comprar a crédito' : undefined },
    { key: 'notes', label: 'Notas', type: 'textarea' },
  ]

  const columns: Column<Partner>[] = [
    { key: 'name', header: 'Contacto', render: (p) => <NameCell name={p.name ?? 'Sin nombre'} sub={p.email || [p.docType, p.docNumber].filter(Boolean).join(' ') || undefined} /> },
    { key: 'type', header: 'Tipo', render: (p) => <TypeBadges p={p} /> },
    { key: 'city', header: 'Ciudad', hideSm: true, render: (p) => <span className="text-ink-soft">{p.city ?? '—'}</span> },
    { key: 'phone', header: 'Teléfono', hideSm: true, render: (p) => <span className="whitespace-nowrap text-ink-soft">{p.phone ?? '—'}</span> },
    { key: 'credit', header: 'Cupo', align: 'right', hideSm: true, render: (p) => (p.creditLimit > 0 ? money(p.creditLimit) : <span className="text-subtle">—</span>) },
    { key: 'balance', header: 'Saldo', align: 'right', render: (p) => (hasBalance(p) ? <span className="font-semibold">{money(p.balance)}</span> : <span className="text-subtle">—</span>) },
    { key: 'overdue', header: 'Vencido', align: 'right', render: (p) => (p.overdue > 0.5 ? <span className="font-semibold text-danger">{money(p.overdue)}</span> : <span className="text-subtle">—</span>) },
    { key: 'blocked', header: 'Estado', render: (p) => (p.blocked ? <StatusBadge status="bloqueado" /> : <span className="text-subtle">—</span>) },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (p: Partner) => (
              <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                <IconButton icon={Pencil} label="Editar" onClick={() => setForm({ open: true, initial: toRow(p) })} />
              </div>
            ),
          },
        ]
      : []),
  ]

  const exportRows = () =>
    exportCsv(
      'clientes_proveedores',
      rows.map((p) => ({
        name: p.name,
        docType: p.docType,
        docNumber: p.docNumber,
        email: p.email,
        phone: p.phone,
        city: p.city,
        address: p.address,
        type: [p.isCustomer && 'Cliente', p.isSupplier && 'Proveedor'].filter(Boolean).join(' / '),
        creditLimit: p.creditLimit,
        term: p.paymentTermDays,
        balance: Math.round(p.balance),
        overdue: Math.round(p.overdue),
        blocked: p.blocked ? 'Sí' : 'No',
      })),
      [
        { key: 'name', label: 'Nombre' },
        { key: 'docType', label: 'Tipo doc.' },
        { key: 'docNumber', label: 'Documento' },
        { key: 'email', label: 'Correo' },
        { key: 'phone', label: 'Teléfono' },
        { key: 'city', label: 'Ciudad' },
        { key: 'address', label: 'Dirección' },
        { key: 'type', label: 'Tipo' },
        { key: 'creditLimit', label: 'Cupo' },
        { key: 'term', label: 'Plazo (días)' },
        { key: 'balance', label: 'Saldo' },
        { key: 'overdue', label: 'Vencido' },
        { key: 'blocked', label: 'Bloqueado' },
      ],
    )

  const detail = items.find((p) => p.id === detailId) ?? null

  return (
    <>
      <PageHeader
        title="Clientes y proveedores"
        subtitle="Contactos, cupos de crédito y cartera de las personas y empresas con las que haces negocio."
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={exportRows} disabled={rows.length === 0}>
              Exportar CSV
            </Button>
            {canWrite && (
              <Button icon={Plus} onClick={() => setForm({ open: true, initial: null })}>
                Nuevo contacto
              </Button>
            )}
          </>
        }
      />
      <ErrorBox error={error} />

      <div className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={Users} label="Contactos" value={qty(data?.partners.total ?? 0)} hint={`${qty(counts.clientes)} clientes · ${qty(counts.proveedores)} proveedores`} />
          <KpiCard icon={UserRound} label="Clientes con compras" value={qty(buyers)} tone="success" hint="Con ventas confirmadas" />
          <KpiCard icon={Wallet} label="Cartera por cobrar" value={money(receivable)} tone="info" hint={`${qty(debtors)} contactos con saldo`} />
          <KpiCard icon={TriangleAlert} label="Cartera vencida" value={money(overdue)} tone={overdue > 0 ? 'danger' : 'success'} hint={overdue > 0 ? `${qty(overdueCount)} contactos en mora` : 'Sin cartera en mora'} inverse />
        </div>

        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'todos', label: 'Todos', count: counts.todos },
            { key: 'clientes', label: 'Clientes', count: counts.clientes },
            { key: 'proveedores', label: 'Proveedores', count: counts.proveedores },
            { key: 'saldo', label: 'Con saldo', count: counts.saldo },
            { key: 'bloqueados', label: 'Bloqueados', count: counts.bloqueados },
          ]}
        />

        <Card padded={false} className="pt-5">
          <Toolbar>
            <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre, documento, correo o ciudad…" className="sm:w-96" />
          </Toolbar>
          <DataTable<Partner>
            columns={columns}
            rows={rows}
            loading={loading}
            onRowClick={(p) => setDetailId(p.id)}
            footer={rows.length ? `${qty(rows.length)} de ${qty(items.length)} contactos` : undefined}
            empty={
              items.length === 0 ? (
                <EmptyState icon={Users} title="Aún no tienes contactos" message="Registra tus clientes y proveedores para vender a crédito y llevar su cartera." action={canWrite ? <Button icon={Plus} onClick={() => setForm({ open: true, initial: null })}>Nuevo contacto</Button> : undefined} />
              ) : (
                <EmptyState icon={Users} title="Sin resultados" message="Ningún contacto coincide con la búsqueda o la pestaña seleccionada." />
              )
            }
          />
        </Card>
      </div>

      <RecordForm
        open={form.open}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        table="partners"
        title={form.initial ? (form.initial.name as string) : 'Nuevo contacto'}
        subtitle={form.initial ? 'Editar contacto' : 'Cliente, proveedor o ambos'}
        fields={fields}
        initial={form.initial}
        validate={(v) => {
          if (!v.is_customer && !v.is_supplier) return 'Marca al menos una opción: cliente o proveedor.'
          if (Number(v.credit_limit) < 0 || Number(v.payment_term_days) < 0) return 'El cupo y el plazo no pueden ser negativos.'
          return null
        }}
      />

      {detail && <PartnerDetail p={detail} onClose={() => setDetailId(null)} onEdit={canWrite ? () => { setForm({ open: true, initial: toRow(detail) }); setDetailId(null) } : undefined} />}
    </>
  )
}

function PartnerDetail({ p, onClose, onEdit }: { p: Partner; onClose: () => void; onEdit?: () => void }) {
  const navigate = useNavigate()
  const { can } = useAuth()
  const { data, loading, error } = useGql<{ partner: { sales: SaleLite[] } | null }>(`query($id:ID!){ partner(id:$id){ sales(limit:10){ id number date total balance status } } }`, { id: p.id })
  const contact = [
    { icon: Mail, text: p.email },
    { icon: Phone, text: p.phone },
    { icon: MapPin, text: [p.address, p.city].filter(Boolean).join(', ') },
  ].filter((c) => c.text)
  const noCredit = p.availableCredit == null

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-3">
          <Avatar name={p.name} size={44} />
          <span className="min-w-0">
            <span className="block truncate">{p.name}</span>
            <span className="block text-sm font-normal text-muted">{[p.docType, p.docNumber].filter(Boolean).join(' ') || 'Sin documento'}</span>
          </span>
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          {onEdit && (
            <Button icon={Pencil} onClick={onEdit}>
              Editar contacto
            </Button>
          )}
        </>
      }
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <TypeBadges p={p} />
        {p.blocked && <StatusBadge status="bloqueado" />}
        <Badge tone="neutral">
          <Clock size={12} strokeWidth={2} />
          Plazo {p.paymentTermDays} días
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard icon={Wallet} label="Saldo por cobrar" value={money(p.balance)} tone="info" hint={hasBalance(p) ? 'Ventas a crédito pendientes' : 'Sin saldo pendiente'} />
        <KpiCard icon={HandCoins} label="Cupo disponible" value={noCredit ? 'Sin cupo' : money(p.availableCredit)} tone={noCredit ? 'neutral' : (p.availableCredit ?? 0) < 0 ? 'danger' : 'success'} hint={noCredit ? 'Sin cupo de crédito definido' : `Cupo total ${money(p.creditLimit)}`} />
        <KpiCard icon={TriangleAlert} label="Vencido" value={money(p.overdue)} tone={p.overdue > 0.5 ? 'danger' : 'success'} hint={p.overdue > 0.5 ? 'Requiere gestión de cobro' : 'Al día'} inverse />
        <KpiCard icon={Banknote} label="Cupo de crédito" value={p.creditLimit > 0 ? money(p.creditLimit) : '—'} hint={p.blocked ? 'Bloqueado en cartera' : 'Habilitado'} />
      </div>

      {(contact.length > 0 || p.notes) && (
        <div className="mt-5 space-y-2 rounded-2xl bg-canvas px-4 py-3 text-sm text-ink-soft">
          {contact.map((c) => (
            <div key={c.text} className="flex items-center gap-2.5">
              <c.icon size={16} strokeWidth={1.75} className="shrink-0 text-muted" />
              <span className="truncate">{c.text}</span>
            </div>
          ))}
          {p.notes && <p className="border-t border-line pt-2 text-muted">{p.notes}</p>}
        </div>
      )}

      <div className="mt-6 mb-2 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-bold text-ink">Últimas ventas</h3>
        {can('sales') && (
          <Button variant="ghost" size="sm" icon={Receipt} onClick={() => navigate('/ventas/pedidos')}>
            Ver pedidos
          </Button>
        )}
      </div>
      <ErrorBox error={error} />
      <div className="-mx-6 border-t border-line">
        <DataTable<SaleLite>
          pageSize={5}
          loading={loading}
          rows={data?.partner?.sales ?? []}
          onRowClick={can('sales') ? (s) => navigate(`/ventas/pedidos/${s.id}`) : undefined}
          columns={[
            { key: 'number', header: 'Documento', render: (s) => <span className="font-semibold text-brand-700">{s.number ?? '—'}</span> },
            { key: 'date', header: 'Fecha', hideSm: true, render: (s) => <span className="text-muted">{date(s.date)}</span> },
            { key: 'total', header: 'Total', align: 'right', render: (s) => <span className="font-semibold">{money(s.total)}</span> },
            { key: 'balance', header: 'Saldo', align: 'right', hideSm: true, render: (s) => (s.status === 'confirmada' && s.balance > 0.5 ? money(s.balance) : <span className="text-subtle">—</span>) },
            { key: 'status', header: 'Estado', render: (s) => <StatusBadge status={s.status} /> },
          ]}
          empty={<EmptyState icon={Receipt} title="Sin ventas registradas" message={can('sales') ? 'Cuando le vendas a este contacto, sus últimas ventas aparecerán aquí.' : 'Tu rol no tiene acceso al historial de ventas.'} />}
        />
      </div>
    </Modal>
  )
}
