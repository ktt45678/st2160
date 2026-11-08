import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  type CueElementNode,
  type CueNode,
  parseCaptions,
  tokenizeVttCueText,
} from '../src/index.ts';

const wptRoot = fileURLToPath(new URL('./fixtures/wpt', import.meta.url));

function decodeUnicodeEscapes(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i] as string;
    if (ch !== '\\' || i + 1 >= raw.length) {
      out += ch;
      continue;
    }
    const next = raw[++i] as string;
    switch (next) {
      case 'n':
        out += '\n';
        break;
      case 'r':
        out += '\r';
        break;
      case 't':
        out += '\t';
        break;
      case 'f':
        out += '\f';
        break;
      case 'v':
        out += '\v';
        break;
      case '0':
        out += '\0';
        break;
      case '\\':
        out += '\\';
        break;
      case '\n':
        break;
      case 'x': {
        const hex = raw.slice(i + 1, i + 3);
        out += String.fromCharCode(Number.parseInt(hex, 16));
        i += 2;
        break;
      }
      case 'u': {
        const hex = raw.slice(i + 1, i + 5);
        out += String.fromCharCode(Number.parseInt(hex, 16));
        i += 4;
        break;
      }
      default:
        out += `\\${next}`;
    }
  }
  return out;
}

function formatWptTimestamp(seconds: number): string {
  const totalMs = Math.round(seconds * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const hours = Math.floor(totalMin / 60);
  const hh = hours.toString().padStart(2, '0');
  const mm = min.toString().padStart(2, '0');
  const ss = sec.toString().padStart(2, '0');
  const mmm = ms.toString().padStart(3, '0');
  return `${hh}:${mm}:${ss}.${mmm}`;
}

const ELEMENT_TAG: Readonly<Record<CueElementNode['type'], string>> = {
  c: 'span',
  i: 'i',
  b: 'b',
  u: 'u',
  s: 's',
  ruby: 'ruby',
  rt: 'rt',
  v: 'span',
  lang: 'span',
  font: 'span',
};

function serializeNodes(nodes: readonly CueNode[]): string {
  const lines = ['#document-fragment'];
  const visit = (node: CueNode, indent: number): void => {
    const pad = ' '.repeat(indent);
    if (node.type === 'text') {
      lines.push(`| ${pad}"${node.value}"`);
      return;
    }
    if (node.type === 'timestamp') {
      lines.push(`| ${pad}<?timestamp ${formatWptTimestamp(node.time)}>`);
      return;
    }
    const tag = ELEMENT_TAG[node.type];
    lines.push(`| ${pad}<${tag}>`);
    const attrs: [string, string][] = [];
    if (node.classes.length > 0) attrs.push(['class', node.classes.join(' ')]);
    if (node.type === 'v') attrs.push(['title', node.annotation]);
    if (node.type === 'lang') attrs.push(['lang', node.annotation]);
    attrs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const attrPad = ' '.repeat(indent + 2);
    for (const [name, val] of attrs) {
      lines.push(`| ${attrPad}${name}="${val}"`);
    }
    for (const child of node.children) {
      visit(child, indent + 2);
    }
  };
  for (const node of nodes) visit(node, 0);
  return lines.join('\n');
}

interface DatCase {
  readonly input: string;
  readonly expected: string;
}

function parseDatFile(filePath: string): DatCase[] {
  const raw = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  const cases: DatCase[] = [];
  let state = '';
  let input = '';
  let expected = '';

  const flush = (): void => {
    if (state !== '') {
      cases.push({
        input: input.slice(0, -1),
        expected: expected.slice(0, -1),
      });
      input = '';
      expected = '';
      state = '';
    }
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = `${lines[idx] as string}\n`;
    if (idx === lines.length - 1 && lines[idx] === '') {
      flush();
      break;
    }
    if (line.startsWith('#')) {
      state = line;
      if (line === '#document-fragment\n') expected += decodeUnicodeEscapes(line);
    } else if (state === '#data\n') {
      input += decodeUnicodeEscapes(line);
    } else if (state === '#errors\n') {
      // ignored
    } else if (state === '#document-fragment\n') {
      if (line === '\n') flush();
      else expected += decodeUnicodeEscapes(line);
    }
  }
  flush();
  return cases;
}

describe('WPT WebVTT cue-text-parsing', () => {
  const datDir = join(wptRoot, 'cue-text-parsing/dat');
  for (const file of readdirSync(datDir).sort()) {
    if (!file.endsWith('.dat')) continue;
    const cases = parseDatFile(join(datDir, file));
    describe(file, () => {
      cases.forEach((tc, index) => {
        it(`case ${index}: ${JSON.stringify(tc.input)}`, () => {
          const vtt = `WEBVTT\n\n00:00.000 --> 00:01.000\n${tc.input}`;
          const parsed = parseCaptions(vtt, { format: 'vtt' });
          const nodes = parsed.cues[0]?.nodes ?? tokenizeVttCueText(tc.input);
          expect(serializeNodes(nodes)).toBe(tc.expected);
        });
      });
    });
  }
});

describe('WPT WebVTT file-parsing (.test files)', () => {
  const supportDir = join(wptRoot, 'file-parsing/support');
  const testFiles = readdirSync(supportDir)
    .filter((f) => f.endsWith('.test'))
    .sort();

  for (const file of testFiles) {
    it(file, () => {
      const raw = readFileSync(join(supportDir, file), 'utf8').replace(/\r\n/g, '\n');
      const firstSplit = raw.indexOf('\n\n');
      const body = raw.slice(firstSplit + 2);
      const sep = body.indexOf('\n===\n');
      const jsAssertions = body.slice(0, sep);
      const rawVtt = body.slice(sep + 5);
      const vtt = decodeUnicodeEscapes(rawVtt);

      const parsed = parseCaptions(vtt, { format: 'vtt' });
      const cues = parsed.cues.map((cue) => ({
        ...cue,
        startTime: cue.start,
        endTime: cue.end,
      }));
      const fakeDoc = { styleSheets: [] };

      const runner = new Function(
        'cues',
        'document',
        'assert_equals',
        'assert_not_equals',
        'assert_true',
        'assert_false',
        jsAssertions,
      );
      runner(
        cues,
        fakeDoc,
        (actual: unknown, expected: unknown) => expect(actual).toBe(expected),
        (actual: unknown, expected: unknown) => expect(actual).not.toBe(expected),
        (actual: unknown) => expect(actual).toBe(true),
        (actual: unknown) => expect(actual).toBe(false),
      );
    });
  }

  it('header-regions.vtt', () => {
    const vtt = readFileSync(join(supportDir, 'header-regions.vtt'), 'utf8');
    const { cues } = parseCaptions(vtt, { format: 'vtt' });
    expect(cues).toHaveLength(10);
    const defaults = {
      width: 100,
      lines: 3,
      regionAnchorX: 0,
      regionAnchorY: 100,
      viewportAnchorX: 0,
      viewportAnchorY: 100,
      scroll: '',
    };
    for (const cue of cues) {
      const expected = JSON.parse(cue.text) as Record<string, unknown> | 'no region';
      if (cue.region !== null) {
        expect(expected).not.toBe('no region');
        const merged = { ...defaults, ...(expected as Record<string, unknown>) };
        expect(cue.region).toMatchObject(merged);
      } else {
        expect(expected).toBe('no region');
      }
    }
  });

  it('regions-edge-case.vtt', () => {
    const vtt = readFileSync(join(supportDir, 'regions-edge-case.vtt'), 'utf8');
    const { cues } = parseCaptions(vtt, { format: 'vtt' });
    expect(cues).toHaveLength(4);
    expect(cues[0]?.region).toMatchObject({ id: 'foo', lines: 1 });
    expect(cues[1]?.region).toMatchObject({ id: 'bill', lines: 2 });
    expect(cues[2]?.region).toMatchObject({ id: 'jill', lines: 3 });
    expect(cues[3]?.region).toMatchObject({ id: 'jack', lines: 4 });
  });

  const invalidSignatureFiles = [
    'empty.vtt',
    'signature-formfeed.vtt',
    'signature-invalid-whitespace.vtt',
    'signature-invalid.vtt',
    'signature-lowercase.vtt',
    'signature-missing-whitespace.vtt',
    'signature-missing.vtt',
    'signature-null.vtt',
    'signature-partial.vtt',
    'signature-two-boms.vtt',
    'signature-websrt.vtt',
  ];

  for (const file of invalidSignatureFiles) {
    it(`rejects invalid signature in strict mode: ${file}`, () => {
      const vtt = readFileSync(join(supportDir, file), 'utf8');
      expect(() => parseCaptions(vtt, { format: 'vtt', strict: true })).toThrow();
      const lenient = parseCaptions(vtt, { format: 'vtt', strict: false });
      expect(lenient.errors[0]?.code).toBe('parse-error');
    });
  }
});
