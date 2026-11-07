import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fontPath, readTestFont, testFonts } from '../src/fonts.ts';
import { fontsRoot } from '../src/paths.ts';

describe('test fonts', () => {
  it.each(testFonts().filter((f) => f.storage === 'git'))(
    '$file matches its manifest hash',
    (font) => {
      expect(readTestFont(font.file).length).toBe(font.size);
    },
  );

  it.each(testFonts())('$file has a license file', (font) => {
    expect(existsSync(join(fontsRoot, font.license))).toBe(true);
  });

  it.runIf(testFonts().some((f) => f.storage === 'fetch' && existsSync(fontPath(f))))(
    'fetched fonts match their manifest hash',
    () => {
      for (const font of testFonts().filter(
        (f) => f.storage === 'fetch' && existsSync(fontPath(f)),
      )) {
        expect(readTestFont(font.file).length).toBe(font.size);
      }
    },
  );
});
