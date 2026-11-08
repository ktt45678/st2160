// Ported from the W3C WebVTT spec, section 6.1, with media-captions (MIT) as a reference.
import {
  type CaptionCue,
  type CaptionRegion,
  type CaptionStyleRule,
  createCue,
  createRegion,
} from './cue.js';
import type { ParseReporter } from './parse-error.js';
import { isAsciiWhitespace, parseRegionSettings, parseTimingsAndSettings } from './vtt-settings.js';
import { parseVttStyleBlock } from './vtt-style.js';
import { tokenizeVttCueText } from './vtt-tokenizer.js';

export interface VttConsumer {
  onHeader?(metadata: Readonly<Record<string, string>>): void;
  onRegion?(region: CaptionRegion): void;
  onStyle?(rules: readonly CaptionStyleRule[]): void;
  onCue?(cue: CaptionCue): void;
  report?: ParseReporter;
}

const PHASE_SIGNATURE = 0;
const PHASE_HEADER_START = 1;
const PHASE_IN_HEADER = 2;
const PHASE_SKIP_LF = 3;
const PHASE_BLOCK_LOOP = 4;
const PHASE_ABORTED = 5;

const BLOCK_NONE = 0;
const BLOCK_CUE = 1;
const BLOCK_REGION = 2;
const BLOCK_STYLE = 3;
const BLOCK_NOTE = 4;

function isBlockKeyword(buffer: string, keyword: string): boolean {
  if (!buffer.startsWith(keyword)) return false;
  for (let i = keyword.length; i < buffer.length; i++) {
    if (!isAsciiWhitespace(buffer.charCodeAt(i))) return false;
  }
  return true;
}

/** Incremental line-by-line WebVTT parser matching W3C WebVTT section 6.1. */
export class VttLineParser {
  readonly metadata: Record<string, string> = {};
  readonly regions: CaptionRegion[] = [];
  readonly styles: CaptionStyleRule[] = [];
  readonly cues: CaptionCue[] = [];

  private readonly consumer: VttConsumer;
  private readonly strict: boolean;
  private phase = PHASE_SIGNATURE;
  private lineNumber = 0;
  private seenCue = false;

  private blockKind = BLOCK_NONE;
  private blockLineCount = 0;
  private blockStartLine = 1;
  private seenArrow = false;
  private buffer = '';
  private currentCue: CaptionCue | null = null;
  private currentRegion: CaptionRegion | null = null;
  private headerEmitted = false;

  constructor(consumer: VttConsumer = {}, strict = false) {
    this.consumer = consumer;
    this.strict = strict;
  }

  pushLine(line: string): void {
    this.lineNumber++;
    if (this.phase === PHASE_ABORTED) return;

    if (this.phase === PHASE_SIGNATURE) {
      if (this.checkSignature(line)) {
        this.phase = PHASE_HEADER_START;
        return;
      }
      this.report('bad-signature', this.lineNumber, 'missing or invalid WEBVTT signature');
      if (this.strict) {
        this.phase = PHASE_ABORTED;
        return;
      }
      this.phase = PHASE_SKIP_LF;
    }

    if (this.phase === PHASE_HEADER_START) {
      if (line === '') {
        this.emitHeader();
        this.phase = PHASE_SKIP_LF;
        return;
      }
      this.phase = PHASE_IN_HEADER;
      this.resetBlock();
    }

    if (this.phase === PHASE_IN_HEADER) {
      this.stepHeaderBlock(line);
      return;
    }

    if (this.phase === PHASE_SKIP_LF) {
      if (line === '') return;
      this.phase = PHASE_BLOCK_LOOP;
      this.resetBlock();
    }

    if (this.phase === PHASE_BLOCK_LOOP) {
      this.stepBlock(line);
    }
  }

  finish(): void {
    if (this.phase === PHASE_ABORTED) return;
    if (this.phase === PHASE_SIGNATURE) {
      this.report('bad-signature', 1, 'missing or invalid WEBVTT signature');
      this.phase = PHASE_ABORTED;
      return;
    }
    if (this.phase === PHASE_HEADER_START || this.phase === PHASE_IN_HEADER) {
      this.emitHeader();
      return;
    }
    if (this.phase === PHASE_BLOCK_LOOP && this.blockLineCount > 0) {
      this.finalizeBlock();
    }
  }

  private checkSignature(line: string): boolean {
    if (line === 'WEBVTT') return true;
    if (line.length > 6 && line.startsWith('WEBVTT')) {
      const c = line.charCodeAt(6);
      return c === 0x20 || c === 0x09;
    }
    return false;
  }

  private emitHeader(): void {
    if (this.headerEmitted) return;
    this.headerEmitted = true;
    this.consumer.onHeader?.(this.metadata);
  }

  private stepHeaderBlock(line: string): void {
    this.blockLineCount++;
    if (line.includes('-->')) {
      this.emitHeader();
      this.phase = PHASE_BLOCK_LOOP;
      this.resetBlock();
      this.stepBlock(line);
      return;
    }
    if (line === '') {
      this.emitHeader();
      this.phase = PHASE_SKIP_LF;
      return;
    }
    const colon = line.indexOf(':');
    if (colon > 0) {
      const key = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      if (key.length > 0) this.metadata[key] = value;
    }
  }

  private stepBlock(line: string): void {
    this.blockLineCount++;
    if (this.blockLineCount === 1) this.blockStartLine = this.lineNumber;

    if (line.includes('-->')) {
      if (this.blockLineCount === 1 || (this.blockLineCount === 2 && !this.seenArrow)) {
        this.seenArrow = true;
        const cue = createCue('vtt', this.buffer, 0, 0);
        const ok = parseTimingsAndSettings(line, this.regions, cue, (kind, setting) => {
          this.report(
            kind === 'unknown' ? 'unknown-setting' : 'bad-setting',
            this.lineNumber,
            `${kind} cue setting: ${setting}`,
          );
        });
        if (ok) {
          this.currentCue = cue;
          this.blockKind = BLOCK_CUE;
          this.buffer = '';
          this.seenCue = true;
        } else {
          this.report('bad-timestamp', this.lineNumber, `invalid cue timings: ${line}`);
          this.currentCue = null;
          this.blockKind = BLOCK_NONE;
        }
        return;
      }
      this.finalizeBlock();
      this.resetBlock();
      this.stepBlock(line);
      return;
    }

    if (line === '') {
      this.finalizeBlock();
      this.phase = PHASE_SKIP_LF;
      return;
    }

    if (this.blockLineCount === 2 && !this.seenCue) {
      if (isBlockKeyword(this.buffer, 'STYLE')) {
        this.blockKind = BLOCK_STYLE;
        this.buffer = '';
      } else if (isBlockKeyword(this.buffer, 'REGION')) {
        this.blockKind = BLOCK_REGION;
        this.currentRegion = createRegion();
        this.buffer = '';
      }
    }
    if (this.blockLineCount === 1 && isBlockKeyword(line, 'NOTE')) {
      this.blockKind = BLOCK_NOTE;
    } else if (this.blockLineCount === 1 && line.startsWith('NOTE')) {
      const after = line.charCodeAt(4);
      if (after === 0x20 || after === 0x09) this.blockKind = BLOCK_NOTE;
    }

    if (this.buffer.length > 0) this.buffer += '\n';
    this.buffer += line;
  }

  private finalizeBlock(): void {
    if (this.currentCue !== null) {
      const cue = this.currentCue;
      cue.text = this.buffer;
      cue.nodes = tokenizeVttCueText(cue.text);
      this.cues.push(cue);
      this.consumer.onCue?.(cue);
    } else if (this.blockKind === BLOCK_STYLE) {
      const rules = parseVttStyleBlock(this.buffer);
      if (rules.length > 0) {
        this.styles.push(...rules);
        this.consumer.onStyle?.(rules);
      }
    } else if (this.currentRegion !== null) {
      const region = this.currentRegion;
      parseRegionSettings(this.buffer, region, (kind, setting) => {
        this.report(
          kind === 'unknown' ? 'unknown-region-setting' : 'bad-region-setting',
          this.blockStartLine,
          `${kind} region setting: ${setting}`,
        );
      });
      this.regions.push(region);
      this.consumer.onRegion?.(region);
    }
    this.resetBlock();
  }

  private resetBlock(): void {
    this.blockKind = BLOCK_NONE;
    this.blockLineCount = 0;
    this.seenArrow = false;
    this.buffer = '';
    this.currentCue = null;
    this.currentRegion = null;
  }

  private report(reason: Parameters<ParseReporter>[0], line: number, message: string): void {
    this.consumer.report?.(reason, line, message);
  }
}
