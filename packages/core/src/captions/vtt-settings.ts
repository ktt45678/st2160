// Ported from the W3C WebVTT spec, sections 6.2 and 6.3, with media-captions (MIT) as a reference.
import type { CaptionCue, CaptionRegion } from './cue.js';

/** Shared read position for the collect algorithms. */
export interface Cursor {
  input: string;
  pos: number;
}

export function isAsciiWhitespace(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0c || c === 0x0d;
}

function isDigit(c: number): boolean {
  return c >= 0x30 && c <= 0x39;
}

export function skipWhitespace(cursor: Cursor): void {
  while (
    cursor.pos < cursor.input.length &&
    isAsciiWhitespace(cursor.input.charCodeAt(cursor.pos))
  ) {
    cursor.pos++;
  }
}

function collectDigits(cursor: Cursor): string {
  const from = cursor.pos;
  while (cursor.pos < cursor.input.length && isDigit(cursor.input.charCodeAt(cursor.pos))) {
    cursor.pos++;
  }
  return cursor.input.slice(from, cursor.pos);
}

function at(cursor: Cursor, char: number): boolean {
  return cursor.pos < cursor.input.length && cursor.input.charCodeAt(cursor.pos) === char;
}

/** Collect a WebVTT timestamp. Returns seconds, or -1 on failure. */
export function collectTimestamp(cursor: Cursor): number {
  if (cursor.pos >= cursor.input.length || !isDigit(cursor.input.charCodeAt(cursor.pos))) return -1;
  let digits = collectDigits(cursor);
  let value1 = Number.parseInt(digits, 10);
  const hours = digits.length !== 2 || value1 > 59;
  if (!at(cursor, 0x3a)) return -1;
  cursor.pos++;
  digits = collectDigits(cursor);
  if (digits.length !== 2) return -1;
  let value2 = Number.parseInt(digits, 10);
  let value3: number;
  if (hours || at(cursor, 0x3a)) {
    if (!at(cursor, 0x3a)) return -1;
    cursor.pos++;
    digits = collectDigits(cursor);
    if (digits.length !== 2) return -1;
    value3 = Number.parseInt(digits, 10);
  } else {
    value3 = value2;
    value2 = value1;
    value1 = 0;
  }
  if (!at(cursor, 0x2e)) return -1;
  cursor.pos++;
  digits = collectDigits(cursor);
  if (digits.length !== 3) return -1;
  const value4 = Number.parseInt(digits, 10);
  if (value2 > 59 || value3 > 59) return -1;
  return value1 * 3600 + value2 * 60 + value3 + value4 / 1000;
}

/** Parses a whole string as a timestamp with nothing after it. Returns -1 on failure. */
export function parseTimestamp(input: string): number {
  const cursor: Cursor = { input, pos: 0 };
  const time = collectTimestamp(cursor);
  return time >= 0 && cursor.pos === input.length ? time : -1;
}

const PERCENTAGE = /^\d+(?:\.\d+)?%$/;

/** Parse a percentage string. Returns 0..100, or -1 on failure. */
export function parsePercentage(input: string): number {
  if (!PERCENTAGE.test(input)) return -1;
  const value = Number.parseFloat(input);
  return value >= 0 && value <= 100 ? value : -1;
}

export function splitOnSpaces(input: string): string[] {
  const tokens: string[] = [];
  let from = -1;
  for (let i = 0; i <= input.length; i++) {
    const space = i === input.length || isAsciiWhitespace(input.charCodeAt(i));
    if (space) {
      if (from >= 0) tokens.push(input.slice(from, i));
      from = -1;
    } else if (from < 0) {
      from = i;
    }
  }
  return tokens;
}

/** `name:value` with a non-empty name and value, else null. */
function splitSetting(setting: string): [string, string] | null {
  const colon = setting.indexOf(':');
  if (colon <= 0 || colon === setting.length - 1) return null;
  return [setting.slice(0, colon), setting.slice(colon + 1)];
}

function splitComma(value: string): [string, string | null] {
  const comma = value.indexOf(',');
  return comma < 0 ? [value, null] : [value.slice(0, comma), value.slice(comma + 1)];
}

const LINE_NUMBER = /^-?\d+(?:\.\d+)?$/;

function parseLinePosition(linepos: string): number | null {
  if (!/\d/.test(linepos)) return null;
  if (linepos.endsWith('%')) {
    const value = parsePercentage(linepos);
    return value < 0 ? null : value;
  }
  if (!LINE_NUMBER.test(linepos)) return null;
  const value = Number.parseFloat(linepos);
  if (!Number.isFinite(value)) return null;
  return value === 0 ? 0 : value;
}

export type SettingProblem = (kind: 'bad' | 'unknown', setting: string) => void;

/** Parse the WebVTT cue settings. `regions` is searched from the end for `region:`. */
export function parseCueSettings(
  input: string,
  regions: readonly CaptionRegion[],
  cue: CaptionCue,
  problem: SettingProblem,
): void {
  for (const setting of splitOnSpaces(input)) {
    const pair = splitSetting(setting);
    if (pair === null) {
      problem('bad', setting);
      continue;
    }
    const [name, value] = pair;
    switch (name) {
      case 'region': {
        if (cue.vertical !== '' || cue.line !== 'auto' || cue.size !== 100) {
          cue.region = null;
          break;
        }
        let match: CaptionRegion | null = null;
        for (let i = regions.length - 1; i >= 0; i--) {
          if ((regions[i] as CaptionRegion).id === value) {
            match = regions[i] as CaptionRegion;
            break;
          }
        }
        cue.region = match;
        break;
      }
      case 'vertical':
        if (value === 'rl' || value === 'lr') cue.vertical = value;
        else problem('bad', setting);
        if (cue.vertical !== '') cue.region = null;
        break;
      case 'line': {
        const [linepos, linealign] = splitComma(value);
        const number = parseLinePosition(linepos);
        if (number === null) {
          problem('bad', setting);
          break;
        }
        if (linealign === 'start' || linealign === 'center' || linealign === 'end') {
          cue.lineAlign = linealign;
        } else if (linealign !== null) {
          problem('bad', setting);
          break;
        }
        cue.line = number;
        cue.snapToLines = !linepos.endsWith('%');
        cue.region = null;
        break;
      }
      case 'position': {
        const [colpos, colalign] = splitComma(value);
        const number = parsePercentage(colpos);
        if (number < 0) {
          problem('bad', setting);
          break;
        }
        if (colalign === 'line-left' || colalign === 'center' || colalign === 'line-right') {
          cue.positionAlign = colalign;
        } else if (colalign !== null) {
          problem('bad', setting);
          break;
        }
        cue.position = number;
        break;
      }
      case 'size': {
        const number = parsePercentage(value);
        if (number < 0) {
          problem('bad', setting);
          break;
        }
        cue.size = number;
        if (number !== 100) cue.region = null;
        break;
      }
      case 'align':
        if (
          value === 'start' ||
          value === 'center' ||
          value === 'end' ||
          value === 'left' ||
          value === 'right'
        ) {
          cue.align = value;
        } else {
          problem('bad', setting);
        }
        break;
      default:
        problem('unknown', setting);
    }
  }
}

/** Collect WebVTT cue timings and settings. Returns false when the timings are invalid. */
export function parseTimingsAndSettings(
  line: string,
  regions: readonly CaptionRegion[],
  cue: CaptionCue,
  problem: SettingProblem,
): boolean {
  const cursor: Cursor = { input: line, pos: 0 };
  skipWhitespace(cursor);
  const start = collectTimestamp(cursor);
  if (start < 0) return false;
  skipWhitespace(cursor);
  if (!at(cursor, 0x2d)) return false;
  cursor.pos++;
  if (!at(cursor, 0x2d)) return false;
  cursor.pos++;
  if (!at(cursor, 0x3e)) return false;
  cursor.pos++;
  skipWhitespace(cursor);
  const end = collectTimestamp(cursor);
  if (end < 0) return false;
  cue.start = start;
  cue.end = end;
  parseCueSettings(line.slice(cursor.pos), regions, cue, problem);
  return true;
}

function parseAnchor(value: string): [number, number] | null {
  const comma = value.indexOf(',');
  if (comma < 0) return null;
  const x = parsePercentage(value.slice(0, comma));
  const y = parsePercentage(value.slice(comma + 1));
  return x < 0 || y < 0 ? null : [x, y];
}

/** Collect WebVTT region settings into `region`. */
export function parseRegionSettings(
  input: string,
  region: CaptionRegion,
  problem: SettingProblem,
): void {
  for (const setting of splitOnSpaces(input)) {
    const pair = splitSetting(setting);
    if (pair === null) {
      problem('bad', setting);
      continue;
    }
    const [name, value] = pair;
    switch (name) {
      case 'id':
        region.id = value;
        break;
      case 'width': {
        const width = parsePercentage(value);
        if (width >= 0) region.width = width;
        else problem('bad', setting);
        break;
      }
      case 'lines': {
        if (/^\d+$/.test(value)) {
          const parsed = Number.parseInt(value, 10);
          if (Number.isSafeInteger(parsed)) region.lines = parsed;
          else problem('bad', setting);
        } else {
          problem('bad', setting);
        }
        break;
      }
      case 'regionanchor': {
        const anchor = parseAnchor(value);
        if (anchor === null) {
          problem('bad', setting);
          break;
        }
        region.regionAnchorX = anchor[0];
        region.regionAnchorY = anchor[1];
        break;
      }
      case 'viewportanchor': {
        const anchor = parseAnchor(value);
        if (anchor === null) {
          problem('bad', setting);
          break;
        }
        region.viewportAnchorX = anchor[0];
        region.viewportAnchorY = anchor[1];
        break;
      }
      case 'scroll':
        if (value === 'up') region.scroll = 'up';
        else problem('bad', setting);
        break;
      default:
        problem('unknown', setting);
    }
  }
}
