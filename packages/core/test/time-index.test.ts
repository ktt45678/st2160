import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lintFrameLoop } from '../../../scripts/frame-loop-lint.ts';
import { TimeIndex } from '../src/index.ts';

function naiveActive(starts: Float64Array, ends: Float64Array, time: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < starts.length; i++) {
    if ((starts[i] as number) <= time && time < (ends[i] as number)) out.push(i);
  }
  return out;
}

describe('TimeIndex', () => {
  it('passes the frame-loop lint rule', () => {
    const file = fileURLToPath(new URL('../src/timing/time-index.ts', import.meta.url));
    expect(lintFrameLoop([file])).toEqual([]);
  });

  it('handles empty input, zero-length intervals, NaN and exact boundaries', () => {
    const empty = new TimeIndex(new Float64Array(0), new Float64Array(0));
    const buf = new Int32Array(8);
    expect(empty.size).toBe(0);
    expect(empty.maxActive).toBe(0);
    expect(empty.query(0, buf)).toBe(0);

    const starts = new Float64Array([1, 2, 5, 3, Number.NaN]);
    const ends = new Float64Array([4, 2, 3, 6, 10]);
    const index = new TimeIndex(starts, ends);
    expect(index.size).toBe(2);
    expect(index.maxActive).toBe(2);
    expect(index.query(Number.NaN, buf)).toBe(0);

    expect(index.query(0.999, buf)).toBe(0);
    const nStart = index.query(1, buf);
    expect(Array.from(buf.subarray(0, nStart))).toEqual([0]);

    const nOverlap = index.query(3.5, buf);
    expect(Array.from(buf.subarray(0, nOverlap))).toEqual([0, 3]);

    const nEnd = index.query(4, buf);
    expect(Array.from(buf.subarray(0, nEnd))).toEqual([3]);
    expect(index.query(6, buf)).toBe(0);
  });

  it('matches a linear scan across random intervals and respects out capacity', () => {
    const count = 400;
    const starts = new Float64Array(count);
    const ends = new Float64Array(count);
    let seed = 0x12345678;
    const next = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    for (let i = 0; i < count; i++) {
      const s = next() * 500;
      const d = next() * 20;
      starts[i] = s;
      ends[i] = s + d;
    }

    const index = new TimeIndex(starts, ends);
    const out = new Int32Array(index.maxActive);
    for (let t = -5; t <= 525; t += 1.37) {
      const n = index.query(t, out);
      expect(Array.from(out.subarray(0, n))).toEqual(naiveActive(starts, ends, t));
    }

    const tiny = new Int32Array(1);
    const nTiny = index.query(250, tiny);
    expect(nTiny).toBeLessThanOrEqual(1);
  });

  it('queries a 100k-interval index in O(log N + K) time', () => {
    const count = 100_000;
    const starts = new Float64Array(count);
    const ends = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      starts[i] = i;
      ends[i] = i + 3;
    }
    const index = new TimeIndex(starts, ends);
    const out = new Int32Array(index.maxActive);
    const t0 = performance.now();
    for (let q = 0; q < 10_000; q++) {
      const n = index.query((q * 9.7) % count, out);
      if (n > 3) throw new Error('unexpected overlap');
    }
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(200);
  });
});
