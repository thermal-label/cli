import type { DiscoveredPrinter, MediaDescriptor, OpenOptions } from '@thermal-label/contracts';

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
}

export interface SelectionResult {
  driver: LoadedDriver;
  openOptions: OpenOptions;
}

export class SelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SelectionError';
  }
}

export async function selectPrinter(
  selector: PrinterSelector,
  importer?: DynamicImporter,
): Promise<SelectionResult> {
  if (selector.host !== undefined && selector.printer === undefined) {
    throw new SelectionError(
      'Specify --printer <family> when using --host; the CLI cannot infer which driver speaks to an arbitrary IP.',
    );
  }

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
    const opts: OpenOptions = { host: selector.host };
    if (selector.port !== undefined) opts.port = selector.port;
    if (selector.serial !== undefined) opts.serialNumber = selector.serial;
    if (selector.device !== undefined) opts.deviceKey = selector.device;
    if (selector.community !== undefined) opts.snmpCommunity = selector.community;
    const [driver] = filtered;
    if (!driver) throw new SelectionError('Internal: no driver after filter.');
    return { driver, openOptions: opts };
  }

  const discovered = await discoverAll(filtered.map(d => d.discovery));
  const matched =
    selector.serial === undefined
      ? discovered
      : discovered.filter(p => p.serialNumber === selector.serial);

  if (matched.length === 0) {
    throw new SelectionError(
      selector.serial === undefined
        ? 'No printers found. Make sure your printer is connected via USB or accessible via TCP.'
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
  if (selector.device !== undefined) opts.deviceKey = selector.device;
  if (selector.community !== undefined) opts.snmpCommunity = selector.community;
  return { driver, openOptions: opts };
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

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
