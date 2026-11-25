# KIO SBS — Windows

El ejecutable de Windows (.exe) se genera con la app Flutter de `apps/flutter`:

```bash
cd ../flutter
flutter build windows --release --dart-define=KIO_API_URL=https://kio-sbs-api.<cuenta>.workers.dev --dart-define=KIO_SYNC_URL=https://kio-sbs-sync.<cuenta>.workers.dev
```

Salida: `apps/flutter/build/windows/x64/runner/Release/`.
