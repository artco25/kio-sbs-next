#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLUTTER_DIR="$ROOT/apps/flutter"
ADMIN_DIR="$ROOT/admin"
SESSION="$FLUTTER_DIR/lib/services/session.dart"
OUT_DIR="$ADMIN_DIR/public/downloads"

VERSION="${1:-$(grep -m1 'const kAppVersion' "$SESSION" | sed -E "s/.*'([^']+)'.*/\1/")}"
NOTES="${2:-Actualizaciones automáticas: descarga en segundo plano e instalación al reiniciar.}"
ARCHIVE="kio-sbs-pos-linux.tar.gz"
TMP="${TMPDIR:-/tmp}/kio-sbs-release-$VERSION"

if [[ -z "$VERSION" ]]; then
  echo "No se pudo leer la versión de $SESSION" >&2
  exit 1
fi

echo "==> Construyendo KIO SBS POS Linux $VERSION"
(cd "$FLUTTER_DIR" && flutter build linux --release)

BUNDLE="$FLUTTER_DIR/build/linux/x64/release/bundle"
if [[ ! -x "$BUNDLE/kio_sbs" ]]; then
  echo "No se encontró el ejecutable en $BUNDLE" >&2
  exit 1
fi

rm -rf "$TMP"
mkdir -p "$TMP" "$OUT_DIR"
tar -czf "$TMP/$ARCHIVE" -C "$BUNDLE" .
SHA="$(sha256sum "$TMP/$ARCHIVE" | awk '{print $1}')"

cp "$TMP/$ARCHIVE" "$OUT_DIR/$ARCHIVE"
python3 - "$VERSION" "$NOTES" "$SHA" "$ARCHIVE" > "$OUT_DIR/release.json" <<'PY'
import json, sys
version, notes, sha, archive = sys.argv[1:5]
data = {
    "version": version,
    "notes": notes,
    "platforms": {
        "linux": {"url": f"/downloads/{archive}", "file": archive, "sha256": sha},
        "windows": {"url": "", "file": "", "sha256": ""},
    },
}
json.dump(data, sys.stdout, ensure_ascii=False, indent=2)
sys.stdout.write("\n")
PY

echo "==> Publicado $OUT_DIR/$ARCHIVE"
echo "==> Manifiesto $OUT_DIR/release.json (sha256 $SHA)"
