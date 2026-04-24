import chalk from 'chalk';

import type { MediaDescriptor, PrinterAdapter, PrinterStatus } from '@thermal-label/contracts';

import type { DynamicImporter } from '../discovery.js';

import { selectPrinter, SelectionError, type PrinterSelector } from './select.js';

export type OutFn = (line: string) => void;

export interface StatusCommandOptions extends PrinterSelector {
  importer?: DynamicImporter;
  out?: OutFn;
}

export async function statusCommand(options: StatusCommandOptions = {}): Promise<void> {
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

  let printer: PrinterAdapter;
  try {
    printer = await selection.driver.discovery.openPrinter(selection.openOptions);
  } catch (err) {
    out(chalk.red(`Failed to open printer: ${err instanceof Error ? err.message : String(err)}`));
    process.exitCode = 1;
    return;
  }

  try {
    const status = await printer.getStatus();
    printStatus(out, printer, status, options.host, options.port);
  } finally {
    await printer.close();
  }
}

function printStatus(
  out: OutFn,
  printer: PrinterAdapter,
  status: PrinterStatus,
  host?: string,
  port?: number,
): void {
  out(`${chalk.bold('Printer:')}   ${printer.model} (${printer.family})`);
  out(`${chalk.bold('Status:')}    ${status.ready ? chalk.green('Ready') : chalk.yellow('Not ready')}`);
  out(`${chalk.bold('Media:')}     ${formatMedia(status.mediaLoaded, status.detectedMedia)}`);
  if (status.errors.length === 0) {
    out(`${chalk.bold('Errors:')}    none`);
  } else {
    out(chalk.bold('Errors:'));
    for (const e of status.errors) {
      out(`  - [${e.code}] ${e.message}`);
    }
  }
  if (host !== undefined) {
    out(`${chalk.bold('Transport:')} TCP ${host}:${(port ?? 9100).toString()}`);
  }
}

function formatMedia(mediaLoaded: boolean, media?: MediaDescriptor): string {
  if (!media) {
    return mediaLoaded ? 'loaded (details not detected)' : 'not detected';
  }
  const parts: string[] = [media.name];
  const details: string[] = [`${media.widthMm.toString()}mm`, media.type];
  if (media.heightMm !== undefined) details.push(`${media.heightMm.toString()}mm`);
  if (media.colorCapable) details.push('two-colour');
  parts.push(`(${details.join(', ')})`);
  return parts.join(' ');
}

function defaultOut(line: string): void {
  process.stdout.write(`${line}\n`);
}
