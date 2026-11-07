// Reference shaper: pinned harfbuzzjs (HarfBuzz WASM). Test tooling only.
import * as hb from 'harfbuzzjs';
import type { ConformanceShaper, ShapedGlyph, ShapeRequest } from './conformance.ts';

export const harfbuzzReference: ConformanceShaper = {
  name: 'harfbuzzjs',
  version: hb.versionString(),
  loadFont(bytes) {
    const font = new hb.Font(new hb.Face(new hb.Blob(bytes), 0));
    return (request: ShapeRequest): ShapedGlyph[] => {
      const buf = new hb.Buffer();
      buf.addText(request.text);
      buf.setScript(request.script);
      buf.setDirection(request.direction === 'rtl' ? hb.Direction.RTL : hb.Direction.LTR);
      const features = Object.entries(request.features).map(([tag, v]) => new hb.Feature(tag, v));
      hb.shape(font, buf, features);
      return buf
        .getGlyphInfosAndPositions()
        .map((g) => [
          g.codepoint,
          g.cluster,
          g.xAdvance ?? 0,
          g.yAdvance ?? 0,
          g.xOffset ?? 0,
          g.yOffset ?? 0,
        ]);
    };
  },
};
