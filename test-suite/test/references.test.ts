import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compareImages, fromOpaqueRgb8, fromStraightRgba8 } from '../src/compare.ts';
import { ffmpegProblem, renderWithLibass } from '../src/ffmpeg.ts';
import { suiteRoot } from '../src/paths.ts';
import { readPng } from '../src/png.ts';
import { framePath, readRefs, refsPinProblem } from '../src/references.ts';

const renderDir = join(suiteRoot, 'fixtures', 'render');
const ffmpegReady = ffmpegProblem() === undefined;

describe('render references', () => {
  it('were made with the pinned ffmpeg', () => {
    expect(refsPinProblem(renderDir)).toBeUndefined();
  });

  it('list a PNG for every case and time', () => {
    for (const [name, refCase] of Object.entries(readRefs(renderDir).cases)) {
      for (const t of refCase.timesMs) {
        const png = readPng(framePath(renderDir, name, t));
        expect([png.width, png.height]).toEqual([refCase.width, refCase.height]);
      }
    }
  });
});

// Needs the ffmpeg build from pins.json; other machines only check the stored files.
describe.runIf(ffmpegReady)('native libass via ffmpeg', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'st2160-refs-test-'));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  it('reproduces the stored references exactly', () => {
    for (const [name, refCase] of Object.entries(readRefs(renderDir).cases)) {
      const run = renderWithLibass({ script: join(renderDir, `${name}.ass`), ...refCase });
      run.frames.forEach((frame, i) => {
        const png = readPng(framePath(renderDir, name, refCase.timesMs[i] ?? 0));
        const stored = fromStraightRgba8(png.width, png.height, png.data);
        const fresh = fromOpaqueRgb8(refCase.width, refCase.height, frame);
        expect(compareImages(stored, fresh).grade).toBe('SAME');
      });
      expect([run.styles, run.events]).toEqual([2, 1]);
    }
  });

  it('renders at the requested time, with the end time exclusive', () => {
    const run = renderWithLibass({
      script: join(renderDir, 'lato-kerning-off.ass'),
      fonts: ['Lato-Regular.ttf'],
      width: 640,
      height: 200,
      timesMs: [4999, 5000],
    });
    expect(run.frames[0]?.some((v) => v > 0)).toBe(true);
    expect(run.frames[1]?.some((v) => v > 0)).toBe(false);
  });

  it('refuses scripts without YCbCr Matrix: None', () => {
    const script = join(scratch, 'tv-range.ass');
    const text = readFileSync(join(renderDir, 'lato-kerning-off.ass'), 'utf8');
    writeFileSync(script, text.replace(/^YCbCr Matrix: None\r?\n/m, ''));
    expect(() =>
      renderWithLibass({
        script,
        fonts: ['Lato-Regular.ttf'],
        width: 64,
        height: 64,
        timesMs: [0],
      }),
    ).toThrow(/YCbCr Matrix/);
  });

  it('refuses system font fallback', () => {
    expect(() =>
      renderWithLibass({
        script: join(renderDir, 'lato-kerning-off.ass'),
        fonts: ['NotoSansHebrew-Regular.ttf'],
        width: 64,
        height: 64,
        timesMs: [0],
      }),
    ).toThrow(/libass chose|fell back/);
  });
});
