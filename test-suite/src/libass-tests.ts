// The libass/libass-tests regression corpus, laid out for libass `compare` (pinned in pins.json).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { libassTestsRoot } from './paths.ts';

export interface CorpusFrame {
  readonly timeMs: number;
  readonly png: string;
}

export interface CorpusCase {
  readonly group: string;
  readonly name: string;
  readonly script: string;
  /** Reference PNGs are rendered at `scale` times the PNG size, then box-filtered down. */
  readonly scaleX: number;
  readonly scaleY: number;
  readonly frames: readonly CorpusFrame[];
  /** Absolute font paths; compare loads every font in the group directory. */
  readonly fonts: readonly string[];
}

const fontExt = /\.(ttf|otf|ttc|otc|pfb|pfa)$/i;

/** Without git symlink support a symlinked font is a short file holding its target path. */
function resolveFont(path: string): string {
  if (statSync(path).size > 255) return path;
  const target = readFileSync(path, 'utf8').trim();
  const resolved = resolve(dirname(path), target);
  if (!existsSync(resolved)) throw new Error(`${path}: broken font link to ${target}`);
  return resolved;
}

function parseScale(dir: string): [number, number] {
  const file = join(dir, 'scale');
  if (!existsSync(file)) return [1, 1];
  const m = /^(\d+)(?:x(\d+))?$/.exec(readFileSync(file, 'utf8').trim());
  if (!m) throw new Error(`${file}: expected N or NxM`);
  return [Number(m[1]), Number(m[2] ?? m[1])];
}

/** Lists corpus cases, sorted by group and name. Run scripts/fetch-test-assets.ts first. */
export function libassTestsCorpus(): CorpusCase[] {
  const root = join(libassTestsRoot, 'regression');
  if (!existsSync(root)) {
    throw new Error(`${root} is missing. Run: node scripts/fetch-test-assets.ts`);
  }
  const cases: CorpusCase[] = [];
  const groups = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();
  for (const group of groups) {
    const dir = join(root, group);
    const files = readdirSync(dir).sort();
    const [scaleX, scaleY] = parseScale(dir);
    const fonts = files.filter((f) => fontExt.test(f)).map((f) => resolveFont(join(dir, f)));
    for (const file of files.filter((f) => f.endsWith('.ass'))) {
      const name = file.slice(0, -4);
      const frames = files
        .filter((f) => f.startsWith(`${name}-`) && /^\d+\.png$/.test(f.slice(name.length + 1)))
        .map((f) => ({ timeMs: Number.parseInt(f.slice(name.length + 1), 10), png: join(dir, f) }))
        .sort((a, b) => a.timeMs - b.timeMs);
      cases.push({ group, name, script: join(dir, file), scaleX, scaleY, frames, fonts });
    }
  }
  return cases;
}
