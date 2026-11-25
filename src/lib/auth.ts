export type AuthUser = {
  id: string;
  company_id: string;
  company_name: string;
  name: string;
  email: string;
  role: "admin" | "contador" | "cajero" | "vendedor";
  active: boolean;
};

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("kio_user");
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthUser; } catch { return null; }
}

export function setSession(token: string, user: AuthUser) {
  localStorage.setItem("kio_token", token);
  localStorage.setItem("kio_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("kio_token");
  localStorage.removeItem("kio_user");
}
