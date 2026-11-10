# Heading fonts

The two heading faces of the dashboard (`--font-heading`: 欧文 Source Serif 4,
和文 Zen Old Mincho; design-spec-v1 §3), committed as heading-only subsets on
2026-08-05 (db76f3f) and loaded by `src/app/layout.tsx` with `next/font/local`.
They were never fetched at build time; this folder only lacked their licences
until PR 27 (2026-11-10). Both fonts are under the SIL Open Font License 1.1,
which asks that the licence travel with every copy.

| File | Bytes | sha256 |
|:--|--:|:--|
| `SourceSerif4-700-subset.woff2` | 16,560 | `3cc37c6dbb1f74f39ec5ec173e9d4ff7eaad063b38c2c16f438552153a5cea15` |
| `ZenOldMincho-700-subset.woff2` | 313,440 | `e27dd53f33039118c73e1731d120d9b8b5360ec579c59b327793e9746f34fed5` |
| `OFL-SourceSerif4.md` | 4,578 | `bb1e7cb76848ee07553f92081428cd5e6eb41a85b65114cb15cc66d22718bf27` |
| `OFL-ZenOldMincho.txt` | 4,399 | `469d214f9842809659c827b7f2adaf40ec0df6efdd5fe18b7127665c32aafaec` |

## What the font files say about themselves (name tables, read with fontTools 4.61.1)

- `SourceSerif4-700-subset.woff2` — family "Source Serif 4", version
  `Version 4.004;hotconv 1.0.116;makeotfexe 2.5.65601`, copyright
  "© 2014 - 2021 Adobe Systems Incorporated (http://www.adobe.com/), with
  Reserved Font Name 'Source'"; 342 glyphs, 292 code points, usWeightClass 700
  (its subfamily and unique-id entries still read "Regular" /
  `SourceSerif4Roman-Regular`). The licence entries were stripped by the
  subsetting.
- `ZenOldMincho-700-subset.woff2` — family "Zen Old Mincho", subfamily "Bold",
  `Version 1.500`, copyright "Copyright 2021 The Zen Old Mincho Project Authors
  (https://github.com/googlefonts/zen-oldmincho)"; 1,386 glyphs, 1,350 code
  points, usWeightClass 700.

The CSS family names are the ones `next/font/local` derives from the loader
variables (`sourceSerif`, `zenOldMincho`); the Reserved Font Name 'Source' is
not used as a family name.

## Licences

- `OFL-SourceSerif4.md` — Adobe's `LICENSE.md` at release 4.004R of
  adobe-fonts/source-serif (commit a9eaef81588dddd479f2275d87b3707ed7ae2847,
  https://github.com/adobe-fonts/source-serif/blob/a9eaef81588dddd479f2275d87b3707ed7ae2847/LICENSE.md),
  the release whose version string the subset carries. google/fonts' copy
  (`ofl/sourceserif4/OFL.txt` at 5bb28733cec313b63fbd415b574b5ae35c8aa8b8)
  states the copyright line differently ("Copyright 2014 The Source Serif 4
  Project Authors"); Adobe's text matches the font's own name table and is the
  one kept here.
- `OFL-ZenOldMincho.txt` — `OFL.txt` of googlefonts/zen-oldmincho at
  490d363e7886839ba1f86971cf874a1d70ad27f0
  (https://github.com/googlefonts/zen-oldmincho/blob/490d363e7886839ba1f86971cf874a1d70ad27f0/OFL.txt),
  byte-identical to google/fonts' `ofl/zenoldmincho/OFL.txt` at 5bb28733cec313b63fbd415b574b5ae35c8aa8b8.

`src/__tests__/fonts/vendored-fonts.test.ts` checks that this folder holds
exactly these files and that the hashes above match.
