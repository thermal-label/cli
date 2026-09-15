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
Family       Model            Transport  Connection         Serial
brother-ql   QL-820NWBc       tcp        192.168.1.67:9100  M5G679125
brother-ql   QL-800           usb        3.10
labelwriter  LabelWriter 450  usb        1.4
```

USB rows come from the drivers' USB enumeration. Network rows come from
each driver's own LAN scan (Brother QL: one SNMP broadcast, about a
second); a printer on another subnet, or with SNMP disabled, is not
listed but still reachable with `--host`.

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

Over TCP (the driver is found by asking the printer what it is, see
[Network printers](#network-printers)):

```
$ thermal-label status --host 192.168.1.67
Printer:   QL-820NWBc (brother-ql)
Status:    Ready
Media:     62mm continuous (62mm, continuous)
Errors:    none
  Printer state: idle
  Two-colour: not detectable over network
Transport: TCP 192.168.1.67:9100
```

Rows under `Errors:` are the driver's detail rows; warnings are shown in
yellow.

### `print text <text>`

Renders text to a label and prints.

```bash
thermal-label print text "BIN-42"
thermal-label print text "FRAGILE" --invert --scale-x 2
thermal-label print text "Hello" --printer brother-ql --density dark
thermal-label print text "Label" --host 192.168.1.67 --copies 3
thermal-label print text "Label" --host 192.168.1.67 --device QL_820NWBc --media 251
```

Before printing, the CLI queries status once (drivers size the job from
the detected media and the error rows are echoed as warnings). If that
query fails the print stops, unless `--media` is given: then it warns and
prints with the media you named, sending the job blind (`confirm: false`):
a driver that would normally confirm the print over the same channel
(Brother QL over TCP checks the SNMP page counter) cannot, so "Printed"
then means "sent", not "came out".

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
| `--host <ip>` | Use TCP transport to the given host. Without `--printer`, every installed driver is asked in turn. |
| `--port <port>` | TCP port (default `9100`). |
| `--serial <sn>` | Target a specific printer by serial number. |
| `--device <key>` | Registry key of the model (`QL_820NWBc`, `LW_550`, …) for drivers that cannot identify it themselves. Wins over identification. |
| `--media <id>` | Media id or name from the driver's catalog (`251`, `"62mm continuous"`). Overrides detected media and lets a print go out when status cannot be read. |
| `--community <name>` | SNMP community for network printers (default `public`). |

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

## Network printers

`--host <ip>` without `--printer` walks the installed drivers in a fixed
order (brother-ql, labelwriter, labelmanager) and hands the printer to the
first one that opens it. A driver that cannot speak to that address
declines and the walk moves on, so an installed-but-unrelated driver never
breaks a print on another. Only when every driver declines does the CLI
fail, and then it prints each driver's reason:

```
$ thermal-label status --host 192.168.1.67
No installed driver could open 192.168.1.67:
  brother-ql: no SNMP answer from 192.168.1.67; pass deviceKey, and media, since status is unavailable too
    candidates (key  name):
      QL_820NWBc  QL-820NWBc
      PT_E550W    PT-E550W
      …
    copy, swapping the key for your model:
      thermal-label status --host 192.168.1.67 --printer brother-ql --device QL_820NWBc --media <id>
  labelwriter: TCP open requires `deviceKey` — port 9100 carries no model signal, …

Pass --printer <family> to see one driver's error, or --device <key> to name the model.
```

How a driver identifies a network printer is its own business; Brother QL
asks over SNMP (model, serial, state, loaded media) because port 9100 is
write-only. When that is not possible (SNMP disabled, printer on another
subnet with no broadcast, a model the driver does not list) `--device`
names the model and `--media` names the roll, and the job goes out
without a status read.

Two-colour rolls (Brother DK-22251) cannot be told apart from plain
62 mm rolls over the network; the status shows a `Two-colour: not
detectable over network` warning and a job sized for the plain roll is
rejected by the printer. Pass `--media 251` on those rolls. See the
driver's troubleshooting page for the details.

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
