# Third-party notices

st2160 is MIT licensed (see `LICENSE`). Parts of it are ported from the projects below. Each section lists the files that contain ported code and the original license. Sections are filled in as code is ported. A package ships the notices for the code it contains.

## libass

ISC License. Copyright (C) 2006-2016 libass contributors. https://github.com/libass/libass

Ported files (test tooling, not published):

- `test-suite/src/compare.ts`: the `compare` metric from `compare/compare.c` and the PNG conversion from `compare/image.c`.
- `test-suite/src/blend.ts` (`blendLibassCompare`): `blend_image` and `blend_all` from `compare/compare.c`.

## HarfRust and HarfBuzz

HarfRust: MIT License, the HarfRust authors. https://github.com/harfbuzz/harfrust
HarfBuzz: Old MIT License, the HarfBuzz authors. https://github.com/harfbuzz/harfbuzz

Ported files: none yet.

## fontations (read-fonts, skrifa)

Used under the MIT License (dual MIT or Apache-2.0). Copyright the fontations authors. https://github.com/googlefonts/fontations

Ported files: none yet.

## unicode-bidi

Used under the MIT License (dual MIT or Apache-2.0). Copyright the Servo project developers. https://github.com/servo/unicode-bidi

Ported files: none yet.

## Brotli and woff2

MIT License. Copyright Google Inc. https://github.com/google/brotli, https://github.com/google/woff2

Ported files: none yet.

## FreeType

Algorithms reimplemented with credit to the FreeType Project (https://freetype.org). No FreeType source code is included.

Ported files: none yet.

## JASSUB

MIT License. Copyright (c) 2021-2022 JASSUB contributors, (c) 2017-2021 JavascriptSubtitlesOctopus contributors. https://github.com/ThaUnknown/jassub

Ported files: none yet.

## media-captions and vtt.js

media-captions: MIT License. https://github.com/vidstack/media-captions (fork: https://github.com/ktt45678/media-captions)
vtt.js: Apache License 2.0. https://github.com/mozilla/vtt.js

Ported files:

- `packages/core/src/captions/vtt-settings.ts`, `vtt-parser.ts`, `vtt-tokenizer.ts`: WebVTT header, region, cue timings/settings and cue text parsing adapted from media-captions and the W3C WebVTT specification.
- `packages/core/src/captions/srt-parser.ts` (`applyNumpadAlignment`): `{\anN}` alignment mapping from `@ktt45678/media-captions` commit `7e1e0bd`.

## WHATWG HTML and web-platform-tests

HTML character reference table (`packages/core/src/captions/html-entities-data.ts`) generated from https://html.spec.whatwg.org/entities.json under CC BY 4.0 (Copyright WHATWG).

WebVTT parser test fixtures under `packages/core/test/fixtures/wpt` (not published) from https://github.com/web-platform-tests/wpt under the 3-Clause BSD License (Copyright web-platform-tests contributors).

## FFmpeg

LGPL 2.1 or later. https://ffmpeg.org

`test-suite/src/blend.ts` (`blendFfmpegRgb24`) reproduces the integer blend arithmetic of `ff_blend_mask` in `libavfilter/drawutils.c`, so candidates composite the same way as the native references. It is test tooling and is not published. No package contains FFmpeg code.

## Test fonts

The fonts in `test-suite/fonts/files` and the one fetched into `test-suite/.cache/fonts` are under the SIL Open Font License 1.1. Each font's license text is in `test-suite/fonts/licenses`, and `test-suite/fonts/manifest.json` records its source. They are test fixtures and are not published.

## Slug

Reference shaders by Eric Lengyel. License to be recorded when the shaders are ported (M14).

Ported files: none yet.
