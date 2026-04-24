import chalk from 'chalk';

import { MediaNotSpecifiedError } from '@thermal-label/contracts';

import type { PrintOptions } from '@thermal-label/contracts';

import type { DynamicImporter } from '../discovery.js';
import { renderImageLabel, type ImageOptions, type ReadFileFn } from '../render.js';

import { selectPrinter, SelectionError, type PrinterSelector } from './select.js';

export type OutFn = (line: string) => void;

export interface PrintImageCommandOptions extends PrinterSelector, ImageOptions {
  density?: string;
  copies?: number;
  importer?: DynamicImporter;
  readFileFn?: ReadFileFn;
  out?: OutFn;
}

export async function printImageCommand(
  path: string,
  options: PrintImageCommandOptions = {},
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

  let image;
  try {
    image = await renderImageLabel(path, options, options.readFileFn);
  } catch (err) {
    out(chalk.red(`Failed to load image: ${err instanceof Error ? err.message : String(err)}`));
    process.exitCode = 1;
    return;
  }

  let printer;
  try {
    printer = await selection.driver.discovery.openPrinter(selection.openOptions);
  } catch (err) {
    out(chalk.red(`Failed to open printer: ${err instanceof Error ? err.message : String(err)}`));
    process.exitCode = 1;
    return;
  }

  try {
    try {
      await printer.getStatus();
    } catch {
      // Ignore — see print-text.ts for rationale.
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
