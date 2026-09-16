import chalk from 'chalk';

import type { DynamicImporter } from '../discovery.js';
import { renderTextLabel, type TextOptions } from '../render.js';

import { runPrint, type OutFn } from './print.js';
import { selectPrinter, SelectionError, type PrinterSelector } from './select.js';

export type { OutFn } from './print.js';

export interface PrintTextCommandOptions extends PrinterSelector, TextOptions {
  density?: string;
  copies?: number;
  /** `--no-confirm`: skip the driver's out-of-band print confirmation. */
  confirm?: false;
  importer?: DynamicImporter;
  out?: OutFn;
}

export async function printTextCommand(
  text: string,
  options: PrintTextCommandOptions = {},
): Promise<void> {
  const out = options.out ?? defaultOut;

  // Render before opening so a bad label never touches the printer.
  const image = renderTextLabel(text, options);

  let selection;
  try {
    selection = await selectPrinter(
      { invocation: `print text ${JSON.stringify(text)}`, ...options },
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
