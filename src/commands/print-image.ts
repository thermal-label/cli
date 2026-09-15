import chalk from 'chalk';

import type { DynamicImporter } from '../discovery.js';
import { renderImageLabel, type ImageOptions, type ReadFileFn } from '../render.js';

import { runPrint, type OutFn } from './print.js';
import { selectPrinter, SelectionError, type PrinterSelector } from './select.js';

export type { OutFn } from './print.js';

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

  // Load before opening so a bad file never touches the printer.
  let image;
  try {
    image = await renderImageLabel(path, options, options.readFileFn);
  } catch (err) {
    out(chalk.red(`Failed to load image: ${err instanceof Error ? err.message : String(err)}`));
    process.exitCode = 1;
    return;
  }

  let selection;
  try {
    selection = await selectPrinter(
      { invocation: `print image ${path}`, ...options },
      options.importer,
    );
  } catch (err) {
    if (err instanceof SelectionError) {
      out(chalk.red(err.message));
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  await runPrint(out, selection.driver, selection.printer, image, options);
}

function defaultOut(line: string): void {
  process.stdout.write(`${line}\n`);
}
