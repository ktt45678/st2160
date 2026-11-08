import { parseAss } from '@st2160/core';
import { describe, expect, it } from 'vitest';
import { commands, server } from 'vitest/browser';
import { parseWithLibass } from '../src/browser/jassub-oracle.ts';

const edgeCaseScripts: { readonly name: string; readonly script: string }[] = [
  {
    name: 'v4-ssa-styles-and-events',
    script: `[Script Info]
ScriptType: v4.00
PlayResX: 640
PlayResY: 480

[V4 Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, TertiaryColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, AlphaLevel, Encoding
Style: *Sub,Arial,22,&H00112233,&H00445566,&H00778899,&H00AABBCC,-1,1,1,2.5,1.5,8,12,14,16,64,1
Style: Mid,Arial,18,&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,0,0,1,-1,-2,4,5,5,5,200,0

[Events]
Dialogue: Marked=0,0:00:01.00,0:00:03.25,*Sub,Bob,1,2,3,Scroll up,Hello SSA, with comma \t\r
Dialogue: Marked=1,0:00:02.00,0:00:04.00,Mid,,0,0,0,,Second line
`,
  },
  {
    name: 'custom-format-and-lookup-rules',
    script: `\uFEFF[Script Info]
ScriptType: v4.00+
PlayResX: 1280

[V4+ Styles]
Format: Fontsize, Name, Fontname, PrimaryColour, ScaleX, ScaleY, Alignment, Bold, Outline, Shadow
Style: 36, **Dup, Lato, &H12345678, 120.5, -10, 7, -1, -3, 4.25
Style: 42, Dup, Roboto, &H87654321, 80, 95, -5, 0, 1.5, -2
Style: 28, Default, CustomDef, &H00AABBCC, 100, 100, 2, 200, 2, 3

[Events]
Format: Start, End, Style, Actor, Text
Comment: 0:00:00.00,0:00:01.00,Dup,Ignored,Comment text
Dialogue: 0:00:00.50,0:00:02.75,*Dup,Alice,Matched second Dup, keeping commas, here
Dialogue: 0:00:03.00,0:00:01.00,*dEfAuLt,Bob,Negative duration event
Dialogue: 0:00:04.00,0:00:06.00,MissingStyle,Carol,Fallback to overridden Default
`,
  },
  {
    name: 'number-wrapping-and-exponents',
    script: `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Math,Arial,1.5e1,&H1000000FF,0x00FF00FF,16777215,-1,100,0,1,0,100.000000000000000001,99.9999999,2.5,-45.125,1,1.75,0.5,9,4294967297,-10,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: -2,0:00:00.00,0:00:05.00,Math,Tester,100,200,300,,Test math
`,
  },
];

const libassTestScripts = [
  'crash/aegisub-format-tests.ass',
  'crash/generic.ass',
  'regression/blurs/be.ass',
  'regression/blurs/blur+t.ass',
  'regression/blurs-anamorphic/blur.ass',
  'regression/draw-images/drawImg.ass',
  'regression/embedded-font/efont.ass',
  'regression/faux-italics/cff.ass',
  'regression/faux-italics/truetype.ass',
  'regression/font_nonunicode/big5-hkscs.ass',
  'regression/font_nonunicode/legacy-arabic-simplified.ass',
  'regression/font_nonunicode/legacy-arabic-traditional.ass',
  'regression/font_nonunicode/shiftjis.ass',
  'regression/font_nonunicode/symbol-first-char-0x0000.ass',
  'regression/font_nonunicode/symbol-first-char-0xF000.ass',
  'regression/implicit-pos/bordercollision.ass',
  'regression/implicit-pos/shift-dir.ass',
  'regression/karaoke/216-vertical.ass',
  'regression/karaoke/357-k-and-kf-desynced.ass',
  'regression/karaoke/karaoke-and-runsplits.ass',
  'regression/scaled-border-default/ffmpeg.ass',
  'regression/scaled-border-default/ffmpeg_legacy2+sbas.ass',
  'regression/scaled-border-default/ffmpeg_legacy2.ass',
  'regression/scaled-border-default/ffmpeg_legacy3.ass',
  'regression/scaled-border-default/ffmpeg_legacy4.ass',
  'regression/scaled-border-default/not-ffmpeg.ass',
  'regression/scaling_playres/playresx_sbas-no.ass',
  'regression/scaling_playres/playresx_sbas-yes.ass',
  'regression/screen-edges/run-origin.ass',
  'regression/screen-edges/screen-edges.ass',
  'regression/ssa/alpha.ass',
  'regression/ssa/effect-delay.ass',
  'regression/token-parsing/trimming.ass',
  'regression/v4++/kt.ass',
  'regression/vsf-quirks-var/alpha-clipping.ass',
  'regression/zero-area/zero-area.ass',
] as const;

const jassubTestScripts = [
  'beastars.ass',
  'example.ass',
  'example1.ass',
  'font-fallback-missing.ass',
  'font-fallback-present.ass',
  'test.ass',
  'perf/collisions-1000.ass',
  'perf/collisions-2000.ass',
  'perf/collisions-4000.ass',
  'perf/dense-blur.ass',
  'perf/header.ass',
  'perf/long-text.ass',
  'perf/many-fonts.ass',
  'perf/missing-fonts.ass',
  'perf/static-many.ass',
  'perf/timed-many.ass',
] as const;

describe.runIf(server.browser === 'chromium')('ASS parser vs JASSUB libass oracle', () => {
  for (const item of edgeCaseScripts) {
    it(`matches JASSUB field-by-field on ${item.name}`, async () => {
      const oracle = await parseWithLibass(item.script);
      const track = parseAss(item.script);
      expect(track.styles.toArray()).toEqual(oracle.styles);
      expect(track.events.toArray(true)).toEqual(oracle.events);
    });
  }

  it('matches JASSUB field-by-field on all 36 libass-tests scripts', async () => {
    let checked = 0;
    for (const relPath of libassTestScripts) {
      const script = await commands.readFile(`../st2160/test-suite/.cache/libass-tests/${relPath}`);
      checked++;
      const oracle = await parseWithLibass(script);
      const track = parseAss(script);
      expect(track.styles.toArray(), `styles in ${relPath}`).toEqual(oracle.styles);
      expect(track.events.toArray(true), `events in ${relPath}`).toEqual(oracle.events);
    }
    expect(checked).toBe(36);
  });

  it('matches JASSUB field-by-field on JASSUB subtitle fixtures if present', async () => {
    for (const relPath of jassubTestScripts) {
      let script: string;
      try {
        script = await commands.readFile(
          `../other-repos/jassub/test/fixtures/subtitles/${relPath}`,
        );
      } catch {
        continue;
      }
      const oracle = await parseWithLibass(script);
      const track = parseAss(script);
      expect(track.styles.toArray(), `styles in ${relPath}`).toEqual(oracle.styles);
      expect(track.events.toArray(true), `events in ${relPath}`).toEqual(oracle.events);
    }
  });
});
