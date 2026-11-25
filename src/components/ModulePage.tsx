"use client";

import { useState } from "react";
import { SUBMODULES } from "@/components/AppShell";

export default function ModulePage({ moduleKey, title, description, kpis, content }: {
  moduleKey: string;
  title: string;
  description: string;
  kpis?: { label: string; value: string; hint?: string }[];
  content?: React.ReactNode;
}) {
  const subs = SUBMODULES[moduleKey] || [];
  const [active, setActive] = useState(subs[0]?.key || "");
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand-600">Módulo</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>

      {subs.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2 border-b border-border pb-2">
          {subs.map((s) => (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${active === s.key ? "bg-primary text-primary-foreground shadow-card" : "text-muted-foreground hover:bg-muted"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {kpis && kpis.length > 0 && (
        <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
            <article key={k.label} className="surface p-6">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{k.label}</p>
              <p className="mt-3 text-3xl font-light tracking-tight text-foreground">{k.value}</p>
              {k.hint && <p className="mt-2 text-sm text-brand-600">{k.hint}</p>}
            </article>
          ))}
        </div>
      )}

      <div className="mt-6">{content || <div className="surface p-8 text-sm text-muted-foreground">Contenido del submódulo: <span className="font-medium text-foreground">{subs.find((s) => s.key === active)?.label}</span></div>}</div>
    </div>
  );
}
