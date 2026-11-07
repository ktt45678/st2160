import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { libassTestsCorpus } from '../src/libass-tests.ts';
import { libassTestsRoot } from '../src/paths.ts';
import { readPng } from '../src/png.ts';

describe.runIf(existsSync(libassTestsRoot))('libass-tests corpus', () => {
  it('lists every script with its frames and resolved fonts', () => {
    const cases = libassTestsCorpus();
    expect(cases.length).toBeGreaterThan(30);
    expect(cases.flatMap((c) => c.frames).length).toBeGreaterThan(100);
    for (const c of cases) for (const f of c.fonts) expect(existsSync(f)).toBe(true);
    expect(cases.find((c) => c.group === 'blurs-anamorphic')).toMatchObject({
      scaleX: 8,
      scaleY: 1,
    });
  });

  it('reads reference PNGs', () => {
    const frame = libassTestsCorpus().find((c) => c.frames.length > 0)?.frames[0];
    const png = readPng(frame?.png ?? '');
    expect(png.width * png.height * 4).toBe(png.data.length);
  });
});
