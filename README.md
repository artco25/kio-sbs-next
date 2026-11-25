# KIO SBS — Frontend

Clientes de **KIO SBS** (*Small Business Solution*) que consumen el backend
[`kio-sbs-bac`](https://github.com/artco25/kio-sbs-bac) (2 workers Express + GraphQL sobre Cloudflare D1).

| Carpeta | Qué es | Plataforma |
|---|---|---|
| [`admin/`](admin) | Administración web: Vite + React + Tailwind + Lucide, acceso por suite, roles por empresa y auto-registro | Cloudflare (Worker de archivos estáticos) |
| [`apps/flutter/`](apps/flutter) | App offline-first con SQLite local y sincronización cada 90 s: caja POS, cartera, nómina… | Windows · Linux · Android · iOS |

Paleta índigo `#1E1B4B · #4338CA · #6366F1 · #A5B4FC · #E0E7FF · #F8FAFF`, íconos Lucide.

## Inicio rápido

```bash
# 1. Backend (en el repo kio-sbs-bac): npm run dev:api  y  npm run dev:sync  (puertos 8797 / 8798)
# 2. Admin web
cd admin && npm install && cp .env.example .env.local && npm run dev
# 3. App Flutter
cd apps/flutter && flutter pub get && flutter run -d linux
```

Despliegue en Cloudflare y variables: ver [`admin/README.md`](admin/README.md) y el README del backend.
