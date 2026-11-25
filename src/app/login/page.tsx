"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { gql } from "@/lib/api";
import { setSession, type AuthUser } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { login } = await gql<{
        login: { token: string; me: { user: { id: string; name: string; email: string; role: AuthUser["role"]; active: boolean }; company: { id: string; name: string } } };
      }>(
        `mutation($e: String!, $p: String!) { login(email: $e, password: $p) { token me { user { id name email role active } company { id name } } } }`,
        { e: email, p: password },
      );
      const { user, company } = login.me;
      setSession(login.token, { ...user, company_id: company.id, company_name: company.name });
      router.replace("/");
    } catch (err: any) {
      setError(err.message || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto flex min-h-[80vh] max-w-6xl items-center justify-center">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-border bg-card shadow-float md:grid-cols-2">
          <div className="p-10 md:p-12">
            <Image src="/brand/artix_logo.svg" alt="KIO" width={140} height={40} className="h-10 w-auto" />
            <p className="mt-8 text-xs font-medium uppercase tracking-[0.2em] text-brand-600">KIO SBS</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Ingresar a KIO SBS</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Accede con tu usuario para administrar empresas, usuarios y operaciones.</p>
            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Email</label>
                <input className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none ring-ring focus:ring-2" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Contraseña</label>
                <input className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none ring-ring focus:ring-2" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button disabled={loading} className="pill-brand w-full justify-center disabled:opacity-60">{loading ? "Ingresando..." : "Ingresar"}</button>
            </form>
          </div>
          <div className="hidden bg-[linear-gradient(160deg,#08313a_0%,#0b0f14_55%,#151b24_100%)] p-12 text-white md:flex md:flex-col md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-brand-200">Plataforma SBS</p>
              <h2 className="mt-3 text-3xl font-light tracking-tight">Control simple, visual y centralizado.</h2>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-white/70">KIO SBS · Small Business Solution</p>
              <p className="mt-1 font-medium">Comercial · Punto de venta · Financiero · Personal y nómina</p>
              <p className="mt-2 text-sm text-white/60">Las cuentas se crean desde Usuarios y roles.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
