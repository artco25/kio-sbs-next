import { Banknote, Building2, Crown, Receipt, Save } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, Card, Field, IconTile, Input, PageHeader, Textarea, useFeedback } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { money } from '../../lib/format'
import { gql } from '../../lib/gql'

const CURRENCY: Record<string, string> = { COP: 'Peso colombiano (COP)', USD: 'Dólar estadounidense (USD)', EUR: 'Euro (EUR)' }

export default function Company() {
  const { me, refresh } = useAuth()
  const { toast } = useFeedback()
  const c = me?.company
  const [form, setForm] = useState({
    name: c?.name ?? '',
    nit: c?.nit ?? '',
    address: c?.address ?? '',
    city: c?.city ?? '',
    phone: c?.phone ?? '',
    email: c?.email ?? '',
    receiptFooter: c?.receiptFooter ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  if (!c) return null
  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k] !== (c[k] ?? ''))

  async function save() {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Obligatorio'
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Correo inválido'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      const input = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]))
      input.name = form.name.trim()
      await gql('mutation($i:CompanyInput!){ updateCompany(input:$i){ id } }', { i: input })
      await refresh()
      toast('Datos de la empresa actualizados')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const addr = [form.address.trim(), form.city.trim()].filter(Boolean).join(', ')

  return (
    <>
      <PageHeader
        title="Empresa"
        subtitle="Datos fiscales y de contacto que aparecen en recibos, pedidos y desprendibles."
        actions={
          <Button icon={Save} loading={saving} disabled={!dirty} onClick={save}>
            Guardar cambios
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card title="Datos de la empresa" subtitle="Se muestran en documentos impresos y en las cajas POS.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Razón social / nombre" required error={errors.name} className="sm:col-span-2">
                <Input value={form.name} onChange={set('name')} maxLength={200} />
              </Field>
              <Field label="NIT">
                <Input value={form.nit} onChange={set('nit')} placeholder="900.123.456-7" />
              </Field>
              <Field label="Teléfono">
                <Input type="tel" value={form.phone} onChange={set('phone')} />
              </Field>
              <Field label="Dirección">
                <Input value={form.address} onChange={set('address')} />
              </Field>
              <Field label="Ciudad">
                <Input value={form.city} onChange={set('city')} />
              </Field>
              <Field label="Correo" error={errors.email} className="sm:col-span-2">
                <Input type="email" value={form.email} onChange={set('email')} />
              </Field>
              <Field label="Pie de recibo" hint={`${form.receiptFooter.length}/500 · Aparece al final del recibo POS.`} className="sm:col-span-2">
                <Textarea value={form.receiptFooter} onChange={set('receiptFooter')} maxLength={500} placeholder="¡Gracias por su compra!" />
              </Field>
            </div>
          </Card>

          <Card title="Plan y moneda">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              <div className="flex items-center gap-3">
                <IconTile icon={Crown} tone="brand" />
                <div>
                  <p className="text-[13px] text-muted">Plan contratado</p>
                  <Badge tone="brand" className="mt-0.5 capitalize">
                    {c.plan}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <IconTile icon={Banknote} tone="success" />
                <div>
                  <p className="text-[13px] text-muted">Moneda</p>
                  <p className="font-semibold text-ink">{CURRENCY[c.currency] ?? c.currency}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <IconTile icon={Building2} tone="info" />
                <div>
                  <p className="text-[13px] text-muted">Identificador</p>
                  <p className="font-mono text-[13px] font-semibold text-ink">{c.id.slice(0, 8)}</p>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Card title="Vista previa del recibo POS" subtitle="Así se imprime en las cajas." actions={<IconTile icon={Receipt} size={36} />}>
          <div className="mx-auto w-full max-w-[300px] rounded-xl border border-dashed border-line-strong bg-canvas p-5 font-mono text-[12px] leading-relaxed text-ink">
            <div className="text-center">
              <p className="text-[14px] font-bold uppercase">{form.name.trim() || 'Nombre de la empresa'}</p>
              {form.nit.trim() && <p>NIT {form.nit.trim()}</p>}
              {addr && <p>{addr}</p>}
              {form.phone.trim() && <p>Tel. {form.phone.trim()}</p>}
              {form.email.trim() && <p className="break-all">{form.email.trim()}</p>}
            </div>
            <Divider />
            <p>Recibo: C1-000123</p>
            <p>Fecha: {new Date().toLocaleDateString('es-CO')}</p>
            <Divider />
            <Line a="2 x Café americano" b={money(9000)} />
            <Line a="1 x Sándwich" b={money(14500)} />
            <Line a="1 x Jugo natural" b={money(7500)} />
            <Divider />
            <Line a="Subtotal" b={money(31000)} />
            <Line a="IVA" b={money(0)} />
            <p className="mt-1 flex justify-between text-[14px] font-bold">
              <span>TOTAL</span>
              <span>{money(31000)}</span>
            </p>
            <Line a="Efectivo" b={money(40000)} />
            <Line a="Cambio" b={money(9000)} />
            <Divider />
            <p className="text-center whitespace-pre-line">{form.receiptFooter.trim() || 'Gracias por su compra'}</p>
          </div>
        </Card>
      </div>
    </>
  )
}

const Divider = () => <div className="my-2 border-t border-dashed border-line-strong" />
const Line = ({ a, b }: { a: string; b: string }) => (
  <p className="flex justify-between gap-3">
    <span>{a}</span>
    <span className="tabular-nums">{b}</span>
  </p>
)
