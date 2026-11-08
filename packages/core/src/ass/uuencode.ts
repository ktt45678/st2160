// Ported from libass/ass.c:decode_chars, decode_font, process_fonts_line.
export interface AssEmbeddedFont {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export type AssFontDecodeWarningHandler = (code: string, message: string) => void;

function decodeChars(
  src: string,
  srcOffset: number,
  dst: Uint8Array,
  dstOffset: number,
  cntIn: number,
): number {
  let value = 0;
  for (let i = 0; i < cntIn; i++) {
    const ch = src.charCodeAt(srcOffset + i) & 0xff;
    value |= (((ch - 33) >>> 0) & 63) << (6 * (3 - i));
  }
  let out = dstOffset;
  dst[out++] = (value >>> 16) & 0xff;
  if (cntIn >= 3) {
    dst[out++] = (value >>> 8) & 0xff;
  }
  if (cntIn >= 4) {
    dst[out++] = value & 0xff;
  }
  return out;
}

export function decodeUuencodedFont(
  encoded: string,
  onWarning?: AssFontDecodeWarningHandler,
): Uint8Array | undefined {
  const size = encoded.length;
  const rem = size % 4;
  if (rem === 1) {
    onWarning?.('ass-bad-font-data', 'Bad encoded data size');
    return undefined;
  }
  const dsize = Math.trunc(size / 4) * 3 + Math.max(rem, 1) - 1;
  const buf = new Uint8Array(dsize);
  let p = 0;
  let q = 0;
  const fullGroups = Math.trunc(size / 4);
  for (let i = 0; i < fullGroups; i++, p += 4) {
    q = decodeChars(encoded, p, buf, q, 4);
  }
  if (rem === 2) {
    decodeChars(encoded, p, buf, q, 2);
  } else if (rem === 3) {
    decodeChars(encoded, p, buf, q, 3);
  }
  return buf;
}

export function encodeUuencodedFont(bytes: Uint8Array): string[] {
  const lines: string[] = [];
  let lineChars: number[] = [];
  const total = bytes.length;
  let i = 0;
  while (i < total) {
    const rem = total - i;
    const b0 = bytes[i] as number;
    const b1 = rem >= 2 ? (bytes[i + 1] as number) : 0;
    const b2 = rem >= 3 ? (bytes[i + 2] as number) : 0;
    const value = (b0 << 16) | (b1 << 8) | b2;
    const count = rem >= 3 ? 4 : rem + 1;
    for (let k = 0; k < count; k++) {
      const sixBit = (value >>> (6 * (3 - k))) & 63;
      lineChars.push(sixBit + 33);
      if (lineChars.length === 80) {
        lines.push(String.fromCharCode(...lineChars));
        lineChars = [];
      }
    }
    i += 3;
  }
  if (lineChars.length > 0) {
    lines.push(String.fromCharCode(...lineChars));
  }
  return lines;
}
