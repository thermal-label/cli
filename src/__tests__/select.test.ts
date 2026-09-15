import { describe, expect, it } from 'vitest';

import type {
  DeviceEntry,
  DiscoveredPrinter,
  MediaDescriptor,
  OpenOptions,
  PrinterAdapter,
  PrinterDiscovery,
} from '@thermal-label/contracts';
import { DeviceIdentificationRequiredError } from '@thermal-label/contracts';

import type { DynamicImporter, LoadedDriver } from '../discovery.js';
import { resolveMedia, selectPrinter, SelectionError } from '../commands/select.js';

function device(key: string, name: string, family: string): DeviceEntry {
  return { key, name, family, transports: {}, engines: [], support: { status: 'untested' } };
}

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

/** Like `fakeDriver` but `openPrinter` throws synchronously. */
function throwingDriver(family: string, error: unknown): FakeDriver {
  const openCalls: OpenOptions[] = [];
  return {
    openCalls,
    discovery: {
      family,
      listPrinters: () => Promise.resolve([]),
      openPrinter: (opts?: OpenOptions) => {
        openCalls.push(opts ?? {});
        throw error;
      },
    },
  };
}

function importerFor(drivers: Record<string, FakeDriver>): DynamicImporter {
  return (pkg: string) => {
    const short = pkg.replace('@thermal-label/', '').replace('-node', '');
    const d = drivers[short];
    return d ? Promise.resolve({ discovery: d.discovery }) : Promise.reject(new Error('missing'));
  };
}

const QL = device('QL_820NWBc', 'QL-820NWBc', 'brother-ql');
const PT = device('PT_E550W', 'PT-E550W', 'brother-ql');
const LW = device('LW_550', 'LabelWriter 550', 'labelwriter');

async function failure(p: Promise<unknown>): Promise<SelectionError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof SelectionError) return err;
    throw err;
  }
  throw new Error('expected a SelectionError');
}

describe('selectPrinter with --host', () => {
  it('walks drivers in order; a plain Error from the first is a decline, the second opens', async () => {
    const brotherQl = fakeDriver('brother-ql', () => {
      throw new Error('no SNMP answer from 10.0.0.9');
    });
    const labelwriter = fakeDriver('labelwriter', () => adapter('labelwriter', 'LabelWriter 550'));
    const importer = importerFor({ 'brother-ql': brotherQl, labelwriter });

    const result = await selectPrinter({ host: '10.0.0.9', port: 9100 }, importer);

    expect(result.driver.discovery.family).toBe('labelwriter');
    expect(result.printer.model).toBe('LabelWriter 550');
    expect(brotherQl.openCalls).toEqual([{ host: '10.0.0.9', port: 9100 }]);
    expect(labelwriter.openCalls).toEqual([{ host: '10.0.0.9', port: 9100 }]);
  });

  it('treats a synchronous throw from openPrinter as a decline', async () => {
    const brotherQl = throwingDriver('brother-ql', 'not even an Error');
    const labelwriter = fakeDriver('labelwriter', () => adapter('labelwriter', 'LabelWriter 550'));
    const importer = importerFor({ 'brother-ql': brotherQl, labelwriter });

    const result = await selectPrinter({ host: '10.0.0.9' }, importer);
    expect(result.driver.discovery.family).toBe('labelwriter');
  });

  it('stops at the first driver that opens; later drivers are not asked', async () => {
    const brotherQl = fakeDriver('brother-ql', () => adapter('brother-ql', 'QL-820NWBc'));
    const labelwriter = fakeDriver('labelwriter', () => adapter('labelwriter', 'LabelWriter 550'));
    const importer = importerFor({ 'brother-ql': brotherQl, labelwriter });

    const result = await selectPrinter({ host: '10.0.0.9' }, importer);
    expect(result.printer.model).toBe('QL-820NWBc');
    expect(labelwriter.openCalls).toEqual([]);
  });

  it('lists every decline when all drivers fail, rendering identification candidates and the --device line', async () => {
    const idErr = new DeviceIdentificationRequiredError([QL, PT], () =>
      Promise.reject(new Error('not used')),
    );
    idErr.message =
      'no SNMP answer from 10.0.0.9; pass deviceKey, and media, since status is unavailable too';
    const brotherQl = fakeDriver('brother-ql', () => {
      throw idErr;
    });
    const labelwriter = fakeDriver('labelwriter', () => {
      throw new Error('TCP open requires `deviceKey`');
    });
    const importer = importerFor({ 'brother-ql': brotherQl, labelwriter });

    const err = await failure(selectPrinter({ host: '10.0.0.9', invocation: 'status' }, importer));
    const msg = err.message;
    expect(msg).toContain('No installed driver could open 10.0.0.9:');
    expect(msg).toContain('brother-ql: no SNMP answer from 10.0.0.9');
    expect(msg).toContain('labelwriter: TCP open requires `deviceKey`');
    expect(msg).toMatch(/QL_820NWBc\s+QL-820NWBc/);
    expect(msg).toMatch(/PT_E550W\s+PT-E550W/);
    expect(msg).toContain(
      'thermal-label status --host 10.0.0.9 --printer brother-ql --device QL_820NWBc --media <id>',
    );
    expect(msg).toContain('--printer <family>');
  });

  it('omits --media from the copy line when the driver identified the model as unknown', async () => {
    const idErr = new DeviceIdentificationRequiredError([QL], () =>
      Promise.reject(new Error('not used')),
    );
    idErr.message = 'model "Brother HL-L2350DW" not in the brother-ql registry';
    const brotherQl = fakeDriver('brother-ql', () => {
      throw idErr;
    });
    const importer = importerFor({ 'brother-ql': brotherQl });

    const err = await failure(
      selectPrinter({ host: '10.0.0.9', port: 9101, invocation: 'print text "hi"' }, importer),
    );
    expect(err.message).toContain(
      'thermal-label print text "hi" --host 10.0.0.9 --port 9101 --printer brother-ql --device QL_820NWBc',
    );
    expect(err.message).not.toContain('--media');
  });

  it("with --printer surfaces that one driver's error verbatim and does not walk", async () => {
    const brotherQl = fakeDriver('brother-ql', () => {
      throw new Error('ECONNREFUSED 10.0.0.9:9100');
    });
    const labelwriter = fakeDriver('labelwriter', () => adapter('labelwriter', 'LabelWriter 550'));
    const importer = importerFor({ 'brother-ql': brotherQl, labelwriter });

    const err = await failure(selectPrinter({ host: '10.0.0.9', printer: 'brother-ql' }, importer));
    expect(err.message).toContain('Failed to open printer at 10.0.0.9:');
    expect(err.message).toContain('brother-ql: ECONNREFUSED 10.0.0.9:9100');
    expect(err.message).not.toContain('No installed driver');
    expect(labelwriter.openCalls).toEqual([]);
  });

  it('forwards --device and --community to every driver in the walk', async () => {
    const brotherQl = fakeDriver('brother-ql', () => {
      throw new Error('Unknown deviceKey "LW_550"');
    });
    const labelwriter = fakeDriver('labelwriter', () => adapter('labelwriter', 'LabelWriter 550'));
    const importer = importerFor({ 'brother-ql': brotherQl, labelwriter });

    const result = await selectPrinter(
      { host: '10.0.0.9', device: 'LW_550', community: 'lab', serial: 'S1' },
      importer,
    );
    const expected: OpenOptions = {
      host: '10.0.0.9',
      serialNumber: 'S1',
      deviceKey: 'LW_550',
      snmpCommunity: 'lab',
    };
    expect(brotherQl.openCalls).toEqual([expected]);
    expect(labelwriter.openCalls).toEqual([expected]);
    expect(result.driver.discovery.family).toBe('labelwriter');
  });
});

describe('selectPrinter via discovery', () => {
  const networkQl: DiscoveredPrinter = {
    device: QL,
    transport: 'tcp',
    connectionId: 'opaque-do-not-parse',
    host: '192.168.1.67',
    port: 9100,
    serialNumber: 'M5G679125',
  };
  const usbLw: DiscoveredPrinter = {
    device: LW,
    transport: 'usb',
    connectionId: '1.4',
    serialNumber: 'LW1',
  };

  it('re-opens a network printer by host/port with the discovered device key', async () => {
    const brotherQl = fakeDriver('brother-ql', () => adapter('brother-ql', 'QL-820NWBc'), [
      networkQl,
    ]);
    const importer = importerFor({ 'brother-ql': brotherQl });

    const result = await selectPrinter({}, importer);
    expect(result.printer.model).toBe('QL-820NWBc');
    expect(brotherQl.openCalls).toEqual([
      { serialNumber: 'M5G679125', host: '192.168.1.67', port: 9100, deviceKey: 'QL_820NWBc' },
    ]);
  });

  it('lets --device override the discovered key and passes --community on re-open', async () => {
    const brotherQl = fakeDriver('brother-ql', () => adapter('brother-ql', 'PT-E550W'), [
      networkQl,
    ]);
    const importer = importerFor({ 'brother-ql': brotherQl });

    await selectPrinter({ device: 'PT_E550W', community: 'lab' }, importer);
    expect(brotherQl.openCalls[0]).toMatchObject({ deviceKey: 'PT_E550W', snmpCommunity: 'lab' });
  });

  it('re-opens a USB printer by serial only, adding deviceKey only when --device is given', async () => {
    const labelwriter = fakeDriver('labelwriter', () => adapter('labelwriter', 'LabelWriter 550'), [
      usbLw,
    ]);
    const importer = importerFor({ labelwriter });

    await selectPrinter({}, importer);
    await selectPrinter({ device: 'LW_550' }, importer);
    expect(labelwriter.openCalls).toEqual([
      { serialNumber: 'LW1' },
      { serialNumber: 'LW1', deviceKey: 'LW_550' },
    ]);
  });

  it('reports an open failure on a discovered printer without the walk hint', async () => {
    const labelwriter = fakeDriver(
      'labelwriter',
      () => {
        throw new Error('USB permission denied');
      },
      [usbLw],
    );
    const importer = importerFor({ labelwriter });

    const err = await failure(selectPrinter({}, importer));
    expect(err.message).toContain('Failed to open printer:');
    expect(err.message).toContain('labelwriter: USB permission denied');
    expect(err.message).not.toContain('--printer <family>');
  });
});

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
