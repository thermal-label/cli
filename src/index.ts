import { Command } from 'commander';

import { listCommand, type ListCommandOptions } from './commands/list.js';
import {
  printImageCommand,
  type PrintImageCommandOptions,
} from './commands/print-image.js';
import { printTextCommand, type PrintTextCommandOptions } from './commands/print-text.js';
import { statusCommand, type StatusCommandOptions } from './commands/status.js';

const VERSION = '0.1.0';

function parseIntArg(value: string): number {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) {
    throw new Error(`Expected an integer, got '${value}'.`);
  }
  return n;
}

function parseRotateArg(value: string): 0 | 90 | 180 | 270 {
  const n = parseIntArg(value);
  if (n !== 0 && n !== 90 && n !== 180 && n !== 270) {
    throw new Error(`--rotate must be 0, 90, 180, or 270, got ${value}.`);
  }
  return n;
}

interface CommanderStatusOpts {
  printer?: string;
  host?: string;
  port?: number;
  serial?: string;
}

interface CommanderPrintTextOpts extends CommanderStatusOpts {
  invert?: boolean;
  scaleX?: number;
  scaleY?: number;
  density?: string;
  copies?: number;
}

interface CommanderPrintImageOpts extends CommanderStatusOpts {
  threshold?: number;
  dither?: boolean;
  invert?: boolean;
  rotate?: 0 | 90 | 180 | 270;
  density?: string;
  copies?: number;
}

function buildStatusOptions(opts: CommanderStatusOpts): StatusCommandOptions {
  const out: StatusCommandOptions = {};
  if (opts.printer !== undefined) out.printer = opts.printer;
  if (opts.host !== undefined) out.host = opts.host;
  if (opts.port !== undefined) out.port = opts.port;
  if (opts.serial !== undefined) out.serial = opts.serial;
  return out;
}

function buildPrintTextOptions(opts: CommanderPrintTextOpts): PrintTextCommandOptions {
  const out: PrintTextCommandOptions = buildStatusOptions(opts);
  if (opts.invert !== undefined) out.invert = opts.invert;
  if (opts.scaleX !== undefined) out.scaleX = opts.scaleX;
  if (opts.scaleY !== undefined) out.scaleY = opts.scaleY;
  if (opts.density !== undefined) out.density = opts.density;
  if (opts.copies !== undefined) out.copies = opts.copies;
  return out;
}

function buildPrintImageOptions(opts: CommanderPrintImageOpts): PrintImageCommandOptions {
  const out: PrintImageCommandOptions = buildStatusOptions(opts);
  if (opts.threshold !== undefined) out.threshold = opts.threshold;
  if (opts.dither !== undefined) out.dither = opts.dither;
  if (opts.invert !== undefined) out.invert = opts.invert;
  if (opts.rotate !== undefined) out.rotate = opts.rotate;
  if (opts.density !== undefined) out.density = opts.density;
  if (opts.copies !== undefined) out.copies = opts.copies;
  return out;
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('thermal-label')
    .description('Unified CLI for thermal label printers — auto-detects all installed drivers.')
    .version(VERSION);

  program
    .command('list')
    .description('List connected printers or installed driver packages.')
    .option('--drivers', 'Show installed driver packages and their status')
    .action(async (opts: { drivers?: boolean }) => {
      const cmdOpts: ListCommandOptions = {};
      if (opts.drivers !== undefined) cmdOpts.drivers = opts.drivers;
      await listCommand(cmdOpts);
    });

  program
    .command('status')
    .description('Query the status of a connected printer.')
    .option('--printer <family>', 'Filter by driver family (brother-ql, labelwriter, labelmanager)')
    .option('--host <ip>', 'Connect via TCP to the given host')
    .option('--port <port>', 'TCP port (default 9100)', parseIntArg)
    .option('--serial <sn>', 'Filter by serial number')
    .action(async (opts: CommanderStatusOpts) => {
      await statusCommand(buildStatusOptions(opts));
    });

  const print = program.command('print').description('Print labels.');

  print
    .command('text <text>')
    .description('Render text to a label and print.')
    .option('--printer <family>', 'Filter by driver family')
    .option('--host <ip>', 'Connect via TCP to the given host')
    .option('--port <port>', 'TCP port (default 9100)', parseIntArg)
    .option('--serial <sn>', 'Filter by serial number')
    .option('--invert', 'White text on black background')
    .option('--scale-x <n>', 'Horizontal scale factor', parseIntArg)
    .option('--scale-y <n>', 'Vertical scale factor', parseIntArg)
    .option('--density <d>', 'Driver-specific density (light, normal, dark)')
    .option('--copies <n>', 'Number of copies', parseIntArg)
    .action(async (text: string, opts: CommanderPrintTextOpts) => {
      await printTextCommand(text, buildPrintTextOptions(opts));
    });

  print
    .command('image <file>')
    .description('Load an image file and print.')
    .option('--printer <family>', 'Filter by driver family')
    .option('--host <ip>', 'Connect via TCP to the given host')
    .option('--port <port>', 'TCP port (default 9100)', parseIntArg)
    .option('--serial <sn>', 'Filter by serial number')
    .option('--threshold <n>', '1bpp threshold (0-255)', parseIntArg)
    .option('--dither', 'Floyd-Steinberg dithering')
    .option('--invert', 'Invert colours')
    .option('--rotate <deg>', 'Rotation in degrees (0, 90, 180, 270)', parseRotateArg)
    .option('--density <d>', 'Driver-specific density (light, normal, dark)')
    .option('--copies <n>', 'Number of copies', parseIntArg)
    .action(async (file: string, opts: CommanderPrintImageOpts) => {
      await printImageCommand(file, buildPrintImageOptions(opts));
    });

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}
