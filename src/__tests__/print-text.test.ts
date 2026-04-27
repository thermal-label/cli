import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
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

function mockDiscovery(mock: MockAdapter): PrinterDiscovery {
  return {
    family: 'brother-ql',
    listPrinters: (): Promise<DiscoveredPrinter[]> =>
      Promise.resolve([
        {
          device: { name: 'QL-820NWB', family: 'brother-ql', transports: ['usb'] },
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
            device: { name: 'QL-820NWB', family: 'brother-ql', transports: ['usb'] },
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
