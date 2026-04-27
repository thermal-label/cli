# thermal-label-cli

Test and print to any supported thermal printer from the command line. **One
CLI**, auto-detects every installed driver — Brother QL, DYMO LabelWriter,
DYMO LabelManager, and any future driver built against
[`@thermal-label/contracts`](/contracts/).

For templates, barcodes, CSV batches, and production label workflows, see
[burnmark-cli](https://www.npmjs.com/package/burnmark-cli) — this CLI is
intentionally minimal and focused on hardware diagnostics and quick prints.

## Install

```bash
# Install the CLI plus the driver(s) for your printer
npm install -g thermal-label-cli @thermal-label/brother-ql-node

# Or with pnpm
pnpm add -g thermal-label-cli @thermal-label/brother-ql-node
```

Driver packages are optional peers — install only what you need.

| Printer family | Driver package |
|---|---|
| Brother QL | `@thermal-label/brother-ql-node` |
| DYMO LabelWriter | `@thermal-label/labelwriter-node` |
| DYMO LabelManager | `@thermal-label/labelmanager-node` |

## Quick start

```bash
# See which printers are connected
thermal-label list

# See which driver packages are installed
thermal-label list --drivers

# Query printer status and detected media
thermal-label status

# Print a quick test label
thermal-label print text "Hello World"

# Print an image
thermal-label print image logo.png
```

## Commands

### `list`

Lists discovered printers across every installed driver.

```
$ thermal-label list
Family       Model            Transport  Connection
brother-ql   QL-820NWB        usb        Bus 003 Device 010
labelwriter  LabelWriter 450  usb        Bus 001 Device 004
```

`--drivers` shows which known driver packages are installed:

```
$ thermal-label list --drivers
Package                            Status
@thermal-label/brother-ql-node     installed
@thermal-label/labelwriter-node    installed
@thermal-label/labelmanager-node   not installed
```

If a driver is installed but does not yet export a `PrinterDiscovery`
instance, you'll see `installed, no discovery export` instead.

### `status`

Queries the status of a connected printer.

```
$ thermal-label status
Printer:   QL-820NWB (brother-ql)
Status:    Ready
Media:     62mm continuous (62mm, continuous)
Errors:    none
```

Over TCP:

```
$ thermal-label status --printer brother-ql --host 192.168.1.42
```

### `print text <text>`

Renders text to a label and prints.

```bash
thermal-label print text "BIN-42"
thermal-label print text "FRAGILE" --invert --scale-x 2
thermal-label print text "Hello" --printer brother-ql --density dark
thermal-label print text "Label" --host 192.168.1.42 --printer brother-ql --copies 3
```

Rendering uses [`@mbtech-nl/bitmap`](https://www.npmjs.com/package/@mbtech-nl/bitmap)'s
pixel font — simple by design. For typography, barcodes, or logos, render
externally and use `print image`.

### `print image <file>`

Loads a PNG or JPEG and prints.

```bash
thermal-label print image logo.png
thermal-label print image photo.jpg --dither --threshold 100
thermal-label print image label.png --rotate 90 --printer labelwriter
```

## Flags

### Global / selection

| Flag | Description |
|---|---|
| `--printer <family>` | Restrict to a driver family: `brother-ql`, `labelwriter`, `labelmanager`. |
| `--host <ip>` | Use TCP transport to the given host. Requires `--printer`. |
| `--port <port>` | TCP port (default `9100`). |
| `--serial <sn>` | Target a specific printer by serial number. |

### `print text`

| Flag | Default | Description |
|---|---|---|
| `--invert` | `false` | White text on black background. |
| `--scale-x <n>` | `1` | Horizontal scale factor. |
| `--scale-y <n>` | `1` | Vertical scale factor. |
| `--density <d>` | `normal` | Driver-specific density (`light`, `normal`, `dark`, …). |
| `--copies <n>` | `1` | Number of copies. |

### `print image`

| Flag | Default | Description |
|---|---|---|
| `--threshold <n>` | `128` | 1bpp threshold (0–255). |
| `--dither` | `false` | Floyd–Steinberg dithering. |
| `--invert` | `false` | Invert colours. |
| `--rotate <deg>` | `0` | Rotation: `0`, `90`, `180`, or `270`. |
| `--density <d>` | `normal` | Driver-specific density. |
| `--copies <n>` | `1` | Number of copies. |

## When multiple printers are connected

If more than one printer is detected and you haven't passed `--printer` or
`--serial`, the CLI prints the list and exits with a non-zero status — no
interactive prompt, so it plays nicely in scripts, systemd units, and CI.
Disambiguate with `--printer <family>` or `--serial <sn>`.

## thermal-label-cli vs burnmark-cli

|  | `thermal-label-cli` | [`burnmark-cli`](https://www.npmjs.com/package/burnmark-cli) |
|---|---|---|
| Purpose | Test hardware, quick prints | Design and produce labels |
| Text rendering | Pixel font via `@mbtech-nl/bitmap` | Full Canvas fonts |
| Template files | — | ✓ `.label` files |
| CSV batch | — | ✓ |
| Barcodes | — | ✓ 50+ formats |
| Sheet PDF export | — | ✓ multi-up tiling |
| Install size | Tiny (pure JS image decoders) | Larger (native canvas addon) |
| Use case | "Does my printer work?" | "Print 200 shipping labels." |

Same driver ecosystem — pick the tool that matches your task.

## Compatibility

| | |
|---|---|
| Runtime | Node ≥ 24 |
| Drivers | Auto-detects any installed `@thermal-label/*-node` driver with a `discovery` export |
| License | MIT |

[Source on GitHub](https://github.com/thermal-label/cli) ·
[npm](https://www.npmjs.com/package/thermal-label-cli)
