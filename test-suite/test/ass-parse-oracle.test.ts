import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseAss } from '@st2160/core';
import { describe, expect, it } from 'vitest';
import { ffmpegProblem, libassTrackCounts } from '../src/ffmpeg.ts';
import { libassTestsCorpus } from '../src/libass-tests.ts';
import { libassTestsRoot, repoRoot } from '../src/paths.ts';

function collectAssFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectAssFiles(full));
    } else if (entry.endsWith('.ass') || entry.endsWith('.ssa')) {
      out.push(full);
    }
  }
  return out.sort();
}

const jassubFixturesDir = join(
  repoRoot,
  '..',
  'other-repos',
  'jassub',
  'test',
  'fixtures',
  'subtitles',
);
const ffmpegReady = ffmpegProblem() === undefined;

describe.runIf(existsSync(libassTestsRoot))('ASS parser on libass-tests corpus', () => {
  it('parses all libass-tests scripts without throwing', () => {
    const cases = libassTestsCorpus();
    expect(cases.length).toBeGreaterThan(30);
    for (const c of cases) {
      const content = readFileSync(c.script, 'utf8');
      const track = parseAss(content);
      expect(track.styles.count).toBeGreaterThanOrEqual(1);
    }
  });

  it.runIf(ffmpegReady)('matches native libass style and event counts on libass-tests', () => {
    for (const c of libassTestsCorpus()) {
      const content = readFileSync(c.script, 'utf8');
      const track = parseAss(content);
      const nativeCounts = libassTrackCounts(c.script);
      expect({ script: c.name, styles: track.styles.count, events: track.events.count }).toEqual({
        script: c.name,
        styles: nativeCounts.styles,
        events: nativeCounts.events,
      });
    }
  });
});

describe.runIf(existsSync(jassubFixturesDir))('ASS parser on JASSUB subtitle fixtures', () => {
  it('parses every JASSUB fixture including the 7 MB Kusriya script', () => {
    const files = collectAssFiles(jassubFixturesDir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const track = parseAss(content);
      expect(track.styles.count).toBeGreaterThanOrEqual(1);
    }
  });
});
