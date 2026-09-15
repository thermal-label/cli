import type {
  DiscoveredPrinter,
  MediaDescriptor,
  OpenOptions,
  PrinterAdapter,
} from '@thermal-label/contracts';
import { DeviceIdentificationRequiredError } from '@thermal-label/contracts';

import {
  discoverAll,
  KNOWN_DRIVERS,
  loadDrivers,
  type DynamicImporter,
  type LoadedDriver,
} from '../discovery.js';

export interface PrinterSelector {
  printer?: string;
  host?: string;
  port?: number;
  serial?: string;
  /** `--device`: registry key, forwarded as `OpenOptions.deviceKey`. */
  device?: string;
  /** `--media`: media id or name, resolved via `resolveMedia` after selection. */
  media?: string;
  /** `--community`: SNMP community, forwarded as `OpenOptions.snmpCommunity`. */
  community?: string;
  /**
   * The command as the user typed it, without selection flags
   * (`status`, `print text "hi"`). Used to render a copy-pasteable
   * invocation when a driver asks for `--device`.
   */
  invocation?: string;
}

export interface SelectionResult {
  driver: LoadedDriver;
  /** Already opened; the caller owns `close()`. */
  printer: PrinterAdapter;
  openOptions: OpenOptions;
}

export class SelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SelectionError';
  }
}

const NO_PRINTERS_HINT =
  'No printers found. Make sure your printer is connected via USB or accessible via TCP.';

interface Decline {
  family: string;
  error: unknown;
}

export async function selectPrinter(
  selector: PrinterSelector,
  importer?: DynamicImporter,
): Promise<SelectionResult> {
  const drivers = await loadDrivers(KNOWN_DRIVERS, importer);
  if (drivers.length === 0) {
    throw new SelectionError(
      "No driver packages installed. Install one, e.g. 'pnpm add @thermal-label/brother-ql-node', then try again.",
    );
  }

  const filtered =
    selector.printer === undefined
      ? drivers
      : drivers.filter(d => d.discovery.family === selector.printer);
  if (filtered.length === 0) {
    const available = drivers.map(d => d.discovery.family).join(', ');
    throw new SelectionError(
      `No installed driver for family '${selector.printer ?? ''}'. Installed families: ${available}.`,
    );
  }

  if (selector.host !== undefined) {
    return openByHost({ ...selector, host: selector.host }, filtered);
  }

  const discovered = await discoverAll(filtered.map(d => d.discovery));
  const matched =
    selector.serial === undefined
      ? discovered
      : discovered.filter(p => p.serialNumber === selector.serial);

  if (matched.length === 0) {
    throw new SelectionError(
      selector.serial === undefined
        ? NO_PRINTERS_HINT
        : `No printer found with serial number '${selector.serial}'.`,
    );
  }

  if (matched.length > 1) {
    throw new SelectionError(formatMultiple(matched));
  }

  const [picked] = matched;
  if (!picked) throw new SelectionError('Internal: no picked printer.');
  const driver = filtered.find(d => d.discovery.family === picked.device.family);
  if (!driver) {
    throw new SelectionError(
      `Internal: no driver for discovered family '${picked.device.family}'.`,
    );
  }

  const opts: OpenOptions = {};
  if (picked.serialNumber !== undefined) opts.serialNumber = picked.serialNumber;
  if (picked.host !== undefined) {
    // Network result: re-open by address with the key discovery already
    // resolved, so the driver does not identify a second time.
    opts.host = picked.host;
    if (picked.port !== undefined) opts.port = picked.port;
    opts.deviceKey = selector.device ?? picked.device.key;
  } else if (selector.device !== undefined) {
    opts.deviceKey = selector.device;
  }
  if (selector.community !== undefined) opts.snmpCommunity = selector.community;

  const outcome = await tryOpen(driver, opts);
  if (outcome.ok) return { driver, printer: outcome.printer, openOptions: opts };
  throw new SelectionError(formatDeclines([outcome.decline], selector, false));
}

async function openByHost(
  selector: PrinterSelector & { host: string },
  drivers: readonly LoadedDriver[],
): Promise<SelectionResult> {
  const opts: OpenOptions = { host: selector.host };
  if (selector.port !== undefined) opts.port = selector.port;
  if (selector.serial !== undefined) opts.serialNumber = selector.serial;
  if (selector.device !== undefined) opts.deviceKey = selector.device;
  if (selector.community !== undefined) opts.snmpCommunity = selector.community;

  // Sequential on purpose: at most one driver holds a 9100 socket, and a
  // driver that throws before connecting never opens one. Every failure,
  // typed or not, is a decline; the walk only fails when all drivers do.
  const declines: Decline[] = [];
  for (const driver of drivers) {
    const outcome = await tryOpen(driver, opts);
    if (outcome.ok) return { driver, printer: outcome.printer, openOptions: opts };
    declines.push(outcome.decline);
  }
  throw new SelectionError(formatDeclines(declines, selector, selector.printer === undefined));
}

type OpenOutcome = { ok: true; printer: PrinterAdapter } | { ok: false; decline: Decline };

async function tryOpen(driver: LoadedDriver, opts: OpenOptions): Promise<OpenOutcome> {
  const family = driver.discovery.family;
  try {
    // `await` inside the try so a synchronous throw and a rejection land
    // in the same catch.
    const printer = await driver.discovery.openPrinter(opts);
    return { ok: true, printer };
  } catch (error: unknown) {
    return { ok: false, decline: { family, error } };
  }
}

/**
 * Resolve `--media` against the driver's catalog by exact id or exact
 * name (case-insensitive).
 */
export function resolveMedia(driver: LoadedDriver, media: string): MediaDescriptor {
  const family = driver.discovery.family;
  const catalog = driver.discovery.listMedia?.();
  if (catalog === undefined) {
    throw new SelectionError(
      `Driver ${family} does not expose a media catalog; --media is not available for it.`,
    );
  }
  const wanted = media.toLowerCase();
  const found = catalog.find(m => String(m.id) === media || m.name.toLowerCase() === wanted);
  if (found === undefined) {
    const ids = catalog.map(m => `${String(m.id)}  ${m.name}`);
    throw new SelectionError(
      [
        `Unknown media '${media}' for ${family}. Known media (id  name):`,
        ...ids.map(l => `  ${l}`),
      ].join('\n'),
    );
  }
  return found;
}

function formatMultiple(printers: readonly DiscoveredPrinter[]): string {
  const lines = ['Multiple printers found:'];
  for (const p of printers) {
    const serial = p.serialNumber === undefined ? '' : `  serial=${p.serialNumber}`;
    lines.push(
      `  ${p.device.family}  ${p.device.name}  ${p.transport}  ${p.connectionId}${serial}`,
    );
  }
  lines.push('', 'Use --printer <family> or --serial <sn> to pick one.');
  return lines.join('\n');
}

function formatDeclines(
  declines: readonly Decline[],
  selector: PrinterSelector,
  walked: boolean,
): string {
  const lines = [
    walked
      ? `No installed driver could open ${selector.host ?? ''}:`
      : `Failed to open printer${selector.host === undefined ? '' : ` at ${selector.host}`}:`,
  ];
  for (const { family, error } of declines) {
    lines.push(`  ${family}: ${errorMessage(error)}`);
    if (error instanceof DeviceIdentificationRequiredError) {
      lines.push(...formatIdentificationHint(family, error, selector));
    }
  }
  if (walked) {
    lines.push(
      '',
      "Pass --printer <family> to see one driver's error, or --device <key> to name the model.",
    );
  }
  return lines.join('\n');
}

function formatIdentificationHint(
  family: string,
  error: DeviceIdentificationRequiredError,
  selector: PrinterSelector,
): string[] {
  const lines: string[] = [];
  const keyWidth = Math.max(...error.candidates.map(c => c.key.length));
  lines.push('    candidates (key  name):');
  for (const c of error.candidates) {
    lines.push(`      ${c.key.padEnd(keyWidth)}  ${c.name}`);
  }
  const [first] = error.candidates;
  if (first === undefined) return lines;

  const parts = ['thermal-label', selector.invocation ?? '<command>'];
  if (selector.host !== undefined) parts.push(`--host ${selector.host}`);
  if (selector.port !== undefined) parts.push(`--port ${selector.port.toString()}`);
  parts.push(`--printer ${family}`, `--device ${first.key}`);
  if (STATUS_UNAVAILABLE.test(error.message)) parts.push('--media <id>');
  lines.push(`    copy, swapping the key for your model:`, `      ${parts.join(' ')}`);
  return lines;
}

/** Driver messages that say status cannot be read either (no SNMP answer). */
const STATUS_UNAVAILABLE = /no SNMP answer|status is unavailable/i;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
