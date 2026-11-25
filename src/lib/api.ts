export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8797";

function authHeaders(extra?: HeadersInit) {
  const token = typeof window !== "undefined" ? localStorage.getItem("kio_token") : null;
  const headers = new Headers(extra || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

/** Cliente GraphQL del worker kio-sbs-api (POST /graphql). */
export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const headers = authHeaders({ "Content-Type": "application/json" });
  const res = await fetch(`${API_URL}/graphql`, { method: "POST", headers, body: JSON.stringify({ query, variables }), cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message: string; extensions?: { code?: string } }[] };
  if (body.errors?.length) {
    const err = new Error(body.errors[0].message) as Error & { code?: string };
    err.code = body.errors[0].extensions?.code;
    throw err;
  }
  if (!res.ok || !body.data) throw new Error("Error de solicitud");
  return body.data;
}

/**
 * Cliente REST del prototipo anterior. Los endpoints /api/* ya no existen en el backend v2
 * (GraphQL); las páginas que aún lo usan (POS web, admin) deben migrarse a gql().
 */
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = authHeaders(options.headers);
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  const res = await fetch(`${API_URL}${path}`, { ...options, headers, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Esta sección aún no está migrada a la API GraphQL");
  return data as T;
}
