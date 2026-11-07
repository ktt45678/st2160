// Native libass references through ffmpeg's `ass` filter.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareFontsDir, testFont } from './fonts.ts';
import { readPins } from './pins.ts';

export interface FfmpegPin {
  readonly version: string;
  readonly libass: string;
  readonly freetype: string;
  readonly harfbuzz: string;
  readonly fribidi: string;
  readonly build: string;
}

export function ffmpegPin(): FfmpegPin {
  const { version, libass, freetype, harfbuzz, fribidi, build } = readPins().ffmpeg;
  return { version, libass, freetype, harfbuzz, fribidi, build };
}

const ffmpegBin = process.env['ST2160_FFMPEG'] ?? 'ffmpeg';

/** Why the local ffmpeg cannot make references, or undefined when it matches pins.json. */
export function ffmpegProblem(): string | undefined {
  const run = spawnSync(ffmpegBin, ['-version'], { encoding: 'utf8' });
  if (run.error || run.status !== 0) return `ffmpeg not runnable (${ffmpegBin})`;
  const first = run.stdout.split('\n')[0] ?? '';
  const pin = ffmpegPin();
  if (!first.includes(`ffmpeg version ${pin.version} `)) {
    return `ffmpeg is "${first.trim()}", pins.json expects ${pin.version}`;
  }
  return undefined;
}

export interface LibassRun {
  /** One opaque rgb24 frame per requested time. */
  readonly frames: Uint8Array[];
  /** `Added subtitle file` counts. libass counts its built-in Default style too. */
  readonly styles: number;
  readonly events: number;
  /** `fontselect` lines: requested (family, weight, italic) and chosen PostScript name. */
  readonly fontSelections: readonly { request: string; chosen: string }[];
}

export interface LibassRenderOptions {
  readonly script: string;
  readonly fonts: readonly string[];
  readonly width: number;
  readonly height: number;
  readonly timesMs: readonly number[];
  readonly background?: 'black' | 'white';
  /** Allow fonts outside `fonts` (system fallback). Never set for parity references. */
  readonly allowFallback?: boolean;
}

/** Renders a script with native libass, refusing setups that would give misleading references. */
export function renderWithLibass(options: LibassRenderOptions): LibassRun {
  const problem = ffmpegProblem();
  if (problem) throw new Error(problem);
  const text = readFileSync(options.script, 'utf8');
  if (!/^YCbCr Matrix:\s*None\s*$/im.test(text)) {
    throw new Error(
      `${options.script}: add "YCbCr Matrix: None", or ffmpeg draws in limited range`,
    );
  }
  const dir = mkdtempSync(join(tmpdir(), 'st2160-ref-'));
  try {
    copyFileSync(options.script, join(dir, 'script.ass'));
    prepareFontsDir(options.fonts, join(dir, 'fonts'));
    const frames: Uint8Array[] = [];
    let log = '';
    for (const t of options.timesMs) {
      const run = runFfmpeg(dir, options, t);
      frames.push(run.frame);
      log ||= run.log;
    }
    const added = /Added subtitle file: .* \((\d+) styles, (\d+) events\)/.exec(log);
    const fontSelections = [...log.matchAll(/fontselect: \((.*)\) -> ([^,]+),/g)].map((m) => ({
      request: m[1] ?? '',
      chosen: m[2] ?? '',
    }));
    if (!options.allowFallback) checkFonts(options, log, fontSelections);
    return {
      frames,
      styles: Number(added?.[1] ?? Number.NaN),
      events: Number(added?.[2] ?? Number.NaN),
      fontSelections,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runFfmpeg(
  dir: string,
  options: LibassRenderOptions,
  timeMs: number,
): { frame: Uint8Array; log: string } {
  const size = `${options.width}x${options.height}`;
  const bg = options.background ?? 'black';
  // The filter renders libass at the frame pts, so move the single frame to the requested ms.
  const filter = `format=rgb24,settb=1/1000,setpts=${timeMs},ass=filename=script.ass:fontsdir=fonts`;
  const run = spawnSync(
    ffmpegBin,
    [
      ...['-v', 'verbose', '-f', 'lavfi', '-i', `color=c=${bg}:s=${size}:d=1:r=1`],
      ...['-vf', filter, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    ],
    { cwd: dir, maxBuffer: 1 << 28 },
  );
  const log = run.stderr.toString('utf8');
  if (run.status !== 0) throw new Error(`ffmpeg failed:\n${log.slice(-2000)}`);
  const expected = options.width * options.height * 3;
  if (run.stdout.length !== expected) {
    throw new Error(`ffmpeg returned ${run.stdout.length} bytes, expected ${expected}`);
  }
  const commit = /libass source: .*commit: ([0-9a-f]+)/.exec(log)?.[1] ?? '';
  if (!commit.startsWith(ffmpegPin().libass)) {
    throw new Error(`libass commit ${commit}, pins.json expects ${ffmpegPin().libass}`);
  }
  return { frame: new Uint8Array(run.stdout), log };
}

function checkFonts(
  options: LibassRenderOptions,
  log: string,
  selections: readonly { request: string; chosen: string }[],
): void {
  const missing = /Glyph 0x[0-9A-F]+ not found[^\n]*/.exec(log);
  if (missing) throw new Error(`libass fell back to another font: ${missing[0]}`);
  const allowed = new Set(options.fonts.map((f) => testFont(f).postScriptName));
  for (const s of selections) {
    if (!allowed.has(s.chosen)) {
      throw new Error(`libass chose ${s.chosen} for (${s.request}), not one of the fixture fonts`);
    }
  }
}

/** Style and event counts as native libass parses them. */
export function libassTrackCounts(
  script: string,
  fonts: readonly string[] = [],
): { styles: number; events: number } {
  const run = renderWithLibass({
    script,
    fonts,
    width: 16,
    height: 16,
    timesMs: [0],
    allowFallback: true,
  });
  return { styles: run.styles, events: run.events };
}
