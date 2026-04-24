import { describe, expect, it, vi } from 'vitest';

import type { DiscoveredPrinter, PrinterDiscovery } from '@thermal-label/contracts';

import { KNOWN_DRIVERS, listDriverStatus, loadDrivers } from '../discovery.js';

function makeDiscovery(family: string): PrinterDiscovery {
  return {
    family,
    listPrinters: (): Promise<DiscoveredPrinter[]> => Promise.resolve([]),
    openPrinter: () => Promise.reject(new Error('not used')),
  };
}

describe('loadDrivers', () => {
  it('returns empty array when no packages are given', async () => {
    const drivers = await loadDrivers([]);
    expect(drivers).toEqual([]);
  });

  it('returns empty array when all imports fail', async () => {
    const importer = vi.fn(() => Promise.reject(new Error('MODULE_NOT_FOUND')));
    const drivers = await loadDrivers(['fake-pkg-a', 'fake-pkg-b'], importer);
    expect(drivers).toEqual([]);
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it('returns a driver when the module has a named discovery export', async () => {
    const discovery = makeDiscovery('brother-ql');
    const importer = vi.fn(() => Promise.resolve({ discovery }));
    const drivers = await loadDrivers(['fake-pkg'], importer);
    expect(drivers).toEqual([{ packageName: 'fake-pkg', discovery }]);
  });

  it('falls back to default.discovery when no named export exists', async () => {
    const discovery = makeDiscovery('labelwriter');
    const importer = vi.fn(() => Promise.resolve({ default: { discovery } }));
    const drivers = await loadDrivers(['fake-pkg'], importer);
    expect(drivers).toEqual([{ packageName: 'fake-pkg', discovery }]);
  });

  it('prefers the named export over default.discovery', async () => {
    const named = makeDiscovery('brother-ql');
    const def = makeDiscovery('labelwriter');
    const importer = vi.fn(() =>
      Promise.resolve({ discovery: named, default: { discovery: def } }),
    );
    const drivers = await loadDrivers(['fake-pkg'], importer);
    expect(drivers[0]?.discovery).toBe(named);
  });

  it('skips a module with no discovery export', async () => {
    const importer = vi.fn(() => Promise.resolve({ somethingElse: true }));
    const drivers = await loadDrivers(['fake-pkg'], importer);
    expect(drivers).toEqual([]);
  });

  it('skips a discovery export that lacks listPrinters', async () => {
    const importer = vi.fn(() => Promise.resolve({ discovery: { family: 'broken' } }));
    const drivers = await loadDrivers(['fake-pkg'], importer);
    expect(drivers).toEqual([]);
  });

  it('skips a discovery export that is not an object', async () => {
    const importer = vi.fn(() => Promise.resolve({ discovery: 'not-an-object' }));
    const drivers = await loadDrivers(['fake-pkg'], importer);
    expect(drivers).toEqual([]);
  });

  it('skips a module that is not an object', async () => {
    const importer = vi.fn(() => Promise.resolve(null));
    const drivers = await loadDrivers(['fake-pkg'], importer);
    expect(drivers).toEqual([]);
  });

  it('mixes installed and missing drivers correctly', async () => {
    const discovery = makeDiscovery('brother-ql');
    const importer = vi.fn((pkg: string) =>
      pkg === 'pkg-a' ? Promise.resolve({ discovery }) : Promise.reject(new Error('not found')),
    );
    const drivers = await loadDrivers(['pkg-a', 'pkg-b', 'pkg-c'], importer);
    expect(drivers).toEqual([{ packageName: 'pkg-a', discovery }]);
  });
});

describe('listDriverStatus', () => {
  it('reports installed-without-discovery vs installed-with-discovery vs missing', async () => {
    const discovery = makeDiscovery('labelmanager');
    const importer = vi.fn((pkg: string) => {
      if (pkg === 'with-discovery') return Promise.resolve({ discovery });
      if (pkg === 'without-discovery') return Promise.resolve({});
      return Promise.reject(new Error('missing'));
    });
    const statuses = await listDriverStatus(
      ['with-discovery', 'without-discovery', 'missing'],
      importer,
    );
    expect(statuses).toEqual([
      { packageName: 'with-discovery', installed: true, hasDiscoveryExport: true },
      { packageName: 'without-discovery', installed: true, hasDiscoveryExport: false },
      { packageName: 'missing', installed: false, hasDiscoveryExport: false },
    ]);
  });
});

describe('KNOWN_DRIVERS', () => {
  it('lists the three retrofit-target packages', () => {
    expect(KNOWN_DRIVERS).toEqual([
      '@thermal-label/brother-ql-node',
      '@thermal-label/labelwriter-node',
      '@thermal-label/labelmanager-node',
    ]);
  });
});
