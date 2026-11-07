import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

export interface Rgba8 {
  readonly width: number;
  readonly height: number;
  /** Straight (not premultiplied) RGBA. */
  readonly data: Uint8Array;
}

export function readPng(path: string): Rgba8 {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

export function writePng(path: string, image: Rgba8): void {
  const png = new PNG({ width: image.width, height: image.height });
  png.data.set(image.data);
  writeFileSync(path, PNG.sync.write(png));
}

/** Opaque RGB to RGBA for viewing or storing ffmpeg references. */
export function rgbToRgba(width: number, height: number, rgb: Uint8Array): Rgba8 {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set(rgb.subarray(3 * i, 3 * i + 3), 4 * i);
    data[4 * i + 3] = 255;
  }
  return { width, height, data };
}
