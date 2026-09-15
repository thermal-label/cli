import { describe, expect, it } from 'vitest';

import type {
  DiscoveredPrinter,
  MediaDescriptor,
  OpenOptions,
  PrinterAdapter,
  PrinterDiscovery,
} from '@thermal-label/contracts';

import type { LoadedDriver } from '../discovery.js';
import { resolveMedia, SelectionError } from '../commands/select.js';

function adapter(family: string, model: string): PrinterAdapter {
  return {
    family,
    model,
    connected: true,
    getStatus: () => Promise.reject(new Error('not used')),
    print: () => Promise.resolve(),
    createPreview: () => Promise.reject(new Error('not used')),
    close: () => Promise.resolve(),
  };
}

interface FakeDriver {
  discovery: PrinterDiscovery;
  openCalls: OpenOptions[];
}

/** A driver whose `openPrinter` behaves per `open`; `listPrinters` returns `found`. */
function fakeDriver(
  family: string,
  open: (opts: OpenOptions) => Promise<PrinterAdapter> | PrinterAdapter,
  found: DiscoveredPrinter[] = [],
  listMedia?: () => readonly MediaDescriptor[],
): FakeDriver {
  const openCalls: OpenOptions[] = [];
  const discovery: PrinterDiscovery = {
    family,
    listPrinters: () => Promise.resolve(found),
    openPrinter: (opts?: OpenOptions) => {
      openCalls.push(opts ?? {});
      // Deliberately not async: a synchronous throw must be caught too.
      return Promise.resolve(open(opts ?? {}));
    },
  };
  if (listMedia) discovery.listMedia = listMedia;
  return { discovery, openCalls };
}

describe('resolveMedia', () => {
  const catalog: MediaDescriptor[] = [
    { id: 259, name: '62mm continuous', widthMm: 62, type: 'continuous' },
    { id: 271, name: '29×90mm die-cut (DK-11201)', widthMm: 29, heightMm: 90, type: 'die-cut' },
  ];
  const driver: LoadedDriver = {
    packageName: '@thermal-label/brother-ql-node',
    discovery: fakeDriver(
      'brother-ql',
      () => adapter('brother-ql', 'x'),
      [],
      () => catalog,
    ).discovery,
  };

  it('matches by exact id', () => {
    expect(resolveMedia(driver, '271').id).toBe(271);
  });

  it('matches by name, case-insensitively', () => {
    expect(resolveMedia(driver, '62MM CONTINUOUS').id).toBe(259);
  });

  it('lists the catalog on an unknown id', () => {
    expect(() => resolveMedia(driver, '999')).toThrow(SelectionError);
    expect(() => resolveMedia(driver, '999')).toThrow(
      /Unknown media '999'.*\n\s+259\s+62mm continuous/s,
    );
  });

  it('errors when the driver exposes no catalog', () => {
    const bare: LoadedDriver = {
      packageName: '@thermal-label/labelwriter-node',
      discovery: fakeDriver('labelwriter', () => adapter('labelwriter', 'x')).discovery,
    };
    expect(() => resolveMedia(bare, '259')).toThrow(
      'Driver labelwriter does not expose a media catalog',
    );
  });
});
