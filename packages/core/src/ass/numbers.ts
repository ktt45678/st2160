import { isAssSpace } from './strtod.js';

export function skipSpaces(str: string, pos = 0): number {
  let p = pos;
  while (p < str.length) {
    const c = str.charCodeAt(p);
    if (c !== 0x20 && c !== 0x09) break;
    p++;
  }
  return p;
}

export function rskipSpaces(str: string, endPos: number, limit = 0): number {
  let p = endPos;
  while (p > limit) {
    const c = str.charCodeAt(p - 1);
    if (c !== 0x20 && c !== 0x09) break;
    p--;
  }
  return p;
}

export function assStrcasecmp(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  let i = 0;
  while (i < len1 && i < len2) {
    let a = s1.charCodeAt(i);
    let b = s2.charCodeAt(i);
    if (a >= 0x41 && a <= 0x5a) a += 0x20;
    if (b >= 0x41 && b <= 0x5a) b += 0x20;
    if (a !== b) return a - b;
    i++;
  }
  const a = i < len1 ? s1.charCodeAt(i) : 0;
  const b = i < len2 ? s2.charCodeAt(i) : 0;
  return a - b;
}

export function assStrncasecmp(s1: string, s2: string, n: number, offset1 = 0): number {
  if (n <= 0) return 0;
  const len1 = s1.length;
  const len2 = s2.length;
  for (let i = 0; i < n; i++) {
    let a = offset1 + i < len1 ? s1.charCodeAt(offset1 + i) : 0;
    let b = i < len2 ? s2.charCodeAt(i) : 0;
    if (a >= 0x41 && a <= 0x5a) a += 0x20;
    if (b >= 0x41 && b <= 0x5a) b += 0x20;
    if (a === 0 || a !== b) return a - b;
  }
  return 0;
}

export interface IntParseResult {
  readonly ok: boolean;
  readonly value: number;
  readonly nextPos: number;
}

function readDigits(str: string, pos: number, base: number): IntParseResult {
  const start = pos;
  const maxDecimal = Math.min(base, 10) + 0x30;
  const maxLower = base - 10 + 0x61;
  const maxUpper = base - 10 + 0x41;
  let val = 0;
  let p = pos;
  while (p < str.length) {
    const c = str.charCodeAt(p);
    let digit: number;
    if (c >= 0x30 && c < maxDecimal) {
      digit = c - 0x30;
    } else if (c >= 0x61 && c < maxLower) {
      digit = c - 0x61 + 10;
    } else if (c >= 0x41 && c < maxUpper) {
      digit = c - 0x41 + 10;
    } else {
      break;
    }
    val = (Math.imul(val, base) + digit) >>> 0;
    p++;
  }
  return { ok: p !== start, value: val >>> 0, nextPos: p };
}

// Ported from libass/ass.c:mystrtou32_modulo.
export function mystrtou32Modulo(str: string, startPos: number, base: number): IntParseResult {
  let p = skipSpaces(str, startPos);
  let sign = 1;
  if (p < str.length && str.charCodeAt(p) === 0x2b) {
    p++;
  } else if (p < str.length && str.charCodeAt(p) === 0x2d) {
    sign = -1;
    p++;
  }

  if (base === 16 && assStrncasecmp(str, '0x', 2, p) === 0) {
    p += 2;
  }

  const digits = readDigits(str, p, base);
  if (digits.ok) {
    const value = Math.imul(digits.value, sign) >>> 0;
    return { ok: true, value, nextPos: digits.nextPos };
  }
  return { ok: false, value: 0, nextPos: startPos };
}

const INT64_MAX = 9223372036854775807n;
const INT64_MIN = -9223372036854775808n;
const INT32_MAX = 0x7fffffff;
const INT32_MIN = -0x80000000;

interface StrtollResult {
  readonly ok: boolean;
  readonly value: bigint;
  readonly nextPos: number;
}

function parseStrtoll(str: string, startPos: number, baseArg: number): StrtollResult {
  const len = str.length;
  let p = startPos;
  while (p < len && isAssSpace(str.charCodeAt(p))) {
    p++;
  }

  let neg = false;
  if (p < len && str.charCodeAt(p) === 0x2d) {
    neg = true;
    p++;
  } else if (p < len && str.charCodeAt(p) === 0x2b) {
    p++;
  }

  let base = baseArg;
  const prefixStart = p;
  let sawZeroPrefix = false;
  if ((base === 0 || base === 16) && p + 1 < len && str.charCodeAt(p) === 0x30) {
    const x = str.charCodeAt(p + 1);
    if (x === 0x78 || x === 0x58) {
      sawZeroPrefix = true;
      p += 2;
      base = 16;
    }
  }
  if (base === 0) {
    base = p < len && str.charCodeAt(p) === 0x30 ? 8 : 10;
  }

  const digitStart = p;
  const maxDecimal = Math.min(base, 10) + 0x30;
  const maxLower = base - 10 + 0x61;
  const maxUpper = base - 10 + 0x41;
  const bigBase = BigInt(base);
  let acc = 0n;
  let overflow = false;

  while (p < len) {
    const c = str.charCodeAt(p);
    let digit: number;
    if (c >= 0x30 && c < maxDecimal) {
      digit = c - 0x30;
    } else if (c >= 0x61 && c < maxLower) {
      digit = c - 0x61 + 10;
    } else if (c >= 0x41 && c < maxUpper) {
      digit = c - 0x41 + 10;
    } else {
      break;
    }
    if (!overflow) {
      acc = acc * bigBase + BigInt(digit);
      if (neg ? -acc < INT64_MIN : acc > INT64_MAX) {
        overflow = true;
      }
    }
    p++;
  }

  if (p === digitStart) {
    if (sawZeroPrefix) {
      return { ok: true, value: 0n, nextPos: prefixStart + 1 };
    }
    return { ok: false, value: 0n, nextPos: startPos };
  }

  if (overflow) {
    return { ok: true, value: neg ? INT64_MIN : INT64_MAX, nextPos: p };
  }
  return { ok: true, value: neg ? -acc : acc, nextPos: p };
}

// Ported from libass/ass_utils.h:mystrtoi32.
export function mystrtoi32(str: string, startPos: number, base: number): IntParseResult {
  const res = parseStrtoll(str, startPos, base);
  if (!res.ok) {
    return { ok: false, value: 0, nextPos: startPos };
  }
  let clamped: number;
  if (res.value > BigInt(INT32_MAX)) {
    clamped = INT32_MAX;
  } else if (res.value < BigInt(INT32_MIN)) {
    clamped = INT32_MIN;
  } else {
    clamped = Number(res.value) | 0;
  }
  return { ok: true, value: clamped, nextPos: res.nextPos };
}

// Ported from libass/ass.c:parse_int_header.
export function parseIntHeader(str: string, startPos = 0): number {
  let p = startPos;
  let base = 10;
  if (assStrncasecmp(str, '&h', 2, p) === 0 || assStrncasecmp(str, '0x', 2, p) === 0) {
    p += 2;
    base = 16;
  }
  return mystrtou32Modulo(str, p, base).value | 0;
}

export function assBswap32(x: number): number {
  return (
    (((x & 0x000000ff) << 24) |
      ((x & 0x0000ff00) << 8) |
      ((x & 0x00ff0000) >>> 8) |
      ((x & 0xff000000) >>> 24)) >>>
    0
  );
}

// Ported from libass/ass.c:parse_color_header.
export function parseColorHeader(str: string, startPos = 0): number {
  const color = parseIntHeader(str, startPos) >>> 0;
  return assBswap32(color);
}

// Ported from libass/ass.c:parse_bool.
export function parseBool(str: string, startPos = 0): number {
  const p = skipSpaces(str, startPos);
  if (assStrncasecmp(str, 'yes', 3, p) === 0) {
    return 1;
  }
  return parseStrtoll(str, p, 10).value > 0n ? 1 : 0;
}

function scanSignedInt32(str: string, startPos: number): IntParseResult {
  const len = str.length;
  let p = startPos;
  while (p < len && isAssSpace(str.charCodeAt(p))) {
    p++;
  }
  let sign = 1;
  if (p < len && str.charCodeAt(p) === 0x2d) {
    sign = -1;
    p++;
  } else if (p < len && str.charCodeAt(p) === 0x2b) {
    p++;
  }
  const digitStart = p;
  let val = 0;
  while (p < len) {
    const c = str.charCodeAt(p);
    if (c < 0x30 || c > 0x39) break;
    val = (Math.imul(val, 10) + (c - 0x30)) | 0;
    p++;
  }
  if (p === digitStart) {
    return { ok: false, value: 0, nextPos: startPos };
  }
  return { ok: true, value: Math.imul(val, sign) | 0, nextPos: p };
}

export interface TimecodeParseResult {
  readonly ok: boolean;
  readonly ms: number;
}

// Ported from libass/ass.c:string2timecode.
export function string2timecode(str: string, startPos = 0): TimecodeParseResult {
  const h = scanSignedInt32(str, startPos);
  if (!h.ok || h.nextPos >= str.length || str.charCodeAt(h.nextPos) !== 0x3a) {
    return { ok: false, ms: 0 };
  }
  const m = scanSignedInt32(str, h.nextPos + 1);
  if (!m.ok || m.nextPos >= str.length || str.charCodeAt(m.nextPos) !== 0x3a) {
    return { ok: false, ms: 0 };
  }
  const s = scanSignedInt32(str, m.nextPos + 1);
  if (!s.ok || s.nextPos >= str.length || str.charCodeAt(s.nextPos) !== 0x2e) {
    return { ok: false, ms: 0 };
  }
  const cs = scanSignedInt32(str, s.nextPos + 1);
  if (!cs.ok) {
    return { ok: false, ms: 0 };
  }
  const tm = ((h.value * 60 + m.value) * 60 + s.value) * 1000 + cs.value * 10;
  return { ok: true, ms: tm };
}

// Ported from libass/ass_utils.h:numpad2align.
export function numpad2align(valArg: number): number {
  let val = valArg | 0;
  if (val < -INT32_MAX) {
    val = 2;
  } else if (val < 0) {
    val = -val;
  }
  let res = (((val - 1) % 3) + 1) | 0;
  if (val <= 3) {
    res |= 0;
  } else if (val <= 6) {
    res |= 8;
  } else {
    res |= 4;
  }
  return res;
}
