import { HTML_ENTITY_DATA } from './html-entities-data.js';
import type { Cursor } from './vtt-settings.js';

let entityMap: Map<string, string> | null = null;
let maxEntityLength = 0;

function getEntityMap(): Map<string, string> {
  if (entityMap !== null) return entityMap;
  const map = new Map<string, string>();
  let max = 0;
  for (const item of HTML_ENTITY_DATA.split(',')) {
    const colon = item.indexOf(':');
    const name = item.slice(0, colon);
    const points = item
      .slice(colon + 1)
      .split('+')
      .map((hex) => Number.parseInt(hex, 16));
    map.set(name, String.fromCodePoint(...points));
    if (name.length > max) max = name.length;
  }
  entityMap = map;
  maxEntityLength = max;
  return map;
}

const CP1252_REPLACEMENTS: Readonly<Record<number, number>> = {
  128: 0x20ac,
  130: 0x201a,
  131: 0x0192,
  132: 0x201e,
  133: 0x2026,
  134: 0x2020,
  135: 0x2021,
  136: 0x02c6,
  137: 0x2030,
  138: 0x0160,
  139: 0x2039,
  140: 0x0152,
  142: 0x017d,
  145: 0x2018,
  146: 0x2019,
  147: 0x201c,
  148: 0x201d,
  149: 0x2022,
  150: 0x2013,
  151: 0x2014,
  152: 0x02dc,
  153: 0x2122,
  154: 0x0161,
  155: 0x203a,
  156: 0x0153,
  158: 0x017e,
  159: 0x0178,
};

function isAsciiAlnum(c: number): boolean {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
}

function isHexDigit(c: number): boolean {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);
}

function decodeNumericCode(code: number): string {
  const mapped = CP1252_REPLACEMENTS[code];
  if (mapped !== undefined) return String.fromCodePoint(mapped);
  if (code === 0x00 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '\uFFFD';
  return String.fromCodePoint(code);
}

/** Consumes an HTML character reference after `&` at `cursor.pos`, or returns `'&'`. */
export function consumeHtmlEntity(cursor: Cursor, additionalAllowed = -1): string {
  const { input } = cursor;
  const start = cursor.pos;
  if (start >= input.length) return '&';
  const first = input.charCodeAt(start);
  if (
    first === 0x09 ||
    first === 0x0a ||
    first === 0x0c ||
    first === 0x20 ||
    first === 0x3c ||
    first === 0x26 ||
    first === additionalAllowed
  ) {
    return '&';
  }
  if (first === 0x23) {
    let p = start + 1;
    let hex = false;
    if (p < input.length && (input.charCodeAt(p) === 0x78 || input.charCodeAt(p) === 0x58)) {
      hex = true;
      p++;
    }
    const digitStart = p;
    while (
      p < input.length &&
      (hex
        ? isHexDigit(input.charCodeAt(p))
        : input.charCodeAt(p) >= 0x30 && input.charCodeAt(p) <= 0x39)
    ) {
      p++;
    }
    if (p === digitStart) return '&';
    const raw = input.slice(digitStart, p);
    if (p < input.length && input.charCodeAt(p) === 0x3b) p++;
    cursor.pos = p;
    const code = Number.parseInt(raw, hex ? 16 : 10);
    return decodeNumericCode(code);
  }
  const map = getEntityMap();
  const limit = Math.min(input.length, start + maxEntityLength);
  let bestEnd = -1;
  let bestVal = '';
  for (let end = start + 1; end <= limit; end++) {
    const ch = input.charCodeAt(end - 1);
    if (!isAsciiAlnum(ch) && ch !== 0x3b) break;
    const sub = input.slice(start, end);
    const val = map.get(sub);
    if (val !== undefined) {
      bestEnd = end;
      bestVal = val;
    }
    if (ch === 0x3b) break;
  }
  if (bestEnd === -1) return '&';
  cursor.pos = bestEnd;
  return bestVal;
}

/** Unescapes HTML character references in an arbitrary string. */
export function decodeHtmlEntities(text: string): string {
  if (text.indexOf('&') === -1) return text;
  let out = '';
  const cursor: Cursor = { input: text, pos: 0 };
  while (cursor.pos < text.length) {
    const amp = text.indexOf('&', cursor.pos);
    if (amp === -1) {
      out += text.slice(cursor.pos);
      break;
    }
    if (amp > cursor.pos) out += text.slice(cursor.pos, amp);
    cursor.pos = amp + 1;
    out += consumeHtmlEntity(cursor);
  }
  return out;
}
