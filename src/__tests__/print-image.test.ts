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
import { PNG } from 'pngjs';

import { printImageCommand } from '../commands/print-image.js';

function makePngBuffer(
  width: number,
  height: number,
  fill: [number, number, number, number],
): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = fill[0];
    png.data[i * 4 + 1] = fill[1];
    png.data[i * 4 + 2] = fill[2];
    png.data[i * 4 + 3] = fill[3];
  }
  return PNG.sync.write(png);
}

interface MockAdapter {
  adapter: PrinterAdapter;
  printCalls: { image: RawImageData; options?: PrintOptions }[];
  readonly closeCalls: number;
}

function mockAdapter(detectedMedia: MediaDescriptor): MockAdapter {
  const printCalls: { image: RawImageData; options?: PrintOptions }[] = [];
  let closes = 0;
  const adapter: PrinterAdapter = {
    family: 'brother-ql',
    model: 'QL-820NWB',
    connected: true,
    getStatus: (): Promise<PrinterStatus> =>
      Promise.resolve({
        ready: true,
        mediaLoaded: true,
        detectedMedia,
        errors: [],
        rawBytes: new Uint8Array(),
      }),
    print: (image, _media, options) => {
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

describe('print image command', () => {
  it('loads the file and calls print with RawImageData', async () => {
    const mock = mockAdapter(stdMedia);
    const pngBytes = makePngBuffer(4, 2, [0, 0, 0, 255]);
    const readFileFn = (): Promise<Buffer> => Promise.resolve(pngBytes);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery: mockDiscovery(mock) })
        : Promise.reject(new Error('missing'));
    await printImageCommand('/fake.png', { importer, readFileFn, out: vi.fn() });
    expect(mock.printCalls).toHaveLength(1);
    const { image } = mock.printCalls[0] ?? {};
    expect(image?.width).toBe(4);
    expect(image?.height).toBe(2);
  });

  it('applies --rotate (swaps dimensions)', async () => {
    const mock = mockAdapter(stdMedia);
    const pngBytes = makePngBuffer(4, 2, [255, 255, 255, 255]);
    const readFileFn = (): Promise<Buffer> => Promise.resolve(pngBytes);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery: mockDiscovery(mock) })
        : Promise.reject(new Error('missing'));
    await printImageCommand('/fake.png', {
      importer,
      readFileFn,
      rotate: 90,
      out: vi.fn(),
    });
    const { image } = mock.printCalls[0] ?? {};
    expect(image?.width).toBe(2);
    expect(image?.height).toBe(4);
  });

  it('applies --threshold, --dither, --invert', async () => {
    const mock = mockAdapter(stdMedia);
    const pngBytes = makePngBuffer(4, 4, [128, 128, 128, 255]);
    const readFileFn = (): Promise<Buffer> => Promise.resolve(pngBytes);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery: mockDiscovery(mock) })
        : Promise.reject(new Error('missing'));
    await printImageCommand('/fake.png', {
      importer,
      readFileFn,
      threshold: 100,
      dither: true,
      invert: true,
      out: vi.fn(),
    });
    expect(mock.printCalls).toHaveLength(1);
    const { image } = mock.printCalls[0] ?? {};
    expect(image?.width).toBe(4);
  });

  it('passes --density through PrintOptions', async () => {
    const mock = mockAdapter(stdMedia);
    const pngBytes = makePngBuffer(2, 2, [0, 0, 0, 255]);
    const readFileFn = (): Promise<Buffer> => Promise.resolve(pngBytes);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery: mockDiscovery(mock) })
        : Promise.reject(new Error('missing'));
    await printImageCommand('/fake.png', {
      importer,
      readFileFn,
      density: 'light',
      out: vi.fn(),
    });
    expect(mock.printCalls[0]?.options).toEqual({ density: 'light' });
  });

  it('calls print N times when --copies is set', async () => {
    const mock = mockAdapter(stdMedia);
    const pngBytes = makePngBuffer(2, 2, [0, 0, 0, 255]);
    const readFileFn = (): Promise<Buffer> => Promise.resolve(pngBytes);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery: mockDiscovery(mock) })
        : Promise.reject(new Error('missing'));
    await printImageCommand('/fake.png', {
      importer,
      readFileFn,
      copies: 2,
      out: vi.fn(),
    });
    expect(mock.printCalls).toHaveLength(2);
  });

  it('errors with a clear message when the file cannot be loaded', async () => {
    const mock = mockAdapter(stdMedia);
    const readFileFn = (): Promise<Buffer> => Promise.reject(new Error('ENOENT: no such file'));
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery: mockDiscovery(mock) })
        : Promise.reject(new Error('missing'));
    const lines: string[] = [];
    await printImageCommand('/missing.png', {
      importer,
      readFileFn,
      out: s => lines.push(s),
    });
    expect(lines.some(l => l.includes('Failed to load image'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('closes the printer in the finally block', async () => {
    const mock = mockAdapter(stdMedia);
    const pngBytes = makePngBuffer(2, 2, [0, 0, 0, 255]);
    const readFileFn = (): Promise<Buffer> => Promise.resolve(pngBytes);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery: mockDiscovery(mock) })
        : Promise.reject(new Error('missing'));
    await printImageCommand('/fake.png', { importer, readFileFn, out: vi.fn() });
    expect(mock.closeCalls).toBe(1);
  });

  it('reports a helpful message on MediaNotSpecifiedError', async () => {
    const pngBytes = makePngBuffer(2, 2, [0, 0, 0, 255]);
    const readFileFn = (): Promise<Buffer> => Promise.resolve(pngBytes);
    const { MediaNotSpecifiedError } = await import('@thermal-label/contracts');
    let closes = 0;
    const adapter: PrinterAdapter = {
      family: 'brother-ql',
      model: 'QL-820NWB',
      connected: true,
      getStatus: () =>
        Promise.resolve({
          ready: true,
          mediaLoaded: true,
          errors: [],
          rawBytes: new Uint8Array(),
        }),
      print: () => Promise.reject(new MediaNotSpecifiedError()),
      createPreview: () => Promise.reject(new Error('not used')),
      close: () => {
        closes++;
        return Promise.resolve();
      },
    };
    const discovery: PrinterDiscovery = {
      family: 'brother-ql',
      listPrinters: () =>
        Promise.resolve([
          {
            device: { name: 'QL-820NWB', family: 'brother-ql', transports: ['usb'] },
            transport: 'usb',
            connectionId: 'mock',
          },
        ]),
      openPrinter: () => Promise.resolve(adapter),
    };
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery })
        : Promise.reject(new Error('missing'));
    const lines: string[] = [];
    await printImageCommand('/fake.png', { importer, readFileFn, out: s => lines.push(s) });
    expect(lines.some(l => l.includes('No media'))).toBe(true);
    expect(process.exitCode).toBe(1);
    expect(closes).toBe(1);
  });

  it('reports generic print failures with exit code 1', async () => {
    const pngBytes = makePngBuffer(2, 2, [0, 0, 0, 255]);
    const readFileFn = (): Promise<Buffer> => Promise.resolve(pngBytes);
    let closes = 0;
    const adapter: PrinterAdapter = {
      family: 'brother-ql',
      model: 'QL-820NWB',
      connected: true,
      getStatus: () =>
        Promise.resolve({
          ready: true,
          mediaLoaded: true,
          errors: [],
          rawBytes: new Uint8Array(),
        }),
      print: () => Promise.reject(new Error('transport disconnect')),
      createPreview: () => Promise.reject(new Error('not used')),
      close: () => {
        closes++;
        return Promise.resolve();
      },
    };
    const discovery: PrinterDiscovery = {
      family: 'brother-ql',
      listPrinters: () =>
        Promise.resolve([
          {
            device: { name: 'QL-820NWB', family: 'brother-ql', transports: ['usb'] },
            transport: 'usb',
            connectionId: 'mock',
          },
        ]),
      openPrinter: () => Promise.resolve(adapter),
    };
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery })
        : Promise.reject(new Error('missing'));
    const lines: string[] = [];
    await printImageCommand('/fake.png', { importer, readFileFn, out: s => lines.push(s) });
    expect(lines.some(l => l.includes('Print failed') && l.includes('transport disconnect'))).toBe(
      true,
    );
    expect(process.exitCode).toBe(1);
    expect(closes).toBe(1);
  });

  it('errors cleanly when no printer is found (covers selection error path)', async () => {
    const pngBytes = makePngBuffer(2, 2, [0, 0, 0, 255]);
    const readFileFn = (): Promise<Buffer> => Promise.resolve(pngBytes);
    const importer = (pkg: string) => {
      void pkg;
      return Promise.reject(new Error('missing'));
    };
    const lines: string[] = [];
    await printImageCommand('/fake.png', { importer, readFileFn, out: s => lines.push(s) });
    expect(lines.some(l => l.includes('No driver packages'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('reports failure to open printer with exit code 1', async () => {
    const pngBytes = makePngBuffer(2, 2, [0, 0, 0, 255]);
    const readFileFn = (): Promise<Buffer> => Promise.resolve(pngBytes);
    const discovery: PrinterDiscovery = {
      family: 'brother-ql',
      listPrinters: () =>
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
    await printImageCommand('/fake.png', { importer, readFileFn, out: s => lines.push(s) });
    expect(lines.some(l => l.includes('Failed to open printer'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });
});
