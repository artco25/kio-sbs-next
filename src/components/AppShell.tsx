"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearSession, getStoredUser, type AuthUser } from "@/lib/auth";
import { gql } from "@/lib/api";

type Suite = { id: number; name: string; code: string; color: string; icon: string; sequence: number; en_pie: number; modules: { module_key: string; name: string; icon: string; enabled: number }[] };

// Suites de KIO SBS (4 ejes). Antes venían de /api/suites del prototipo REST.
const KIO_SBS_SUITES: Suite[] = [
  { id: 1, name: "Inicio", code: "inicio", color: "#214F76", icon: "layout-dashboard", sequence: 0, en_pie: 0, modules: [{ module_key: "dashboard", name: "Panel", icon: "layout-dashboard", enabled: 1 }] },
  { id: 2, name: "Comercial", code: "comercial", color: "#24A756", icon: "shopping-bag", sequence: 10, en_pie: 0, modules: [
    { module_key: "contactos", name: "Contactos", icon: "contact", enabled: 1 },
    { module_key: "ventas", name: "Ventas", icon: "shopping-bag", enabled: 1 },
    { module_key: "inventario", name: "Inventario", icon: "package", enabled: 1 },
  ] },
  { id: 3, name: "Punto de venta", code: "pos", color: "#E0A33C", icon: "store", sequence: 20, en_pie: 0, modules: [{ module_key: "pos", name: "POS", icon: "store", enabled: 1 }] },
  { id: 4, name: "Financiero", code: "financiero", color: "#4A9FD8", icon: "landmark", sequence: 30, en_pie: 0, modules: [{ module_key: "contabilidad", name: "Contabilidad", icon: "receipt-text", enabled: 1 }] },
  { id: 5, name: "Personal y nómina", code: "personal", color: "#8B6FD6", icon: "id-card", sequence: 40, en_pie: 0, modules: [{ module_key: "rrhh", name: "RRHH y nómina", icon: "id-card", enabled: 1 }] },
  { id: 6, name: "Sistema", code: "sistema", color: "#6b7482", icon: "settings", sequence: 99, en_pie: 1, modules: [{ module_key: "administracion", name: "Administración", icon: "settings", enabled: 1 }] },
];

// Submódulos por módulo (estilo KIO)
const MODULE_ROUTES: Record<string, string> = {
  dashboard: "/", crm: "/crm", ventas: "/ventas", pos: "/pos", website: "/website",
  encuestas: "/encuestas", compras: "/compras", inventario: "/inventario", manufactura: "/manufactura",
  proyectos: "/proyectos", contabilidad: "/contabilidad", contactos: "/contactos", rrhh: "/rrhh",
  administracion: "/administracion", gestion: "/gestion",
};

export const SUBMODULES: Record<string, { key: string; label: string }[]> = {
  dashboard: [{ key: "resumen", label: "Resumen" }, { key: "clientes", label: "Clientes" }],
  crm: [{ key: "leads", label: "Leads" }, { key: "oportunidades", label: "Oportunidades" }, { key: "clientes", label: "Clientes" }, { key: "actividades", label: "Actividades" }],
  ventas: [{ key: "pedidos", label: "Pedidos" }, { key: "cotizaciones", label: "Cotizaciones" }, { key: "facturas", label: "Facturas" }, { key: "clientes", label: "Clientes" }],
  pos: [{ key: "caja", label: "Caja" }, { key: "productos", label: "Productos" }, { key: "categorias", label: "Categorías" }, { key: "sesiones", label: "Sesiones" }, { key: "reportes", label: "Reportes" }],
  website: [{ key: "paginas", label: "Páginas" }, { key: "configuracion", label: "Configuración" }],
  encuestas: [{ key: "lista", label: "Lista" }, { key: "resultados", label: "Resultados" }],
  compras: [{ key: "ordenes", label: "Órdenes" }, { key: "proveedores", label: "Proveedores" }, { key: "recepciones", label: "Recepciones" }],
  inventario: [{ key: "productos", label: "Productos" }, { key: "stock", label: "Stock" }, { key: "movimientos", label: "Movimientos" }, { key: "bodegas", label: "Bodegas" }],
  manufactura: [{ key: "ordenes", label: "Órdenes de producción" }, { key: "recetas", label: "Recetas" }, { key: "centros", label: "Centros de trabajo" }],
  proyectos: [{ key: "proyectos", label: "Proyectos" }, { key: "tareas", label: "Tareas" }, { key: "gantt", label: "Gantt" }],
  contabilidad: [{ key: "facturas", label: "Facturas" }, { key: "pagos", label: "Pagos" }, { key: "cuentas", label: "Cuentas" }, { key: "reportes", label: "Reportes" }, { key: "cierre", label: "Cierre" }],
  contactos: [{ key: "contactos", label: "Contactos" }, { key: "empresas", label: "Empresas" }],
  rrhh: [{ key: "empleados", label: "Empleados" }, { key: "nomina", label: "Nómina" }, { key: "asistencias", label: "Asistencias" }, { key: "novedades", label: "Novedades" }],
  administracion: [{ key: "empresas", label: "Empresas" }, { key: "usuarios", label: "Usuarios" }, { key: "roles", label: "Roles y permisos" }, { key: "configuracion", label: "Configuración" }],
  gestion: [{ key: "dashboard", label: "Dashboard ejecutivo" }, { key: "reportes", label: "Reportes" }, { key: "kpis", label: "KPIs" }],
};



export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [suites, setSuites] = useState<Suite[]>([]);
  const [activeSuite, setActiveSuite] = useState<number | null>(null);
  const [plegado, setPlegado] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.replace("/login"); return; }
    setUser(u);
    setSuites(KIO_SBS_SUITES);
    setActiveSuite(KIO_SBS_SUITES[1].id);
    // Valida el token contra la API; si venció, vuelve al login.
    gql<{ me: { user: { id: string } } }>("{ me { user { id } } }").catch((e: Error & { code?: string }) => {
      if (e.code === "UNAUTHENTICATED") { clearSession(); router.replace("/login"); }
    });
    try { setPlegado(localStorage.getItem("kio_plegado") === "1"); } catch {}
    setReady(true);
  }, [router]);

  async function logout() {
    try { await gql("mutation { logout }"); } catch {}
    clearSession();
    router.replace("/login");
  }

  function togglePlegado() {
    const v = !plegado;
    setPlegado(v);
    try { localStorage.setItem("kio_plegado", v ? "1" : "0"); } catch {}
  }

  if (!ready || !user) return <div className="min-h-screen bg-background" />;

  const suite = suites.find((s) => s.id === activeSuite) || suites[0];
  const nonPieSuites = suites.filter((s) => !s.en_pie);
  const pieSuite = suites.find((s) => s.en_pie);
  const modules = suite?.modules?.filter((m) => m.enabled) || [];

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className={`border-r border-border bg-card/80 backdrop-blur transition-all duration-200 ${plegado ? "w-[76px]" : "w-[264px]"}`}>
          <div className="flex h-full flex-col">
            {/* Logo */}
            <div className={`flex items-center gap-2 border-b border-border px-4 py-4 ${plegado ? "justify-center" : ""}`}>
              <Image src="/brand/artix_mark.svg" alt="KIO" width={28} height={28} className="h-7 w-7 shrink-0" />
              {!plegado && <span className="text-sm font-semibold text-foreground">KIO SBS</span>}
            </div>

            {/* Suite selector */}
            {!plegado && (
              <div className="border-b border-border px-4 py-3">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Suite</p>
                <select
                  value={activeSuite || ""}
                  onChange={(e) => setActiveSuite(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
                >
                  {nonPieSuites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  {pieSuite && <option value={pieSuite.id}>{pieSuite.name}</option>}
                </select>
                {suite && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: suite.color }} />
                    <span className="text-xs text-muted-foreground">{suite.name}</span>
                  </div>
                )}
              </div>
            )}

            {/* Module list */}
            <nav className="flex-1 overflow-y-auto px-2 py-3">
              {modules.map((m) => {
                const href = MODULE_ROUTES[m.module_key] || "/";
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={m.module_key}
                    href={href}
                    className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "text-primary-foreground shadow-card" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    style={active ? { backgroundColor: suite?.color || "#2FD9F4" } : {}}
                    title={plegado ? m.name : undefined}
                  >
                    <span className="text-base">{m.icon === "layout-dashboard" ? "📊" : m.icon === "shopping-bag" ? "🛒" : m.icon === "store" ? "🏪" : m.icon === "target" ? "🎯" : m.icon === "globe" ? "🌐" : m.icon === "clipboard-list" ? "📋" : m.icon === "package" ? "📦" : m.icon === "shopping-cart" ? "🛍️" : m.icon === "factory" ? "🏭" : m.icon === "square-kanban" ? "📌" : m.icon === "receipt-text" ? "🧾" : m.icon === "contact" ? "📇" : m.icon === "id-card" ? "🪪" : m.icon === "settings" ? "⚙️" : m.icon === "blocks" ? "🧩" : "📁"}</span>
                    {!plegado && <span>{m.name}</span>}
                  </Link>
                );
              })}
            </nav>

            {/* Footer */}
            <div className="border-t border-border px-4 py-3">
              {!plegado && (
                <div className="mb-3">
                  <p className="text-sm font-medium text-foreground">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                  <p className="mt-1 text-xs text-brand-600">{user.company_name} · {user.role}</p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button onClick={togglePlegado} className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted" title={plegado ? "Expandir" : "Contraer"}>
                  {plegado ? "→" : "←"}
                </button>
                {!plegado && (
                  <button onClick={logout} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                    Cerrar sesión
                  </button>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {/* Top bar */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-8 py-3 backdrop-blur">
            <div className="flex items-center gap-2">
              {suite && <span className="rounded-full px-2.5 py-1 text-xs font-medium text-white" style={{ backgroundColor: suite.color }}>{suite.name}</span>}
              <span className="text-sm font-medium text-foreground">{modules.find((m) => pathname === (MODULE_ROUTES[m.module_key] || "/") || pathname.startsWith((MODULE_ROUTES[m.module_key] || "/") + "/"))?.name || "KIO SBS"}</span>
            </div>
            <div className="flex items-center gap-3">
              <input className="w-64 rounded-xl border border-border bg-card px-4 py-2 text-sm outline-none ring-ring focus:ring-2" placeholder="Buscar..." />
              <span className="text-sm text-muted-foreground">{user.name}</span>
            </div>
          </div>
          <div className="px-8 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}


