import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DeviceEntry,
  DiscoveredPrinter,
  MediaDescriptor,
  PrinterAdapter,
  PrinterDiscovery,
  PrinterStatus,
  PrintOptions,
  RawImageData,
} from '@thermal-label/contracts';
import { MediaNotSpecifiedError } from '@thermal-label/contracts';

import { printTextCommand } from '../commands/print-text.js';

interface MockAdapter {
  adapter: PrinterAdapter;
  printCalls: { image: RawImageData; options?: PrintOptions }[];
  readonly closeCalls: number;
}

function mockAdapter(detectedMedia?: MediaDescriptor, throwOnPrint?: Error): MockAdapter {
  const printCalls: { image: RawImageData; options?: PrintOptions }[] = [];
  let closes = 0;
  const adapter: PrinterAdapter = {
    family: 'brother-ql',
    model: 'QL-820NWB',
    connected: true,
    getStatus: (): Promise<PrinterStatus> => {
      const status: PrinterStatus = {
        ready: true,
        mediaLoaded: true,
        errors: [],
        rawBytes: new Uint8Array(),
      };
      if (detectedMedia !== undefined) status.detectedMedia = detectedMedia;
      return Promise.resolve(status);
    },
    print: (image, _media, options): Promise<void> => {
      if (throwOnPrint) return Promise.reject(throwOnPrint);
      const call: { image: RawImageData; options?: PrintOptions } = { image };
      if (options !== undefined) call.options = options;
      printCalls.push(call);
      return Promise.resolve();
    },
    createPreview: () => Promise.reject(new Error('not used')),
    close: () => {
      closes++;
      return Promise.resolve();
    },
  };
  return {
    adapter,
    printCalls,
    get closeCalls() {
      return closes;
    },
  };
}

const ql820Device: DeviceEntry = {
  key: 'QL_820NWB',
  name: 'QL-820NWB',
  family: 'brother-ql',
  transports: {},
  engines: [],
  support: { status: 'untested' },
};

function mockDiscovery(mock: MockAdapter): PrinterDiscovery {
  return {
    family: 'brother-ql',
    listPrinters: (): Promise<DiscoveredPrinter[]> =>
      Promise.resolve([
        {
          device: ql820Device,
          transport: 'usb',
          connectionId: 'Bus 003 Device 010',
        },
      ]),
    openPrinter: () => Promise.resolve(mock.adapter),
  };
}

const stdMedia: MediaDescriptor = {
  id: 259,
  name: '62mm continuous',
  widthMm: 62,
  type: 'continuous',
};

beforeEach(() => {
  process.exitCode = 0;
});

afterEach(() => {
  process.exitCode = 0;
});

describe('print text command', () => {
  it('renders text and calls print with RawImageData', async () => {
    const mock = mockAdapter(stdMedia);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery: mockDiscovery(mock) })
        : Promise.reject(new Error('missing'));
    const out = vi.fn();
    await printTextCommand('HELLO', { importer, out });
    expect(mock.printCalls).toHaveLength(1);
    const { image } = mock.printCalls[0] ?? {};
    expect(image?.width).toBeGreaterThan(0);
    expect(image?.height).toBeGreaterThan(0);
    expect(image?.data.length).toBe((image?.width ?? 0) * (image?.height ?? 0) * 4);
  });

  it('applies --invert, --scale-x, --scale-y to the rendered image', async () => {
    const mock = mockAdapter(stdMedia);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery: mockDiscovery(mock) })
        : Promise.reject(new Error('missing'));
    await printTextCommand('X', {
      importer,
      out: () => {
        /* discard */
      },
      invert: true,
      scaleX: 3,
      scaleY: 2,
    });
    const { image } = mock.printCalls[0] ?? {};
    expect(image).toBeDefined();
    // The bitmap's default 8x8 font scaled 3x wide, 2x tall
    // for a single char should produce 8*3=24 x 8*2=16.
    expect(image?.width).toBe(24);
    expect(image?.height).toBe(16);
  });

  it('passes --density through to printer.print as PrintOptions.density', async () => {
    const mock = mockAdapter(stdMedia);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery: mockDiscovery(mock) })
        : Promise.reject(new Error('missing'));
    await printTextCommand('X', {
      importer,
      out: () => {
        /* discard */
      },
      density: 'dark',
    });
    expect(mock.printCalls[0]?.options).toEqual({ density: 'dark' });
  });

  it('calls print N times when --copies is set', async () => {
    const mock = mockAdapter(stdMedia);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery: mockDiscovery(mock) })
        : Promise.reject(new Error('missing'));
    await printTextCommand('X', {
      importer,
      out: () => {
        /* discard */
      },
      copies: 3,
    });
    expect(mock.printCalls).toHaveLength(3);
  });

  it('closes the printer even when print throws', async () => {
    const mock = mockAdapter(stdMedia, new Error('connection dropped'));
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery: mockDiscovery(mock) })
        : Promise.reject(new Error('missing'));
    await printTextCommand('X', {
      importer,
      out: () => {
        /* discard */
      },
    });
    expect(mock.closeCalls).toBe(1);
    expect(process.exitCode).toBe(1);
  });

  it('reports a helpful message on MediaNotSpecifiedError', async () => {
    const mock = mockAdapter(undefined, new MediaNotSpecifiedError());
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery: mockDiscovery(mock) })
        : Promise.reject(new Error('missing'));
    const lines: string[] = [];
    await printTextCommand('X', { importer, out: s => lines.push(s) });
    expect(lines.some(l => l.includes('No media'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('errors cleanly when no printer is found', async () => {
    const importer = (pkg: string) => {
      void pkg;
      return Promise.reject(new Error('missing'));
    };
    const lines: string[] = [];
    await printTextCommand('X', { importer, out: s => lines.push(s) });
    expect(lines.some(l => l.includes('No driver packages'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('reports failure to open the printer with exit code 1', async () => {
    const discovery: PrinterDiscovery = {
      family: 'brother-ql',
      listPrinters: (): Promise<DiscoveredPrinter[]> =>
        Promise.resolve([
          {
            device: ql820Device,
            transport: 'usb',
            connectionId: 'mock',
          },
        ]),
      openPrinter: () => Promise.reject(new Error('USB permission denied')),
    };
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery })
        : Promise.reject(new Error('missing'));
    const lines: string[] = [];
    await printTextCommand('X', { importer, out: s => lines.push(s) });
    expect(lines.some(l => l.includes('Failed to open printer'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });
});

describe('print text: --media and status failures', () => {
  const twoColour: MediaDescriptor = {
    id: 251,
    name: '62mm continuous (two-colour)',
    widthMm: 62,
    type: 'continuous',
    palette: [
      { name: 'black', rgb: [0, 0, 0] },
      { name: 'red', rgb: [255, 0, 0] },
    ],
  };

  function discoveryWith(
    adapter: PrinterAdapter,
    listMedia?: () => readonly MediaDescriptor[],
  ): PrinterDiscovery {
    const d = mockDiscovery({ adapter, printCalls: [], closeCalls: 0 });
    d.openPrinter = () => Promise.resolve(adapter);
    if (listMedia) d.listMedia = listMedia;
    return d;
  }

  function importerFor(discovery: PrinterDiscovery) {
    return (pkg: string): Promise<unknown> =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery })
        : Promise.reject(new Error('missing'));
  }

  it('passes the resolved --media to print() and ignores detected media', async () => {
    const mock = mockAdapter(stdMedia);
    const printedMedia: (MediaDescriptor | undefined)[] = [];
    mock.adapter.print = (_image, media): Promise<void> => {
      printedMedia.push(media);
      return Promise.resolve();
    };
    const discovery = discoveryWith(mock.adapter, () => [stdMedia, twoColour]);
    const lines: string[] = [];
    await printTextCommand('X', {
      importer: importerFor(discovery),
      out: s => lines.push(s),
      media: '251',
    });
    expect(printedMedia).toEqual([twoColour]);
    expect(process.exitCode).toBe(0);
  });

  it('errors when --media names an unknown id, before printing', async () => {
    const mock = mockAdapter(stdMedia);
    const discovery = discoveryWith(mock.adapter, () => [stdMedia]);
    const lines: string[] = [];
    await printTextCommand('X', {
      importer: importerFor(discovery),
      out: s => lines.push(s),
      media: 'nope',
    });
    expect(lines.some(l => l.includes("Unknown media 'nope'"))).toBe(true);
    expect(mock.printCalls).toHaveLength(0);
    expect(mock.closeCalls).toBe(1);
    expect(process.exitCode).toBe(1);
  });

  it('errors when the driver has no media catalog and --media is given', async () => {
    const mock = mockAdapter(stdMedia);
    const discovery = discoveryWith(mock.adapter);
    const lines: string[] = [];
    await printTextCommand('X', {
      importer: importerFor(discovery),
      out: s => lines.push(s),
      media: '259',
    });
    expect(lines.some(l => l.includes('does not expose a media catalog'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('exits with the driver message when getStatus fails and no --media was given', async () => {
    const mock = mockAdapter(stdMedia);
    mock.adapter.getStatus = () => Promise.reject(new Error('no SNMP answer from 10.0.0.9'));
    const discovery = discoveryWith(mock.adapter, () => [stdMedia]);
    const lines: string[] = [];
    await printTextCommand('X', { importer: importerFor(discovery), out: s => lines.push(s) });
    expect(lines.some(l => l.includes('Status query failed: no SNMP answer from 10.0.0.9'))).toBe(
      true,
    );
    expect(lines.some(l => l.includes('--media <id>'))).toBe(true);
    expect(mock.printCalls).toHaveLength(0);
    expect(mock.closeCalls).toBe(1);
    expect(process.exitCode).toBe(1);
  });

  it('warns and prints when getStatus fails but --media was given', async () => {
    const mock = mockAdapter(stdMedia);
    mock.adapter.getStatus = () => Promise.reject(new Error('no SNMP answer from 10.0.0.9'));
    const discovery = discoveryWith(mock.adapter, () => [stdMedia]);
    const lines: string[] = [];
    await printTextCommand('X', {
      importer: importerFor(discovery),
      out: s => lines.push(s),
      media: '259',
    });
    expect(lines.some(l => l.includes('Warning: status query failed (no SNMP answer'))).toBe(true);
    expect(lines.some(l => l.includes('without print confirmation'))).toBe(true);
    expect(mock.printCalls).toHaveLength(1);
    expect(mock.printCalls[0]?.options).toEqual({ confirm: false });
    expect(lines.some(l => l.includes('Printed 1 label'))).toBe(true);
    expect(process.exitCode).toBe(0);
  });

  it('does not touch confirm when the status query succeeds', async () => {
    const mock = mockAdapter(stdMedia);
    const discovery = discoveryWith(mock.adapter, () => [stdMedia]);
    const lines: string[] = [];
    await printTextCommand('X', {
      importer: importerFor(discovery),
      out: s => lines.push(s),
      media: '259',
    });
    expect(mock.printCalls).toHaveLength(1);
    expect(mock.printCalls[0]?.options).not.toHaveProperty('confirm');
    expect(process.exitCode).toBe(0);
  });

  it('surfaces status error rows and warn details as warnings and still prints', async () => {
    const mock = mockAdapter(stdMedia);
    mock.adapter.getStatus = (): Promise<PrinterStatus> =>
      Promise.resolve({
        ready: true,
        mediaLoaded: true,
        detectedMedia: stdMedia,
        errors: [{ code: 'low_media', message: 'Roll nearly out' }],
        rawBytes: new Uint8Array(),
        details: [
          { label: 'Printer state', value: 'idle' },
          { label: 'Two-colour', value: 'not detectable over network', severity: 'warn' },
        ],
      });
    const discovery = discoveryWith(mock.adapter);
    const lines: string[] = [];
    await printTextCommand('X', { importer: importerFor(discovery), out: s => lines.push(s) });
    expect(
      lines.some(l => l.includes('Warning: printer reports [low_media] Roll nearly out')),
    ).toBe(true);
    expect(lines.some(l => l.includes('Warning: Two-colour: not detectable over network'))).toBe(
      true,
    );
    expect(lines.some(l => l.includes('Printer state'))).toBe(false);
    expect(mock.printCalls).toHaveLength(1);
  });
});
