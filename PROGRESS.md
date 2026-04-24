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
