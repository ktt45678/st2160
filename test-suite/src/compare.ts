// Port of the libass `compare` metric (compare/compare.c, libass 2a8a567).
// Images are 16-bit RGBA, premultiplied, with inverted alpha (0 = opaque), as compare.c uses.

export type Grade = 'SAME' | 'GOOD' | 'BAD' | 'FAIL';

export interface Image16 {
  readonly width: number;
  readonly height: number;
  readonly data: Uint16Array;
}

export interface CompareResult {
  readonly grade: Grade;
  readonly maxError: number;
  readonly diffPixels: number;
  /** Largest per-channel difference in 8-bit levels. */
  readonly maxChannelDiff: number;
}

/** `classify_result`: thresholds are strict. */
export function classify(error: number): Grade {
  if (error === 0) return 'SAME';
  if (error < 2) return 'GOOD';
  if (error < 4) return 'BAD';
  return 'FAIL';
}

/** Straight-alpha 8-bit RGBA (a PNG) to compare.c's internal form (`read_png`, depth < 16). */
export function fromStraightRgba8(width: number, height: number, rgba: Uint8Array): Image16 {
  const data = new Uint16Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const a = rgba[4 * i + 3] ?? 0;
    for (let k = 0; k < 3; k++) {
      const ca = (rgba[4 * i + k] ?? 0) * a;
      data[4 * i + k] = 257 * ((ca + (ca >> 8) + 128) >> 8);
    }
    data[4 * i + 3] = 257 * (255 - a);
  }
  return { width, height, data };
}

/** Premultiplied 8-bit RGBA with normal alpha (st2160 canvas output). */
export function fromPremultipliedRgba8(width: number, height: number, rgba: Uint8Array): Image16 {
  const data = new Uint16Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    for (let k = 0; k < 3; k++) data[4 * i + k] = 257 * (rgba[4 * i + k] ?? 0);
    data[4 * i + 3] = 257 * (255 - (rgba[4 * i + 3] ?? 0));
  }
  return { width, height, data };
}

/** Opaque 8-bit RGB (an ffmpeg composite). */
export function fromOpaqueRgb8(width: number, height: number, rgb: Uint8Array): Image16 {
  const data = new Uint16Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    for (let k = 0; k < 3; k++) data[4 * i + k] = 257 * (rgb[3 * i + k] ?? 0);
  }
  return { width, height, data };
}

function absDiff4(a: Uint16Array, i: number, b: Uint16Array, j: number): number {
  let res = 0;
  for (let k = 0; k < 4; k++) res = Math.max(res, Math.abs((a[i + k] ?? 0) - (b[j + k] ?? 0)));
  return res;
}

/** `calc_grad`: error visibility scale per pixel of the reference. */
export function computeGradient(target: Image16): Uint16Array {
  const { width: w, height: h, data } = target;
  const base = 257;
  const border = base + Math.floor(65535 / 4);
  const grad = new Uint16Array(w * h).fill(border);
  const stride = 4 * w;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const t = y * stride + 4 * x;
      const gg = Math.max(
        Math.floor(absDiff4(data, t, data, t - 4) / 4),
        Math.floor(absDiff4(data, t, data, t + 4) / 4),
        Math.floor(absDiff4(data, t, data, t - stride) / 4),
        Math.floor(absDiff4(data, t, data, t + stride) / 4),
        Math.floor(absDiff4(data, t, data, t - stride - 4) / 8),
        Math.floor(absDiff4(data, t, data, t - stride + 4) / 8),
        Math.floor(absDiff4(data, t, data, t + stride - 4) / 8),
        Math.floor(absDiff4(data, t, data, t + stride + 4) / 8),
      );
      grad[y * w + x] = base + gg;
    }
  }
  return grad;
}

/** `compare1`: max over pixels of channel difference divided by the reference gradient. */
export function compareImages(
  target: Image16,
  candidate: Image16,
  grad = computeGradient(target),
): CompareResult {
  if (target.width !== candidate.width || target.height !== candidate.height) {
    throw new Error(
      `size mismatch: reference ${target.width}x${target.height}, candidate ${candidate.width}x${candidate.height}`,
    );
  }
  let maxError = 0;
  let diffPixels = 0;
  let maxChannelDiff = 0;
  for (let i = 0; i < target.width * target.height; i++) {
    const diff = absDiff4(candidate.data, 4 * i, target.data, 4 * i);
    if (diff === 0) continue;
    diffPixels++;
    maxChannelDiff = Math.max(maxChannelDiff, Math.round(diff / 257));
    maxError = Math.max(maxError, diff / (grad[i] ?? 1));
  }
  return { grade: classify(maxError), maxError, diffPixels, maxChannelDiff };
}
