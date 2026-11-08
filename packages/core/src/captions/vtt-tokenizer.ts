// Ported from the W3C WebVTT spec, section 6.4, with media-captions (MIT) as a reference.
import type { CueElementNode, CueElementType, CueNode } from './cue.js';
import { consumeHtmlEntity } from './html-entities.js';
import { type Cursor, isAsciiWhitespace, parseTimestamp } from './vtt-settings.js';

interface TextToken {
  readonly kind: 'text';
  readonly value: string;
}

interface StartTagToken {
  readonly kind: 'start';
  readonly tagName: string;
  readonly classes: readonly string[];
  readonly annotation?: string;
}

interface EndTagToken {
  readonly kind: 'end';
  readonly tagName: string;
}

interface TimestampToken {
  readonly kind: 'timestamp';
  readonly value: string;
}

type CueToken = TextToken | StartTagToken | EndTagToken | TimestampToken;

const STATE_DATA = 0;
const STATE_TAG = 1;
const STATE_START_TAG = 2;
const STATE_START_TAG_CLASS = 3;
const STATE_START_TAG_ANNOTATION = 4;
const STATE_END_TAG = 5;
const STATE_TIMESTAMP_TAG = 6;

function collapseAnnotation(raw: string): string {
  let out = '';
  let inSpace = true;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (isAsciiWhitespace(c)) {
      if (!inSpace) {
        out += ' ';
        inSpace = true;
      }
    } else {
      out += raw[i] as string;
      inSpace = false;
    }
  }
  return out.endsWith(' ') ? out.slice(0, -1) : out;
}

function nextCueToken(cursor: Cursor): CueToken {
  const { input } = cursor;
  let state = STATE_DATA;
  let result = '';
  let buffer = '';
  const classes: string[] = [];

  while (true) {
    const eof = cursor.pos >= input.length;
    const c = eof ? -1 : input.charCodeAt(cursor.pos);

    switch (state) {
      case STATE_DATA:
        if (c === 0x26) {
          cursor.pos++;
          result += consumeHtmlEntity(cursor);
          continue;
        }
        if (c === 0x3c) {
          if (result === '') {
            state = STATE_TAG;
            break;
          }
          return { kind: 'text', value: result };
        }
        if (eof) return { kind: 'text', value: result };
        result += input[cursor.pos] as string;
        break;

      case STATE_TAG:
        if (c === 0x09 || c === 0x0a || c === 0x0c || c === 0x20) {
          state = STATE_START_TAG_ANNOTATION;
        } else if (c === 0x2e) {
          state = STATE_START_TAG_CLASS;
        } else if (c === 0x2f) {
          state = STATE_END_TAG;
        } else if (c >= 0x30 && c <= 0x39) {
          result = input[cursor.pos] as string;
          state = STATE_TIMESTAMP_TAG;
        } else if (c === 0x3e || eof) {
          if (c === 0x3e) cursor.pos++;
          return { kind: 'start', tagName: '', classes };
        } else {
          result = input[cursor.pos] as string;
          state = STATE_START_TAG;
        }
        break;

      case STATE_START_TAG:
        if (c === 0x09 || c === 0x0c || c === 0x20) {
          state = STATE_START_TAG_ANNOTATION;
        } else if (c === 0x0a) {
          buffer = '\n';
          state = STATE_START_TAG_ANNOTATION;
        } else if (c === 0x2e) {
          state = STATE_START_TAG_CLASS;
        } else if (c === 0x3e || eof) {
          if (c === 0x3e) cursor.pos++;
          return { kind: 'start', tagName: result, classes };
        } else {
          result += input[cursor.pos] as string;
        }
        break;

      case STATE_START_TAG_CLASS:
        if (c === 0x09 || c === 0x0c || c === 0x20) {
          classes.push(buffer);
          buffer = '';
          state = STATE_START_TAG_ANNOTATION;
        } else if (c === 0x0a) {
          classes.push(buffer);
          buffer = '\n';
          state = STATE_START_TAG_ANNOTATION;
        } else if (c === 0x2e) {
          classes.push(buffer);
          buffer = '';
        } else if (c === 0x3e || eof) {
          if (c === 0x3e) cursor.pos++;
          classes.push(buffer);
          return { kind: 'start', tagName: result, classes };
        } else {
          buffer += input[cursor.pos] as string;
        }
        break;

      case STATE_START_TAG_ANNOTATION:
        if (c === 0x26) {
          cursor.pos++;
          buffer += consumeHtmlEntity(cursor, 0x3e);
          continue;
        }
        if (c === 0x3e || eof) {
          if (c === 0x3e) cursor.pos++;
          return {
            kind: 'start',
            tagName: result,
            classes,
            annotation: collapseAnnotation(buffer),
          };
        }
        buffer += input[cursor.pos] as string;
        break;

      case STATE_END_TAG:
        if (c === 0x3e || eof) {
          if (c === 0x3e) cursor.pos++;
          return { kind: 'end', tagName: result };
        }
        result += input[cursor.pos] as string;
        break;

      case STATE_TIMESTAMP_TAG:
        if (c === 0x3e || eof) {
          if (c === 0x3e) cursor.pos++;
          return { kind: 'timestamp', value: result };
        }
        result += input[cursor.pos] as string;
        break;
    }

    cursor.pos++;
  }
}

const VTT_TAGS = new Set<CueElementType>(['c', 'i', 'b', 'u', 'ruby', 'rt', 'v', 'lang']);

/** Parses WebVTT cue text into a `CueNode` tree per W3C WebVTT section 6.4. */
export function tokenizeVttCueText(input: string): CueNode[] {
  const root: CueNode[] = [];
  const stack: CueElementNode[] = [];
  const cursor: Cursor = { input: input.replaceAll('\0', '\uFFFD'), pos: 0 };

  const currentChildren = (): CueNode[] =>
    stack.length > 0 ? ((stack[stack.length - 1] as CueElementNode).children as CueNode[]) : root;

  while (cursor.pos < cursor.input.length) {
    const token = nextCueToken(cursor);
    switch (token.kind) {
      case 'text':
        if (token.value.length > 0) {
          currentChildren().push({ type: 'text', value: token.value });
        }
        break;

      case 'start': {
        const name = token.tagName as CueElementType;
        if (!VTT_TAGS.has(name)) break;
        if (name === 'rt') {
          const top = stack[stack.length - 1];
          if (top?.type !== 'ruby') break;
        }
        const classes = token.classes.filter((cls) => cls.length > 0);
        const annotation = name === 'v' || name === 'lang' ? (token.annotation ?? '') : '';
        const node: CueElementNode = {
          type: name,
          classes,
          annotation,
          children: [],
        };
        currentChildren().push(node);
        stack.push(node);
        break;
      }

      case 'end': {
        const top = stack[stack.length - 1];
        if (!top) break;
        if (token.tagName === top.type && VTT_TAGS.has(top.type)) {
          stack.pop();
        } else if (token.tagName === 'ruby' && top.type === 'rt') {
          stack.pop();
          stack.pop();
        }
        break;
      }

      case 'timestamp': {
        const time = parseTimestamp(token.value);
        if (time >= 0) {
          currentChildren().push({ type: 'timestamp', time });
        }
        break;
      }
    }
  }

  return root;
}
