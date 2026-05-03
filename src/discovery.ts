import type { DiscoveredPrinter, PrinterDiscovery } from '@thermal-label/contracts';

export const KNOWN_DRIVERS = [
  '@thermal-label/brother-ql-node',
  '@thermal-label/labelwriter-node',
  '@thermal-label/labelmanager-node',
] as const;

export interface LoadedDriver {
  packageName: string;
  discovery: PrinterDiscovery;
}

export interface DriverStatus {
  packageName: string;
  installed: boolean;
  hasDiscoveryExport: boolean;
}

export type DynamicImporter = (specifier: string) => Promise<unknown>;

const defaultImporter: DynamicImporter = pkg => import(pkg);

function extractDiscovery(mod: unknown): PrinterDiscovery | undefined {
  if (mod === null || typeof mod !== 'object') return undefined;
  const named = (mod as { discovery?: unknown }).discovery;
  const fromDefault = (mod as { default?: { discovery?: unknown } }).default?.discovery;
  const candidate = named ?? fromDefault;
  if (candidate === null || typeof candidate !== 'object') return undefined;
  if (typeof (candidate as { listPrinters?: unknown }).listPrinters !== 'function') {
    return undefined;
  }
  return candidate as PrinterDiscovery;
}

export async function loadDrivers(
  packages: readonly string[] = KNOWN_DRIVERS,
  importer: DynamicImporter = defaultImporter,
): Promise<LoadedDriver[]> {
  const drivers: LoadedDriver[] = [];
  for (const pkg of packages) {
    try {
      const mod = await importer(pkg);
      const discovery = extractDiscovery(mod);
      if (discovery) {
        drivers.push({ packageName: pkg, discovery });
      }
    } catch {
      // Not installed, or failed to load — skip silently. This is
      // expected and correct: unknown packages on the KNOWN_DRIVERS list
      // are simply absent from the current install.
    }
  }
  return drivers;
}

export async function discoverAll(
  discoveries: readonly PrinterDiscovery[],
): Promise<DiscoveredPrinter[]> {
  const results = await Promise.allSettled(discoveries.map(d => d.listPrinters()));
  const combined: DiscoveredPrinter[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') combined.push(...r.value);
  }
  return combined;
}

export async function listDriverStatus(
  packages: readonly string[] = KNOWN_DRIVERS,
  importer: DynamicImporter = defaultImporter,
): Promise<DriverStatus[]> {
  const statuses: DriverStatus[] = [];
  for (const pkg of packages) {
    try {
      const mod = await importer(pkg);
      statuses.push({
        packageName: pkg,
        installed: true,
        hasDiscoveryExport: extractDiscovery(mod) !== undefined,
      });
    } catch {
      statuses.push({ packageName: pkg, installed: false, hasDiscoveryExport: false });
    }
  }
  return statuses;
}
