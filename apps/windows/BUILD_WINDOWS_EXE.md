# Generar instalador .exe — KIO SBS POS (Windows)

Esta guía genera el instalador de **KIO SBS POS** para Windows desde la app Flutter del repo.

> ⚠️ **Importante:** la compilación de Windows **no** se puede hacer desde Linux/macOS. Debe ejecutarse en una PC con **Windows 10/11 (64-bit)**.

## 1) Requisitos (instalar una sola vez)

1. **Git**  
   https://git-scm.com/download/win

2. **Flutter SDK** (stable) con soporte Windows desktop  
   https://docs.flutter.dev/get-started/install/windows/desktop  
   Verifica:
   ```powershell
   flutter doctor
   ```
   Debe aparecer ✓ en “Windows Version (Installed version of Windows...)”.

3. **Visual Studio 2022** (Community sirve)  
   https://visualstudio.microsoft.com/downloads/  
   En el instalador selecciona la carga de trabajo:  
   **“Desktop development with C++”** (incluye MSVC, Windows SDK, CMake).

4. **Inno Setup 6** (para crear el instalador .exe)  
   https://jrsoftware.org/isdl.php  
   Instala con opciones por defecto (la ruta esperada es `C:\Program Files (x86)\Inno Setup 6\ISCC.exe`).

## 2) Obtener el código

```powershell
git clone https://github.com/artco25/kio-sbs-next.git
cd kio-sbs-next
```

## 3) Generar el instalador (recomendado)

Ejecuta el script incluido (compila Flutter release + genera el instalador):

```powershell
powershell -ExecutionPolicy Bypass -File .\apps\windows\build_windows.ps1
```

Por defecto usa las URLs de producción:
- API: `https://kio-sbs-backend.rmolina1529.workers.dev`
- Sync: `https://kio-sbs-sync.rmolina1529.workers.dev`

Para apuntar a otro backend:

```powershell
powershell -ExecutionPolicy Bypass -File .\apps\windows\build_windows.ps1 `
  -ApiUrl "https://TU-API.workers.dev" `
  -SyncUrl "https://TU-SYNC.workers.dev"
```

### Salida

- **Instalador:** `apps\windows\dist\KIO-SBS-POS-Setup-0.1.0.exe`
- **Build suelto:** `apps\flutter\build\windows\x64\runner\Release\`

Ese `.exe` es el que distribuyes a los equipos POS (instala en `Archivos de programa\KIO SBS POS` y crea acceso directo opcional).

## 4) Alternativa: solo compilar (sin instalador)

Si solo quieres la carpeta ejecutable:

```powershell
cd apps\flutter
flutter pub get
flutter build windows --release `
  --dart-define=KIO_API_URL=https://kio-sbs-backend.rmolina1529.workers.dev `
  --dart-define=KIO_SYNC_URL=https://kio-sbs-sync.rmolina1529.workers.dev
```

Ejecutable: `apps\flutter\build\windows\x64\runner\Release\kio_sbs.exe`  
(para distribuir, copia **toda** la carpeta `Release`, no solo el .exe).

## 5) Probar antes de entregar

1. Ejecuta el instalador en la PC destino.
2. Abre **KIO SBS POS**.
3. En el login, si hace falta, toca “Configurar servidores” y verifica las URLs.
4. Inicia sesión con un usuario de prueba (ej. `admin@artix.co`).
5. Verifica: abrir caja, agregar productos, cobrar, y que el indicador de sync muestre estado (se pausa tras 5 min sin actividad para ahorrar peticiones).

## 6) Problemas comunes

| Problema | Solución |
|---|---|
| `flutter doctor` marca falta Visual Studio C++ | Reinstala VS con la carga “Desktop development with C++”. |
| `ISCC.exe` no encontrado | Instala Inno Setup 6 o edita la ruta `$iscc` en `apps/windows/build_windows.ps1`. |
| El .exe abre pero no conecta | Revisa `Configurar servidores` en login; las URLs deben ser HTTPS y accesibles. |
| Antivirus bloquea el instalador | Normal en instaladores nuevos sin firma de código; firma el .exe con un certificado Authenticode para distribución masiva. |
| Quiero cambiar icono/nombre | Actualiza assets/branding en Flutter y regenera; para el instalador edita `apps/windows/installer.iss`. |

## 7) Notas de release

- **Modo offline:** la app guarda en SQLite local y sincroniza cada 90s cuando hay actividad; sin actividad se pausa (ahorro de cuota Cloudflare).
- **Builds:** cada vez que cambies código, sube versión en `apps/flutter/pubspec.yaml` (`version: x.y.z+build`) y en `installer.iss`/script si quieres reflejarlo en el nombre del instalador.
