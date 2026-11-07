import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FfmpegPin } from './ffmpeg.ts';
import { repoRoot } from './paths.ts';

export interface Pins {
  readonly ffmpeg: FfmpegPin;
  readonly assets: { readonly 'libass-tests': { readonly repo: string; readonly commit: string } };
}

export function readPins(): Pins {
  return JSON.parse(readFileSync(join(repoRoot, 'pins.json'), 'utf8')) as Pins;
}
