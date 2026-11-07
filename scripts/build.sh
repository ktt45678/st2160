#!/usr/bin/env bash
# Usage: scripts/build.sh
# Builds every package: TypeScript project references first, then the Angular library.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

pnpm exec tsc --build
pnpm --filter @st2160/angular-workspace run build
