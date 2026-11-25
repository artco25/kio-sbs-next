# KIO SBS — Windows (POS / Terminal)

El ejecutable de Windows se genera desde la app Flutter (`apps/flutter`).

## Requisitos (máquina Windows)
- Flutter SDK con soporte Windows desktop (`flutter doctor`)
- Visual Studio con "Desktop development with C++"
- [Inno Setup 6](https://jrsoftware.org/isinfo.php) (para el instalador)

## Generar instalador

```powershell
powershell -ExecutionPolicy Bypass -File .\apps\windows\build_windows.ps1
```

Parámetros opcionales:
```powershell
.\apps\windows\build_windows.ps1 `
  -ApiUrl "https://kio-sbs-backend.rmolina1529.workers.dev" `
  -SyncUrl "https://kio-sbs-sync.rmolina1529.workers.dev"
```

Salida:
- Build: `apps/flutter/build/windows/x64/runner/Release/`
- Instalador: `apps/windows/dist/KIO-SBS-POS-Setup-0.1.0.exe`

## Solo build (sin instalador)

```powershell
cd apps/flutter
flutter build windows --release `
  --dart-define=KIO_API_URL=https://kio-sbs-backend.rmolina1529.workers.dev `
  --dart-define=KIO_SYNC_URL=https://kio-sbs-sync.rmolina1529.workers.dev
```

> Nota: la compilación Windows no se puede hacer cross-compile desde Linux/macOS; debe ejecutarse en Windows.
