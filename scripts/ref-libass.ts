// Usage: node scripts/ref-libass.ts <dir/name.ass> --size WxH [--times 0,1500] [--fonts a.ttf]
// Writes native libass reference PNGs next to the script and records them in refs.json.
import { basename, dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { writeReference } from '../test-suite/src/references.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    size: { type: 'string' },
    times: { type: 'string', default: '0' },
    fonts: { type: 'string', default: '' },
  },
});

const script = positionals[0];
const size = /^(\d+)x(\d+)$/.exec(values.size ?? '');
if (!script?.endsWith('.ass') || !size) {
  console.error(
    'usage: node scripts/ref-libass.ts <dir/name.ass> --size WxH [--times 0,1500] [--fonts a.ttf,b.otf]',
  );
  process.exit(2);
}

const timesMs = values.times.split(',').map(Number);
if (timesMs.some((t) => !Number.isInteger(t) || t < 0))
  throw new Error(`bad --times ${values.times}`);

writeReference(dirname(resolve(script)), basename(script, '.ass'), {
  width: Number(size[1]),
  height: Number(size[2]),
  fonts: values.fonts.split(',').filter(Boolean),
  timesMs,
});
console.log(`wrote references for ${script}`);
