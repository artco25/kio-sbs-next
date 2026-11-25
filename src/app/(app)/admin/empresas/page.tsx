"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Company = { id: number; name: string; slug: string; is_main: number; created_at: string };

export default function EmpresasPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isMain, setIsMain] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const data = await api<{ companies: Company[] }>("/api/admin/companies");
    setCompanies(data.companies);
  }

  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await api("/api/admin/companies", { method: "POST", body: JSON.stringify({ name, slug, is_main: isMain }) });
      setName(""); setSlug(""); setIsMain(false);
      await load();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand-600">Admin</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Empresas</h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
        <form onSubmit={create} className="surface p-6">
          <h2 className="text-sm font-semibold text-foreground">Crear empresa</h2>
          <div className="mt-4 space-y-3">
            <input className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
            <input className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" placeholder="Slug (ej. artix)" value={slug} onChange={(e) => setSlug(e.target.value)} required />
            <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={isMain} onChange={(e) => setIsMain(e.target.checked)} /> Empresa principal</label>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button disabled={loading} className="pill-brand w-full justify-center disabled:opacity-60">{loading ? "Guardando..." : "Crear empresa"}</button>
          </div>
        </form>

        <div className="surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr><th className="px-4 py-3 font-medium">Nombre</th><th className="px-4 py-3 font-medium">Slug</th><th className="px-4 py-3 font-medium">Principal</th></tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.slug}</td>
                  <td className="px-4 py-3">{c.is_main ? <span className="rounded-full bg-brand-100 px-2 py-1 text-xs text-brand-700">Principal</span> : <span className="text-muted-foreground">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
