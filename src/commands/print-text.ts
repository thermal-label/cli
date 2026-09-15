import chalk from 'chalk';

import type { DynamicImporter } from '../discovery.js';
import { renderTextLabel, type TextOptions } from '../render.js';

import { runPrint, type OutFn } from './print.js';
import { errorMessage, selectPrinter, SelectionError, type PrinterSelector } from './select.js';

export type { OutFn } from './print.js';

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
    out(chalk.red(`Failed to open printer: ${errorMessage(err)}`));
    process.exitCode = 1;
    return;
  }

  await runPrint(out, selection.driver, printer, image, options);
}

function defaultOut(line: string): void {
  process.stdout.write(`${line}\n`);
}
