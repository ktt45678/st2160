#!/usr/bin/env bash
# Usage: scripts/check.sh [--no-browser]
# Everything CI runs: lint, build, type-check tests, WASM and frame-loop rules, all tests.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

browser=1
for arg in "$@"; do
  case "$arg" in
    --no-browser) browser=0 ;;
    *)
      echo "check: unknown argument $arg" >&2
      exit 2
      ;;
  esac
done

step() { printf '\n== %s\n' "$1"; }

step "lint"
pnpm exec biome ci .

step "build"
bash scripts/build.sh

step "type-check tests"
pnpm exec tsc -p tsconfig.test.json

step "wasm rule"
bash scripts/check-wasm.sh

step "frame-loop rule"
node scripts/frame-loop-lint.ts

step "tests (node)"
pnpm exec vitest run --project node

if ((browser)); then
  step "tests (browser)"
  pnpm exec vitest run --project 'browser*'
fi

step "tests (angular)"
pnpm --filter @st2160/angular-workspace run test

printf '\ncheck: all passed\n'
