"use client";

import { useState } from "react";

const kpis = [
  { label: "Pedidos confirmados", value: "48", hint: "+12%" },
  { label: "Ticket medio", value: "$641.000", hint: "+5%" },
  { label: "Tasa de conversión", value: "24%", hint: "+3 pts" },
  { label: "Clientes con compra", value: "38", hint: "Activos" },
];

const clientes = [
  { nombre: "Panadería Central", email: "contacto@panaderia.co", pais: "Colombia", compras: 12 },
  { nombre: "Café Norte", email: "info@cafenorte.co", pais: "Colombia", compras: 8 },
  { nombre: "Tienda Barrio", email: "tienda@barrio.co", pais: "Colombia", compras: 5 },
];

export default function DashboardPage() {
  const [tab, setTab] = useState("resumen");
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand-600">KIO SBS</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Dashboard</h1>
      <p className="mt-2 text-sm text-muted-foreground">Resumen de la operación y clientes.</p>

      <div className="mt-6 flex gap-2 border-b border-border pb-2">
        {["resumen", "clientes"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === t ? "bg-primary text-primary-foreground shadow-card" : "text-muted-foreground hover:bg-muted"}`}>
            {t === "resumen" ? "Resumen" : "Clientes"}
          </button>
        ))}
      </div>

      {tab === "resumen" && (
        <>
          <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {kpis.map((k) => (
              <article key={k.label} className="surface p-6">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{k.label}</p>
                <p className="mt-3 text-3xl font-light tracking-tight text-foreground">{k.value}</p>
                <p className="mt-2 text-sm text-brand-600">{k.hint}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section className="surface p-6">
              <h2 className="text-sm font-semibold text-foreground">Ingresos últimos 6 meses</h2>
              <div className="mt-4 flex items-end gap-2 h-40">
                {[40, 55, 35, 70, 60, 85].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-lg bg-brand-400/80" style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                {["Jun", "Jul", "Ago", "Sep", "Oct", "Nov"].map((m) => <span key={m}>{m}</span>)}
              </div>
            </section>
            <section className="surface p-6">
              <h2 className="text-sm font-semibold text-foreground">Productos más vendidos</h2>
              <div className="mt-4 space-y-3">
                {["Pan de masa madre", "Harina", "Croissant"].map((p, i) => (
                  <div key={p} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{p}</span>
                    <span className="text-sm text-muted-foreground">{[42, 28, 15][i]} uds</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}

      {tab === "clientes" && (
        <section className="surface mt-6 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr><th className="px-4 py-3 font-medium">Nombre</th><th className="px-4 py-3 font-medium">Email</th><th className="px-4 py-3 font-medium">País</th><th className="px-4 py-3 font-medium">Compras</th></tr>
            </thead>
            <tbody>
              {clientes.map((c, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-foreground">{c.nombre}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.pais}</td>
                  <td className="px-4 py-3 text-foreground">{c.compras}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
