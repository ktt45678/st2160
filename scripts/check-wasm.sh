#!/usr/bin/env bash
# Usage: scripts/check-wasm.sh
# Fails if any package other than shaper-harfbuzz ships or references WebAssembly (AGENTS.md rule).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

allowed="packages/shaper-harfbuzz"
found=()

while IFS= read -r -d '' file; do
  found+=("$file")
done < <(find packages test-suite -path '*/node_modules' -prune -o -path "$allowed" -prune \
  -o -type f -name '*.wasm' -print0)

while IFS= read -r file; do
  found+=("$file")
done < <(grep -rlE '\.wasm\b|WebAssembly\.' packages \
  --include='*.ts' --include='*.js' --include='*.mjs' --include='*.json' \
  --exclude-dir=node_modules --exclude-dir=.angular --exclude-dir=out-tsc \
  | grep -v "^$allowed/" || true)

if ((${#found[@]} > 0)); then
  echo "check-wasm: WebAssembly found outside $allowed:" >&2
  printf '  %s\n' "${found[@]}" >&2
  exit 1
fi
echo "check-wasm: clean"
