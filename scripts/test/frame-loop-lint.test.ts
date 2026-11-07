import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lintFrameLoop } from '../frame-loop-lint.ts';

const fixture = fileURLToPath(new URL('./fixtures/frame-loop/bad.ts', import.meta.url));

describe('frame-loop-lint', () => {
  const diagnostics = lintFrameLoop([fixture]);
  const messages = diagnostics.map((d) => `${d.line} ${d.message}`);

  it('flags every forbidden construct in a tagged function', () => {
    expect(messages).toEqual([
      '12 allocation: new',
      '13 allocation: array literal',
      '14 allocation: object literal',
      '15 banned method: map()',
      '15 banned method: from()',
      '15 closure or nested function',
      '16 string work: template literal',
      '17 string work: concatenation',
      '18 allocation: array literal',
      '18 allocation: spread',
      '19 calls helper, which is not tagged @frameLoop',
    ]);
  });

  it('accepts loops, typed-array fill, Math, tagged calls and ignored lines', () => {
    expect(diagnostics.filter((d) => d.line >= 23)).toEqual([]);
  });
});
