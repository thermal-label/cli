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

    // Warm the adapter's media cache so print() can default to detected media.
    try {
      await printer.getStatus();
    } catch {
      // Ignore — with --media the job is sized anyway; without it the
      // driver raises MediaNotSpecifiedError below.
    }

    const copies = options.copies ?? 1;
    const printOpts: PrintOptions = {};
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
