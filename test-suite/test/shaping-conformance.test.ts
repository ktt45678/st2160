import { describe, expect, it } from 'vitest';
import {
  type ConformanceShaper,
  classifyShaping,
  matchCount,
  runConformance,
} from '../src/shaping/conformance.ts';
import { fuzzTexts, shapingSuites } from '../src/shaping/corpus.ts';
import { harfbuzzReference } from '../src/shaping/harfbuzz-reference.ts';

const latin = shapingSuites.filter((s) => s.name === 'latin');

describe('shaping conformance runner', () => {
  it('classifies the first difference that matters', () => {
    const g = [1, 0, 500, 0, 0, 0] as const;
    expect(classifyShaping([g], [g])).toBe('match');
    expect(classifyShaping([g], [])).toBe('glyph-count');
    expect(classifyShaping([[2, 0, 500, 0, 0, 0]], [g])).toBe('glyph-id');
    expect(classifyShaping([[1, 1, 500, 0, 0, 0]], [g])).toBe('cluster');
    expect(classifyShaping([[1, 0, 499, 0, 0, 0]], [g])).toBe('position');
  });

  it('generates the same fuzz corpus every run', () => {
    const suite = shapingSuites[0];
    if (!suite) throw new Error('no suites');
    expect(fuzzTexts(suite)).toEqual(fuzzTexts(suite));
    expect(fuzzTexts(suite)).toHaveLength(suite.fuzz.count);
  });

  it('matches the reference against itself', () => {
    for (const row of runConformance(harfbuzzReference, harfbuzzReference, { suites: latin })) {
      expect(matchCount(row)).toBe(row.total);
    }
  });

  it('counts a shaper that throws as an error, not a crash', () => {
    const broken: ConformanceShaper = {
      name: 'broken',
      version: '0',
      loadFont: () => () => {
        throw new Error('not implemented');
      },
    };
    const [row] = runConformance(broken, harfbuzzReference, { suites: latin });
    expect(row?.counts['curated:error']).toBe(latin[0]?.texts.length);
    expect(row && matchCount(row)).toBe(0);
  });
});
