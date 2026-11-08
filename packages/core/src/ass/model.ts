import { TimeIndex } from '../timing/time-index.js';
import type { AssEmbeddedFont } from './uuencode.js';

export const ASS_TRACK_TYPE_UNKNOWN = 0;
export const ASS_TRACK_TYPE_ASS = 1;
export const ASS_TRACK_TYPE_SSA = 2;
export type AssTrackType =
  | typeof ASS_TRACK_TYPE_UNKNOWN
  | typeof ASS_TRACK_TYPE_ASS
  | typeof ASS_TRACK_TYPE_SSA;

export const YCBCR_DEFAULT = 0;
export const YCBCR_UNKNOWN = 1;
export const YCBCR_NONE = 2;
export const YCBCR_BT601_TV = 3;
export const YCBCR_BT601_PC = 4;
export const YCBCR_BT709_TV = 5;
export const YCBCR_BT709_PC = 6;
export const YCBCR_SMPTE240M_TV = 7;
export const YCBCR_SMPTE240M_PC = 8;
export const YCBCR_FCC_TV = 9;
export const YCBCR_FCC_PC = 10;
export type AssYCbCrMatrix =
  | typeof YCBCR_DEFAULT
  | typeof YCBCR_UNKNOWN
  | typeof YCBCR_NONE
  | typeof YCBCR_BT601_TV
  | typeof YCBCR_BT601_PC
  | typeof YCBCR_BT709_TV
  | typeof YCBCR_BT709_PC
  | typeof YCBCR_SMPTE240M_TV
  | typeof YCBCR_SMPTE240M_PC
  | typeof YCBCR_FCC_TV
  | typeof YCBCR_FCC_PC;

export const SINFO_LANGUAGE = 1 << 0;
export const SINFO_PLAYRESX = 1 << 1;
export const SINFO_PLAYRESY = 1 << 2;
export const SINFO_TIMER = 1 << 3;
export const SINFO_WRAPSTYLE = 1 << 4;
export const SINFO_SCALEDBORDER = 1 << 5;
export const SINFO_COLOURMATRIX = 1 << 6;
export const SINFO_KERNING = 1 << 7;
export const SINFO_SCRIPTTYPE = 1 << 8;
export const SINFO_LAYOUTRESX = 1 << 9;
export const SINFO_LAYOUTRESY = 1 << 10;
export const GENBY_FFMPEG = 1 << 14;

export const VALIGN_SUB = 0;
export const VALIGN_CENTER = 8;
export const VALIGN_TOP = 4;
export const HALIGN_LEFT = 1;
export const HALIGN_CENTER = 2;
export const HALIGN_RIGHT = 3;

export const ASS_JUSTIFY_AUTO = 0;
export const ASS_JUSTIFY_LEFT = 1;
export const ASS_JUSTIFY_CENTER = 2;
export const ASS_JUSTIFY_RIGHT = 3;

export interface AssStyleRecord {
  readonly Name: string;
  readonly FontName: string;
  readonly FontSize: number;
  readonly PrimaryColour: number;
  readonly SecondaryColour: number;
  readonly OutlineColour: number;
  readonly BackColour: number;
  readonly Bold: number;
  readonly Italic: number;
  readonly Underline: number;
  readonly StrikeOut: number;
  readonly ScaleX: number;
  readonly ScaleY: number;
  readonly Spacing: number;
  readonly Angle: number;
  readonly BorderStyle: number;
  readonly Outline: number;
  readonly Shadow: number;
  readonly Alignment: number;
  readonly MarginL: number;
  readonly MarginR: number;
  readonly MarginV: number;
  readonly Encoding: number;
  readonly treat_fontname_as_pattern: number;
  readonly Blur: number;
  readonly Justify: number;
}

export interface AssEventRecord {
  readonly Start: number;
  readonly Duration: number;
  readonly ReadOrder: number;
  readonly Layer: number;
  readonly Style: number;
  readonly Name: string;
  readonly MarginL: number;
  readonly MarginR: number;
  readonly MarginV: number;
  readonly Effect: string;
  readonly Text: string;
}

export interface AssScriptInfo {
  readonly trackType: AssTrackType;
  readonly playResX: number;
  readonly playResY: number;
  readonly resolvedPlayResX: number;
  readonly resolvedPlayResY: number;
  readonly layoutResX: number;
  readonly layoutResY: number;
  readonly timer: number;
  readonly wrapStyle: number;
  readonly scaledBorderAndShadow: number;
  readonly kerning: number;
  readonly language: string | undefined;
  readonly ycbcrMatrix: AssYCbCrMatrix;
  readonly headerFlags: number;
}

export class AssStringTable {
  private readonly strings: string[] = [''];
  private readonly indexByString = new Map<string, number>([['', 0]]);

  intern(value: string): number {
    const existing = this.indexByString.get(value);
    if (existing !== undefined) return existing;
    const id = this.strings.length;
    this.strings.push(value);
    this.indexByString.set(value, id);
    return id;
  }

  get(id: number): string {
    return this.strings[id] ?? '';
  }

  get size(): number {
    return this.strings.length;
  }
}

export class AssStyleArena {
  readonly count: number;
  readonly nameId: Int32Array;
  readonly fontNameId: Int32Array;
  readonly fontSize: Float64Array;
  readonly primaryColour: Uint32Array;
  readonly secondaryColour: Uint32Array;
  readonly outlineColour: Uint32Array;
  readonly backColour: Uint32Array;
  readonly bold: Int32Array;
  readonly italic: Int32Array;
  readonly underline: Int32Array;
  readonly strikeOut: Int32Array;
  readonly scaleX: Float64Array;
  readonly scaleY: Float64Array;
  readonly spacing: Float64Array;
  readonly angle: Float64Array;
  readonly borderStyle: Int32Array;
  readonly outline: Float64Array;
  readonly shadow: Float64Array;
  readonly alignment: Int32Array;
  readonly marginL: Int32Array;
  readonly marginR: Int32Array;
  readonly marginV: Int32Array;
  readonly encoding: Int32Array;
  readonly treatFontnameAsPattern: Int32Array;
  readonly blur: Float64Array;
  readonly justify: Int32Array;
  private readonly strings: AssStringTable;

  constructor(count: number, strings: AssStringTable) {
    this.count = count;
    this.strings = strings;
    this.nameId = new Int32Array(count);
    this.fontNameId = new Int32Array(count);
    this.fontSize = new Float64Array(count);
    this.primaryColour = new Uint32Array(count);
    this.secondaryColour = new Uint32Array(count);
    this.outlineColour = new Uint32Array(count);
    this.backColour = new Uint32Array(count);
    this.bold = new Int32Array(count);
    this.italic = new Int32Array(count);
    this.underline = new Int32Array(count);
    this.strikeOut = new Int32Array(count);
    this.scaleX = new Float64Array(count);
    this.scaleY = new Float64Array(count);
    this.spacing = new Float64Array(count);
    this.angle = new Float64Array(count);
    this.borderStyle = new Int32Array(count);
    this.outline = new Float64Array(count);
    this.shadow = new Float64Array(count);
    this.alignment = new Int32Array(count);
    this.marginL = new Int32Array(count);
    this.marginR = new Int32Array(count);
    this.marginV = new Int32Array(count);
    this.encoding = new Int32Array(count);
    this.treatFontnameAsPattern = new Int32Array(count);
    this.blur = new Float64Array(count);
    this.justify = new Int32Array(count);
  }

  getRecord(index: number): AssStyleRecord {
    return {
      Name: this.strings.get(this.nameId[index] as number),
      FontName: this.strings.get(this.fontNameId[index] as number),
      FontSize: this.fontSize[index] as number,
      PrimaryColour: this.primaryColour[index] as number,
      SecondaryColour: this.secondaryColour[index] as number,
      OutlineColour: this.outlineColour[index] as number,
      BackColour: this.backColour[index] as number,
      Bold: this.bold[index] as number,
      Italic: this.italic[index] as number,
      Underline: this.underline[index] as number,
      StrikeOut: this.strikeOut[index] as number,
      ScaleX: this.scaleX[index] as number,
      ScaleY: this.scaleY[index] as number,
      Spacing: this.spacing[index] as number,
      Angle: this.angle[index] as number,
      BorderStyle: this.borderStyle[index] as number,
      Outline: this.outline[index] as number,
      Shadow: this.shadow[index] as number,
      Alignment: this.alignment[index] as number,
      MarginL: this.marginL[index] as number,
      MarginR: this.marginR[index] as number,
      MarginV: this.marginV[index] as number,
      Encoding: this.encoding[index] as number,
      treat_fontname_as_pattern: this.treatFontnameAsPattern[index] as number,
      Blur: this.blur[index] as number,
      Justify: this.justify[index] as number,
    };
  }

  toArray(): AssStyleRecord[] {
    const out: AssStyleRecord[] = [];
    for (let i = 0; i < this.count; i++) {
      out.push(this.getRecord(i));
    }
    return out;
  }
}

export class AssEventArena {
  readonly count: number;
  readonly start: Float64Array;
  readonly duration: Float64Array;
  readonly end: Float64Array;
  readonly readOrder: Int32Array;
  readonly layer: Int32Array;
  readonly style: Int32Array;
  readonly nameId: Int32Array;
  readonly marginL: Int32Array;
  readonly marginR: Int32Array;
  readonly marginV: Int32Array;
  readonly effectId: Int32Array;
  readonly textId: Int32Array;
  private readonly strings: AssStringTable;

  constructor(count: number, strings: AssStringTable) {
    this.count = count;
    this.strings = strings;
    this.start = new Float64Array(count);
    this.duration = new Float64Array(count);
    this.end = new Float64Array(count);
    this.readOrder = new Int32Array(count);
    this.layer = new Int32Array(count);
    this.style = new Int32Array(count);
    this.nameId = new Int32Array(count);
    this.marginL = new Int32Array(count);
    this.marginR = new Int32Array(count);
    this.marginV = new Int32Array(count);
    this.effectId = new Int32Array(count);
    this.textId = new Int32Array(count);
  }

  getRecord(index: number, unsignedTime = false): AssEventRecord {
    const startVal = this.start[index] as number;
    const durationVal = this.duration[index] as number;
    return {
      Start: unsignedTime ? startVal >>> 0 : startVal,
      Duration: unsignedTime ? durationVal >>> 0 : durationVal,
      ReadOrder: this.readOrder[index] as number,
      Layer: this.layer[index] as number,
      Style: this.style[index] as number,
      Name: this.strings.get(this.nameId[index] as number),
      MarginL: this.marginL[index] as number,
      MarginR: this.marginR[index] as number,
      MarginV: this.marginV[index] as number,
      Effect: this.strings.get(this.effectId[index] as number),
      Text: this.strings.get(this.textId[index] as number),
    };
  }

  toArray(unsignedTime = false): AssEventRecord[] {
    const out: AssEventRecord[] = [];
    for (let i = 0; i < this.count; i++) {
      out.push(this.getRecord(i, unsignedTime));
    }
    return out;
  }
}

// Ported from libass/ass.c:ass_lazy_track_init.
export function resolvePlayRes(
  playResX: number,
  playResY: number,
  onWarning?: (code: string, message: string) => void,
): { readonly x: number; readonly y: number } {
  if (playResX > 0 && playResY > 0) {
    return { x: playResX, y: playResY };
  }
  if (playResX <= 0 && playResY <= 0) {
    onWarning?.('ass-missing-playres', 'Neither PlayResX nor PlayResY defined. Assuming 384x288');
    return { x: 384, y: 288 };
  }
  if (playResY <= 0 && playResX === 1280) {
    onWarning?.('ass-missing-playres-y', 'PlayResY undefined, setting to 1024');
    return { x: playResX, y: 1024 };
  }
  if (playResY <= 0) {
    const xm1 = (playResX - 1) >>> 0;
    const y = Math.max(1, (xm1 - Math.trunc(xm1 / 4)) | 0);
    onWarning?.('ass-missing-playres-y', `PlayResY undefined, setting to ${y}`);
    return { x: playResX, y };
  }
  if (playResX <= 0 && playResY === 1024) {
    onWarning?.('ass-missing-playres-x', 'PlayResX undefined, setting to 1280');
    return { x: 1280, y: playResY };
  }
  const yu = playResY >>> 0;
  const x = Math.min(yu + Math.trunc(yu / 3), 0x7fffffff) | 0;
  onWarning?.('ass-missing-playres-x', `PlayResX undefined, setting to ${x}`);
  return { x, y: playResY };
}

export class AssTrack {
  readonly info: AssScriptInfo;
  readonly styles: AssStyleArena;
  readonly events: AssEventArena;
  readonly strings: AssStringTable;
  readonly fonts: readonly AssEmbeddedFont[];
  readonly defaultStyle: number;
  readonly styleFormat: string | undefined;
  readonly eventFormat: string | undefined;
  readonly timeIndex: TimeIndex;
  /** Event rank by `(Layer, ReadOrder)`, libass `cmp_event_layer`. */
  readonly layerRank: Int32Array;

  constructor(init: {
    readonly info: AssScriptInfo;
    readonly styles: AssStyleArena;
    readonly events: AssEventArena;
    readonly strings: AssStringTable;
    readonly fonts: readonly AssEmbeddedFont[];
    readonly defaultStyle: number;
    readonly styleFormat: string | undefined;
    readonly eventFormat: string | undefined;
  }) {
    this.info = init.info;
    this.styles = init.styles;
    this.events = init.events;
    this.strings = init.strings;
    this.fonts = init.fonts;
    this.defaultStyle = init.defaultStyle;
    this.styleFormat = init.styleFormat;
    this.eventFormat = init.eventFormat;
    this.timeIndex = new TimeIndex(init.events.start, init.events.end);
    this.layerRank = TimeIndex.rankBy(init.events.layer, init.events.readOrder);
  }

  /** Writes active event indices at `timeMs` into `out` ordered by `(Layer, ReadOrder)`. */
  /** @frameLoop */
  queryActiveEvents(timeMs: number, out: Int32Array): number {
    return this.timeIndex.queryRanked(timeMs, this.layerRank, out);
  }
}
