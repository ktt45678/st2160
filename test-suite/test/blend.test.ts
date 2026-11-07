import { describe, expect, it } from 'vitest';
import { type AssImage, blendFfmpegRgb24, blendLibassCompare } from '../src/blend.ts';

const mask = (values: number[], color: number, dstX = 0, dstY = 0): AssImage => ({
  width: values.length,
  height: 1,
  stride: values.length,
  bitmap: new Uint8Array(values),
  color,
  dstX,
  dstY,
});

describe('ffmpeg ass blend', () => {
  it('keeps a white mask on black equal to its coverage', () => {
    const values = [0, 1, 64, 128, 200, 255];
    const frame = new Uint8Array(values.length * 3);
    blendFfmpegRgb24(frame, values.length, 1, [mask(values, 0xffffff00)]);
    expect([...frame].filter((_, i) => i % 3 === 0)).toEqual(values);
  });

  it('applies colour alpha and clips to the frame', () => {
    const frame = new Uint8Array(2 * 3);
    blendFfmpegRgb24(frame, 2, 1, [mask([255, 255, 255], 0xff000080, -1)]);
    // alpha 127: (0x10307 * 127 + 3) >> 8 = 32898, times 255, over 2^24.
    expect([...frame]).toEqual([127, 0, 0, 127, 0, 0]);
  });
});

describe('libass compare blend', () => {
  it('produces premultiplied colour with inverted alpha', () => {
    const frame = blendLibassCompare(3, 1, [mask([0, 255, 128], 0xff800000)]);
    expect([...frame]).toEqual([0, 0, 0, 255, 255, 128, 0, 0, 128, 64, 0, 127]);
  });
});
