import { describe, expect, it } from 'vitest';
import {
  applyNumpadAlignment,
  type CaptionCue,
  type CaptionRegion,
  type CaptionStyleRule,
  createCue,
  type ErrorEvent,
  isSt2160Error,
  LineSplitter,
  parseCaptionByteStream,
  parseCaptionStream,
  parseCaptions,
  parseDetails,
  parseTimestamp,
  parseVttStyleBlock,
  tokenizeVttCueText,
} from '../src/index.ts';

function streamFromChunks(chunks: readonly string[]): ReadableStream<string> {
  let i = 0;
  return new ReadableStream<string>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[i++] as string);
    },
  });
}

describe('LineSplitter', () => {
  it('strips BOM, normalizes CRLF/CR/LF across chunks, and replaces NUL with U+FFFD', () => {
    const lines: string[] = [];
    const splitter = new LineSplitter((line) => lines.push(line));
    splitter.push('\uFEFFfirst\r');
    splitter.push('\nsecond\rthird\nfourth\0end');
    splitter.end();
    expect(lines).toEqual(['first', 'second', 'third', 'fourth\uFFFDend']);
  });
});

describe('WebVTT parser (media-captions port + STYLE + streaming)', () => {
  it('parses header metadata, regions, cues and settings', () => {
    const vtt = [
      'WEBVTT - Demo',
      'Kind: captions',
      'Language: en-US',
      '',
      'REGION',
      'id:top width:80% lines:2 regionanchor:10%,20% viewportanchor:15%,25% scroll:up',
      '',
      'NOTE comment block',
      'still comment',
      '',
      'cue-1',
      '00:00:01.000 --> 00:00:03.500 region:top align:start position:20%,line-left',
      'Hello <b>world</b>!',
      '',
      '00:04.000 --> 00:06.000 vertical:rl line:50%,center size:60%',
      '<v.loud Roger>Line 1',
      'Line 2',
    ].join('\n');

    const headers: Readonly<Record<string, string>>[] = [];
    const regions: CaptionRegion[] = [];
    const cues: CaptionCue[] = [];
    const result = parseCaptions(vtt, {
      format: 'vtt',
      onHeader: (m) => headers.push(m),
      onRegion: (r) => regions.push(r),
      onCue: (c) => cues.push(c),
    });

    expect(result.errors).toEqual([]);
    expect(headers).toEqual([{ Kind: 'captions', Language: 'en-US' }]);
    expect(regions).toHaveLength(1);
    expect(regions[0]).toEqual({
      id: 'top',
      width: 80,
      lines: 2,
      regionAnchorX: 10,
      regionAnchorY: 20,
      viewportAnchorX: 15,
      viewportAnchorY: 25,
      scroll: 'up',
    });

    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({
      id: 'cue-1',
      start: 1,
      end: 3.5,
      region: regions[0],
      align: 'start',
      position: 20,
      positionAlign: 'line-left',
      text: 'Hello <b>world</b>!',
      format: 'vtt',
    });
    expect(cues[1]).toMatchObject({
      id: '',
      start: 4,
      end: 6,
      region: null,
      vertical: 'rl',
      line: 50,
      snapToLines: false,
      lineAlign: 'center',
      size: 60,
    });

    const buf = new Int32Array(2);
    expect(result.index.query(2, buf)).toBe(1);
    expect(buf[0]).toBe(0);
    expect(result.index.query(5, buf)).toBe(1);
    expect(buf[0]).toBe(1);
  });

  it('parses and sanitizes STYLE blocks per WebVTT spec', () => {
    const vtt = [
      'WEBVTT',
      '',
      'STYLE',
      '/* comment with -- > inside */',
      '::cue {',
      '  color: lime;',
      '  background-color: rgba(0, 0, 0, 0.8);',
      '  position: fixed;',
      '  width: 100px;',
      '  background-image: url(https://evil.example/x.png);',
      '}',
      'video::cue(v[voice="Roger"]), ::cue(c.yellow) {',
      '  font-weight: bold !important;',
      '  text-shadow: 1px 1px 2px black;',
      '}',
      '::cue(:root) { opacity: 0.9; }',
      '::cue-region { background-color: black; }',
      '::cue-region(#top) { color: white; }',
      '::cue-region(.bad) { color: red; }',
      '.not-cue { color: red; }',
      '',
      '00:00.000 --> 00:02.000',
      'Text',
      '',
      'STYLE',
      '::cue { color: red; }',
    ].join('\n');

    const seenStyles: CaptionStyleRule[][] = [];
    const result = parseCaptions(vtt, {
      format: 'vtt',
      onStyle: (rules) => seenStyles.push([...rules]),
    });

    expect(seenStyles).toHaveLength(1);
    expect(result.styles).toEqual([
      {
        target: 'cue',
        selector: '',
        declarations: [
          { property: 'color', value: 'lime' },
          { property: 'background-color', value: 'rgba(0, 0, 0, 0.8)' },
        ],
      },
      {
        target: 'cue',
        selector: 'v[voice="Roger"]',
        declarations: [
          { property: 'font-weight', value: 'bold' },
          { property: 'text-shadow', value: '1px 1px 2px black' },
        ],
      },
      {
        target: 'cue',
        selector: 'c.yellow',
        declarations: [
          { property: 'font-weight', value: 'bold' },
          { property: 'text-shadow', value: '1px 1px 2px black' },
        ],
      },
      {
        target: 'cue',
        selector: '',
        declarations: [{ property: 'opacity', value: '0.9' }],
      },
      {
        target: 'region',
        selector: '',
        declarations: [{ property: 'background-color', value: 'black' }],
      },
      {
        target: 'region',
        selector: '#top',
        declarations: [{ property: 'color', value: 'white' }],
      },
    ]);
    expect(parseVttStyleBlock('@import "x.css"; ::cue() { color: red }')).toEqual([]);
  });

  it('reports parse errors with line numbers in lenient mode and throws in strict mode', () => {
    const bad = ['NOT_WEBVTT', '', '00:00.000 --> 00:01.000 unknown:1 size:999%', 'Cue text'].join(
      '\n',
    );

    const events: ErrorEvent[] = [];
    const lenient = parseCaptions(bad, {
      format: 'vtt',
      onError: (ev) => events.push(ev),
    });

    expect(lenient.cues).toHaveLength(1);
    expect(events.map((e) => parseDetails(e.error))).toEqual([
      { format: 'vtt', reason: 'bad-signature', line: 1 },
      { format: 'vtt', reason: 'unknown-setting', line: 3 },
      { format: 'vtt', reason: 'bad-setting', line: 3 },
    ]);

    expect(() => parseCaptions(bad, { format: 'vtt', strict: true })).toThrowError(
      expect.objectContaining({ code: 'parse-error' }),
    );
  });

  it('tokenizes cue text tags, classes, annotations, timestamps and entities', () => {
    const nodes = tokenizeVttCueText(
      '<c.lime.bg_black><i><b><u>Hi &amp; <ruby>base<rt>top</rt></ruby></u></b></i></c><v.loud Bob> <00:01.500><lang en-GB>yo</lang></v>',
    );
    expect(nodes).toEqual([
      {
        type: 'c',
        classes: ['lime', 'bg_black'],
        annotation: '',
        children: [
          {
            type: 'i',
            classes: [],
            annotation: '',
            children: [
              {
                type: 'b',
                classes: [],
                annotation: '',
                children: [
                  {
                    type: 'u',
                    classes: [],
                    annotation: '',
                    children: [
                      { type: 'text', value: 'Hi & ' },
                      {
                        type: 'ruby',
                        classes: [],
                        annotation: '',
                        children: [
                          { type: 'text', value: 'base' },
                          {
                            type: 'rt',
                            classes: [],
                            annotation: '',
                            children: [{ type: 'text', value: 'top' }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'v',
        classes: ['loud'],
        annotation: 'Bob',
        children: [
          { type: 'text', value: ' ' },
          { type: 'timestamp', time: 1.5 },
          {
            type: 'lang',
            classes: [],
            annotation: 'en-GB',
            children: [{ type: 'text', value: 'yo' }],
          },
        ],
      },
    ]);
    expect(parseTimestamp('01:02:03.456')).toBeCloseTo(3723.456);
    expect(parseTimestamp('00:60.000')).toBe(-1);
  });
});

describe('SRT parser (spec 04 section 3 item 1 + extended wild tags)', () => {
  it('handles comma and dot milliseconds, BOM, CRLF, missing blank lines and X1/Y1 coords', () => {
    const srt =
      '\uFEFF1\r\n' +
      '00:00:01,250 --> 00:00:03.500 X1:100 X2:500 Y1:50 Y2:100\r\n' +
      'First line\r\n' +
      'Second line\r\n' +
      '2\r\n' +
      '00:00:04,000 --> 00:00:05,000\r\n' +
      'No blank line before cue 2\r\n' +
      '00:00:06.000 --> 00:00:07.000\r\n' +
      'Cue 3 without numeric id';

    const result = parseCaptions(srt, { format: 'srt' });
    expect(result.errors).toEqual([]);
    expect(result.cues).toHaveLength(3);

    expect(result.cues[0]).toMatchObject({
      id: '1',
      start: 1.25,
      end: 3.5,
      text: 'First line\nSecond line',
      format: 'srt',
    });
    expect(result.cues[1]).toMatchObject({
      id: '2',
      start: 4,
      end: 5,
      text: 'No blank line before cue 2',
    });
    expect(result.cues[2]).toMatchObject({
      id: '',
      start: 6,
      end: 7,
      text: 'Cue 3 without numeric id',
    });
  });

  it('applies {\\anN} only at the start and maps all 9 numpad positions', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:02,000',
      '{\\an8}Top center',
      '',
      '2',
      '00:00:02,000 --> 00:00:03,000',
      'Mid-line {\\an1}tag stripped without moving cue',
      '',
      '3',
      '00:00:03,000 --> 00:00:04,000',
      '{\\a6}Legacy SSA top-center',
    ].join('\n');

    const { cues } = parseCaptions(srt, { format: 'srt' });
    expect(cues).toHaveLength(3);

    expect(cues[0]).toMatchObject({
      text: 'Top center',
      snapToLines: false,
      line: 0,
      lineAlign: 'start',
      position: 50,
      positionAlign: 'center',
      align: 'center',
    });

    expect(cues[1]).toMatchObject({
      text: 'Mid-line tag stripped without moving cue',
      snapToLines: true,
      line: 'auto',
      position: 'auto',
      align: 'center',
    });

    expect(cues[2]).toMatchObject({
      line: 0,
      lineAlign: 'start',
      position: 50,
      align: 'center',
    });

    const expected: Record<number, [number, string, number, string, string]> = {
      1: [100, 'end', 0, 'line-left', 'start'],
      2: [100, 'end', 50, 'center', 'center'],
      3: [100, 'end', 100, 'line-right', 'end'],
      4: [50, 'center', 0, 'line-left', 'start'],
      5: [50, 'center', 50, 'center', 'center'],
      6: [50, 'center', 100, 'line-right', 'end'],
      7: [0, 'start', 0, 'line-left', 'start'],
      8: [0, 'start', 50, 'center', 'center'],
      9: [0, 'start', 100, 'line-right', 'end'],
    };
    for (let n = 1; n <= 9; n++) {
      const cue = createCue('srt', '', 0, 1);
      applyNumpadAlignment(cue, n);
      const tuple = expected[n];
      expect([cue.line, cue.lineAlign, cue.position, cue.positionAlign, cue.align]).toEqual(tuple);
    }
  });

  it('parses HTML-like tags (i, b, u, s, font color/face/size, br) and inline ASS overrides', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:03,000',
      '<i>Italic</i> <b>Bold</b> <u>Under</u> <s>Strike</s> <font color="#ff00aa" face="Arial" size="18">Font</font>',
      '',
      '2',
      '00:00:04,000 --> 00:00:06,000',
      '{\\b1\\i1\\c&H0080FF&\\fnVerdana\\fs24}Override{\\r} plain\\Nnext\\hline <br/> {y:i}slanted{/y:i}',
    ].join('\n');

    const { cues } = parseCaptions(srt, { format: 'srt' });
    expect(cues).toHaveLength(2);
    expect(cues[0]?.nodes).toEqual([
      {
        type: 'i',
        classes: [],
        annotation: '',
        children: [{ type: 'text', value: 'Italic' }],
      },
      { type: 'text', value: ' ' },
      {
        type: 'b',
        classes: [],
        annotation: '',
        children: [{ type: 'text', value: 'Bold' }],
      },
      { type: 'text', value: ' ' },
      {
        type: 'u',
        classes: [],
        annotation: '',
        children: [{ type: 'text', value: 'Under' }],
      },
      { type: 'text', value: ' ' },
      {
        type: 's',
        classes: [],
        annotation: '',
        children: [{ type: 'text', value: 'Strike' }],
      },
      { type: 'text', value: ' ' },
      {
        type: 'font',
        classes: [],
        annotation: '',
        color: '#ff00aa',
        face: 'Arial',
        size: '18',
        children: [{ type: 'text', value: 'Font' }],
      },
    ]);

    expect(cues[1]?.nodes[0]).toEqual({
      type: 'font',
      classes: [],
      annotation: '',
      color: '#ff8000',
      face: 'Verdana',
      size: '24px',
      children: [
        {
          type: 'b',
          classes: [],
          annotation: '',
          children: [
            {
              type: 'i',
              classes: [],
              annotation: '',
              children: [{ type: 'text', value: 'Override' }],
            },
          ],
        },
      ],
    });
    expect(cues[1]?.nodes[1]).toEqual({
      type: 'text',
      value: ' plain\nnext\u00a0line \n ',
    });
    expect(cues[1]?.nodes[2]).toEqual({
      type: 'i',
      classes: [],
      annotation: '',
      children: [{ type: 'text', value: 'slanted' }],
    });
  });

  it('reports malformed SRT timestamps and orphan lines', () => {
    const srt = ['orphan', '1', '00:00:05,000 --> 00:00:02,000', 'bad', '', 'trailing'].join('\n');
    const result = parseCaptions(srt, { format: 'srt' });
    expect(result.cues).toHaveLength(0);
    expect(result.errors.map((e) => parseDetails(e)?.reason)).toEqual([
      'orphan-text',
      'bad-timestamp',
      'orphan-text',
    ]);
  });
});

describe('Streaming caption parser & 50 MB non-blocking gate', () => {
  it('parses byte streams and supports AbortSignal cancellation', async () => {
    const encoder = new TextEncoder();
    const bytes = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('WEBVTT\n\n00:00.000 --> '));
        controller.enqueue(encoder.encode('00:01.000\nHello\n'));
        controller.close();
      },
    });
    const parsed = await parseCaptionByteStream(bytes, { format: 'vtt' });
    expect(parsed.cues).toHaveLength(1);
    expect(parsed.cues[0]?.text).toBe('Hello');

    const abortController = new AbortController();
    const infinite = new ReadableStream<string>({
      pull(controller) {
        controller.enqueue('00:00.000 --> 00:01.000\nhi\n\n');
        abortController.abort();
      },
    });
    await expect(
      parseCaptionStream(infinite, { format: 'vtt', signal: abortController.signal }),
    ).rejects.toSatisfy((err) => isSt2160Error(err, 'aborted'));
  });

  it('parses a 50 MB VTT stream incrementally without blocking > 50 ms at a time', async () => {
    const block = '00:00:01.000 --> 00:00:02.000 align:center\nHello streaming subtitle world!\n\n';
    const blocksPerChunk = 1000;
    const chunkText = block.repeat(blocksPerChunk);
    const totalChunks = Math.ceil((50 * 1024 * 1024) / chunkText.length);
    let sent = 0;

    const stream = streamFromChunks(
      Array.from({ length: totalChunks + 1 }, (_, i) => (i === 0 ? 'WEBVTT\n\n' : chunkText)),
    );

    const gaps: number[] = [];
    let lastTick = performance.now();
    const ticker = setInterval(() => {
      const now = performance.now();
      gaps.push(now - lastTick);
      lastTick = now;
    }, 5);

    try {
      const result = await parseCaptionStream(stream, {
        format: 'vtt',
        yieldIntervalMs: 5,
        onCue: () => {
          sent++;
        },
      });
      clearInterval(ticker);
      expect(sent).toBe(totalChunks * blocksPerChunk);
      expect(result.cues.length).toBe(sent);
      // Event-loop gaps also include GC and runner pauses, so gate p99 and cap the worst gap.
      gaps.sort((a, b) => a - b);
      const p99 = gaps[Math.floor(gaps.length * 0.99)] as number;
      expect(gaps.length).toBeGreaterThan(20);
      expect(p99).toBeLessThan(50);
      expect(gaps[gaps.length - 1]).toBeLessThan(250);
    } finally {
      clearInterval(ticker);
    }
  }, 30_000);
});
