import { St2160Error } from '../errors/index.js';
import type { CaptionFormat } from './cue.js';

export type CaptionParseReason =
  | 'bad-signature'
  | 'bad-timestamp'
  | 'bad-setting'
  | 'unknown-setting'
  | 'bad-region-setting'
  | 'unknown-region-setting'
  | 'orphan-text';

export interface CaptionParseDetails extends Readonly<Record<string, unknown>> {
  readonly format: CaptionFormat;
  readonly reason: CaptionParseReason;
  /** 1-based line number in the source. */
  readonly line: number;
}

/** Receives every parse problem. Throwing from it stops the parse (strict mode). */
export type ParseReporter = (reason: CaptionParseReason, line: number, message: string) => void;

export function createParseError(
  format: CaptionFormat,
  reason: CaptionParseReason,
  line: number,
  message: string,
): St2160Error {
  const details: CaptionParseDetails = { format, reason, line };
  return new St2160Error('parse-error', `${format} line ${line}: ${message}`, { details });
}

export function parseDetails(error: St2160Error): CaptionParseDetails | undefined {
  return error.code === 'parse-error' ? (error.details as CaptionParseDetails) : undefined;
}
