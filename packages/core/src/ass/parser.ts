// Ported from libass/ass.c and libass/ass_utils.c (ISC License, Copyright 2006-2016 libass contributors).
import type { ParseWarningEvent } from '../errors/events.js';
import { St2160Error } from '../errors/st2160-error.js';
import {
  ASS_TRACK_TYPE_ASS,
  ASS_TRACK_TYPE_SSA,
  ASS_TRACK_TYPE_UNKNOWN,
  AssEventArena,
  type AssEventRecord,
  type AssScriptInfo,
  AssStringTable,
  AssStyleArena,
  type AssStyleRecord,
  AssTrack,
  type AssTrackType,
  type AssYCbCrMatrix,
  GENBY_FFMPEG,
  resolvePlayRes,
  SINFO_COLOURMATRIX,
  SINFO_KERNING,
  SINFO_LANGUAGE,
  SINFO_LAYOUTRESX,
  SINFO_LAYOUTRESY,
  SINFO_PLAYRESX,
  SINFO_PLAYRESY,
  SINFO_SCALEDBORDER,
  SINFO_SCRIPTTYPE,
  SINFO_TIMER,
  SINFO_WRAPSTYLE,
  YCBCR_BT601_PC,
  YCBCR_BT601_TV,
  YCBCR_BT709_PC,
  YCBCR_BT709_TV,
  YCBCR_DEFAULT,
  YCBCR_FCC_PC,
  YCBCR_FCC_TV,
  YCBCR_NONE,
  YCBCR_SMPTE240M_PC,
  YCBCR_SMPTE240M_TV,
  YCBCR_UNKNOWN,
} from './model.js';
import {
  assStrcasecmp,
  assStrncasecmp,
  numpad2align,
  parseBool,
  parseColorHeader,
  parseIntHeader,
  rskipSpaces,
  skipSpaces,
  string2timecode,
} from './numbers.js';
import { assAtof, isAssSpace } from './strtod.js';
import { type AssEmbeddedFont, decodeUuencodedFont } from './uuencode.js';

export const ASS_STYLE_FORMAT =
  'Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, ' +
  'OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ' +
  'ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, ' +
  'Alignment, MarginL, MarginR, MarginV, Encoding';

export const ASS_EVENT_FORMAT =
  'Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text';

export const SSA_STYLE_FORMAT =
  'Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, ' +
  'TertiaryColour, BackColour, Bold, Italic, BorderStyle, Outline, ' +
  'Shadow, Alignment, MarginL, MarginR, MarginV, AlphaLevel, Encoding';

export const SSA_EVENT_FORMAT =
  'Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text';

const PST_UNKNOWN = 0;
const PST_INFO = 1;
const PST_STYLES = 2;
const PST_EVENTS = 3;
const PST_FONTS = 4;
type ParserState =
  | typeof PST_UNKNOWN
  | typeof PST_INFO
  | typeof PST_STYLES
  | typeof PST_EVENTS
  | typeof PST_FONTS;

export interface ParseAssOptions {
  readonly encoding?: string;
  readonly extractFonts?: boolean;
  readonly onWarning?: (warning: ParseWarningEvent) => void;
}

export interface ParseAssAsyncOptions extends ParseAssOptions {
  readonly signal?: AbortSignal;
  readonly chunkLines?: number;
}

interface MutableStyle {
  Name: string;
  FontName: string;
  FontSize: number;
  PrimaryColour: number;
  SecondaryColour: number;
  OutlineColour: number;
  BackColour: number;
  Bold: number;
  Italic: number;
  Underline: number;
  StrikeOut: number;
  ScaleX: number;
  ScaleY: number;
  Spacing: number;
  Angle: number;
  BorderStyle: number;
  Outline: number;
  Shadow: number;
  Alignment: number;
  MarginL: number;
  MarginR: number;
  MarginV: number;
  Encoding: number;
  treat_fontname_as_pattern: number;
  Blur: number;
  Justify: number;
}

interface MutableEvent {
  Start: number;
  Duration: number;
  ReadOrder: number;
  Layer: number;
  Style: number;
  Name: string;
  MarginL: number;
  MarginR: number;
  MarginV: number;
  Effect: string;
  Text: string;
}

function createDefaultStyle(): MutableStyle {
  return {
    Name: 'Default',
    FontName: 'Arial',
    FontSize: 18,
    PrimaryColour: 0xffffff00,
    SecondaryColour: 0x00ffff00,
    OutlineColour: 0x00000000,
    BackColour: 0x00000080,
    Bold: 200,
    Italic: 0,
    Underline: 0,
    StrikeOut: 0,
    ScaleX: 1.0,
    ScaleY: 1.0,
    Spacing: 0,
    Angle: 0,
    BorderStyle: 1,
    Outline: 2,
    Shadow: 3,
    Alignment: 2,
    MarginL: 20,
    MarginR: 20,
    MarginV: 20,
    Encoding: 0,
    treat_fontname_as_pattern: 0,
    Blur: 0,
    Justify: 0,
  };
}

function createBlankStyle(): MutableStyle {
  return {
    Name: '',
    FontName: '',
    FontSize: 0,
    PrimaryColour: 0,
    SecondaryColour: 0,
    OutlineColour: 0,
    BackColour: 0,
    Bold: 0,
    Italic: 0,
    Underline: 0,
    StrikeOut: 0,
    ScaleX: 100.0,
    ScaleY: 100.0,
    Spacing: 0,
    Angle: 0,
    BorderStyle: 0,
    Outline: 0,
    Shadow: 0,
    Alignment: 0,
    MarginL: 0,
    MarginR: 0,
    MarginV: 0,
    Encoding: 0,
    treat_fontname_as_pattern: 0,
    Blur: 0,
    Justify: 0,
  };
}

function setStyleAlpha(style: MutableStyle, frontAlphaArg: number, backAlphaArg: number): void {
  const frontAlpha = Math.max(Math.min(frontAlphaArg | 0, 0xff), 0) >>> 0;
  const backAlpha = Math.max(Math.min(backAlphaArg | 0, 0xff), 0) >>> 0;
  style.PrimaryColour = ((style.PrimaryColour & 0xffffff00) | frontAlpha) >>> 0;
  style.SecondaryColour = ((style.SecondaryColour & 0xffffff00) | frontAlpha) >>> 0;
  style.OutlineColour = ((style.OutlineColour & 0xffffff00) | frontAlpha) >>> 0;
  style.BackColour = ((style.BackColour & 0xffffff00) | backAlpha) >>> 0;
}

export function parseYCbCrMatrix(str: string, startPos = 0): AssYCbCrMatrix {
  const p = skipSpaces(str, startPos);
  if (p >= str.length) {
    return YCBCR_DEFAULT;
  }
  const end = rskipSpaces(str, str.length, p);
  const n = Math.min(end - p, 15);
  const buffer = str.slice(p, p + n);
  if (assStrcasecmp(buffer, 'none') === 0) return YCBCR_NONE;
  if (assStrcasecmp(buffer, 'tv.601') === 0) return YCBCR_BT601_TV;
  if (assStrcasecmp(buffer, 'pc.601') === 0) return YCBCR_BT601_PC;
  if (assStrcasecmp(buffer, 'tv.709') === 0) return YCBCR_BT709_TV;
  if (assStrcasecmp(buffer, 'pc.709') === 0) return YCBCR_BT709_PC;
  if (assStrcasecmp(buffer, 'tv.240m') === 0) return YCBCR_SMPTE240M_TV;
  if (assStrcasecmp(buffer, 'pc.240m') === 0) return YCBCR_SMPTE240M_PC;
  if (assStrcasecmp(buffer, 'tv.fcc') === 0) return YCBCR_FCC_TV;
  if (assStrcasecmp(buffer, 'pc.fcc') === 0) return YCBCR_FCC_PC;
  return YCBCR_UNKNOWN;
}

interface TokenCursor {
  pos: number;
}

function nextToken(str: string, cursor: TokenCursor, rtrim: boolean): string | undefined {
  const start = skipSpaces(str, cursor.pos);
  if (start >= str.length) {
    cursor.pos = start;
    return undefined;
  }
  let end = start;
  while (end < str.length && str.charCodeAt(end) !== 0x2c) {
    end++;
  }
  cursor.pos = end < str.length ? end + 1 : end;
  const tokenEnd = rtrim ? rskipSpaces(str, end, start) : end;
  return str.slice(start, tokenEnd);
}

// Ported from libass/ass.c:format_line_compare.
export function formatLineCompare(fmt1: string, fmt2: string): boolean {
  let p1 = 0;
  let p2 = 0;
  while (true) {
    p1 = skipSpaces(fmt1, p1);
    p2 = skipSpaces(fmt2, p2);
    if (p1 >= fmt1.length || p2 >= fmt2.length) {
      break;
    }
    const tk1Start = p1;
    let tk1End = tk1Start;
    while (tk1End < fmt1.length && fmt1.charCodeAt(tk1End) !== 0x2c) tk1End++;
    p1 = tk1End < fmt1.length ? tk1End + 1 : tk1End;

    const tk2Start = p2;
    let tk2End = tk2Start;
    while (tk2End < fmt2.length && fmt2.charCodeAt(tk2End) !== 0x2c) tk2End++;
    p2 = tk2End < fmt2.length ? tk2End + 1 : tk2End;

    tk1End = rskipSpaces(fmt1, tk1End, tk1Start);
    tk2End = rskipSpaces(fmt2, tk2End, tk2Start);

    let tk1 = fmt1.slice(tk1Start, tk1End);
    let tk2 = fmt2.slice(tk2Start, tk2End);
    if (tk1 === 'Actor') tk1 = 'Name';
    if (tk2 === 'Actor') tk2 = 'Name';

    if (tk1.length !== tk2.length) return false;
    if (assStrncasecmp(tk1, tk2, tk1.length) !== 0) return false;
  }
  return p1 >= fmt1.length && p2 >= fmt2.length;
}

// Ported from libass/ass_utils.c:ass_lookup_style.
export function assLookupStyle(
  styles: readonly { readonly Name: string }[],
  defaultStyle: number,
  rawName: string,
  onWarning?: (code: string, message: string) => void,
): number {
  let p = 0;
  while (p < rawName.length && rawName.charCodeAt(p) === 0x2a) {
    p++;
  }
  let name = rawName.slice(p);
  if (assStrcasecmp(name, 'Default') === 0) {
    name = 'Default';
  }
  for (let i = styles.length - 1; i >= 0; i--) {
    if (styles[i]?.Name === name) {
      return i;
    }
  }
  const fallback = styles[defaultStyle]?.Name ?? 'Default';
  onWarning?.('ass-unknown-style', `Warning: no style named '${name}' found, using '${fallback}'`);
  return defaultStyle;
}

class AssParserSession {
  state: ParserState = PST_UNKNOWN;
  trackType: AssTrackType = ASS_TRACK_TYPE_UNKNOWN;
  playResX = 0;
  playResY = 0;
  layoutResX = 0;
  layoutResY = 0;
  timer = 0;
  wrapStyle = 0;
  scaledBorderAndShadow = 0;
  kerning = 0;
  language: string | undefined = undefined;
  ycbcrMatrix: AssYCbCrMatrix = YCBCR_DEFAULT;
  headerFlags = 0;
  defaultStyle = 0;
  styleFormat: string | undefined = undefined;
  eventFormat: string | undefined = undefined;
  readonly styles: MutableStyle[] = [createDefaultStyle()];
  readonly events: MutableEvent[] = [];
  readonly fonts: AssEmbeddedFont[] = [];
  private fontName: string | undefined = undefined;
  private fontChunks: string[] = [];
  private currentLine = 0;
  private readonly extractFonts: boolean;
  private readonly onWarning: ((warning: ParseWarningEvent) => void) | undefined;

  constructor(options?: ParseAssOptions) {
    this.extractFonts = options?.extractFonts ?? true;
    this.onWarning = options?.onWarning;
  }

  private warn(code: string, message: string): void {
    this.onWarning?.({
      type: 'parse-warning',
      line: this.currentLine,
      code,
      message,
    });
  }

  private checkDuplicateInfoLine(flag: number, name: string): void {
    if ((this.headerFlags & flag) !== 0) {
      this.warn(
        'ass-duplicate-header',
        `Duplicate Script Info Header '${name}'. Previous value overwritten!`,
      );
    } else {
      this.headerFlags |= flag;
    }
  }

  private customFormatLineCompatibility(fmt: string, std: string): void {
    if ((this.headerFlags & SINFO_SCALEDBORDER) === 0 && !formatLineCompare(fmt, std)) {
      this.scaledBorderAndShadow = 1;
    }
  }

  private detectLegacyConvSubs(): boolean {
    if (this.headerFlags !== (SINFO_SCRIPTTYPE | SINFO_PLAYRESX | SINFO_PLAYRESY | GENBY_FFMPEG)) {
      return false;
    }
    const style1 = this.styles[1];
    if (this.styles.length !== 2 || !style1 || !style1.Name.startsWith('Default')) {
      return false;
    }
    return true;
  }

  private parseScriptType(str: string, startPos: number): void {
    const end = rskipSpaces(str, str.length, startPos);
    let len = end - startPos;
    if (len < 4) return;
    let ver: AssTrackType = ASS_TRACK_TYPE_SSA;
    let p = end;
    if (str.charCodeAt(p - 1) === 0x2b) {
      ver = ASS_TRACK_TYPE_ASS;
      len--;
      p--;
    }
    if (len >= 4 && str.slice(p - 4, p) === '4.00') {
      this.trackType = ver;
    }
  }

  private processInfoLine(line: string, offset: number): void {
    const sub = offset === 0 ? line : line.slice(offset);
    if (sub.startsWith('PlayResX:')) {
      this.checkDuplicateInfoLine(SINFO_PLAYRESX, 'PlayResX');
      this.playResX = parseIntHeader(sub, 9);
    } else if (sub.startsWith('PlayResY:')) {
      this.checkDuplicateInfoLine(SINFO_PLAYRESY, 'PlayResY');
      this.playResY = parseIntHeader(sub, 9);
    } else if (sub.startsWith('LayoutResX:')) {
      this.checkDuplicateInfoLine(SINFO_LAYOUTRESX, 'LayoutResX');
      this.layoutResX = parseIntHeader(sub, 11);
    } else if (sub.startsWith('LayoutResY:')) {
      this.checkDuplicateInfoLine(SINFO_LAYOUTRESY, 'LayoutResY');
      this.layoutResY = parseIntHeader(sub, 11);
    } else if (sub.startsWith('Timer:')) {
      this.checkDuplicateInfoLine(SINFO_TIMER, 'Timer');
      this.timer = assAtof(sub, 6);
    } else if (sub.startsWith('WrapStyle:')) {
      this.checkDuplicateInfoLine(SINFO_WRAPSTYLE, 'WrapStyle');
      this.wrapStyle = parseIntHeader(sub, 10);
    } else if (sub.startsWith('ScaledBorderAndShadow:')) {
      this.checkDuplicateInfoLine(SINFO_SCALEDBORDER, 'ScaledBorderAndShadow');
      this.scaledBorderAndShadow = parseBool(sub, 22);
    } else if (sub.startsWith('Kerning:')) {
      this.checkDuplicateInfoLine(SINFO_KERNING, 'Kerning');
      this.kerning = parseBool(sub, 8);
    } else if (sub.startsWith('YCbCr Matrix:')) {
      this.checkDuplicateInfoLine(SINFO_COLOURMATRIX, 'YCbCr Matrix');
      this.ycbcrMatrix = parseYCbCrMatrix(sub, 13);
    } else if (sub.startsWith('Language:')) {
      this.checkDuplicateInfoLine(SINFO_LANGUAGE, 'Language');
      let p = 9;
      while (p < sub.length && isAssSpace(sub.charCodeAt(p))) {
        p++;
      }
      this.language = sub.slice(p, p + 2);
    } else if (sub.startsWith('ScriptType:')) {
      this.checkDuplicateInfoLine(SINFO_SCRIPTTYPE, 'ScriptType');
      this.parseScriptType(sub, 11);
    } else if (sub.startsWith('; Script generated by ')) {
      if (sub.slice(22, 33) === 'FFmpeg/Lavc') {
        this.headerFlags |= GENBY_FFMPEG;
      }
    }
  }

  private processStyle(str: string): void {
    if (this.styleFormat === undefined) {
      this.styleFormat =
        this.trackType === ASS_TRACK_TYPE_SSA ? SSA_STYLE_FORMAT : ASS_STYLE_FORMAT;
    }
    const format = this.styleFormat;
    const style = createBlankStyle();
    let hasFontName = false;
    let ssaAlpha = 0;
    const qCursor: TokenCursor = { pos: 0 };
    const pCursor: TokenCursor = { pos: 0 };

    while (true) {
      const tname = nextToken(format, qCursor, true);
      if (tname === undefined) break;
      const token = nextToken(str, pCursor, false);
      if (token === undefined) break;

      if (assStrcasecmp(tname, 'Name') === 0) {
        let k = 0;
        while (k < token.length && token.charCodeAt(k) === 0x2a) k++;
        style.Name = token.slice(k);
      } else if (assStrcasecmp(tname, 'FontName') === 0) {
        style.FontName = token;
        hasFontName = true;
      } else if (assStrcasecmp(tname, 'PrimaryColour') === 0) {
        style.PrimaryColour = parseColorHeader(token);
      } else if (assStrcasecmp(tname, 'SecondaryColour') === 0) {
        style.SecondaryColour = parseColorHeader(token);
      } else if (assStrcasecmp(tname, 'OutlineColour') === 0) {
        style.OutlineColour = parseColorHeader(token);
      } else if (assStrcasecmp(tname, 'BackColour') === 0) {
        style.BackColour = parseColorHeader(token);
        if (this.trackType === ASS_TRACK_TYPE_SSA) {
          style.OutlineColour = style.BackColour;
        }
      } else if (assStrcasecmp(tname, 'AlphaLevel') === 0) {
        ssaAlpha = parseIntHeader(token);
      } else if (assStrcasecmp(tname, 'FontSize') === 0) {
        style.FontSize = assAtof(token);
      } else if (assStrcasecmp(tname, 'Bold') === 0) {
        style.Bold = parseIntHeader(token);
      } else if (assStrcasecmp(tname, 'Italic') === 0) {
        style.Italic = parseIntHeader(token);
      } else if (assStrcasecmp(tname, 'Underline') === 0) {
        style.Underline = parseIntHeader(token);
      } else if (assStrcasecmp(tname, 'StrikeOut') === 0) {
        style.StrikeOut = parseIntHeader(token);
      } else if (assStrcasecmp(tname, 'Spacing') === 0) {
        style.Spacing = assAtof(token);
      } else if (assStrcasecmp(tname, 'Angle') === 0) {
        style.Angle = assAtof(token);
      } else if (assStrcasecmp(tname, 'BorderStyle') === 0) {
        style.BorderStyle = parseIntHeader(token);
      } else if (assStrcasecmp(tname, 'Alignment') === 0) {
        style.Alignment = parseIntHeader(token);
        if (this.trackType === ASS_TRACK_TYPE_ASS) {
          style.Alignment = numpad2align(style.Alignment);
        } else if (style.Alignment === 8) {
          style.Alignment = 3;
        } else if (style.Alignment === 4) {
          style.Alignment = 11;
        }
      } else if (assStrcasecmp(tname, 'MarginL') === 0) {
        style.MarginL = parseIntHeader(token);
      } else if (assStrcasecmp(tname, 'MarginR') === 0) {
        style.MarginR = parseIntHeader(token);
      } else if (assStrcasecmp(tname, 'MarginV') === 0) {
        style.MarginV = parseIntHeader(token);
      } else if (assStrcasecmp(tname, 'Encoding') === 0) {
        style.Encoding = parseIntHeader(token);
      } else if (assStrcasecmp(tname, 'ScaleX') === 0) {
        style.ScaleX = assAtof(token);
      } else if (assStrcasecmp(tname, 'ScaleY') === 0) {
        style.ScaleY = assAtof(token);
      } else if (assStrcasecmp(tname, 'Outline') === 0) {
        style.Outline = assAtof(token);
      } else if (assStrcasecmp(tname, 'Shadow') === 0) {
        style.Shadow = assAtof(token);
      }
    }

    if (this.trackType === ASS_TRACK_TYPE_SSA) {
      setStyleAlpha(style, ssaAlpha, 0x80);
    }
    // process_style divides; JASSUB's -ffast-math build multiplies by 0.01 instead.
    style.ScaleX = Math.max(style.ScaleX, 0.0) / 100;
    style.ScaleY = Math.max(style.ScaleY, 0.0) / 100;
    style.Spacing = Math.max(style.Spacing, 0.0);
    style.Outline = Math.max(style.Outline, 0.0);
    style.Shadow = Math.max(style.Shadow, 0.0);
    style.Bold = style.Bold !== 0 ? 1 : 0;
    style.Italic = style.Italic !== 0 ? 1 : 0;
    style.Underline = style.Underline !== 0 ? 1 : 0;
    style.StrikeOut = style.StrikeOut !== 0 ? 1 : 0;
    if (style.Name.length === 0) {
      style.Name = 'Default';
    }
    if (!hasFontName) {
      style.FontName = 'Arial';
    }
    const sid = this.styles.length;
    this.styles.push(style);
    if (style.Name === 'Default') {
      this.defaultStyle = sid;
    }
  }

  private processStylesLine(line: string, offset: number): void {
    const sub = offset === 0 ? line : line.slice(offset);
    if (sub.startsWith('Format:')) {
      const p = skipSpaces(sub, 7);
      const fmt = sub.slice(p);
      this.styleFormat = fmt;
      const std = this.trackType === ASS_TRACK_TYPE_ASS ? ASS_STYLE_FORMAT : SSA_STYLE_FORMAT;
      this.customFormatLineCompatibility(fmt, std);
    } else if (sub.startsWith('Style:')) {
      const p = skipSpaces(sub, 6);
      this.processStyle(sub.slice(p));
    }
  }

  private eventFormatFallback(): void {
    this.state = PST_EVENTS;
    this.eventFormat = this.trackType === ASS_TRACK_TYPE_SSA ? SSA_EVENT_FORMAT : ASS_EVENT_FORMAT;
  }

  private processEventTail(str: string, nIgnored: number): MutableEvent | undefined {
    const format = this.eventFormat ?? ASS_EVENT_FORMAT;
    const qCursor: TokenCursor = { pos: 0 };
    const pCursor: TokenCursor = { pos: 0 };

    for (let i = 0; i < nIgnored; i++) {
      if (nextToken(format, qCursor, false) === undefined) break;
    }

    const event: MutableEvent = {
      Start: 0,
      Duration: 0,
      ReadOrder: 0,
      Layer: 0,
      Style: 0,
      Name: '',
      MarginL: 0,
      MarginR: 0,
      MarginV: 0,
      Effect: '',
      Text: '',
    };

    while (true) {
      let tname = nextToken(format, qCursor, true);
      if (tname === undefined) break;

      if (assStrcasecmp(tname, 'Text') === 0) {
        let end = str.length;
        while (end > pCursor.pos) {
          const c = str.charCodeAt(end - 1);
          if (c !== 0x0d && c !== 0x09 && c !== 0x20) break;
          end--;
        }
        event.Text = str.slice(pCursor.pos, end);
        event.Duration -= event.Start;
        return event;
      }

      const token = nextToken(str, pCursor, false);
      if (token === undefined) break;

      if (assStrcasecmp(tname, 'End') === 0) {
        tname = 'Duration';
      } else if (assStrcasecmp(tname, 'Actor') === 0) {
        tname = 'Name';
      }

      if (assStrcasecmp(tname, 'Layer') === 0) {
        event.Layer = parseIntHeader(token);
      } else if (assStrcasecmp(tname, 'Style') === 0) {
        event.Style = assLookupStyle(this.styles, this.defaultStyle, token, (code, msg) =>
          this.warn(code, msg),
        );
      } else if (assStrcasecmp(tname, 'Name') === 0) {
        event.Name = token;
      } else if (assStrcasecmp(tname, 'Effect') === 0) {
        event.Effect = token;
      } else if (assStrcasecmp(tname, 'MarginL') === 0) {
        event.MarginL = parseIntHeader(token);
      } else if (assStrcasecmp(tname, 'MarginR') === 0) {
        event.MarginR = parseIntHeader(token);
      } else if (assStrcasecmp(tname, 'MarginV') === 0) {
        event.MarginV = parseIntHeader(token);
      } else if (assStrcasecmp(tname, 'Start') === 0) {
        const res = string2timecode(token);
        if (!res.ok) this.warn('ass-bad-timestamp', 'Bad timestamp');
        event.Start = res.ms;
      } else if (assStrcasecmp(tname, 'Duration') === 0) {
        const res = string2timecode(token);
        if (!res.ok) this.warn('ass-bad-timestamp', 'Bad timestamp');
        event.Duration = res.ms;
      }
    }

    return undefined;
  }

  private processEventsLine(line: string, offset: number): void {
    const sub = offset === 0 ? line : line.slice(offset);
    if (sub.startsWith('Format:')) {
      const p = skipSpaces(sub, 7);
      const fmt = sub.slice(p);
      this.eventFormat = fmt;
      const std = this.trackType === ASS_TRACK_TYPE_ASS ? ASS_EVENT_FORMAT : SSA_EVENT_FORMAT;
      this.customFormatLineCompatibility(fmt, std);
      if (this.detectLegacyConvSubs()) {
        this.scaledBorderAndShadow = 1;
      }
    } else if (sub.startsWith('Dialogue:')) {
      if (this.eventFormat === undefined) {
        this.eventFormatFallback();
      }
      const p = skipSpaces(sub, 9);
      const event = this.processEventTail(sub.slice(p), 0);
      if (event !== undefined) {
        this.events.push(event);
      }
    }
  }

  flushPendingFont(): void {
    if (this.fontName === undefined) return;
    const name = this.fontName;
    const encoded = this.fontChunks.join('');
    this.fontName = undefined;
    this.fontChunks = [];
    const bytes = decodeUuencodedFont(encoded, (code, msg) => this.warn(code, msg));
    if (bytes !== undefined && this.extractFonts) {
      this.fonts.push({ name, bytes });
    }
  }

  private processFontsLine(line: string, offset: number): void {
    const sub = offset === 0 ? line : line.slice(offset);
    if (sub.startsWith('fontname:')) {
      const p = skipSpaces(sub, 9);
      if (this.fontName !== undefined) {
        this.flushPendingFont();
      }
      this.fontName = sub.slice(p);
      return;
    }
    if (this.fontName === undefined) {
      return;
    }
    this.fontChunks.push(sub);
  }

  processLine(line: string, lineNumber: number): void {
    this.currentLine = lineNumber;
    const p = skipSpaces(line, 0);
    if (assStrncasecmp(line, '[Script Info]', 13, p) === 0) {
      this.state = PST_INFO;
    } else if (assStrncasecmp(line, '[V4 Styles]', 11, p) === 0) {
      this.state = PST_STYLES;
      this.trackType = ASS_TRACK_TYPE_SSA;
    } else if (assStrncasecmp(line, '[V4+ Styles]', 12, p) === 0) {
      this.state = PST_STYLES;
      this.trackType = ASS_TRACK_TYPE_ASS;
    } else if (assStrncasecmp(line, '[Events]', 8, p) === 0) {
      this.state = PST_EVENTS;
    } else if (assStrncasecmp(line, '[Fonts]', 7, p) === 0) {
      this.state = PST_FONTS;
    } else {
      switch (this.state) {
        case PST_INFO:
          this.processInfoLine(line, p);
          break;
        case PST_STYLES:
          this.processStylesLine(line, p);
          break;
        case PST_EVENTS:
          this.processEventsLine(line, p);
          break;
        case PST_FONTS:
          this.processFontsLine(line, p);
          break;
      }
    }
  }

  finalize(): AssTrack {
    this.flushPendingFont();

    if (this.trackType === ASS_TRACK_TYPE_UNKNOWN) {
      throw new St2160Error(
        'ass-invalid-script',
        'ASS/SSA track type is unknown (missing ScriptType or [V4(+) Styles] section)',
      );
    }

    const strings = new AssStringTable();
    const styleArena = new AssStyleArena(this.styles.length, strings);
    for (let i = 0; i < this.styles.length; i++) {
      const s = this.styles[i] as MutableStyle;
      styleArena.nameId[i] = strings.intern(s.Name);
      styleArena.fontNameId[i] = strings.intern(s.FontName);
      styleArena.fontSize[i] = s.FontSize;
      styleArena.primaryColour[i] = s.PrimaryColour;
      styleArena.secondaryColour[i] = s.SecondaryColour;
      styleArena.outlineColour[i] = s.OutlineColour;
      styleArena.backColour[i] = s.BackColour;
      styleArena.bold[i] = s.Bold;
      styleArena.italic[i] = s.Italic;
      styleArena.underline[i] = s.Underline;
      styleArena.strikeOut[i] = s.StrikeOut;
      styleArena.scaleX[i] = s.ScaleX;
      styleArena.scaleY[i] = s.ScaleY;
      styleArena.spacing[i] = s.Spacing;
      styleArena.angle[i] = s.Angle;
      styleArena.borderStyle[i] = s.BorderStyle;
      styleArena.outline[i] = s.Outline;
      styleArena.shadow[i] = s.Shadow;
      styleArena.alignment[i] = s.Alignment;
      styleArena.marginL[i] = s.MarginL;
      styleArena.marginR[i] = s.MarginR;
      styleArena.marginV[i] = s.MarginV;
      styleArena.encoding[i] = s.Encoding;
      styleArena.treatFontnameAsPattern[i] = s.treat_fontname_as_pattern;
      styleArena.blur[i] = s.Blur;
      styleArena.justify[i] = s.Justify;
    }

    const eventArena = new AssEventArena(this.events.length, strings);
    for (let i = 0; i < this.events.length; i++) {
      const e = this.events[i] as MutableEvent;
      eventArena.start[i] = e.Start;
      eventArena.duration[i] = e.Duration;
      eventArena.end[i] = e.Start + e.Duration;
      eventArena.readOrder[i] = i;
      eventArena.layer[i] = e.Layer;
      eventArena.style[i] = e.Style;
      eventArena.nameId[i] = strings.intern(e.Name);
      eventArena.marginL[i] = e.MarginL;
      eventArena.marginR[i] = e.MarginR;
      eventArena.marginV[i] = e.MarginV;
      eventArena.effectId[i] = strings.intern(e.Effect);
      eventArena.textId[i] = strings.intern(e.Text);
    }

    const resolvedRes = resolvePlayRes(this.playResX, this.playResY, (code, msg) =>
      this.warn(code, msg),
    );

    const info: AssScriptInfo = {
      trackType: this.trackType,
      playResX: this.playResX,
      playResY: this.playResY,
      resolvedPlayResX: resolvedRes.x,
      resolvedPlayResY: resolvedRes.y,
      layoutResX: this.layoutResX,
      layoutResY: this.layoutResY,
      timer: this.timer,
      wrapStyle: this.wrapStyle,
      scaledBorderAndShadow: this.scaledBorderAndShadow,
      kerning: this.kerning,
      language: this.language,
      ycbcrMatrix: this.ycbcrMatrix,
      headerFlags: this.headerFlags,
    };

    return new AssTrack({
      info,
      styles: styleArena,
      events: eventArena,
      strings,
      fonts: this.fonts,
      defaultStyle: this.defaultStyle,
      styleFormat: this.styleFormat,
      eventFormat: this.eventFormat,
    });
  }
}

function decodeInput(input: string | Uint8Array, encoding?: string): string {
  if (typeof input === 'string') {
    return input;
  }
  const decoder = new TextDecoder(encoding ?? 'utf-8');
  return decoder.decode(input);
}

// Ported from libass/ass.c:process_text.
function isLineBreakOrBom(text: string, p: number): number {
  const c = text.charCodeAt(p);
  if (c === 0x0d || c === 0x0a) return 1;
  if (c === 0xfeff) return 1;
  if (
    c === 0xef &&
    p + 2 < text.length &&
    text.charCodeAt(p + 1) === 0xbb &&
    text.charCodeAt(p + 2) === 0xbf
  ) {
    return 3;
  }
  return 0;
}

export function parseAss(input: string | Uint8Array, options?: ParseAssOptions): AssTrack {
  const text = decodeInput(input, options?.encoding);
  const session = new AssParserSession(options);
  const len = text.length;
  let p = 0;
  let lineNumber = 0;

  while (p < len) {
    while (p < len) {
      const skip = isLineBreakOrBom(text, p);
      if (skip === 0) break;
      if (text.charCodeAt(p) === 0x0a || text.charCodeAt(p) === 0x0d) {
        lineNumber++;
      }
      p += skip;
    }
    let q = p;
    while (q < len) {
      const c = text.charCodeAt(q);
      if (c === 0x00 || c === 0x0d || c === 0x0a) break;
      q++;
    }
    if (q === p) break;
    lineNumber++;
    session.processLine(text.slice(p, q), lineNumber);
    if (q >= len || text.charCodeAt(q) === 0x00) break;
    p = q + 1;
  }

  return session.finalize();
}

export async function parseAssAsync(
  input: string | Uint8Array,
  options?: ParseAssAsyncOptions,
): Promise<AssTrack> {
  const signal = options?.signal;
  if (signal?.aborted) {
    throw new St2160Error('aborted', 'ASS parse was aborted');
  }
  const text = decodeInput(input, options?.encoding);
  const session = new AssParserSession(options);
  const chunkLines = options?.chunkLines ?? 2000;
  const len = text.length;
  let p = 0;
  let lineNumber = 0;
  let linesInChunk = 0;

  while (p < len) {
    while (p < len) {
      const skip = isLineBreakOrBom(text, p);
      if (skip === 0) break;
      if (text.charCodeAt(p) === 0x0a || text.charCodeAt(p) === 0x0d) {
        lineNumber++;
      }
      p += skip;
    }
    let q = p;
    while (q < len) {
      const c = text.charCodeAt(q);
      if (c === 0x00 || c === 0x0d || c === 0x0a) break;
      q++;
    }
    if (q === p) break;
    lineNumber++;
    session.processLine(text.slice(p, q), lineNumber);
    if (q >= len || text.charCodeAt(q) === 0x00) break;
    p = q + 1;

    linesInChunk++;
    if (linesInChunk >= chunkLines) {
      linesInChunk = 0;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (signal?.aborted) {
        throw new St2160Error('aborted', 'ASS parse was aborted');
      }
    }
  }

  return session.finalize();
}

export type { AssEventRecord, AssStyleRecord };
