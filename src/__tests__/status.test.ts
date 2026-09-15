import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  DeviceEntry,
  DiscoveredPrinter,
  OpenOptions,
  PrinterAdapter,
  PrinterDiscovery,
  PrinterStatus,
  TransportType,
} from '@thermal-label/contracts';

import { statusCommand } from '../commands/status.js';

interface MockPrinterInit {
  family: string;
  name: string;
  transport?: TransportType;
  connectionId?: string;
  serialNumber?: string;
  status: PrinterStatus;
}

function mockDevice(name: string, family: string): DeviceEntry {
  return {
    key: name.replaceAll(/\W+/g, '_').toUpperCase(),
    name,
    family,
    transports: {},
    engines: [],
    support: { status: 'untested' },
  };
}

function mockDiscovery(init: MockPrinterInit[]): {
  discovery: PrinterDiscovery;
  adapters: PrinterAdapter[];
  closeCalls: number[];
  openCalls: OpenOptions[];
} {
  const adapters: PrinterAdapter[] = [];
  const closeCalls: number[] = [];
  const openCalls: OpenOptions[] = [];
  const family = init[0]?.family ?? 'unknown';

  const discovery: PrinterDiscovery = {
    family,
    listPrinters: (): Promise<DiscoveredPrinter[]> =>
      Promise.resolve(
        init.map(p => {
          const dp: DiscoveredPrinter = {
            device: mockDevice(p.name, p.family),
            transport: p.transport ?? 'usb',
            connectionId: p.connectionId ?? 'mock',
          };
          if (p.serialNumber !== undefined) dp.serialNumber = p.serialNumber;
          return dp;
        }),
      ),
    openPrinter: (options?: OpenOptions) => {
      openCalls.push(options ?? {});
      const match = init.find(p => options?.serialNumber === p.serialNumber) ?? init[0];
      if (!match) return Promise.reject(new Error('no printer'));
      const idx = adapters.length;
      const adapter: PrinterAdapter = {
        family: match.family,
        model: match.name,
        connected: true,
        getStatus: () => Promise.resolve(match.status),
        print: () => Promise.resolve(),
        createPreview: () => Promise.reject(new Error('not used')),
        close: () => {
          closeCalls.push(idx);
          return Promise.resolve();
        },
      };
      adapters.push(adapter);
      return Promise.resolve(adapter);
    },
  };

  return { discovery, adapters, closeCalls, openCalls };
}

function stripAnsi(s: string): string {
  return s.replaceAll(/\[[0-9;]*m/g, '');
}

function collect(): { out: (s: string) => void; lines: string[] } {
  const lines: string[] = [];
  return {
    out: (s: string) => {
      lines.push(stripAnsi(s));
    },
    lines,
  };
}

function baseStatus(overrides: Partial<PrinterStatus> = {}): PrinterStatus {
  return {
    ready: true,
    mediaLoaded: true,
    errors: [],
    rawBytes: new Uint8Array(),
    ...overrides,
  };
}

const originalExitCode = process.exitCode;

beforeEach(() => {
  process.exitCode = 0;
});

afterEach(() => {
  process.exitCode = originalExitCode;
});

describe('status command', () => {
  it('prints status for a single discovered printer', async () => {
    const { out, lines } = collect();
    const { discovery, closeCalls } = mockDiscovery([
      {
        family: 'brother-ql',
        name: 'QL-820NWB',
        status: baseStatus({
          detectedMedia: {
            id: 259,
            name: '62mm continuous',
            widthMm: 62,
            type: 'continuous',
          },
        }),
      },
    ]);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery })
        : Promise.reject(new Error('missing'));
    await statusCommand({ importer, out });
    expect(lines.some(l => l.includes('QL-820NWB') && l.includes('brother-ql'))).toBe(true);
    expect(lines.some(l => l.includes('Ready'))).toBe(true);
    expect(lines.some(l => l.includes('62mm continuous'))).toBe(true);
    expect(lines.some(l => l.includes('Errors:') && l.includes('none'))).toBe(true);
    expect(closeCalls).toEqual([0]);
  });

  it('errors when no printers are found', async () => {
    const { out, lines } = collect();
    const { discovery } = mockDiscovery([]);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery })
        : Promise.reject(new Error('missing'));
    await statusCommand({ importer, out });
    expect(lines.some(l => l.includes('No printers found'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('errors when multiple printers are found without a discriminator', async () => {
    const { out, lines } = collect();
    const { discovery } = mockDiscovery([
      { family: 'brother-ql', name: 'QL-820NWB', serialNumber: 'A1', status: baseStatus() },
      { family: 'brother-ql', name: 'QL-1100', serialNumber: 'B2', status: baseStatus() },
    ]);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery })
        : Promise.reject(new Error('missing'));
    await statusCommand({ importer, out });
    const joined = lines.join('\n');
    expect(joined).toContain('Multiple printers found');
    expect(joined).toContain('--printer');
    expect(joined).toContain('--serial');
    expect(process.exitCode).toBe(1);
  });

  it('narrows by --serial when multiple printers are available', async () => {
    const { out, lines } = collect();
    const { discovery, openCalls } = mockDiscovery([
      { family: 'brother-ql', name: 'QL-820NWB', serialNumber: 'A1', status: baseStatus() },
      { family: 'brother-ql', name: 'QL-1100', serialNumber: 'B2', status: baseStatus() },
    ]);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery })
        : Promise.reject(new Error('missing'));
    await statusCommand({ importer, out, serial: 'B2' });
    expect(openCalls).toEqual([{ serialNumber: 'B2' }]);
    expect(lines.some(l => l.includes('QL-1100'))).toBe(true);
  });

  it('narrows by --printer family', async () => {
    const { out, lines } = collect();
    const { discovery: qlDiscovery } = mockDiscovery([
      { family: 'brother-ql', name: 'QL-820NWB', status: baseStatus() },
    ]);
    const { discovery: lwDiscovery } = mockDiscovery([
      { family: 'labelwriter', name: 'LabelWriter 450', status: baseStatus() },
    ]);
    const importer = (pkg: string) => {
      if (pkg === '@thermal-label/brother-ql-node')
        return Promise.resolve({ discovery: qlDiscovery });
      if (pkg === '@thermal-label/labelwriter-node')
        return Promise.resolve({ discovery: lwDiscovery });
      return Promise.reject(new Error('missing'));
    };
    await statusCommand({ importer, out, printer: 'labelwriter' });
    expect(lines.some(l => l.includes('LabelWriter 450'))).toBe(true);
  });

  it('walks the installed drivers when --host is given without --printer', async () => {
    const { out, lines } = collect();
    const { discovery, openCalls } = mockDiscovery([
      { family: 'brother-ql', name: 'QL-820NWB', status: baseStatus() },
    ]);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery })
        : Promise.reject(new Error('missing'));
    await statusCommand({ importer, out, host: '192.168.1.42', community: 'lab' });
    expect(openCalls).toEqual([{ host: '192.168.1.42', snmpCommunity: 'lab' }]);
    expect(lines.some(l => l.includes('QL-820NWB'))).toBe(true);
    expect(process.exitCode).toBe(0);
  });

  it('renders status details rows, warnings in place', async () => {
    const { out, lines } = collect();
    const { discovery } = mockDiscovery([
      {
        family: 'brother-ql',
        name: 'QL-820NWBc',
        status: baseStatus({
          details: [
            { label: 'Printer state', value: 'idle' },
            { label: 'Two-colour', value: 'not detectable over network', severity: 'warn' },
          ],
        }),
      },
    ]);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery })
        : Promise.reject(new Error('missing'));
    await statusCommand({ importer, out });
    expect(lines.some(l => l.includes('Printer state: idle'))).toBe(true);
    expect(lines.some(l => l.includes('Two-colour: not detectable over network'))).toBe(true);
  });

  it('shows --media as the media line and validates it against the catalog', async () => {
    const { out, lines } = collect();
    const { discovery } = mockDiscovery([
      { family: 'brother-ql', name: 'QL-820NWBc', status: baseStatus() },
    ]);
    discovery.listMedia = () => [
      { id: 251, name: '62mm continuous (two-colour)', widthMm: 62, type: 'continuous' },
    ];
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery })
        : Promise.reject(new Error('missing'));
    await statusCommand({ importer, out, media: '251' });
    expect(
      lines.some(l => l.includes('62mm continuous (two-colour)') && l.includes('(from --media)')),
    ).toBe(true);
    expect(process.exitCode).toBe(0);

    await statusCommand({ importer, out, media: '999' });
    expect(lines.some(l => l.includes("Unknown media '999'"))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('uses TCP transport and prints Transport line when --host is set with --printer', async () => {
    const { out, lines } = collect();
    const { discovery, openCalls } = mockDiscovery([
      { family: 'brother-ql', name: 'QL-820NWB', status: baseStatus() },
    ]);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery })
        : Promise.reject(new Error('missing'));
    await statusCommand({ importer, out, host: '192.168.1.42', printer: 'brother-ql' });
    expect(openCalls).toEqual([{ host: '192.168.1.42' }]);
    expect(lines.some(l => l.includes('Transport:') && l.includes('192.168.1.42:9100'))).toBe(true);
  });

  it('prints error list when printer reports errors', async () => {
    const { out, lines } = collect();
    const { discovery } = mockDiscovery([
      {
        family: 'brother-ql',
        name: 'QL-820NWB',
        status: baseStatus({
          ready: false,
          errors: [
            { code: 'no_media', message: 'Out of paper' },
            { code: 'cover_open', message: 'Cover is open' },
          ],
        }),
      },
    ]);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery })
        : Promise.reject(new Error('missing'));
    await statusCommand({ importer, out });
    expect(lines.some(l => l.includes('Not ready'))).toBe(true);
    expect(lines.some(l => l.includes('[no_media]') && l.includes('Out of paper'))).toBe(true);
    expect(lines.some(l => l.includes('[cover_open]'))).toBe(true);
  });

  it('closes the printer even when getStatus throws', async () => {
    const closeCalls: number[] = [];
    const discovery: PrinterDiscovery = {
      family: 'brother-ql',
      listPrinters: (): Promise<DiscoveredPrinter[]> =>
        Promise.resolve([
          {
            device: mockDevice('QL-820NWB', 'brother-ql'),
            transport: 'usb',
            connectionId: 'mock',
          },
        ]),
      openPrinter: () => {
        const adapter: PrinterAdapter = {
          family: 'brother-ql',
          model: 'QL-820NWB',
          connected: true,
          getStatus: () => Promise.reject(new Error('boom')),
          print: () => Promise.resolve(),
          createPreview: () => Promise.reject(new Error('not used')),
          close: () => {
            closeCalls.push(1);
            return Promise.resolve();
          },
        };
        return Promise.resolve(adapter);
      },
    };
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery })
        : Promise.reject(new Error('missing'));
    const noop = (): void => {
      // discard output for this test
    };
    await expect(statusCommand({ importer, out: noop })).rejects.toThrow('boom');
    expect(closeCalls).toEqual([1]);
  });

  it('reports failure to open a printer via exit code 1', async () => {
    const { out, lines } = collect();
    const discovery: PrinterDiscovery = {
      family: 'brother-ql',
      listPrinters: (): Promise<DiscoveredPrinter[]> =>
        Promise.resolve([
          {
            device: mockDevice('QL-820NWB', 'brother-ql'),
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
    await statusCommand({ importer, out });
    expect(
      lines.some(l => l.includes('Failed to open printer') && l.includes('USB permission denied')),
    ).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('errors when --printer is a family that is not installed', async () => {
    const { out, lines } = collect();
    const { discovery } = mockDiscovery([
      { family: 'brother-ql', name: 'QL-820NWB', status: baseStatus() },
    ]);
    const importer = (pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery })
        : Promise.reject(new Error('missing'));
    await statusCommand({ importer, out, printer: 'labelmanager' });
    expect(lines.some(l => l.includes('labelmanager'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('errors when no drivers installed', async () => {
    const { out, lines } = collect();
    const importer = () => Promise.reject(new Error('not installed'));
    await statusCommand({ importer, out });
    expect(lines.some(l => l.includes('No driver packages installed'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });
});
