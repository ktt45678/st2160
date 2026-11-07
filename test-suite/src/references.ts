// Native reference store: `name.ass`, `name-NNNN.png` (time in ms) and one refs.json per directory.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type FfmpegPin, ffmpegPin, renderWithLibass } from './ffmpeg.ts';
import { rgbToRgba, writePng } from './png.ts';

export interface ReferenceCase {
  readonly width: number;
  readonly height: number;
  readonly fonts: readonly string[];
  readonly timesMs: readonly number[];
}

export interface RefsFile {
  readonly ffmpeg: FfmpegPin;
  readonly cases: Readonly<Record<string, ReferenceCase>>;
}

export function readRefs(dir: string): RefsFile {
  const path = join(dir, 'refs.json');
  if (!existsSync(path)) throw new Error(`${path} is missing`);
  return JSON.parse(readFileSync(path, 'utf8')) as RefsFile;
}

/** Why references in `dir` are stale, or undefined when they match the pinned ffmpeg. */
export function refsPinProblem(dir: string): string | undefined {
  const recorded = readRefs(dir).ffmpeg;
  const pinned = ffmpegPin();
  return JSON.stringify(recorded) === JSON.stringify(pinned)
    ? undefined
    : `${dir}/refs.json was made with ffmpeg ${recorded.version}, pins.json has ${pinned.version}`;
}

export const framePath = (dir: string, name: string, timeMs: number): string =>
  join(dir, `${name}-${String(timeMs).padStart(4, '0')}.png`);

/** Renders `dir/name.ass` with native libass, writes its PNGs and records the case in refs.json. */
export function writeReference(dir: string, name: string, refCase: ReferenceCase): void {
  const run = renderWithLibass({ script: join(dir, `${name}.ass`), ...refCase });
  run.frames.forEach((frame, i) => {
    const time = refCase.timesMs[i] ?? 0;
    writePng(framePath(dir, name, time), rgbToRgba(refCase.width, refCase.height, frame));
  });
  const refs = existsSync(join(dir, 'refs.json')) ? readRefs(dir) : { cases: {} };
  const cases = { ...refs.cases, [name]: refCase };
  const sorted = Object.fromEntries(Object.entries(cases).sort(([a], [b]) => a.localeCompare(b)));
  const next: RefsFile = { ffmpeg: ffmpegPin(), cases: sorted };
  writeFileSync(join(dir, 'refs.json'), `${JSON.stringify(next, null, 2)}\n`);
}
