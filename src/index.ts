import { Command } from 'commander';

import { listCommand, type ListCommandOptions } from './commands/list.js';
import { printImageCommand, type PrintImageCommandOptions } from './commands/print-image.js';
import { printTextCommand, type PrintTextCommandOptions } from './commands/print-text.js';
import { statusCommand, type StatusCommandOptions } from './commands/status.js';

const VERSION = '0.6.0';

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
  device?: string;
  media?: string;
  community?: string;
}

interface CommanderPrintTextOpts extends CommanderStatusOpts {
  invert?: boolean;
  scaleX?: number;
  scaleY?: number;
  density?: string;
  copies?: number;
  /** commander negatable `--no-confirm`: `true` unless the flag is given. */
  confirm?: boolean;
}

interface CommanderPrintImageOpts extends CommanderStatusOpts {
  threshold?: number;
  dither?: boolean;
  invert?: boolean;
  rotate?: 0 | 90 | 180 | 270;
  density?: string;
  copies?: number;
  confirm?: boolean;
}

function buildStatusOptions(opts: CommanderStatusOpts): StatusCommandOptions {
  const out: StatusCommandOptions = {};
  if (opts.printer !== undefined) out.printer = opts.printer;
  if (opts.host !== undefined) out.host = opts.host;
  if (opts.port !== undefined) out.port = opts.port;
  if (opts.serial !== undefined) out.serial = opts.serial;
  if (opts.device !== undefined) out.device = opts.device;
  if (opts.media !== undefined) out.media = opts.media;
  if (opts.community !== undefined) out.community = opts.community;
  return out;
}

function buildPrintTextOptions(opts: CommanderPrintTextOpts): PrintTextCommandOptions {
  const out: PrintTextCommandOptions = buildStatusOptions(opts);
  if (opts.invert !== undefined) out.invert = opts.invert;
  if (opts.scaleX !== undefined) out.scaleX = opts.scaleX;
  if (opts.scaleY !== undefined) out.scaleY = opts.scaleY;
  if (opts.density !== undefined) out.density = opts.density;
  if (opts.copies !== undefined) out.copies = opts.copies;
  if (opts.confirm === false) out.confirm = false;
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
  if (opts.confirm === false) out.confirm = false;
  return out;
}

/** Selection flags shared by `status`, `print text` and `print image`. */
function withSelectionFlags(cmd: Command): Command {
  return cmd
    .option('--printer <family>', 'Filter by driver family (brother-ql, labelwriter, labelmanager)')
    .option('--host <ip>', 'Connect via TCP to the given host')
    .option('--port <port>', 'TCP port (default 9100)', parseIntArg)
    .option('--serial <sn>', 'Filter by serial number')
    .option(
      '--device <key>',
      'Registry key of the model (e.g. QL_820NWBc) when the driver cannot identify it',
    )
    .option('--media <id>', "Media id or name from the driver's catalog; overrides detected media")
    .option('--community <name>', 'SNMP community for network printers (default public)');
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

  withSelectionFlags(
    program.command('status').description('Query the status of a connected printer.'),
  ).action(async (opts: CommanderStatusOpts) => {
    await statusCommand(buildStatusOptions(opts));
  });

  const print = program.command('print').description('Print labels.');

  withSelectionFlags(print.command('text <text>').description('Render text to a label and print.'))
    .option('--invert', 'White text on black background')
    .option('--scale-x <n>', 'Horizontal scale factor', parseIntArg)
    .option('--scale-y <n>', 'Vertical scale factor', parseIntArg)
    .option('--density <d>', 'Driver-specific density (light, normal, dark)')
    .option('--copies <n>', 'Number of copies', parseIntArg)
    .option(
      '--no-confirm',
      'Send without out-of-band print confirmation (network printers whose SNMP page counter cannot be read)',
    )
    .action(async (text: string, opts: CommanderPrintTextOpts) => {
      await printTextCommand(text, buildPrintTextOptions(opts));
    });

  withSelectionFlags(print.command('image <file>').description('Load an image file and print.'))
    .option('--threshold <n>', '1bpp threshold (0-255)', parseIntArg)
    .option('--dither', 'Floyd-Steinberg dithering')
    .option('--invert', 'Invert colours')
    .option('--rotate <deg>', 'Rotation in degrees (0, 90, 180, 270)', parseRotateArg)
    .option('--density <d>', 'Driver-specific density (light, normal, dark)')
    .option('--copies <n>', 'Number of copies', parseIntArg)
    .option(
      '--no-confirm',
      'Send without out-of-band print confirmation (network printers whose SNMP page counter cannot be read)',
    )
    .action(async (file: string, opts: CommanderPrintImageOpts) => {
      await printImageCommand(file, buildPrintImageOptions(opts));
    });

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}
