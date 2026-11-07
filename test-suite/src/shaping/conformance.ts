// Shaping conformance: a shaper under test against a reference shaper on the corpus.
import { readTestFont } from '../fonts.ts';
import { fuzzTexts, type ShapingSuite, shapingSuites } from './corpus.ts';

/** glyph id, cluster (UTF-16 index), x advance, y advance, x offset, y offset. */
export type ShapedGlyph = readonly [number, number, number, number, number, number];

export interface ShapeRequest {
  readonly text: string;
  readonly script: string;
  readonly direction: 'ltr' | 'rtl';
  /** OpenType feature tag to value, applied to the whole text. */
  readonly features: Readonly<Record<string, number>>;
}

export interface ConformanceShaper {
  readonly name: string;
  readonly version: string;
  /** Returns a shape function bound to one font at its units-per-em scale. */
  loadFont(bytes: Uint8Array): (request: ShapeRequest) => ShapedGlyph[];
}

export type Mismatch = 'match' | 'glyph-count' | 'glyph-id' | 'cluster' | 'position' | 'error';

export interface ConformanceRow {
  readonly suite: string;
  readonly font: string;
  readonly features: string;
  readonly total: number;
  /** `curated:match`, `fuzz:glyph-id` and so on. */
  readonly counts: Readonly<Record<string, number>>;
  readonly samples: readonly {
    text: string;
    kind: Mismatch;
    candidate?: ShapedGlyph[];
    reference: ShapedGlyph[];
  }[];
}

export const featureSets: readonly { name: string; features: Record<string, number> }[] = [
  { name: 'default', features: {} },
  { name: 'no-kern-liga', features: { kern: 0, liga: 0 } },
];

/** Code point index for every UTF-16 index that starts a code point. */
function utf16ToCodePoint(text: string): Map<number, number> {
  const map = new Map<number, number>();
  let cp = 0;
  for (let i = 0; i < text.length; ) {
    map.set(i, cp++);
    i += (text.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
  }
  return map;
}

export function classifyShaping(a: readonly ShapedGlyph[], b: readonly ShapedGlyph[]): Mismatch {
  if (a.length !== b.length) return 'glyph-count';
  let kind: Mismatch = 'match';
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!x || !y || x[0] !== y[0]) return 'glyph-id';
    if (x[1] !== y[1]) kind = 'cluster';
    for (let k = 2; k < 6; k++) if (x[k] !== y[k] && kind === 'match') kind = 'position';
  }
  return kind;
}

export interface ConformanceOptions {
  readonly suites?: readonly ShapingSuite[];
  readonly sampleLimit?: number;
}

export function runConformance(
  candidate: ConformanceShaper,
  reference: ConformanceShaper,
  options: ConformanceOptions = {},
): ConformanceRow[] {
  const rows: ConformanceRow[] = [];
  const sampleLimit = options.sampleLimit ?? 6;
  for (const suite of options.suites ?? shapingSuites) {
    const corpus = [
      ...suite.texts.map((text) => ({ text, src: 'curated' })),
      ...fuzzTexts(suite).map((text) => ({ text, src: 'fuzz' })),
    ];
    for (const font of suite.fonts) {
      const bytes = readTestFont(font);
      const shapeCandidate = candidate.loadFont(bytes);
      const shapeReference = reference.loadFont(bytes);
      for (const set of featureSets) {
        const counts: Record<string, number> = {};
        const samples: ConformanceRow['samples'][number][] = [];
        for (const { text, src } of corpus) {
          const request = {
            text,
            script: suite.script,
            direction: suite.direction,
            features: set.features,
          };
          const cps = utf16ToCodePoint(text);
          const toCp = (g: ShapedGlyph): ShapedGlyph => [
            g[0],
            cps.get(g[1]) ?? g[1],
            g[2],
            g[3],
            g[4],
            g[5],
          ];
          const ref = shapeReference(request).map(toCp);
          let cand: ShapedGlyph[] | undefined;
          let kind: Mismatch;
          try {
            cand = shapeCandidate(request).map(toCp);
            kind = classifyShaping(cand, ref);
          } catch {
            kind = 'error';
          }
          const key = `${src}:${kind}`;
          counts[key] = (counts[key] ?? 0) + 1;
          if (kind !== 'match' && samples.length < sampleLimit) {
            samples.push(
              cand
                ? { text, kind, candidate: cand, reference: ref }
                : { text, kind, reference: ref },
            );
          }
        }
        rows.push({
          suite: suite.name,
          font,
          features: set.name,
          total: corpus.length,
          counts,
          samples,
        });
      }
    }
  }
  return rows;
}

export function matchCount(row: ConformanceRow): number {
  return (row.counts['curated:match'] ?? 0) + (row.counts['fuzz:match'] ?? 0);
}
