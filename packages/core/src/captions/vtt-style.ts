// Sanitized parser for WebVTT `STYLE` blocks (`::cue` and `::cue-region` rules).
import type { CaptionStyleDeclaration, CaptionStyleRule } from './cue.js';

const ALLOWED_PROPERTIES = new Set([
  'color',
  'opacity',
  'visibility',
  'text-decoration',
  'text-decoration-line',
  'text-decoration-color',
  'text-decoration-style',
  'text-decoration-thickness',
  'text-shadow',
  'background',
  'background-color',
  'background-image',
  'background-position',
  'background-size',
  'background-repeat',
  'background-origin',
  'background-clip',
  'background-attachment',
  'outline',
  'outline-color',
  'outline-style',
  'outline-width',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-variant',
  'font-weight',
  'font-stretch',
  'line-height',
  'white-space',
  'text-combine-upright',
  'ruby-position',
]);

const UNSAFE_VALUE = /(?:url|expression)\s*\(|@import|javascript\s*:|[<>\\]/i;
const CUE_PSEUDO = /^(?:video)?::(cue(?:-region)?)(?:\(([\s\S]*)\))?$/i;

function stripComments(css: string): string {
  let out = '';
  let i = 0;
  let quote = 0;
  while (i < css.length) {
    const c = css.charCodeAt(i);
    if (quote !== 0) {
      if (c === 0x5c && i + 1 < css.length) {
        out += css.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (c === quote) quote = 0;
      out += css[i] as string;
      i++;
      continue;
    }
    if (c === 0x22 || c === 0x27) {
      quote = c;
      out += css[i] as string;
      i++;
      continue;
    }
    if (c === 0x2f && css.charCodeAt(i + 1) === 0x2a) {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 2;
      continue;
    }
    out += css[i] as string;
    i++;
  }
  return out;
}

function splitTopLevel(input: string, sep: number): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (quote !== 0) {
      if (c === quote) quote = 0;
      continue;
    }
    if (c === 0x22 || c === 0x27) quote = c;
    else if (c === 0x28 || c === 0x5b) depth++;
    else if ((c === 0x29 || c === 0x5d) && depth > 0) depth--;
    else if (c === sep && depth === 0) {
      parts.push(input.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(input.slice(start));
  return parts;
}

function parseDeclarations(block: string): CaptionStyleDeclaration[] {
  const declarations: CaptionStyleDeclaration[] = [];
  for (const raw of splitTopLevel(block, 0x3b)) {
    const colon = raw.indexOf(':');
    if (colon <= 0) continue;
    const property = raw.slice(0, colon).trim().toLowerCase();
    if (!ALLOWED_PROPERTIES.has(property)) continue;
    const value = raw
      .slice(colon + 1)
      .replace(/!\s*important\s*$/i, '')
      .trim();
    if (value.length === 0 || UNSAFE_VALUE.test(value)) continue;
    declarations.push({ property, value });
  }
  return declarations;
}

function parseSelector(raw: string): { target: 'cue' | 'region'; selector: string } | null {
  const trimmed = raw.trim();
  const match = CUE_PSEUDO.exec(trimmed);
  if (match === null) return null;
  const kind = (match[1] as string).toLowerCase();
  const arg = (match[2] ?? '').trim();
  if (match[2] !== undefined && arg.length === 0) return null;
  if (/[{}@;]/.test(arg)) return null;
  if (kind === 'cue-region') {
    if (arg.length > 0 && !/^#[A-Za-z0-9_-]+$/.test(arg)) return null;
    return { target: 'region', selector: arg };
  }
  return { target: 'cue', selector: arg === ':root' ? '' : arg };
}

/** Parses a WebVTT `STYLE` block body into sanitized `CaptionStyleRule`s. */
export function parseVttStyleBlock(cssText: string): CaptionStyleRule[] {
  const cleaned = stripComments(cssText);
  const rules: CaptionStyleRule[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const open = cleaned.indexOf('{', i);
    if (open === -1) break;
    const close = cleaned.indexOf('}', open + 1);
    if (close === -1) break;
    const prelude = cleaned.slice(i, open).trim();
    const body = cleaned.slice(open + 1, close);
    i = close + 1;
    if (prelude.length === 0 || prelude.startsWith('@')) continue;
    const declarations = parseDeclarations(body);
    if (declarations.length === 0) continue;
    for (const sel of splitTopLevel(prelude, 0x2c)) {
      const parsed = parseSelector(sel);
      if (parsed !== null) {
        rules.push({
          target: parsed.target,
          selector: parsed.selector,
          declarations,
        });
      }
    }
  }
  return rules;
}
