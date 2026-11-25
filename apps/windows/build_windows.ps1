# Construye el instalador de KIO SBS POS para Windows.
# Ejecutar en PowerShell en una máquina Windows con Flutter + Visual Studio (Desktop) + Inno Setup 6.
# Uso:
#   powershell -ExecutionPolicy Bypass -File .\apps\windows\build_windows.ps1
param(
  [string]$ApiUrl = "https://kio-sbs-backend.rmolina1529.workers.dev",
  [string]$SyncUrl = "https://kio-sbs-sync.rmolina1529.workers.dev"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$flutter = Join-Path $root "apps\flutter"
$iss = Join-Path $PSScriptRoot "installer.iss"
$iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"

Write-Host "==> Flutter build windows (release)" -ForegroundColor Cyan
Push-Location $flutter
flutter pub get
flutter build windows --release --dart-define=KIO_API_URL=$ApiUrl --dart-define=KIO_SYNC_URL=$SyncUrl
Pop-Location

if (!(Test-Path $iscc)) { throw "No se encontró Inno Setup 6 en $iscc. Instálalo desde https://jrsoftware.org/isinfo.php" }
Write-Host "==> Generando instalador con Inno Setup" -ForegroundColor Cyan
& $iscc "/DAppVersion=0.1.0" "/DSourceDir=$flutter\build\windows\x64\runner\Release" "/DOutputDir=$PSScriptRoot\dist" $iss
Write-Host "==> Instalador listo en apps\windows\dist\" -ForegroundColor Green
