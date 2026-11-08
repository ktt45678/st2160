import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const packages = ['core', 'text', 'element', 'videojs', 'shaper-harfbuzz', 'font-index'];

// Tests import workspace packages from source, so no build is needed before testing.
const alias = packages.map((name) => ({
  find: `@st2160/${name}`,
  replacement: fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
}));

const browsers = ['chromium', 'firefox', 'webkit'] as const;

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'packages/*/test/**/*.test.ts',
            'test-suite/test/**/*.test.ts',
            'scripts/test/**/*.test.ts',
          ],
          exclude: ['**/*.browser.test.ts', '**/node_modules/**'],
        },
      },
      ...browsers.map((browser) => ({
        extends: true as const,
        server: {
          fs: {
            allow: [fileURLToPath(new URL('..', import.meta.url))],
          },
        },
        test: {
          name: `browser-${browser}`,
          include: ['packages/*/test/**/*.browser.test.ts', 'test-suite/test/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser }],
          },
        },
      })),
    ],
  },
});
