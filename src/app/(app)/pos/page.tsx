"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Product = { id: number; name: string; price: number; tax_rate: number; unit: string; category_name?: string };
type CartItem = Product & { qty: number };
type Session = { id: number; terminal: string; status: string; opened_at: string };

const fmt = (n: number) => n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const terminal = "POS-WEB-1";

  async function load() {
    const [p, s] = await Promise.all([
      api<{ products: Product[] }>("/api/pos/products"),
      api<{ session: Session | null }>(`/api/pos/sessions/current?terminal=${encodeURIComponent(terminal)}`),
    ]);
    setProducts(p.products);
    setSession(s.session);
  }

  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const subtotal = useMemo(() => cart.reduce((a, i) => a + i.price * i.qty, 0), [cart]);
  const tax = useMemo(() => cart.reduce((a, i) => a + i.price * i.qty * (i.tax_rate ?? 0.19), 0), [cart]);
  const total = subtotal + tax;

  function add(p: Product) {
    setCart((prev) => {
      const f = prev.find((x) => x.id === p.id);
      if (f) return prev.map((x) => (x.id === p.id ? { ...x, qty: x.qty + 1 } : x));
      return [...prev, { ...p, qty: 1 }];
    });
  }
  function qty(id: number, delta: number) {
    setCart((prev) => prev.map((x) => (x.id === id ? { ...x, qty: Math.max(1, x.qty + delta) } : x)));
  }
  function remove(id: number) { setCart((prev) => prev.filter((x) => x.id !== id)); }

  async function openSession() {
    setError(""); setMsg("");
    try {
      const data = await api<{ session: Session }>("/api/pos/sessions/open", { method: "POST", body: JSON.stringify({ terminal, opening_cash: 0 }) });
      setSession(data.session); setMsg("Sesión abierta");
    } catch (e: any) { setError(e.message); }
  }
  async function closeSession() {
    if (!session) return;
    setError(""); setMsg("");
    try {
      await api(`/api/pos/sessions/${session.id}/close`, { method: "POST", body: JSON.stringify({ closing_cash: 0, notes: "Cierre desde POS web" }) });
      setSession(null); setMsg("Sesión cerrada");
    } catch (e: any) { setError(e.message); }
  }
  async function checkout() {
    if (!session) return setError("Abre una sesión POS antes de vender.");
    if (!cart.length) return setError("El carrito está vacío.");
    setLoading(true); setError(""); setMsg("");
    try {
      await api("/api/pos/sales", {
        method: "POST",
        body: JSON.stringify({
          session_id: session.id,
          discount_total: 0,
          items: cart.map((i) => ({ product_id: i.id, name: i.name, qty: i.qty, unit_price: i.price, tax_rate: i.tax_rate })),
          payments: [{ method: paymentMethod, amount: total }],
        }),
      });
      setCart([]); setMsg(`Venta registrada (${paymentMethod}) por ${fmt(total)}`);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand-600">POS Web</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Punto de venta</h1>
          <p className="mt-1 text-sm text-muted-foreground">Terminal {terminal} · {session ? `Sesión #${session.id} abierta` : "Sin sesión abierta"}</p>
        </div>
        <div className="flex gap-2">
          {!session ? <button onClick={openSession} className="pill-brand">Abrir sesión</button> : <button onClick={closeSession} className="rounded-pill border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cerrar sesión</button>}
        </div>
      </div>

      {msg && <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">{msg}</p>}
      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_380px]">
        <section className="surface p-6">
          <h2 className="text-sm font-semibold text-foreground">Productos</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <button key={p.id} onClick={() => add(p)} className="rounded-2xl border border-border bg-background p-4 text-left transition hover:border-brand-300 hover:shadow-card">
                <p className="text-xs text-muted-foreground">{p.category_name || "Sin categoría"}</p>
                <p className="mt-1 font-medium text-foreground">{p.name}</p>
                <p className="mt-2 text-sm text-brand-600">{fmt(p.price)} / {p.unit}</p>
              </button>
            ))}
          </div>
        </section>

        <aside className="surface p-6">
          <h2 className="text-sm font-semibold text-foreground">Carrito</h2>
          <div className="mt-4 space-y-3">
            {cart.length === 0 && <p className="text-sm text-muted-foreground">Agrega productos para iniciar una venta.</p>}
            {cart.map((i) => (
              <div key={i.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="text-sm font-medium text-foreground">{i.name}</p><p className="text-xs text-muted-foreground">{fmt(i.price)} x {i.qty}</p></div>
                  <button onClick={() => remove(i.id)} className="text-xs text-muted-foreground hover:text-foreground">Quitar</button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => qty(i.id, -1)} className="h-7 w-7 rounded-lg border border-border">-</button>
                  <span className="text-sm">{i.qty}</span>
                  <button onClick={() => qty(i.id, 1)} className="h-7 w-7 rounded-lg border border-border">+</button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>IVA (19%)</span><span>{fmt(tax)}</span></div>
            <div className="flex justify-between font-semibold text-foreground"><span>Total</span><span>{fmt(total)}</span></div>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Pago</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm">
              <option>Efectivo</option><option>Nequi</option><option>Tarjeta</option>
            </select>
          </div>

          <button onClick={checkout} disabled={loading} className="pill-brand mt-4 w-full justify-center disabled:opacity-60">{loading ? "Registrando..." : "Cobrar"}</button>
        </aside>
      </div>
    </div>
  );
}
