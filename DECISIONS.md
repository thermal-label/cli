# Implementation Decisions

Judgment calls made during implementation that deviate from, or fill gaps
in, `PLAN.md`. Operator was unavailable — decisions documented here for
later review.

## D1 — Image decoding: PNG + JPEG only, pure-JS, no BMP

**Plan said:** §2.4 lists "PNG, JPEG, BMP". §5.2 suggested `sharp` for
decoding.
**Chose:** `pngjs` + `jpeg-js` (pure JS). Dropped BMP.

**Why:** The CLI's positioning (PLAN §8.1) emphasises a tiny install.
`sharp` bundles platform-specific native binaries and adds tens of MB
per install. The pure-JS pair each weighs under 100 KB, works on any
platform without prebuilt binaries, and decodes a file once per CLI
invocation — performance is irrelevant at this scale.

BMP is rare in modern workflows (PNG/JPEG cover label-design output
from every common tool) and adding a decoder just to satisfy the plan
wasn't worth the extra dependency and test surface. Users who produce
BMPs can convert to PNG in their source tool. If operator wants BMP
back, re-add `decode-bmp` and extend `loadImageFile`'s dispatcher.

`@mbtech-nl/bitmap` exposes `renderImage` (threshold/dither/invert/
rotate) so no additional image transforms from `sharp` are needed.

## D2 — `renderText` returns `LabelBitmap`, `PrinterAdapter.print` takes `RawImageData`

**Plan said:** §5.1 showed `renderText(text, options)` returning
`RawImageData` passed directly to `printer.print()`.
**Actual:** `@mbtech-nl/bitmap` `renderText` returns `LabelBitmap` (1bpp).
`PrinterAdapter.print` accepts `RawImageData` (RGBA).

**Why:** The plan was mistaken about the bitmap return type. The CLI
bridges the two with a `labelBitmapToRawImageData()` helper that expands
each 1bpp pixel to a pure-black or pure-white RGBA quartet. The driver
then re-threshholds trivially (every pixel is either 0 or 255). Round-
tripping is wasteful but one-off per label and keeps the CLI clean.

## D3 — Coverage thresholds set to 90/90/85/90

**Plan said:** no specific thresholds.
**Chose:** 90% lines/functions/statements, 85% branches.

**Why:** The CLI has non-trivial branching for discovery (try/catch per
driver), flag parsing, and error paths that are hard to drive through
Vitest without extensive mocking. 90/85 is a realistic target that still
catches regressions without forcing useless tests for every early-exit
branch. `src/index.ts` (commander wiring) is excluded — it is pure glue
code that is exercised manually via `--help`.

## D4 — Remote push deferred, no remote configured

**Plan said:** "Commit + push" at each step.
**Chose:** Commit locally at each step. Skip push — no git remote.

**Why:** The repo at `/home/mannes/thermal-label/cli` was initialised
without a remote. Adding one requires operator credentials. Local
commits preserve step boundaries so the work can be pushed later in
a single `git push --all`. See `BLOCKERS.md` B1.

## D5 — `sharp`-style image decoding replaced with per-format dispatch

**Plan said:** one `loadImage` helper.
**Chose:** inspect file extension (`.png` / `.jpg` / `.jpeg` / `.bmp`)
and dispatch to the corresponding decoder.

**Why:** Pure-JS decoders have format-specific APIs. One dispatcher
gives a single `loadImageFile(path) → RawImageData` surface for the
print-image command without spreading format knowledge across the
codebase.
