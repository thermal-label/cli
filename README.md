# thermal-label-cli

> Unified CLI for thermal label printers. Auto-detects every installed driver — Brother QL, DYMO LabelWriter, DYMO LabelManager, and any future driver built against `@thermal-label/contracts`.

[![npm version](https://img.shields.io/npm/v/thermal-label-cli.svg)](https://www.npmjs.com/package/thermal-label-cli)
[![CI](https://github.com/thermal-label/cli/actions/workflows/ci.yml/badge.svg)](https://github.com/thermal-label/cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## Install

```bash
# CLI plus the driver(s) for your printer:
npm install -g thermal-label-cli @thermal-label/brother-ql-node
```

| Printer family | Driver package |
|---|---|
| Brother QL | `@thermal-label/brother-ql-node` |
| DYMO LabelWriter | `@thermal-label/labelwriter-node` |
| DYMO LabelManager | `@thermal-label/labelmanager-node` |

## Quick example

```bash
thermal-label list                       # detect connected printers
thermal-label status                     # readiness + media + errors
thermal-label print text "Hello World"   # quick text print
thermal-label print image logo.png       # PNG / JPEG print
```

## Documentation

Full docs at **<https://thermal-label.github.io/cli/>**.

- Command + flag reference
- TCP / WebUSB usage
- thermal-label-cli vs burnmark-cli — when to use which

## Philosophy

Diagnostic-first: prove cabling, USB permissions, TCP connectivity; smoke-test
media detection and error reporting; script one-off prints in CI or systemd
units. For templates, barcodes, CSV batches, and sheet PDFs, see
[burnmark-cli](https://www.npmjs.com/package/burnmark-cli) — same drivers,
production-oriented workflow.

## Compatibility

| | |
|---|---|
| Runtime | Node ≥ 20.9 (Node 24 LTS recommended) |
| Drivers | Auto-detects any installed `@thermal-label/*-node` driver with a `discovery` export |
| License | MIT |

## Contributing

See [`CONTRIBUTING/`](https://github.com/thermal-label/.github/tree/main/CONTRIBUTING)
on the org `.github` repo.
