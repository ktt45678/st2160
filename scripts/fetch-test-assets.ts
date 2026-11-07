// Usage: node scripts/fetch-test-assets.ts
// Downloads test assets that are too large or unlicensed for git into test-suite/.cache.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fontPath, readTestFont, sha256, testFonts } from '../test-suite/src/fonts.ts';
import { cacheRoot, libassTestsRoot } from '../test-suite/src/paths.ts';
import { readPins } from '../test-suite/src/pins.ts';

async function fetchFonts(): Promise<void> {
  for (const font of testFonts().filter((f) => f.storage === 'fetch')) {
    const path = fontPath(font);
    if (existsSync(path)) {
      readTestFont(font.file);
      console.log(`ok ${font.file}`);
      continue;
    }
    const res = await fetch(font.source);
    if (!res.ok) throw new Error(`${font.source}: HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const hash = sha256(bytes);
    if (hash !== font.sha256)
      throw new Error(`${font.file}: sha256 ${hash}, expected ${font.sha256}`);
    mkdirSync(join(cacheRoot, 'fonts'), { recursive: true });
    writeFileSync(path, bytes);
    console.log(`fetched ${font.file}`);
  }
}

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function fetchLibassTests(): void {
  const { repo, commit } = readPins().assets['libass-tests'];
  if (!existsSync(join(libassTestsRoot, '.git'))) {
    mkdirSync(libassTestsRoot, { recursive: true });
    git(['init', '-q'], libassTestsRoot);
    git(['remote', 'add', 'origin', repo], libassTestsRoot);
  }
  const head = existsSync(join(libassTestsRoot, 'run.sh'))
    ? git(['rev-parse', 'HEAD'], libassTestsRoot).trim()
    : '';
  if (head !== commit) {
    git(['fetch', '-q', '--depth', '1', 'origin', commit], libassTestsRoot);
    git(['-c', 'advice.detachedHead=false', 'checkout', '-q', '--force', commit], libassTestsRoot);
  }
  console.log(`ok libass-tests ${commit.slice(0, 12)}`);
}

await fetchFonts();
fetchLibassTests();
