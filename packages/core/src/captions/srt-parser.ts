// Lenient SRT parser and tag tokenizer, with `{\anN}` ported from media-captions `7e1e0bd` (MIT).
import {
  type CaptionCue,
  type CueElementNode,
  type CueElementType,
  type CueNode,
  createCue,
} from './cue.js';
import { decodeHtmlEntities } from './html-entities.js';
import type { ParseReporter } from './parse-error.js';

export interface SrtConsumer {
  onCue?(cue: CaptionCue): void;
  report?: ParseReporter;
}

const SRT_TIMING_LINE =
  /^\s*(\d{1,3}):(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?\s*-->\s*(\d{1,3}):(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?(.*)$/;
const SRT_SHORT_TIMING_LINE =
  /^\s*(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?\s*-->\s*(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?(.*)$/;
const NUMERIC_ID = /^\s*\d+\s*$/;
const COORD_SETTING = /^[XY][12]\s*:\s*-?\d+$/i;

function parseSrtTimings(line: string): [number, number, string] | null {
  const match = SRT_TIMING_LINE.exec(line);
  if (match !== null) {
    const h1 = Number.parseInt(match[1] as string, 10);
    const m1 = Number.parseInt(match[2] as string, 10);
    const s1 = Number.parseInt(match[3] as string, 10);
    const ms1 = match[4] ? Number.parseInt((match[4] as string).padEnd(3, '0'), 10) : 0;
    const h2 = Number.parseInt(match[5] as string, 10);
    const m2 = Number.parseInt(match[6] as string, 10);
    const s2 = Number.parseInt(match[7] as string, 10);
    const ms2 = match[8] ? Number.parseInt((match[8] as string).padEnd(3, '0'), 10) : 0;
    if (m1 > 59 || s1 > 59 || m2 > 59 || s2 > 59) return null;
    const start = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000;
    const end = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000;
    return [start, end, (match[9] ?? '').trim()];
  }
  const shortMatch = SRT_SHORT_TIMING_LINE.exec(line);
  if (shortMatch === null) return null;
  const m1 = Number.parseInt(shortMatch[1] as string, 10);
  const s1 = Number.parseInt(shortMatch[2] as string, 10);
  const ms1 = shortMatch[3] ? Number.parseInt((shortMatch[3] as string).padEnd(3, '0'), 10) : 0;
  const m2 = Number.parseInt(shortMatch[4] as string, 10);
  const s2 = Number.parseInt(shortMatch[5] as string, 10);
  const ms2 = shortMatch[6] ? Number.parseInt((shortMatch[6] as string).padEnd(3, '0'), 10) : 0;
  if (m1 > 59 || s1 > 59 || m2 > 59 || s2 > 59) return null;
  return [m1 * 60 + s1 + ms1 / 1000, m2 * 60 + s2 + ms2 / 1000, (shortMatch[7] ?? '').trim()];
}

const LEGACY_SSA_ALIGNMENT: Readonly<Record<number, number>> = {
  1: 1,
  2: 2,
  3: 3,
  5: 7,
  6: 8,
  7: 9,
  9: 4,
  10: 5,
  11: 6,
};

/** Maps ASS numpad alignment 1..9 onto VTTCue-compatible line, position and align. */
export function applyNumpadAlignment(cue: CaptionCue, alignment: number): void {
  if (alignment < 1 || alignment > 9) return;
  cue.snapToLines = false;
  if (alignment >= 7) {
    cue.line = 0;
    cue.lineAlign = 'start';
  } else if (alignment >= 4) {
    cue.line = 50;
    cue.lineAlign = 'center';
  } else {
    cue.line = 100;
    cue.lineAlign = 'end';
  }
  const col = alignment % 3;
  if (col === 1) {
    cue.align = 'start';
    cue.position = 0;
    cue.positionAlign = 'line-left';
  } else if (col === 2) {
    cue.align = 'center';
    cue.position = 50;
    cue.positionAlign = 'center';
  } else {
    cue.align = 'end';
    cue.position = 100;
    cue.positionAlign = 'line-right';
  }
}

interface StyleState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string;
  face: string;
  size: string;
}

function emptyState(): StyleState {
  return {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    color: '',
    face: '',
    size: '',
  };
}

function cloneState(s: StyleState): StyleState {
  return { ...s };
}

const SAFE_COLOR =
  /^(?:#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\))$/i;
const SAFE_FACE = /^[A-Za-z0-9 _.,-]+$/;
const SAFE_SIZE = /^\d+(?:\.\d+)?(?:px|%|em|rem|pt)?$/i;

function sanitizeColor(raw: string): string {
  const trimmed = raw.trim();
  if (/^[0-9a-f]{6}$/i.test(trimmed)) return `#${trimmed}`;
  return SAFE_COLOR.test(trimmed) ? trimmed : '';
}

function sanitizeFace(raw: string): string {
  const trimmed = raw.trim();
  return SAFE_FACE.test(trimmed) ? trimmed : '';
}

function sanitizeSize(raw: string): string {
  const trimmed = raw.trim();
  return SAFE_SIZE.test(trimmed) ? trimmed : '';
}

function convertBgrHex(bgrHex: string): string {
  const clean = bgrHex.padStart(6, '0').slice(-6).toLowerCase();
  const b = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const r = clean.slice(4, 6);
  return `#${r}${g}${b}`;
}

const ATTR_RE = /([a-z]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;

function parseFontAttributes(attrText: string, state: StyleState): void {
  ATTR_RE.lastIndex = 0;
  let match = ATTR_RE.exec(attrText);
  while (match !== null) {
    const name = (match[1] as string).toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    if (name === 'color') {
      const color = sanitizeColor(val);
      if (color) state.color = color;
    } else if (name === 'face') {
      const face = sanitizeFace(val);
      if (face) state.face = face;
    } else if (name === 'size') {
      const size = sanitizeSize(val);
      if (size) state.size = size;
    }
    match = ATTR_RE.exec(attrText);
  }
}

const MICRO_STYLE_RE = /^(?:y\s*:\s*([ibsu])|\/\s*y(?:\s*:\s*([ibsu]))?|([ibsu])\s*:\s*([01]))$/i;

function tryApplyMicroTag(rawInner: string, state: StyleState): boolean {
  const m = MICRO_STYLE_RE.exec(rawInner.trim());
  if (m === null) return false;
  if (m[1]) {
    const ch = m[1].toLowerCase();
    if (ch === 'b') state.bold = true;
    else if (ch === 'i') state.italic = true;
    else if (ch === 'u') state.underline = true;
    else if (ch === 's') state.strike = true;
    return true;
  }
  if (rawInner.trim().startsWith('/')) {
    const ch = (m[2] ?? '').toLowerCase();
    if (ch === 'b') state.bold = false;
    else if (ch === 'i') state.italic = false;
    else if (ch === 'u') state.underline = false;
    else if (ch === 's') state.strike = false;
    else {
      state.bold = false;
      state.italic = false;
      state.underline = false;
      state.strike = false;
    }
    return true;
  }
  const ch = (m[3] as string).toLowerCase();
  const on = m[4] === '1';
  if (ch === 'b') state.bold = on;
  else if (ch === 'i') state.italic = on;
  else if (ch === 'u') state.underline = on;
  else if (ch === 's') state.strike = on;
  return true;
}
const LEADING_AN_RE = /^\s*\{\s*\\(an([1-9])|a(10|11|[1-35-79]))(?=[\\}\s])/;
const OVERRIDE_CMD_RE = /\\(an[1-9]|a(?:10|11|[1-35-79])|[bius][01]|1?c|fn|fs|r)\s*([^\\}]*)/gi;

function applyOverrideBlock(content: string, state: StyleState, fontStack: StyleState[]): void {
  OVERRIDE_CMD_RE.lastIndex = 0;
  let match = OVERRIDE_CMD_RE.exec(content);
  while (match !== null) {
    const cmd = (match[1] as string).toLowerCase();
    const arg = (match[2] ?? '').trim();
    if (cmd === 'b1') state.bold = true;
    else if (cmd === 'b0') state.bold = false;
    else if (cmd === 'i1') state.italic = true;
    else if (cmd === 'i0') state.italic = false;
    else if (cmd === 'u1') state.underline = true;
    else if (cmd === 'u0') state.underline = false;
    else if (cmd === 's1') state.strike = true;
    else if (cmd === 's0') state.strike = false;
    else if (cmd === 'r') {
      const clean = emptyState();
      Object.assign(state, clean);
      fontStack.length = 0;
    } else if (cmd === 'fn') {
      state.face = sanitizeFace(arg);
    } else if (cmd === 'fs' && /^\d+(?:\.\d+)?$/.test(arg)) {
      state.size = `${arg}px`;
    } else if (cmd === 'c' || cmd === '1c') {
      const hex = /^&?H([0-9a-f]{1,8})&?$/i.exec(arg);
      if (hex !== null) state.color = convertBgrHex(hex[1] as string);
    }
    match = OVERRIDE_CMD_RE.exec(content);
  }
}

function wrapSegment(text: string, state: StyleState): CueNode {
  let node: CueNode = { type: 'text', value: text };
  const wrap = (type: CueElementType, extra?: Partial<CueElementNode>): void => {
    node = {
      type,
      classes: [],
      annotation: '',
      ...extra,
      children: [node],
    };
  };
  if (state.strike) wrap('s');
  if (state.underline) wrap('u');
  if (state.italic) wrap('i');
  if (state.bold) wrap('b');
  if (state.color || state.face || state.size) {
    const extra: { color?: string; face?: string; size?: string } = {};
    if (state.color) extra.color = state.color;
    if (state.face) extra.face = state.face;
    if (state.size) extra.size = state.size;
    wrap('font', extra);
  }
  return node;
}

/** Extracts leading `{\anN}`, strips `{...}` blocks, and parses SRT tags into `CueNode`s. */
export function parseSrtCueText(raw: string, cue: CaptionCue): CueNode[] {
  const leadingAn = LEADING_AN_RE.exec(raw);
  if (leadingAn !== null) {
    const numpad = leadingAn[2]
      ? Number.parseInt(leadingAn[2], 10)
      : (LEGACY_SSA_ALIGNMENT[Number.parseInt(leadingAn[3] as string, 10)] ?? 0);
    applyNumpadAlignment(cue, numpad);
  }

  const normalized = raw.replace(/\\N/g, '\n').replace(/\\h/g, '\u00a0');
  const state = emptyState();
  const fontStack: StyleState[] = [];
  const nodes: CueNode[] = [];
  let textBuf = '';
  let i = 0;

  const flush = (): void => {
    if (textBuf.length === 0) return;
    nodes.push(wrapSegment(decodeHtmlEntities(textBuf), state));
    textBuf = '';
  };

  while (i < normalized.length) {
    const ch = normalized.charCodeAt(i);

    if (ch === 0x7b) {
      const close = normalized.indexOf('}', i + 1);
      if (close !== -1) {
        const inner = normalized.slice(i + 1, close);
        if (inner.includes('\\')) {
          flush();
          applyOverrideBlock(inner, state, fontStack);
          i = close + 1;
          continue;
        }
        if (MICRO_STYLE_RE.test(inner.trim())) {
          flush();
          tryApplyMicroTag(inner, state);
          i = close + 1;
          continue;
        }
      }
    }

    if (ch === 0x3c) {
      const close = normalized.indexOf('>', i + 1);
      if (close !== -1) {
        const rawTag = normalized.slice(i + 1, close).trim();
        const handled = tryApplyHtmlTag(rawTag, state, fontStack, flush);
        if (handled) {
          i = close + 1;
          continue;
        }
      }
    }

    textBuf += normalized[i] as string;
    i++;
  }

  flush();
  cue.text = plainTextFromSrt(raw);
  return nodes;
}

function tryApplyHtmlTag(
  rawTag: string,
  state: StyleState,
  fontStack: StyleState[],
  flush: () => void,
): boolean {
  const lower = rawTag.toLowerCase();
  if (lower === 'b' || lower === 'strong') {
    flush();
    state.bold = true;
    return true;
  }
  if (lower === '/b' || lower === '/strong' || lower === 'b/') {
    flush();
    state.bold = false;
    return true;
  }
  if (lower === 'i' || lower === 'em') {
    flush();
    state.italic = true;
    return true;
  }
  if (lower === '/i' || lower === '/em' || lower === 'i/') {
    flush();
    state.italic = false;
    return true;
  }
  if (lower === 'u') {
    flush();
    state.underline = true;
    return true;
  }
  if (lower === '/u' || lower === 'u/') {
    flush();
    state.underline = false;
    return true;
  }
  if (lower === 's' || lower === 'strike' || lower === 'del') {
    flush();
    state.strike = true;
    return true;
  }
  if (lower === '/s' || lower === '/strike' || lower === '/del' || lower === 's/') {
    flush();
    state.strike = false;
    return true;
  }
  if (lower === 'br' || lower === 'br/' || lower === 'br /') {
    flush();
    return false;
  }
  if (lower === 'font' || lower.startsWith('font ') || lower.startsWith('font\t')) {
    flush();
    fontStack.push(cloneState(state));
    parseFontAttributes(rawTag.slice(4), state);
    return true;
  }
  if (lower === '/font') {
    flush();
    const prev = fontStack.pop();
    if (prev !== undefined) {
      state.color = prev.color;
      state.face = prev.face;
      state.size = prev.size;
    } else {
      state.color = '';
      state.face = '';
      state.size = '';
    }
    return true;
  }
  return false;
}

function plainTextFromSrt(raw: string): string {
  return raw.replace(/\{\\an[1-9]\}/gi, '').replace(/\{\\a(?:10|11|[1-35-79])\}/gi, '');
}

/** Incremental line-by-line SRT parser. Handles missing blank lines and comma or dot ms. */
export class SrtLineParser {
  readonly cues: CaptionCue[] = [];

  private readonly consumer: SrtConsumer;
  private lineNumber = 0;
  private currentCue: CaptionCue | null = null;
  private textLines: string[] = [];
  private pendingId = '';
  private pendingIdLine = 0;

  constructor(consumer: SrtConsumer = {}) {
    this.consumer = consumer;
  }

  pushLine(rawLine: string): void {
    this.lineNumber++;
    const line = rawLine.trimEnd();

    if (line.trim() === '') {
      this.flushCue();
      this.pendingId = '';
      return;
    }

    if (line.includes('-->')) {
      const timings = parseSrtTimings(line);
      if (timings === null) {
        this.flushCue();
        this.pendingId = '';
        this.consumer.report?.('bad-timestamp', this.lineNumber, `invalid SRT timings: ${line}`);
        return;
      }

      let id = this.pendingId;
      if (this.currentCue !== null) {
        if (
          this.textLines.length >= 2 &&
          NUMERIC_ID.test(this.textLines[this.textLines.length - 1] as string)
        ) {
          id = (this.textLines.pop() as string).trim();
        }
        this.flushCue();
      }
      this.pendingId = '';

      const [start, end, trailing] = timings;
      if (end < start) {
        this.consumer.report?.(
          'bad-timestamp',
          this.lineNumber,
          `SRT end time ${end} is before start ${start}`,
        );
        return;
      }
      if (trailing.length > 0) {
        for (const token of trailing.split(/\s+/)) {
          if (token.length > 0 && !COORD_SETTING.test(token)) {
            this.consumer.report?.(
              'unknown-setting',
              this.lineNumber,
              `unknown SRT trailing setting: ${token}`,
            );
          }
        }
      }
      this.currentCue = createCue('srt', id, start, end);
      this.textLines = [];
      return;
    }

    if (this.currentCue !== null) {
      const brNormalized = line.replace(/<br\s*\/?>/gi, '\n');
      this.textLines.push(brNormalized);
      return;
    }

    if (this.pendingId !== '') {
      this.consumer.report?.(
        'orphan-text',
        this.pendingIdLine,
        `expected timing line after "${this.pendingId}"`,
      );
    }
    this.pendingId = line.trim();
    this.pendingIdLine = this.lineNumber;
  }

  finish(): void {
    if (this.pendingId !== '' && this.currentCue === null) {
      this.consumer.report?.(
        'orphan-text',
        this.pendingIdLine,
        `unexpected trailing line "${this.pendingId}"`,
      );
      this.pendingId = '';
    }
    this.flushCue();
  }

  private flushCue(): void {
    if (this.currentCue === null) return;
    const cue = this.currentCue;
    const rawText = this.textLines.join('\n');
    cue.nodes = parseSrtCueText(rawText, cue);
    this.cues.push(cue);
    this.consumer.onCue?.(cue);
    this.currentCue = null;
    this.textLines = [];
  }
}
