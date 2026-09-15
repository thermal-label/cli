import chalk from 'chalk';

import { MediaNotSpecifiedError } from '@thermal-label/contracts';

import type {
  MediaDescriptor,
  PrinterAdapter,
  PrintOptions,
  RawImageData,
} from '@thermal-label/contracts';

import type { LoadedDriver } from '../discovery.js';

import { errorMessage, resolveMedia, SelectionError } from './select.js';

export type OutFn = (line: string) => void;

export interface PrintRunOptions {
  density?: string;
  copies?: number;
  /** `--media`: overrides detected media; also lets a failed status query through. */
  media?: string;
}

/**
 * The part of `print text` / `print image` after the label is rendered
 * and the printer is open: media resolution, the status pre-check, the
 * copies loop, and closing the printer.
 */
export async function runPrint(
  out: OutFn,
  driver: LoadedDriver,
  printer: PrinterAdapter,
  image: RawImageData,
  options: PrintRunOptions,
): Promise<void> {
  try {
    let media: MediaDescriptor | undefined;
    if (options.media !== undefined) media = resolveMedia(driver, options.media);

    // The status query warms the driver's media cache so print() can
    // default to detected media, and surfaces error rows. Without
    // --media a failure here means the job cannot be sized, so stop.
    // With --media the job still goes out, but blind: the channel a
    // driver would confirm the print on (SNMP) is the one that failed.
    const printOpts: PrintOptions = {};
    try {
      const status = await printer.getStatus();
      for (const e of status.errors) {
        out(chalk.yellow(`Warning: printer reports [${e.code}] ${e.message}`));
      }
      for (const d of status.details ?? []) {
        if (d.severity === 'warn' || d.severity === 'error') {
          out(chalk.yellow(`Warning: ${d.label}: ${d.value}`));
        }
      }
    } catch (err) {
      const message = errorMessage(err);
      if (media === undefined) {
        out(chalk.red(`Status query failed: ${message}`));
        out(chalk.red('Pass --media <id> to print without media detection.'));
        process.exitCode = 1;
        return;
      }
      out(
        chalk.yellow(
          `Warning: status query failed (${message}); printing with --media, without print confirmation.`,
        ),
      );
      printOpts.confirm = false;
    }

    const copies = options.copies ?? 1;
    if (options.density !== undefined) printOpts.density = options.density;
    for (let i = 0; i < copies; i++) {
      await printer.print(image, media, printOpts);
    }
    out(chalk.green(`Printed ${copies.toString()} label${copies === 1 ? '' : 's'}.`));
  } catch (err) {
    if (err instanceof SelectionError) {
      out(chalk.red(err.message));
      process.exitCode = 1;
      return;
    }
    if (err instanceof MediaNotSpecifiedError) {
      out(
        chalk.red(
          'No media is loaded or detected. Load media, pass --media <id>, or use a driver with media auto-detection (e.g. Brother QL).',
        ),
      );
      process.exitCode = 1;
      return;
    }
    out(chalk.red(`Print failed: ${errorMessage(err)}`));
    process.exitCode = 1;
  } finally {
    await printer.close();
  }
}
