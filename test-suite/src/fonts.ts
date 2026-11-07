import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cacheRoot, fontsRoot } from './paths.ts';

export interface TestFont {
  readonly file: string;
  /** Microsoft name ID 1, the name libass matches. Instanced fonts keep names like "... Thin". */
  readonly family: string;
  readonly postScriptName: string;
  readonly size: number;
  readonly sha256: string;
  /** `git`: checked in under fonts/files. `fetch`: downloaded into .cache/fonts. */
  readonly storage: 'git' | 'fetch';
  readonly source: string;
  readonly license: string;
}

interface FontManifest {
  readonly version: 1;
  readonly fonts: readonly TestFont[];
}

let manifest: FontManifest | undefined;

export function testFonts(): readonly TestFont[] {
  manifest ??= JSON.parse(readFileSync(join(fontsRoot, 'manifest.json'), 'utf8')) as FontManifest;
  return manifest.fonts;
}

export function testFont(file: string): TestFont {
  const font = testFonts().find((f) => f.file === file);
  if (!font) throw new Error(`test font ${file} is not in fonts/manifest.json`);
  return font;
}

export function fontPath(font: TestFont): string {
  return font.storage === 'git'
    ? join(fontsRoot, 'files', font.file)
    : join(cacheRoot, 'fonts', font.file);
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Reads a test font and checks its hash, so a changed or missing file fails loudly. */
export function readTestFont(file: string): Uint8Array {
  const font = testFont(file);
  const path = fontPath(font);
  if (!existsSync(path)) {
    throw new Error(`${path} is missing. Run: node scripts/fetch-test-assets.ts`);
  }
  const bytes = new Uint8Array(readFileSync(path));
  const hash = sha256(bytes);
  if (hash !== font.sha256) throw new Error(`${file}: sha256 ${hash}, expected ${font.sha256}`);
  return bytes;
}

/** Copies the given fonts into `dir`, which then holds fonts only (libass loads every file). */
export function prepareFontsDir(files: readonly string[], dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const file of files) {
    readTestFont(file);
    copyFileSync(fontPath(testFont(file)), join(dir, file));
  }
}
