import { describe, expect, it } from 'vitest';
import {
  ASS_TRACK_TYPE_ASS,
  ASS_TRACK_TYPE_SSA,
  assAtof,
  assStrtod,
  decodeUuencodedFont,
  encodeUuencodedFont,
  GENBY_FFMPEG,
  isSt2160Error,
  mystrtoi32,
  mystrtou32Modulo,
  numpad2align,
  type ParseWarningEvent,
  parseAss,
  parseAssAsync,
  parseBool,
  parseColorHeader,
  parseIntHeader,
  parseYCbCrMatrix,
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
  string2timecode,
  TimeIndex,
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
} from '../src/index.ts';

describe('ass_strtod and number parsing', () => {
  it('parses decimal floats, exponents, leading zeros, and >18 mantissa digits like Tcl ass_strtod', () => {
    expect(assStrtod('  -12.5e2px')).toEqual({ value: -1250, nextPos: 9 });
    expect(assStrtod('+0000.00125')).toEqual({ value: 0.00125, nextPos: 11 });
    expect(assStrtod('.5')).toEqual({ value: 0.5, nextPos: 2 });
    expect(assStrtod('5.')).toEqual({ value: 5, nextPos: 2 });
    expect(assStrtod('   .abc')).toEqual({ value: 0, nextPos: 0 });
    expect(assStrtod('12345678901234567899999')).toEqual({
      value: 1.2345678901234568e22,
      nextPos: 23,
    });
    expect(assAtof('100.0000')).toBe(100);
    expect(assStrtod('1e9999').nextPos).toBe(6);
    expect(assStrtod('1e-320').value).toBeGreaterThan(0);
  });

  it('wraps integers modulo 2^32 in mystrtou32_modulo and parse_int_header', () => {
    expect(mystrtou32Modulo('  -1', 0, 10)).toEqual({
      ok: true,
      value: 0xffffffff,
      nextPos: 4,
    });
    expect(mystrtou32Modulo('4294967297', 0, 10)).toEqual({
      ok: true,
      value: 1,
      nextPos: 10,
    });
    expect(parseIntHeader('&H100000005')).toBe(5);
    expect(parseIntHeader('0x80000000')).toBe(-2147483648);
    expect(parseIntHeader('-42')).toBe(-42);
  });

  it('clamps signed integers to INT32_MIN..INT32_MAX in mystrtoi32', () => {
    expect(mystrtoi32('999999999999', 0, 10)).toEqual({
      ok: true,
      value: 0x7fffffff,
      nextPos: 12,
    });
    expect(mystrtoi32('-999999999999', 0, 10)).toEqual({
      ok: true,
      value: -0x80000000,
      nextPos: 13,
    });
    expect(mystrtoi32('0x10', 0, 16)).toEqual({
      ok: true,
      value: 16,
      nextPos: 4,
    });
  });

  it('byte-swaps colors from &HAABBGGRR to 0xRRGGBBAA in parse_color_header', () => {
    expect(parseColorHeader('&H00FFFFFF')).toBe(0xffffff00);
    expect(parseColorHeader('&H80112233')).toBe(0x33221180);
    expect(parseColorHeader('0x0000FF00')).toBe(0x00ff0000);
    // Decimal colors are also parsed and byte-swapped.
    expect(parseColorHeader('16777215')).toBe(0xffffff00);
  });

  it('parses booleans and YCbCr Matrix values', () => {
    expect(parseBool(' yes ')).toBe(1);
    expect(parseBool('YES_INDEED')).toBe(1);
    expect(parseBool('1')).toBe(1);
    expect(parseBool('2')).toBe(1);
    expect(parseBool('0')).toBe(0);
    expect(parseBool('no')).toBe(0);
    expect(parseBool('-1')).toBe(0);

    expect(parseYCbCrMatrix('   ')).toBe(YCBCR_DEFAULT);
    expect(parseYCbCrMatrix(' None ')).toBe(YCBCR_NONE);
    expect(parseYCbCrMatrix('TV.601')).toBe(YCBCR_BT601_TV);
    expect(parseYCbCrMatrix('PC.601')).toBe(YCBCR_BT601_PC);
    expect(parseYCbCrMatrix('TV.709')).toBe(YCBCR_BT709_TV);
    expect(parseYCbCrMatrix('PC.709')).toBe(YCBCR_BT709_PC);
    expect(parseYCbCrMatrix('TV.240M')).toBe(YCBCR_SMPTE240M_TV);
    expect(parseYCbCrMatrix('PC.240M')).toBe(YCBCR_SMPTE240M_PC);
    expect(parseYCbCrMatrix('TV.FCC')).toBe(YCBCR_FCC_TV);
    expect(parseYCbCrMatrix('PC.FCC')).toBe(YCBCR_FCC_PC);
    expect(parseYCbCrMatrix('BT.2020')).toBe(YCBCR_UNKNOWN);
  });

  it('parses timecodes with string2timecode', () => {
    expect(string2timecode('0:01:02.34')).toEqual({ ok: true, ms: 62340 });
    expect(string2timecode('1:00:00.00')).toEqual({ ok: true, ms: 3600000 });
    expect(string2timecode('invalid')).toEqual({ ok: false, ms: 0 });
  });

  it('converts numpad alignment to libass bitmask alignment', () => {
    expect(numpad2align(1)).toBe(1);
    expect(numpad2align(2)).toBe(2);
    expect(numpad2align(3)).toBe(3);
    expect(numpad2align(4)).toBe(9);
    expect(numpad2align(5)).toBe(10);
    expect(numpad2align(6)).toBe(11);
    expect(numpad2align(7)).toBe(5);
    expect(numpad2align(8)).toBe(6);
    expect(numpad2align(9)).toBe(7);
    expect(numpad2align(-5)).toBe(10);
    expect(numpad2align(-0x80000000)).toBe(2);
  });
});

describe('ASS script parser', () => {
  it('parses [Script Info] keys, tracks duplicate warnings, and resolves PlayRes fallbacks', () => {
    const warnings: ParseWarningEvent[] = [];
    const script = `\uFEFF[Script Info]
; Script generated by FFmpeg/Lavc58.91.100
ScriptType: v4.00+
PlayResX: 1280
PlayResX: 1920
PlayResY: 1080
LayoutResX: 3840
LayoutResY: 2160
Timer: 100.0000
WrapStyle: 2
ScaledBorderAndShadow: yes
Kerning: yes
YCbCr Matrix: TV.709
Language: eng

[V4+ Styles]
Style: Default,Arial,20,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,3,2,10,10,10,1
`;
    const track = parseAss(script, { onWarning: (w) => warnings.push(w) });
    expect(track.info).toMatchObject({
      trackType: ASS_TRACK_TYPE_ASS,
      playResX: 1920,
      playResY: 1080,
      resolvedPlayResX: 1920,
      resolvedPlayResY: 1080,
      layoutResX: 3840,
      layoutResY: 2160,
      timer: 100,
      wrapStyle: 2,
      scaledBorderAndShadow: 1,
      kerning: 1,
      language: 'en',
      ycbcrMatrix: YCBCR_BT709_TV,
    });
    expect(track.info.headerFlags).toBe(
      SINFO_SCRIPTTYPE |
        SINFO_PLAYRESX |
        SINFO_PLAYRESY |
        SINFO_LAYOUTRESX |
        SINFO_LAYOUTRESY |
        SINFO_TIMER |
        SINFO_WRAPSTYLE |
        SINFO_SCALEDBORDER |
        SINFO_KERNING |
        SINFO_COLOURMATRIX |
        SINFO_LANGUAGE |
        GENBY_FFMPEG,
    );
    expect(warnings).toEqual([
      {
        type: 'parse-warning',
        line: 5,
        code: 'ass-duplicate-header',
        message: "Duplicate Script Info Header 'PlayResX'. Previous value overwritten!",
      },
    ]);

    expect(resolvePlayRes(0, 0)).toEqual({ x: 384, y: 288 });
    expect(resolvePlayRes(1280, 0)).toEqual({ x: 1280, y: 1024 });
    expect(resolvePlayRes(0, 1024)).toEqual({ x: 1280, y: 1024 });
    expect(resolvePlayRes(640, 0)).toEqual({ x: 640, y: 480 });
    expect(resolvePlayRes(0, 480)).toEqual({ x: 640, y: 480 });
  });

  it('matches section headers by prefix and stays in current section on [Graphics]', () => {
    const script = `[Script Info] extra trailing text
ScriptType: v4.00+
[UnknownSection]
PlayResX: 640
[Graphics]
PlayResY: 360
[Events] trailing
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Still parsed
`;
    const track = parseAss(script);
    expect(track.info.playResX).toBe(640);
    expect(track.info.playResY).toBe(360);
    expect(track.events.count).toBe(1);
    expect(track.events.getRecord(0).Text).toBe('Still parsed');
  });

  it('handles V4 SSA styles, alignment remapping, AlphaLevel, and OutlineColour = BackColour', () => {
    const script = `[Script Info]
ScriptType: v4.00

[V4 Styles]
Style: *Sub,Tahoma,24,&H00112233,&H00445566,&H00778899,&H00AABBCC,-1,1,1,2,3,8,10,20,30,64,1
Style: Mid,Tahoma,24,&H00112233,&H00445566,&H00778899,&H00AABBCC,0,0,1,-2,-3,4,10,20,30,300,1
`;
    const track = parseAss(script);
    expect(track.info.trackType).toBe(ASS_TRACK_TYPE_SSA);
    expect(track.styles.count).toBe(3);

    const sub = track.styles.getRecord(1);
    expect(sub.Name).toBe('Sub');
    expect(sub.PrimaryColour).toBe(0x33221140);
    expect(sub.SecondaryColour).toBe(0x66554440);
    expect(sub.OutlineColour).toBe(0xccbbaa40);
    expect(sub.BackColour).toBe(0xccbbaa80);
    expect(sub.Bold).toBe(1);
    expect(sub.Italic).toBe(1);
    expect(sub.Alignment).toBe(3);

    const mid = track.styles.getRecord(2);
    expect(mid.Alignment).toBe(11);
    expect(mid.Outline).toBe(0);
    expect(mid.Shadow).toBe(0);
    expect(mid.PrimaryColour).toBe(0x332211ff);
  });

  it('auto-enables ScaledBorderAndShadow on custom Format lines or legacy FFmpeg conversion', () => {
    const customFmtScript = `[Script Info]
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Short event
`;
    expect(parseAss(customFmtScript).info.scaledBorderAndShadow).toBe(1);

    const explicitNoScript = `[Script Info]
ScriptType: v4.00+
ScaledBorderAndShadow: no

[Events]
Format: Layer, Start, End, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Short event
`;
    expect(parseAss(explicitNoScript).info.scaledBorderAndShadow).toBe(0);

    const legacyFfmpegScript = `[Script Info]
; Script generated by FFmpeg/Lavc57.24.102
ScriptType: v4.00+
PlayResX: 384
PlayResY: 288

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,16,&Hffffff,&Hffffff,&H0,&H0,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Legacy ffmpeg
`;
    expect(parseAss(legacyFfmpegScript).info.scaledBorderAndShadow).toBe(1);
  });

  it('divides ScaleX and ScaleY by 100 like process_style, not by multiplying by 0.01', () => {
    const script = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, ScaleX, ScaleY
Style: Narrow,Arial,20,95,57

[Events]
`;
    const track = parseAss(script);
    expect(track.styles.scaleX[1]).toBe(0.95);
    expect(track.styles.scaleY[1]).toBe(0.57);
  });

  it('looks up styles with leading asterisks, case-insensitive Default, and backwards search', () => {
    const warnings: ParseWarningEvent[] = [];
    const script = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize
Style: Dup,FontA,20
Style: Dup,FontB,30
Style: Default,CustomDefault,40

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.00,***Dup,,0,0,0,,Uses second Dup
Dialogue: 0,0:00:00.00,0:00:01.00,*dEfAuLt,,0,0,0,,Uses CustomDefault
Dialogue: 0,0:00:00.00,0:00:01.00,NonExistent,,0,0,0,,Falls back to default_style
`;
    const track = parseAss(script, { onWarning: (w) => warnings.push(w) });
    expect(track.defaultStyle).toBe(3);
    expect(track.events.getRecord(0).Style).toBe(2);
    expect(track.events.getRecord(1).Style).toBe(3);
    expect(track.events.getRecord(2).Style).toBe(3);
    expect(warnings.some((w) => w.code === 'ass-unknown-style')).toBe(true);
  });

  it('keeps commas in Dialogue Text, trims trailing CR/tab/space, and ignores Comment lines', () => {
    const script = `[Script Info]
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Actor, MarginL, MarginR, MarginV, Effect, Text
Comment: 0,0:00:00.00,0:00:05.00,Default,Bob,0,0,0,,Ignored comment
Dialogue: 2,0:00:01.00,0:00:03.50,Default,Alice,1,2,3,Scroll up,First, second, third \t\r
Dialogue: 0,0:00:01.00
`;
    const track = parseAss(script);
    expect(track.events.count).toBe(1);
    expect(track.events.getRecord(0)).toEqual({
      Start: 1000,
      Duration: 2500,
      ReadOrder: 0,
      Layer: 2,
      Style: 0,
      Name: 'Alice',
      MarginL: 1,
      MarginR: 2,
      MarginV: 3,
      Effect: 'Scroll up',
      Text: 'First, second, third',
    });
  });

  it('round-trips embedded [Fonts] uuencode data and decodes at EOF without end marker', () => {
    const original = new Uint8Array(257);
    for (let i = 0; i < original.length; i++) {
      original[i] = (i * 73 + 19) & 0xff;
    }
    const encodedLines = encodeUuencodedFont(original);
    const script = `[Script Info]
ScriptType: v4.00+

[Fonts]
fontname: TestFont_0.ttf
${encodedLines.join('\n')}`;

    const track = parseAss(script);
    expect(track.fonts).toHaveLength(1);
    expect(track.fonts[0]?.name).toBe('TestFont_0.ttf');
    expect(track.fonts[0]?.bytes).toEqual(original);

    const warnCodes: string[] = [];
    expect(decodeUuencodedFont('ABCDE', (code) => warnCodes.push(code))).toBeUndefined();
    expect(warnCodes).toEqual(['ass-bad-font-data']);
  });

  it('rejects scripts with unknown track type via St2160Error(ass-invalid-script)', () => {
    expect(() =>
      parseAss('[Events]\nDialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Hi'),
    ).toThrowError();
    try {
      parseAss('not an ass file');
    } catch (err) {
      expect(isSt2160Error(err, 'ass-invalid-script')).toBe(true);
    }
  });

  it('supports async chunked parsing and AbortSignal cancellation', async () => {
    const script = `[Script Info]
ScriptType: v4.00+

[Events]
Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Line 1
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Line 2
Dialogue: 0,0:00:02.00,0:00:03.00,Default,,0,0,0,,Line 3
`;
    const track = await parseAssAsync(script, { chunkLines: 2 });
    expect(track.events.count).toBe(3);

    const controller = new AbortController();
    controller.abort();
    await expect(parseAssAsync(script, { signal: controller.signal })).rejects.toThrowError();
  });

  it('queries active events in (Layer, ReadOrder) order with exclusive End and skips Duration <= 0', () => {
    const script = `[Script Info]
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 5,0:00:01.00,0:00:04.00,Default,,0,0,0,,Layer 5 first
Dialogue: 1,0:00:01.00,0:00:04.00,Default,,0,0,0,,Layer 1 first
Dialogue: 5,0:00:01.00,0:00:04.00,Default,,0,0,0,,Layer 5 second
Dialogue: 1,0:00:01.00,0:00:04.00,Default,,0,0,0,,Layer 1 second
Dialogue: 0,0:00:02.00,0:00:02.00,Default,,0,0,0,,Zero duration
Dialogue: 0,0:00:03.00,0:00:02.00,Default,,0,0,0,,Negative duration
`;
    const track = parseAss(script);
    const out = new Int32Array(track.timeIndex.maxActive + 2);

    expect(track.queryActiveEvents(999, out)).toBe(0);
    const nAt1000 = track.queryActiveEvents(1000, out);
    expect(Array.from(out.subarray(0, nAt1000))).toEqual([1, 3, 0, 2]);
    const nAt2000 = track.queryActiveEvents(2000, out);
    expect(Array.from(out.subarray(0, nAt2000))).toEqual([1, 3, 0, 2]);
    expect(track.queryActiveEvents(4000, out)).toBe(0);
  });

  it('indexes and queries 100k events under budget', () => {
    const count = 100_000;
    const starts = new Float64Array(count);
    const ends = new Float64Array(count);
    const layers = new Int32Array(count);
    const readOrders = new Int32Array(count);
    for (let i = 0; i < count; i++) {
      starts[i] = i * 10;
      ends[i] = i * 10 + 55;
      layers[i] = (count - i) % 7;
      readOrders[i] = i;
    }
    const track = parseAss('[Script Info]\nScriptType: v4.00+\n');
    expect(track.info.trackType).toBe(ASS_TRACK_TYPE_ASS);

    const t0 = performance.now();
    const index = new TimeIndex(starts, ends);
    const buildMs = performance.now() - t0;
    expect(buildMs).toBeLessThan(1500);

    const rank = TimeIndex.rankBy(layers, readOrders);
    const out = new Int32Array(index.maxActive);
    const q0 = performance.now();
    for (let q = 0; q < 1000; q++) {
      index.queryRanked(q * 500 + 25, rank, out);
    }
    const avgUs = ((performance.now() - q0) * 1000) / 1000;
    expect(avgUs).toBeLessThan(100);
  });

  it('orders 15k simultaneous events by layer and read order quickly', () => {
    const count = 15_000;
    const starts = new Float64Array(count);
    const ends = new Float64Array(count).fill(10_000);
    const layers = new Int32Array(count);
    const readOrders = new Int32Array(count);
    for (let i = 0; i < count; i++) {
      starts[i] = i % 97;
      layers[i] = (i * 7919) % 13;
      readOrders[i] = (i * 104_729) % count;
    }
    const index = new TimeIndex(starts, ends);
    const rank = TimeIndex.rankBy(layers, readOrders);
    const out = new Int32Array(index.maxActive);

    const n = index.queryRanked(5000, rank, out);
    expect(n).toBe(count);
    const expected = Array.from({ length: count }, (_, i) => i).sort(
      (a, b) =>
        (layers[a] as number) - (layers[b] as number) ||
        (readOrders[a] as number) - (readOrders[b] as number) ||
        a - b,
    );
    expect(Array.from(out.subarray(0, n))).toEqual(expected);

    const q0 = performance.now();
    for (let q = 0; q < 20; q++) index.queryRanked(5000 + q, rank, out);
    expect((performance.now() - q0) / 20).toBeLessThan(10);
  });
});
