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

- [ ] `src/commands/list.ts`
- [ ] `src/__tests__/list.test.ts`
- [ ] Gate: typecheck + lint + test + build
- [ ] Commit

## Step 4 — Status command

- [ ] `src/commands/status.ts`
- [ ] `src/__tests__/status.test.ts`
- [ ] Gate: typecheck + lint + test + build
- [ ] Commit

## Step 5 — Render helpers

- [ ] `src/render.ts` — `renderTextLabel`, `renderImageLabel`, `labelBitmapToRawImageData`
- [ ] Gate: typecheck + lint + build
- [ ] Commit

## Step 6 — Print commands

- [ ] `src/commands/print-text.ts`
- [ ] `src/commands/print-image.ts`
- [ ] `src/__tests__/print-text.test.ts`
- [ ] `src/__tests__/print-image.test.ts`
- [ ] Gate: typecheck + lint + test + build
- [ ] Commit

## Step 7 — CLI entry point

- [ ] `src/index.ts` — commander program setup, wire all commands
- [ ] Verify `node bin/thermal-label.js --help` works
- [ ] Gate: typecheck + lint + test + build
- [ ] Commit

## Step 8 — README

- [ ] Publish-ready per PLAN §8
- [ ] Commit

## Step 9 — Final

- [ ] `pnpm test:coverage` — thresholds pass
- [ ] Verify all PROGRESS.md checkboxes ticked
- [ ] Commit
