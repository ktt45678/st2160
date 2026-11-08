export type CaptionFormat = 'vtt' | 'srt';

export type CueVertical = '' | 'rl' | 'lr';
export type CueLineAlign = 'start' | 'center' | 'end';
export type CuePositionAlign = 'line-left' | 'center' | 'line-right' | 'auto';
export type CueAlign = 'start' | 'center' | 'end' | 'left' | 'right';

/** A WebVTT region, with the same fields and defaults as `VTTRegion`. */
export interface CaptionRegion {
  id: string;
  /** Percent of the video width. */
  width: number;
  lines: number;
  regionAnchorX: number;
  regionAnchorY: number;
  viewportAnchorX: number;
  viewportAnchorY: number;
  scroll: '' | 'up';
}

export interface CueTextNode {
  readonly type: 'text';
  readonly value: string;
}

/** Inline `<hh:mm:ss.ttt>` marker for karaoke-style past and future styling. */
export interface CueTimestampNode {
  readonly type: 'timestamp';
  /** Seconds. */
  readonly time: number;
}

export type CueElementType = 'c' | 'i' | 'b' | 'u' | 's' | 'ruby' | 'rt' | 'v' | 'lang' | 'font';

export interface CueElementNode {
  readonly type: CueElementType;
  readonly classes: readonly string[];
  /** Voice name for `v`, language tag for `lang`, otherwise empty. */
  readonly annotation: string;
  /** SRT `<font color>`, sanitized. */
  readonly color?: string;
  /** SRT `<font face>`, sanitized. */
  readonly face?: string;
  /** SRT `<font size>`, sanitized. */
  readonly size?: string;
  readonly children: readonly CueNode[];
}

export type CueNode = CueTextNode | CueTimestampNode | CueElementNode;

/** One SRT or WebVTT cue. Settings mirror `VTTCue` so the native fallback can copy them. */
export interface CaptionCue {
  id: string;
  /** Seconds. */
  start: number;
  /** Seconds. */
  end: number;
  /** Raw cue text, tags included. */
  text: string;
  nodes: readonly CueNode[];
  region: CaptionRegion | null;
  vertical: CueVertical;
  snapToLines: boolean;
  line: number | 'auto';
  lineAlign: CueLineAlign;
  position: number | 'auto';
  positionAlign: CuePositionAlign;
  size: number;
  align: CueAlign;
  format: CaptionFormat;
}

export interface CaptionStyleDeclaration {
  readonly property: string;
  readonly value: string;
}

/** One sanitized `STYLE` rule. The renderer scopes it to its own cue tree. */
export interface CaptionStyleRule {
  /** `cue` for `::cue` rules, `region` for `::cue-region` rules. */
  readonly target: 'cue' | 'region';
  /** Argument of `::cue(...)` or `::cue-region(...)`, empty for the bare pseudo-element. */
  readonly selector: string;
  readonly declarations: readonly CaptionStyleDeclaration[];
}

export function createRegion(): CaptionRegion {
  return {
    id: '',
    width: 100,
    lines: 3,
    regionAnchorX: 0,
    regionAnchorY: 100,
    viewportAnchorX: 0,
    viewportAnchorY: 100,
    scroll: '',
  };
}

export function createCue(
  format: CaptionFormat,
  id: string,
  start: number,
  end: number,
): CaptionCue {
  return {
    id,
    start,
    end,
    text: '',
    nodes: [],
    region: null,
    vertical: '',
    snapToLines: true,
    line: 'auto',
    lineAlign: 'start',
    position: 'auto',
    positionAlign: 'auto',
    size: 100,
    align: 'center',
    format,
  };
}
