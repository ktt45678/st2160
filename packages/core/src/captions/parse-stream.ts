import { type ErrorEvent, St2160Error } from '../errors/index.js';
import { TimeIndex } from '../timing/index.js';
import type { CaptionCue, CaptionFormat, CaptionRegion, CaptionStyleRule } from './cue.js';
import { LineSplitter } from './line-splitter.js';
import { type CaptionParseReason, createParseError } from './parse-error.js';
import { SrtLineParser } from './srt-parser.js';
import { VttLineParser } from './vtt-parser.js';

export interface ParseCaptionsOptions {
  /** Defaults to `'vtt'`. */
  readonly format?: CaptionFormat;
  /** In strict mode, the first `parse-error` rejects and cancels the stream. */
  readonly strict?: boolean;
  readonly signal?: AbortSignal;
  /** Chunk processing time budget before yielding to the event loop, in ms. Default 20. */
  readonly yieldIntervalMs?: number;
  readonly onHeader?: (metadata: Readonly<Record<string, string>>) => void;
  readonly onRegion?: (region: CaptionRegion) => void;
  readonly onStyle?: (rules: readonly CaptionStyleRule[]) => void;
  readonly onCue?: (cue: CaptionCue) => void;
  readonly onError?: (event: ErrorEvent) => void;
}

export interface ParsedCaptions {
  readonly format: CaptionFormat;
  readonly metadata: Readonly<Record<string, string>>;
  readonly regions: readonly CaptionRegion[];
  readonly styles: readonly CaptionStyleRule[];
  readonly cues: readonly CaptionCue[];
  readonly errors: readonly St2160Error[];
  readonly index: TimeIndex;
}

export function buildCueTimeIndex(cues: readonly CaptionCue[]): TimeIndex {
  const starts = new Float64Array(cues.length);
  const ends = new Float64Array(cues.length);
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i] as CaptionCue;
    starts[i] = cue.start;
    ends[i] = cue.end;
  }
  return new TimeIndex(starts, ends);
}

/** Synchronous parse of a full WebVTT or SRT string. */
export function parseCaptions(text: string, options: ParseCaptionsOptions = {}): ParsedCaptions {
  const format = options.format ?? 'vtt';
  const strict = options.strict ?? false;
  const errors: St2160Error[] = [];

  const report = (reason: CaptionParseReason, line: number, message: string): void => {
    const error = createParseError(format, reason, line, message);
    errors.push(error);
    options.onError?.({ type: 'error', error });
    if (strict) throw error;
  };

  if (format === 'srt') {
    const parser = new SrtLineParser({
      ...(options.onCue ? { onCue: options.onCue } : {}),
      report,
    });
    const splitter = new LineSplitter((line) => parser.pushLine(line));
    splitter.push(text);
    splitter.end();
    parser.finish();
    return {
      format,
      metadata: {},
      regions: [],
      styles: [],
      cues: parser.cues,
      errors,
      index: buildCueTimeIndex(parser.cues),
    };
  }

  const parser = new VttLineParser(
    {
      ...(options.onHeader ? { onHeader: options.onHeader } : {}),
      ...(options.onRegion ? { onRegion: options.onRegion } : {}),
      ...(options.onStyle ? { onStyle: options.onStyle } : {}),
      ...(options.onCue ? { onCue: options.onCue } : {}),
      report,
    },
    strict,
  );
  const splitter = new LineSplitter((line) => parser.pushLine(line));
  splitter.push(text);
  splitter.end();
  parser.finish();
  return {
    format,
    metadata: parser.metadata,
    regions: parser.regions,
    styles: parser.styles,
    cues: parser.cues,
    errors,
    index: buildCueTimeIndex(parser.cues),
  };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new St2160Error('aborted', 'caption stream parse aborted', {
      cause: signal.reason,
    });
  }
}

function yieldToMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Streaming parse over a `ReadableStream<string>`, yielding when a slice exceeds budget. */
export async function parseCaptionStream(
  stream: ReadableStream<string>,
  options: ParseCaptionsOptions = {},
): Promise<ParsedCaptions> {
  const format = options.format ?? 'vtt';
  const strict = options.strict ?? false;
  const signal = options.signal;
  const budgetMs = options.yieldIntervalMs ?? 20;
  throwIfAborted(signal);

  const errors: St2160Error[] = [];
  const report = (reason: CaptionParseReason, line: number, message: string): void => {
    const error = createParseError(format, reason, line, message);
    errors.push(error);
    options.onError?.({ type: 'error', error });
    if (strict) throw error;
  };

  const vtt =
    format === 'vtt'
      ? new VttLineParser(
          {
            ...(options.onHeader ? { onHeader: options.onHeader } : {}),
            ...(options.onRegion ? { onRegion: options.onRegion } : {}),
            ...(options.onStyle ? { onStyle: options.onStyle } : {}),
            ...(options.onCue ? { onCue: options.onCue } : {}),
            report,
          },
          strict,
        )
      : null;
  const srt =
    format === 'srt'
      ? new SrtLineParser({
          ...(options.onCue ? { onCue: options.onCue } : {}),
          report,
        })
      : null;

  const lineQueue: string[] = [];
  const splitter = new LineSplitter((line) => lineQueue.push(line));
  const reader = stream.getReader();

  const onAbort = (): void => {
    void reader.cancel(signal?.reason);
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  let sliceStart = performance.now();
  const drainQueue = async (): Promise<void> => {
    let idx = 0;
    while (idx < lineQueue.length) {
      throwIfAborted(signal);
      const line = lineQueue[idx++] as string;
      if (vtt !== null) vtt.pushLine(line);
      else srt?.pushLine(line);
      if ((idx & 255) === 0 && performance.now() - sliceStart >= budgetMs) {
        await yieldToMacrotask();
        sliceStart = performance.now();
      }
    }
    lineQueue.length = 0;
  };

  try {
    while (true) {
      throwIfAborted(signal);
      const { value, done } = await reader.read();
      throwIfAborted(signal);
      if (done) break;
      if (value.length > 0) {
        splitter.push(value);
        await drainQueue();
      }
    }
    splitter.end();
    await drainQueue();
    if (vtt !== null) vtt.finish();
    else srt?.finish();
    if (performance.now() - sliceStart >= budgetMs) {
      await yieldToMacrotask();
    }
  } catch (err) {
    await reader.cancel(err).catch(() => {});
    throw err;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }

  const cues = vtt !== null ? vtt.cues : (srt as SrtLineParser).cues;
  return {
    format,
    metadata: vtt !== null ? vtt.metadata : {},
    regions: vtt !== null ? vtt.regions : [],
    styles: vtt !== null ? vtt.styles : [],
    cues,
    errors,
    index: buildCueTimeIndex(cues),
  };
}

/** Streaming parse over a byte `ReadableStream<Uint8Array>`. */
export function parseCaptionByteStream(
  stream: ReadableStream<Uint8Array>,
  options: ParseCaptionsOptions & { readonly encoding?: string } = {},
): Promise<ParsedCaptions> {
  const decoder = new TextDecoder(options.encoding ?? 'utf-8');
  const reader = stream.getReader();
  const textStream = new ReadableStream<string>({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) {
        const tail = decoder.decode();
        if (tail.length > 0) controller.enqueue(tail);
        controller.close();
        reader.releaseLock();
        return;
      }
      const chunk = decoder.decode(value, { stream: true });
      if (chunk.length > 0) controller.enqueue(chunk);
    },
    async cancel(reason) {
      await reader.cancel(reason);
      reader.releaseLock();
    },
  });
  return parseCaptionStream(textStream, options);
}
