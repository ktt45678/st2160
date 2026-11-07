/** One libass `ASS_Image`: an 8-bit coverage mask with one color. */
export interface AssImage {
  readonly width: number;
  readonly height: number;
  readonly stride: number;
  readonly bitmap: Uint8Array;
  /** 0xRRGGBBAA as libass stores it. AA is transparency: 0 is opaque. */
  readonly color: number;
  readonly dstX: number;
  readonly dstY: number;
}

interface Clip {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

function clip(img: AssImage, frameW: number, frameH: number): Clip | undefined {
  const x0 = Math.max(0, img.dstX);
  const y0 = Math.max(0, img.dstY);
  const w = Math.min(frameW, img.dstX + img.width) - x0;
  const h = Math.min(frameH, img.dstY + img.height) - y0;
  return w > 0 && h > 0 ? { x0, y0, w, h } : undefined;
}

/**
 * ffmpeg's `ass` filter on an rgb24 frame (`overlay_ass_image` then `ff_blend_mask`,
 * libavfilter/drawutils.c). Use it to composite candidate masks the way native references are made.
 */
export function blendFfmpegRgb24(
  frame: Uint8Array,
  width: number,
  height: number,
  images: Iterable<AssImage>,
): void {
  for (const img of images) {
    const box = clip(img, width, height);
    if (!box) continue;
    const src = [(img.color >>> 24) & 255, (img.color >>> 16) & 255, (img.color >>> 8) & 255];
    const alpha = Math.floor((0x10307 * (255 - (img.color & 255)) + 3) / 256);
    for (let y = 0; y < box.h; y++) {
      const my = box.y0 + y - img.dstY;
      for (let x = 0; x < box.w; x++) {
        const m = img.bitmap[my * img.stride + box.x0 + x - img.dstX] ?? 0;
        const a = m * alpha;
        const o = 3 * ((box.y0 + y) * width + box.x0 + x);
        for (let k = 0; k < 3; k++) {
          const d = frame[o + k] ?? 0;
          frame[o + k] = Math.floor(((0x1010101 - a) * d + a * (src[k] ?? 0)) / 0x1000000);
        }
      }
    }
  }
}

/**
 * libass `compare` blending (`blend_all`, `blend_image`): starts from transparent black and
 * yields premultiplied RGBA with inverted alpha. Use it for libass-tests PNG references.
 */
export function blendLibassCompare(
  width: number,
  height: number,
  images: Iterable<AssImage>,
): Uint8Array {
  const frame = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) frame[4 * i + 3] = 255;
  const offs = 1 << 22;
  for (const img of images) {
    const box = clip(img, width, height);
    if (!box) continue;
    const r = (img.color >>> 24) & 255;
    const g = (img.color >>> 16) & 255;
    const b = (img.color >>> 8) & 255;
    const mul = 129 * (255 - (img.color & 255));
    for (let y = 0; y < box.h; y++) {
      const my = box.y0 + y - img.dstY;
      for (let x = 0; x < box.w; x++) {
        const k = (img.bitmap[my * img.stride + box.x0 + x - img.dstX] ?? 0) * mul;
        const o = 4 * ((box.y0 + y) * width + box.x0 + x);
        const target = [r, g, b, 0];
        for (let c = 0; c < 4; c++) {
          const d = frame[o + c] ?? 0;
          frame[o + c] = d - (((d - (target[c] ?? 0)) * k + offs) >> 23);
        }
      }
    }
  }
  return frame;
}
