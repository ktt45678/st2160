# st2160

Subtitle engine for HTML5 video, written in TypeScript. It renders ASS/SSA with libass parity on the GPU, and SRT and WebVTT as accessible captions.

Status: early development. Nothing is published yet.

## Packages

| Package | Purpose |
| --- | --- |
| `@st2160/core` | Engine: ASS worker renderer, SRT/WebVTT, video sync, font selection |
| `@st2160/text` | Font reader, shaper and BiDi, no runtime dependencies |
| `@st2160/angular` | Angular directive and providers (Angular 22+) |
| `@st2160/element` | `<st2160-overlay>` custom element |
| `@st2160/videojs` | Video.js 10 integration |
| `@st2160/shaper-harfbuzz` | Opt-in HarfBuzz (WASM) fallback shaper |
| `@st2160/font-index` | CLI that builds font catalog indexes |

## Development

Requirements: Node 24.15 or newer, pnpm 10 (`packageManager` in `package.json`), Git Bash on Windows.

```sh
pnpm install
pnpm exec playwright install chromium firefox webkit
pnpm check          # lint, build, type-check, rules, all tests
pnpm build          # build every package
pnpm test:node      # unit tests in Node
pnpm test:browser   # browser tests in Chromium, Firefox and WebKit
```

Rules checked by `pnpm check`:

- No WebAssembly outside `@st2160/shaper-harfbuzz` (`scripts/check-wasm.sh`).
- Functions tagged `/** @frameLoop */` must not allocate, create closures, build strings, use array methods or call untagged functions of our own (`scripts/frame-loop-lint.ts`).

Pinned versions: npm packages in the `catalog` of `pnpm-workspace.yaml`, everything else in `pins.json`.

## License

MIT. Ported code and its original licenses are listed in `THIRD_PARTY_NOTICES.md`.
