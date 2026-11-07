import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
export const suiteRoot = fileURLToPath(new URL('../', import.meta.url));
/** Downloaded assets, filled by scripts/fetch-test-assets.ts. */
export const cacheRoot = fileURLToPath(new URL('../.cache/', import.meta.url));
export const fontsRoot = fileURLToPath(new URL('../fonts/', import.meta.url));
export const libassTestsRoot = fileURLToPath(new URL('../.cache/libass-tests/', import.meta.url));
