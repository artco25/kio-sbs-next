import { Download, Laptop, Monitor, PackageCheck, ShieldCheck } from 'lucide-react'
import { Badge, Button, Card, IconTile, PageHeader } from '../../components/ui'

const WINDOWS_URL = import.meta.env.VITE_DOWNLOAD_WINDOWS_URL || ''
const LINUX_URL = import.meta.env.VITE_DOWNLOAD_LINUX_URL || ''

type Platform = {
  key: string
  name: string
  icon: typeof Monitor
  tone: 'brand' | 'info'
  description: string
  detail: string
  url: string
  file: string
  requirements: string[]
}

const PLATFORMS: Platform[] = [
  {
    key: 'windows',
    name: 'Windows',
    icon: Monitor,
    tone: 'brand',
    description: 'Instalador para equipos POS con Windows 10/11 (64-bit).',
    detail: 'Incluye KIO SBS POS listo para caja, ventas rápidas y operación táctil.',
    url: WINDOWS_URL,
    file: 'KIO-SBS-POS-Setup-0.1.0.exe',
    requirements: ['Windows 10/11 64-bit', 'Conexión a internet para sincronización', 'Impresora/ticketera opcional'],
  },
  {
    key: 'linux',
    name: 'Linux',
    icon: Laptop,
    tone: 'info',
    description: 'App de escritorio para equipos Linux (Debian/Ubuntu).',
    detail: 'Misma experiencia POS optimizada para terminales de venta.',
    url: LINUX_URL,
    file: 'kio-sbs-pos-linux.tar.gz',
    requirements: ['Linux 64-bit (Ubuntu/Debian recomendado)', 'Conexión a internet para sincronización', 'Impresora/ticketera opcional'],
  },
]

function PlatformCard({ p }: { p: Platform }) {
  const available = Boolean(p.url)
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <IconTile icon={p.icon} tone={p.tone} size={48} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-ink">{p.name}</h3>
              <Badge tone={available ? 'success' : 'warning'}>{available ? 'Disponible' : 'Próximamente'}</Badge>
            </div>
            <p className="text-sm text-muted">{p.description}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-line bg-surface-2/60 p-4">
        <div className="text-sm font-semibold text-ink">{p.detail}</div>
        <div className="mt-1 text-xs text-muted">Archivo: {p.file}</div>
      </div>

      <ul className="mt-5 space-y-2 text-sm text-muted">
        {p.requirements.map((r) => (
          <li key={r} className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand" />
            <span>{r}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-center gap-3">
        {available ? (
          <a
            href={p.url}
            download
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-700 active:scale-[.98]"
          >
            <Download size={16} strokeWidth={2} />
            Descargar para {p.name}
          </a>
        ) : (
          <Button icon={Download} disabled>
            Descargar para {p.name}
          </Button>
        )}
        {!available && <span className="text-xs text-muted">Configura la URL de descarga para habilitar este botón.</span>}
      </div>
    </Card>
  )
}

export default function Downloads() {
  return (
    <>
      <PageHeader
        title="Descargar KIO SBS POS"
        subtitle="Instala la app de punto de venta en los equipos de caja. Linux y Windows funcionan en modo POS (vendedores/receptores de pedidos)."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        {PLATFORMS.map((p) => (
          <PlatformCard key={p.key} p={p} />
        ))}
      </div>

      <Card className="mt-6" title="Después de instalar" subtitle="Recomendaciones para dejar el equipo listo.">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: PackageCheck, text: 'Inicia sesión con el usuario de caja/vendedor asignado.' },
            { icon: ShieldCheck, text: 'Verifica que la URL del servidor apunte a producción.' },
            { icon: Download, text: 'Abre caja y prueba una venta antes de operar en vivo.' },
          ].map((i) => (
            <div key={i.text} className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2/50 p-4 text-sm text-muted">
              <i.icon className="mt-0.5 h-4 w-4 text-brand" />
              <span>{i.text}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
