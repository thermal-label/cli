import chalk from 'chalk';

import { MediaNotSpecifiedError } from '@thermal-label/contracts';

import type { PrintOptions } from '@thermal-label/contracts';

import type { DynamicImporter } from '../discovery.js';
import { renderTextLabel, type TextOptions } from '../render.js';

import { selectPrinter, SelectionError, type PrinterSelector } from './select.js';

export type OutFn = (line: string) => void;

export interface PrintTextCommandOptions extends PrinterSelector, TextOptions {
  density?: string;
  copies?: number;
  importer?: DynamicImporter;
  out?: OutFn;
}

export async function printTextCommand(
  text: string,
  options: PrintTextCommandOptions = {},
): Promise<void> {
  const out = options.out ?? defaultOut;

  let selection;
  try {
    selection = await selectPrinter(options, options.importer);
  } catch (err) {
    if (err instanceof SelectionError) {
      out(chalk.red(err.message));
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const image = renderTextLabel(text, options);

  let printer;
  try {
    printer = await selection.driver.discovery.openPrinter(selection.openOptions);
  } catch (err) {
    out(chalk.red(`Failed to open printer: ${err instanceof Error ? err.message : String(err)}`));
    process.exitCode = 1;
    return;
  }

  try {
    // Warm the adapter's media cache so print() can default to detected media.
    try {
      await printer.getStatus();
    } catch {
      // Ignore — drivers without media detection will still print if the
      // user passes media via a higher-level flag (currently none). If no
      // media is specified, we surface MediaNotSpecifiedError below.
    }

    const copies = options.copies ?? 1;
    const printOpts: PrintOptions = {};
    if (options.density !== undefined) printOpts.density = options.density;
    for (let i = 0; i < copies; i++) {
      await printer.print(image, undefined, printOpts);
    }
    out(chalk.green(`Printed ${copies.toString()} label${copies === 1 ? '' : 's'}.`));
  } catch (err) {
    if (err instanceof MediaNotSpecifiedError) {
      out(
        chalk.red(
          'No media is loaded or detected. Load media or use a driver with media auto-detection (e.g. Brother QL).',
        ),
      );
      process.exitCode = 1;
      return;
    }
    out(chalk.red(`Print failed: ${err instanceof Error ? err.message : String(err)}`));
    process.exitCode = 1;
  } finally {
    await printer.close();
  }
}

function defaultOut(line: string): void {
  process.stdout.write(`${line}\n`);
}
