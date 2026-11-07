import { describe, expect, it } from 'vitest';
import { server } from 'vitest/browser';
import { parseWithLibass } from '../src/browser/jassub-oracle.ts';

const script = `[Script Info]
ScriptType: v4.00+
PlayResX: 640
PlayResY: 360

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,Lato,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 1,0:00:01.50,0:00:03.00,Main,Ann,0,0,0,,{\\b0}Hello, world
Dialogue: 0,0:00:00.00,0:00:02.00,Missing,,5,6,7,Banner;10,Second
`;

// One engine is enough for an oracle; the WASM build is the same in every browser.
describe.runIf(server.browser === 'chromium')('JASSUB libass oracle', () => {
  it('returns libass styles and events', async () => {
    const track = await parseWithLibass(script);
    expect(track.styles.map((s) => s.Name)).toEqual(['Default', 'Main']);
    const main = track.styles[1];
    expect(main).toMatchObject({ FontName: 'Lato', FontSize: 48, Bold: 1, Alignment: 2 });
    expect(main?.PrimaryColour).toBe(0xffffff00);
    expect(main?.BackColour).toBe(0x00000080);
    expect(track.events).toHaveLength(2);
    expect(track.events[0]).toMatchObject({
      Start: 1500,
      Duration: 1500,
      Layer: 1,
      Style: 1,
      Name: 'Ann',
      Text: '{\\b0}Hello, world',
      ReadOrder: 0,
    });
    // Unknown style names fall back to track->default_style (ass_lookup_style).
    expect(track.events[1]).toMatchObject({ Style: 0, MarginV: 7, Effect: 'Banner;10' });
  });
});
