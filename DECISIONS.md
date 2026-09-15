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

## D3 — Coverage thresholds: 90/80/75/90 (stmts/branches/funcs/lines)

**Plan said:** no specific thresholds.
**Chose:** 90% lines/statements, 80% branches, 75% functions.

**Why:** Statement and line coverage are high (~95%); those are the
metrics that catch real regressions. Function coverage drops because
each command file has a trivial `defaultOut(line)` helper that wraps
`process.stdout.write` — never called in tests (tests inject `out`).
Testing these wrappers would require capturing stdout, which is
ceremony for no signal. Branch coverage is slightly relaxed for
unreachable defensive paths (e.g. `Internal: no driver after filter`
branches in `select.ts` that only fire on broken invariants).

`src/index.ts` (commander wiring) is excluded — it is pure glue code
that is exercised manually via `--help` and the smoke test in
PROGRESS.md Step 7.

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

## D6 — `--host` walks the drivers; every failure is a decline

**Plan said (plan 17 D7):** walk installed drivers on `--host` without
`--printer`; typed "not mine" errors mean move on, anything else is that
driver's error.
**Chose:** every rejection or synchronous throw from `openPrinter` is a
decline, whatever its type. The walk only fails when all drivers decline,
and then prints each driver's reason.

**Why:** the published labelwriter-node throws a plain `Error` when
`deviceKey` is missing on TCP, and future drivers may throw anything. A
walk that rethrows untyped errors would make a Brother print die on an
unrelated installed driver. The reasons are not lost: they are all shown
when nobody succeeds, and `--printer <family>` still surfaces one
driver's error verbatim. Sequential, not concurrent, so at most one
driver holds a 9100 socket; the cost today is one SNMP timeout (only
brother-ql identifies over the network).

`selectPrinter` now opens the printer itself so there is one open site
for the walk, the `--printer` path and the discovered path. Discovered
network printers are re-opened with the discovered device key so the
driver does not identify twice.

## D7 — `list` shows a Serial column instead of a `serial=` suffix

**Plan said (plan 17 D7):** render network rows as
`brother-ql  QL-820NWBc  tcp  192.168.1.67:9100  serial=M5G679125`.
**Chose:** a fifth `Serial` column on every row, blank when unknown.

**Why:** USB rows carry serials too, and a column keeps the table
aligned; the information is the same. The "multiple printers found"
message keeps the `serial=` suffix, it is a sentence not a table.
