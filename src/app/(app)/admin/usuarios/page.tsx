"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Company = { id: number; name: string };
type User = { id: number; company_id: number; company_name: string; name: string; email: string; role: string; active: number };

export default function UsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState({ company_id: "", name: "", email: "", password: "", role: "user" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const [u, c] = await Promise.all([
      api<{ users: User[] }>("/api/admin/users"),
      api<{ companies: Company[] }>("/api/admin/companies"),
    ]);
    setUsers(u.users);
    setCompanies(c.companies);
    if (!form.company_id && c.companies[0]) setForm((f) => ({ ...f, company_id: String(c.companies[0].id) }));
  }

  useEffect(() => { load().catch((e) => setError((e instanceof Error ? e.message : "Error"))); }, []); // eslint-disable-line

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await api("/api/admin/users", { method: "POST", body: JSON.stringify({ ...form, company_id: Number(form.company_id) }) });
      setForm((f) => ({ ...f, name: "", email: "", password: "", role: "user" }));
      await load();
    } catch (err) { setError((err instanceof Error ? err.message : "Error")); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand-600">Admin</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Usuarios</h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
        <form onSubmit={create} className="surface p-6">
          <h2 className="text-sm font-semibold text-foreground">Crear usuario</h2>
          <div className="mt-4 space-y-3">
            <select className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })} required>
              <option value="">Empresa</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <input className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" placeholder="Contraseña" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <select className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="user">Usuario</option>
              <option value="admin">Admin</option>
            </select>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button disabled={loading} className="pill-brand w-full justify-center disabled:opacity-60">{loading ? "Guardando..." : "Crear usuario"}</button>
          </div>
        </form>

        <div className="surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr><th className="px-4 py-3 font-medium">Nombre</th><th className="px-4 py-3 font-medium">Email</th><th className="px-4 py-3 font-medium">Empresa</th><th className="px-4 py-3 font-medium">Rol</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-foreground">{u.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.company_name}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-muted px-2 py-1 text-xs text-foreground">{u.role}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
