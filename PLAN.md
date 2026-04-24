# @thermal-label/cli — Implementation Plan

> Unified CLI for thermal label printers. Replaces the three per-driver
> CLIs (`labelmanager-cli`, `labelwriter-cli`, `brother-ql-cli`) with a
> single tool that auto-discovers installed driver packages at runtime.
>
> This is a driver diagnostic and quick-test tool — not a label design
> tool. For templates, barcodes, CSV batch printing, use `burnmark-cli`.
>
> **SCOPE: this plan covers ONLY the CLI package.** The existing driver
> packages do NOT implement `PrinterDiscovery` yet — that happens in the
> driver retrofit amendments. Build and test this CLI against mocked
> drivers. The dynamic import will find nothing when run against
> unretrofitted drivers. That's expected and correct.

---

## 1. Repository

`github.com/thermal-label/cli`

```
cli/
├── .github/
│   ├── FUNDING.yml
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── src/
│   ├── index.ts              # CLI entry point (commander setup)
│   ├── discovery.ts          # dynamic driver import + discoverAll
│   ├── commands/
│   │   ├── list.ts
│   │   ├── status.ts
│   │   ├── print-text.ts
│   │   └── print-image.ts
│   ├── render.ts             # text/image → RawImageData via @mbtech-nl/bitmap
│   └── __tests__/
│       ├── discovery.test.ts
│       ├── list.test.ts
│       ├── status.test.ts
│       ├── print-text.test.ts
│       └── print-image.test.ts
├── bin/
│   └── thermal-label.js
├── PROGRESS.md
├── DECISIONS.md
├── BLOCKERS.md
├── LICENSE
├── README.md
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── eslint.config.js
```

---

## 2. Commands

### 2.1 `thermal-label list`

Lists discovered printers across all installed driver packages.

```
$ thermal-label list
  Family        Model              Transport   Connection
  brother-ql    QL-820NWB          usb         Bus 003 Device 010
  labelwriter   LabelWriter 450    usb         Bus 001 Device 004

$ thermal-label list --drivers
  Package                              Status
  @thermal-label/brother-ql-node       ✓ installed
  @thermal-label/labelwriter-node      ✓ installed
  @thermal-label/labelmanager-node     ✗ not installed
```

**`--drivers` flag:** lists known driver packages and their install status.
Does not query hardware — just checks which packages are importable.

### 2.2 `thermal-label status`

Queries the status of a connected printer.

```
$ thermal-label status
  Printer:   QL-820NWB (brother-ql)
  Status:    Ready
  Media:     62mm continuous (DK-22251, two-colour)
  Errors:    none

$ thermal-label status --host 192.168.1.42
  Printer:   QL-820NWB (brother-ql)
  Status:    Ready
  Media:     62mm continuous
  Transport: TCP 192.168.1.42:9100
```

Auto-detects the printer when one is connected. If multiple printers
found, prompts the user to pick. If `--printer` flag is set, filters
to that family.

### 2.3 `thermal-label print text <text>`

Renders text to a bitmap and prints.

```
$ thermal-label print text "BIN-42"
$ thermal-label print text "FRAGILE" --invert --scale-x 2
$ thermal-label print text "Hello" --printer brother-ql --density dark
$ thermal-label print text "Label" --host 192.168.1.42 --copies 3
```

Rendering uses `@mbtech-nl/bitmap` — pixel font rendering, no Canvas,
no `@napi-rs/canvas`. This is intentionally basic — for nice labels
with real fonts, use `burnmark-cli`.

### 2.4 `thermal-label print image <file>`

Loads an image file and prints.

```
$ thermal-label print image logo.png
$ thermal-label print image photo.jpg --dither --threshold 100
$ thermal-label print image label.png --rotate 90 --printer labelwriter
```

Supports PNG, JPEG, BMP. Uses `@mbtech-nl/bitmap` for loading and
conversion to `RawImageData`.

---

## 3. Flags

### 3.1 Global Flags

| Flag | Type | Description |
|---|---|---|
| `--printer <family>` | string | Force driver family: `brother-ql`, `labelwriter`, `labelmanager` |
| `--host <ip>` | string | Use TCP transport to the given host |
| `--port <port>` | number | TCP port (default 9100) |
| `--serial <sn>` | string | Target printer by serial number |
| `--verbose` | boolean | Show debug output |

### 3.2 `print text` Flags

| Flag | Type | Default | Description |
|---|---|---|---|
| `--invert` | boolean | false | White text on black background |
| `--scale-x <n>` | number | 1 | Horizontal scale factor |
| `--scale-y <n>` | number | 1 | Vertical scale factor |
| `--density <d>` | string | `'normal'` | Driver-specific density |
| `--copies <n>` | number | 1 | Number of copies |

### 3.3 `print image` Flags

| Flag | Type | Default | Description |
|---|---|---|---|
| `--threshold <n>` | number | 128 | 1bpp threshold (0-255) |
| `--dither` | boolean | false | Floyd-Steinberg dithering |
| `--invert` | boolean | false | Invert colours |
| `--rotate <deg>` | number | 0 | Rotation: 0, 90, 180, 270 |
| `--density <d>` | string | `'normal'` | Driver-specific density |
| `--copies <n>` | number | 1 | Number of copies |

---

## 4. Dynamic Driver Discovery

### 4.1 Known Driver Packages

```typescript
const KNOWN_DRIVERS = [
  '@thermal-label/labelmanager-node',
  '@thermal-label/labelwriter-node',
  '@thermal-label/brother-ql-node',
] as const;
```

This list is the only place new drivers need to be registered. Adding
a future `@thermal-label/zebra-node` or `@thermal-label/escpos-node`
is a one-line addition + CLI release.

### 4.2 Import Logic

```typescript
import type { PrinterDiscovery } from '@thermal-label/contracts';

interface LoadedDriver {
  packageName: string;
  discovery: PrinterDiscovery;
}

async function loadDrivers(): Promise<LoadedDriver[]> {
  const drivers: LoadedDriver[] = [];

  for (const pkg of KNOWN_DRIVERS) {
    try {
      const mod = await import(pkg);

      // The driver must export a PrinterDiscovery instance
      // Convention: named export 'discovery' or default export
      const discovery: PrinterDiscovery | undefined =
        mod.discovery ?? mod.default?.discovery;

      if (discovery && typeof discovery.listPrinters === 'function') {
        drivers.push({ packageName: pkg, discovery });
      }
    } catch {
      // Not installed — skip silently. This is expected and normal.
    }
  }

  return drivers;
}
```

### 4.3 The `--drivers` Flag

```typescript
async function listDriverStatus(): Promise<void> {
  for (const pkg of KNOWN_DRIVERS) {
    try {
      await import(pkg);
      console.log(`  ${pkg}  ✓ installed`);
    } catch {
      console.log(`  ${pkg}  ✗ not installed`);
    }
  }
}
```

### 4.4 Auto-Detection Flow

```
thermal-label print text "Hello"
  1. loadDrivers() — find installed driver packages
  2. For each driver: call discovery.listPrinters()
     (via discoverAll from @thermal-label/transport)
  3. If exactly one printer found → use it
  4. If multiple → error with list, ask user to use --printer or --serial
  5. If none → error with helpful message:
     "No printers found. Installed drivers: brother-ql, labelwriter.
      Make sure your printer is connected via USB or accessible via TCP."
  6. Open printer via discovery.openPrinter()
  7. Render text/image → RawImageData
  8. printer.print(image)
  9. printer.close() in finally block — ALWAYS
```

### 4.5 When No Drivers Are Installed

```
$ thermal-label list
  No driver packages installed.

  Install a driver for your printer:
    pnpm add @thermal-label/brother-ql-node     # Brother QL series
    pnpm add @thermal-label/labelwriter-node     # Dymo LabelWriter
    pnpm add @thermal-label/labelmanager-node    # Dymo LabelManager

  Then run 'thermal-label list' again.
```

### 4.6 When No Drivers Implement PrinterDiscovery Yet

The existing driver packages don't implement `PrinterDiscovery` yet —
that happens in the driver retrofit amendments. Until then, `loadDrivers()`
will import the package but find no `discovery` export, and skip it. The
result is the same as "no drivers installed" from the CLI's perspective.

This is expected. The CLI is correct and ready — the drivers need to
catch up. Document this in DECISIONS.md.

---

## 5. Rendering

### 5.1 Text Rendering

Uses `@mbtech-nl/bitmap` pixel font — basic but sufficient for diagnostic
labels. Not Canvas, not `@napi-rs/canvas`. The output is `RawImageData`
passed directly to `printer.print()`.

```typescript
import { renderText, type RawImageData } from '@mbtech-nl/bitmap';

function renderTextLabel(text: string, options: TextOptions): RawImageData {
  return renderText(text, {
    scaleX: options.scaleX ?? 1,
    scaleY: options.scaleY ?? 1,
    invert: options.invert ?? false,
  });
}
```

### 5.2 Image Rendering

Loads an image file from disk, decodes it, returns `RawImageData`.

```typescript
import { loadImage, type RawImageData } from '@mbtech-nl/bitmap';
// or use sharp/decode-bmp for format support if bitmap doesn't handle it

async function renderImageLabel(path: string, options: ImageOptions): Promise<RawImageData> {
  const image = await loadImage(path);
  // Apply options: threshold, dither, invert, rotate
  return image;
}
```

If `@mbtech-nl/bitmap` doesn't have `loadImage` for PNG/JPEG, use
`sharp` as a dependency for image decoding. The agent should check
what bitmap actually exports and decide. Log in DECISIONS.md.

---

## 6. Package Setup

```json
{
  "name": "@thermal-label/cli",
  "version": "0.1.0",
  "description": "Unified CLI for thermal label printers — auto-detects all installed drivers",
  "keywords": ["thermal-label", "printer", "cli", "dymo", "brother", "label"],
  "type": "module",
  "author": "Mannes Brak",
  "license": "MIT",
  "homepage": "https://github.com/thermal-label/cli",
  "repository": { "type": "git", "url": "https://github.com/thermal-label/cli.git" },
  "bugs": { "url": "https://github.com/thermal-label/cli/issues" },
  "funding": [
    { "type": "github", "url": "https://github.com/sponsors/mannes" },
    { "type": "ko-fi", "url": "https://ko-fi.com/mannes" }
  ],
  "files": ["bin", "dist", "README.md"],
  "bin": { "thermal-label": "./bin/thermal-label.js" },
  "engines": { "node": ">=24.0.0" },
  "publishConfig": { "access": "public" },
  "sideEffects": false,
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "dependencies": {
    "@thermal-label/contracts": "^0.1.0",
    "@thermal-label/transport": "^0.1.0",
    "@mbtech-nl/bitmap": "^1.0.0",
    "commander": "^12.0.0",
    "chalk": "^5.0.0",
    "ora": "^8.0.0"
  },
  "peerDependencies": {
    "@thermal-label/labelmanager-node": ">=0.0.1",
    "@thermal-label/labelwriter-node": ">=0.0.1",
    "@thermal-label/brother-ql-node": ">=0.0.1"
  },
  "peerDependenciesMeta": {
    "@thermal-label/labelmanager-node": { "optional": true },
    "@thermal-label/labelwriter-node": { "optional": true },
    "@thermal-label/brother-ql-node": { "optional": true }
  },
  "devDependencies": {
    "@mbtech-nl/eslint-config": "^1.0.1",
    "@mbtech-nl/prettier-config": "^1.0.0",
    "@mbtech-nl/tsconfig": "^1.0.0",
    "@types/node": "^22.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "typescript": "~5.5.0",
    "vitest": "^2.0.0"
  }
}
```

Note `@mbtech-nl/eslint-config: "^1.0.1"` — includes the D9 fix.

Two tsconfigs: wide for lint, narrow for emit.

---

## 7. Tests

**All tests use mocked drivers.** The CLI does not touch real hardware
or real driver packages during tests. Mock the dynamic import to return
fake `PrinterDiscovery` implementations.

### 7.1 Discovery (`discovery.test.ts`)

- `loadDrivers()` with no packages installed → empty array
- `loadDrivers()` with one mock driver → returns it
- `loadDrivers()` with a package that has no `discovery` export → skips it
- `loadDrivers()` with a package that throws on import → skips it gracefully
- `listDriverStatus()` correctly shows installed vs not-installed

### 7.2 List Command (`list.test.ts`)

- No drivers installed → helpful install instructions
- One driver, one printer → table output with family, model, transport
- Multiple drivers, multiple printers → combined table
- `--drivers` flag → shows package install status
- Drivers installed but no PrinterDiscovery export → same as no drivers
  (this is the current state until drivers are retrofitted)

### 7.3 Status Command (`status.test.ts`)

- One printer found → displays status, media, errors
- No printer found → helpful error message
- Multiple printers → error asking for `--printer` or `--serial`
- `--printer brother-ql` → filters to that family
- `--host` flag → uses TCP via the filtered driver
- Printer with detected media → shows media details
- Printer with errors → shows error codes and messages

### 7.4 Print Text (`print-text.test.ts`)

- Renders text via bitmap, calls `printer.print(image)` with correct RawImageData
- `--invert` flag → passes to renderText
- `--scale-x` / `--scale-y` → passes to renderText
- `--density` → passes to printer.print options
- `--copies 3` → calls printer.print three times (or passes copies option)
- `printer.close()` called in finally block — verify even on print error
- No printer found → helpful error, does not crash

### 7.5 Print Image (`print-image.test.ts`)

- Loads image file, calls `printer.print(image)`
- `--threshold` → passes to image conversion
- `--dither` → enables Floyd-Steinberg
- `--invert` → inverts image
- `--rotate 90` → rotates before printing
- File not found → clear error message
- `printer.close()` called in finally block

---

## 8. Positioning

### 8.1 This CLI vs burnmark-cli

| | `@thermal-label/cli` | `burnmark-cli` |
|---|---|---|
| Purpose | Test hardware, quick prints | Design and produce labels |
| Rendering | Pixel font via `@mbtech-nl/bitmap` | Full Canvas fonts via `@napi-rs/canvas` |
| Templates | ❌ | ✅ `.label` files |
| CSV batch | ❌ | ✅ |
| Barcodes | ❌ | ✅ 50+ formats |
| Sheet export | ❌ | ✅ PDF tiling |
| Install size | Tiny | Larger (canvas native addon) |
| Use case | "Does my printer work?" | "Print 200 shipping labels" |

### 8.2 README Tagline

> Test and print to any supported thermal printer from the command line.
> For templates, barcodes, and production label workflows, see
> [burnmark-cli](https://github.com/burnmark-io/designer-core).

---

## 9. CI/CD

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v5
        with: { version: 9 }
      - uses: actions/setup-node@v6
        with: { node-version: '24', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm prettier --check "src/**/*.ts"
      - run: pnpm test:coverage
      - uses: codecov/codecov-action@v5
        with: { token: '${{ secrets.CODECOV_TOKEN }}' }
      - run: pnpm build
```

Release: standard npm trusted publishing on `v*` tags.

---

## 10. Implementation Sequence

```
1. Scaffold
   - LICENSE (MIT, Mannes Brak)
   - .github/FUNDING.yml
   - package.json, tsconfig.json, tsconfig.build.json, eslint.config.js
   - bin/thermal-label.js (shebang + dynamic import)
   - GitHub Actions: ci.yml, release.yml
   - .gitignore
   - PROGRESS.md, DECISIONS.md, BLOCKERS.md
   - pnpm install — must complete without errors
   - Commit + push

2. Driver discovery
   - src/discovery.ts — loadDrivers, listDriverStatus, KNOWN_DRIVERS
   - src/__tests__/discovery.test.ts — all mocked, no real driver imports
   - Gate: typecheck + lint + test + build
   - Commit + push

3. List command
   - src/commands/list.ts
   - src/__tests__/list.test.ts
   - Gate: typecheck + lint + test + build
   - Commit + push

4. Status command
   - src/commands/status.ts
   - src/__tests__/status.test.ts
   - Gate: typecheck + lint + test + build
   - Commit + push

5. Render helpers
   - src/render.ts — renderTextLabel, renderImageLabel
   - Check what @mbtech-nl/bitmap exports for image loading — if it
     can't load PNG/JPEG from disk, add sharp as a dependency. Log in
     DECISIONS.md.
   - Gate: typecheck + lint + build
   - Commit + push

6. Print commands
   - src/commands/print-text.ts
   - src/commands/print-image.ts
   - src/__tests__/print-text.test.ts
   - src/__tests__/print-image.test.ts
   - Gate: typecheck + lint + test + build
   - Commit + push

7. CLI entry point
   - src/index.ts — commander program setup, wire all commands
   - Verify bin/thermal-label.js works: node bin/thermal-label.js --help
   - Gate: typecheck + lint + test + build
   - Commit + push

8. README
   - Complete, publish-ready per section 8
   - Install snippet, all commands with examples, driver install note,
     comparison with burnmark-cli, license badge, funding
   - Commit + push

9. Final
   - pnpm test:coverage — verify thresholds
   - Verify all PROGRESS.md checkboxes ticked
   - Commit + push
```

---

## 11. Key Constraints

**Scope:**
- **ONLY implement this package.** Do not modify driver repos. The drivers
  do NOT implement `PrinterDiscovery` yet — that's the retrofit.
- **All tests use mocked drivers.** No real hardware, no real driver
  imports during tests. Mock the dynamic import to return fake
  `PrinterDiscovery` implementations.
- **The CLI will find zero printers when run against current drivers.**
  This is expected and correct. Document in DECISIONS.md. The CLI is
  ready — the drivers need to catch up.

**Implementation:**
- `printer.close()` ALWAYS called in finally block — even on errors.
- `loadDrivers()` never throws — import failures are silently skipped.
- `discoverAll()` from `@thermal-label/transport` used for printer discovery.
- Error messages are helpful — tell the user what to do, not just what failed.
- `--host` flag uses `TcpTransport` from `@thermal-label/transport/node`.
- No Canvas, no `@napi-rs/canvas` — rendering is via `@mbtech-nl/bitmap` only.
- Multiple printers found without `--printer` flag → error with list, don't
  pick arbitrarily.

**Tooling:**
- Two tsconfigs: wide for lint, narrow for emit.
- `@mbtech-nl/eslint-config: "^1.0.1"` — includes the D9 fix.
- `publishConfig: { access: "public" }`.
- `pnpm prettier --check` in CI.
- `sideEffects: false`.
- At 0.x, break freely.

**After this ships:**
- Unpublish per-driver CLIs: `npm unpublish @thermal-label/{labelmanager,labelwriter,brother-ql}-cli --force`
- Retrofit drivers to implement `PrinterDiscovery` and export `discovery` instance