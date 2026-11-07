import { describe, expect, it } from 'vitest';
import {
  classify,
  compareImages,
  computeGradient,
  fromOpaqueRgb8,
  fromStraightRgba8,
} from '../src/compare.ts';

function rgb(width: number, height: number, fill: (x: number, y: number) => number) {
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++)
      data.fill(fill(x, y), 3 * (y * width + x), 3 * (y * width + x) + 3);
  }
  return data;
}

describe('compare metric', () => {
  it('uses strict thresholds', () => {
    expect(classify(0)).toBe('SAME');
    expect(classify(1.999)).toBe('GOOD');
    expect(classify(2)).toBe('BAD');
    expect(classify(3.999)).toBe('BAD');
    expect(classify(4)).toBe('FAIL');
  });

  it('grades identical images SAME', () => {
    const img = fromOpaqueRgb8(
      8,
      8,
      rgb(8, 8, (x) => x * 30),
    );
    expect(compareImages(img, img)).toEqual({
      grade: 'SAME',
      maxError: 0,
      diffPixels: 0,
      maxChannelDiff: 0,
    });
  });

  it('grades a one-level change in a flat area at 1.0', () => {
    const ref = fromOpaqueRgb8(
      8,
      8,
      rgb(8, 8, () => 0),
    );
    const cand = fromOpaqueRgb8(
      8,
      8,
      rgb(8, 8, (x, y) => (x === 4 && y === 4 ? 1 : 0)),
    );
    expect(compareImages(ref, cand)).toEqual({
      grade: 'GOOD',
      maxError: 1,
      diffPixels: 1,
      maxChannelDiff: 1,
    });
  });

  it('forgives the same change on a hard edge', () => {
    const ref = fromOpaqueRgb8(
      8,
      8,
      rgb(8, 8, (x) => (x < 4 ? 0 : 255)),
    );
    const cand = fromOpaqueRgb8(
      8,
      8,
      rgb(8, 8, (x, y) => (x === 3 && y === 4 ? 1 : x < 4 ? 0 : 255)),
    );
    // Side neighbour differs by 65535, so the scale is 257 + 65535 / 4.
    expect(compareImages(ref, cand).maxError).toBeCloseTo(257 / (257 + 16383), 12);
  });

  it('treats the outer ring as an edge (calc_grad border)', () => {
    const grad = computeGradient(
      fromOpaqueRgb8(
        4,
        3,
        rgb(4, 3, () => 0),
      ),
    );
    expect([...grad]).toEqual([
      16640, 16640, 16640, 16640, 16640, 257, 257, 16640, 16640, 16640, 16640, 16640,
    ]);
  });

  it('uses diagonal neighbours at half weight', () => {
    const ref = fromOpaqueRgb8(
      3,
      3,
      rgb(3, 3, (x, y) => (x === 0 && y === 0 ? 255 : 0)),
    );
    expect(computeGradient(ref)[4]).toBe(257 + Math.floor(65535 / 8));
  });

  it('converts straight alpha like read_png', () => {
    const img = fromStraightRgba8(
      3,
      1,
      new Uint8Array([255, 255, 255, 255, 9, 9, 9, 0, 255, 0, 0, 128]),
    );
    expect([...img.data]).toEqual([
      65535,
      65535,
      65535,
      0,
      0,
      0,
      0,
      65535,
      128 * 257,
      0,
      0,
      127 * 257,
    ]);
  });

  it('rejects size mismatches', () => {
    const a = fromOpaqueRgb8(2, 2, new Uint8Array(12));
    const b = fromOpaqueRgb8(2, 1, new Uint8Array(6));
    expect(() => compareImages(a, b)).toThrow(/size mismatch/);
  });
});
