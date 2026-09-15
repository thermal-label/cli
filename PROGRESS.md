# Implementation Progress

Tracks completion of the steps in `PLAN.md` §10.

## Step 1 — Scaffold

- [x] LICENSE (MIT, Mannes Brak)
- [x] .github/FUNDING.yml
- [x] .github/workflows/ci.yml
- [x] .github/workflows/release.yml
- [x] .gitignore
- [x] package.json
- [x] tsconfig.json (wide, noEmit)
- [x] tsconfig.build.json (narrow, emits to dist)
- [x] eslint.config.js
- [x] vitest.config.ts
- [x] bin/thermal-label.js (shebang + dynamic import)
- [x] src/index.ts (placeholder, wired in Step 7)
- [x] PROGRESS.md / DECISIONS.md / BLOCKERS.md
- [x] `pnpm install` completes cleanly
- [x] Commit

## Step 2 — Driver discovery

- [x] `src/discovery.ts` — `loadDrivers`, `listDriverStatus`, `KNOWN_DRIVERS`
- [x] `src/__tests__/discovery.test.ts` — all mocked, no real driver imports
- [x] Gate: typecheck + lint + test + build
- [x] Commit

## Step 3 — List command

- [x] `src/commands/list.ts`
- [x] `src/__tests__/list.test.ts`
- [x] Gate: typecheck + lint + test + build
- [x] Commit

## Step 4 — Status command

- [x] `src/commands/status.ts`
- [x] `src/commands/select.ts` (shared printer-selection logic)
- [x] `src/__tests__/status.test.ts`
- [x] Gate: typecheck + lint + test + build
- [x] Commit

## Step 5 — Render helpers

- [x] `src/render.ts` — `renderTextLabel`, `renderImageLabel`, `labelBitmapToRawImageData`
- [x] `src/__tests__/render.test.ts` — added early for coverage
- [x] Gate: typecheck + lint + test + build
- [x] Commit

## Step 6 — Print commands

- [x] `src/commands/print-text.ts`
- [x] `src/commands/print-image.ts`
- [x] `src/__tests__/print-text.test.ts`
- [x] `src/__tests__/print-image.test.ts`
- [x] Gate: typecheck + lint + test + build
- [x] Commit

## Step 7 — CLI entry point

- [x] `src/index.ts` — commander program setup, wire all commands
- [x] Verify `node bin/thermal-label.js --help` works
- [x] Verify `node bin/thermal-label.js list --drivers` against real (unretrofitted) drivers
- [x] Gate: typecheck + lint + test + build
- [x] Commit

## Step 8 — README

- [x] Publish-ready per PLAN §8
- [x] Commit

## Step 9 — Final

- [x] `pnpm test:coverage` — thresholds pass (95/84/81/95)
- [x] Verify all PROGRESS.md checkboxes ticked
- [x] Commit

## Step N — MediaDescriptor refactor

> Plan: [../brother-ql/MEDIA_DESCRIPTOR_REFACTOR.md](../brother-ql/MEDIA_DESCRIPTOR_REFACTOR.md)

- [x] Bump `@thermal-label/contracts` to `^0.2.0`
- [x] `status` command formats `media.palette.length`-colour instead of `colorCapable`
- [x] Test fixtures drop `colorCapable: false` (`status.test.ts`, `print-text.test.ts`, `print-image.test.ts`)
- [x] Gates green (typecheck, lint, format, test, build)

## Step — Network printers (plan 17 step 5, 0.6.0)

> Plan: `~/thermal-label/plans/backlog/17-network-discovery-snmp.md` D7

- [x] `--device`, `--media`, `--community` on `status`, `print text`, `print image`
- [x] `--host` without `--printer` walks drivers; every failure declines; `DeviceIdentificationRequiredError` rendered with candidates and a copy line
- [x] `selectPrinter` opens; discovered network printers re-open with `deviceKey`
- [x] `--media` resolved through `listMedia()`; `print` stops swallowing `getStatus()` failures
- [x] `list`: host:port rows, Serial column, SNMP-broadcast hint
- [x] Tests: `select.test.ts` (walk, re-open, media), status/list/print-text suites extended — 87 tests, coverage 95/89/85/95
- [x] Docs: `docs/index.md` network section + flags, README
- [x] Version 0.6.0
- [ ] Pin `@thermal-label/contracts ^0.6.2` and `@thermal-label/brother-ql-node ^0.6.2` + lockfile — after both are on npm
- [ ] Bench B7–B12 (maintainer, QL-820NWBc at 192.168.1.67)
