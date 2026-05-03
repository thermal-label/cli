import { describe, expect, it, vi } from 'vitest';

import type { DeviceEntry, DiscoveredPrinter, PrinterDiscovery } from '@thermal-label/contracts';

import { listCommand } from '../commands/list.js';

interface MockPrinter {
  family: string;
  name: string;
  transport: DiscoveredPrinter['transport'];
  connectionId: string;
}

function mockDevice(p: MockPrinter): DeviceEntry {
  return {
    key: p.name.replaceAll(/\W+/g, '_').toUpperCase(),
    name: p.name,
    family: p.family,
    transports: {},
    engines: [],
    support: { status: 'untested' },
  };
}

function mockDiscovery(family: string, printers: MockPrinter[]): PrinterDiscovery {
  return {
    family,
    listPrinters: (): Promise<DiscoveredPrinter[]> =>
      Promise.resolve(
        printers.map(p => ({
          device: mockDevice(p),
          transport: p.transport,
          connectionId: p.connectionId,
        })),
      ),
    openPrinter: () => Promise.reject(new Error('not used')),
  };
}

function stripAnsi(s: string): string {
  return s.replaceAll(/\[[0-9;]*m/g, '');
}

function collectOutput(): { out: (s: string) => void; lines: string[] } {
  const lines: string[] = [];
  return {
    out: (s: string) => {
      lines.push(stripAnsi(s));
    },
    lines,
  };
}

describe('list command', () => {
  it('shows install instructions when no drivers are installed', async () => {
    const { out, lines } = collectOutput();
    const importer = vi.fn(() => Promise.reject(new Error('not found')));
    await listCommand({ importer, out });
    expect(lines[0]).toBe('No driver packages installed.');
    expect(lines.some(l => l.includes('pnpm add @thermal-label/brother-ql-node'))).toBe(true);
    expect(lines.some(l => l.includes('pnpm add @thermal-label/labelwriter-node'))).toBe(true);
    expect(lines.some(l => l.includes('pnpm add @thermal-label/labelmanager-node'))).toBe(true);
  });

  it('treats installed-but-no-discovery as same as not installed', async () => {
    const { out, lines } = collectOutput();
    const importer = vi.fn(() => Promise.resolve({ somethingElse: true }));
    await listCommand({ importer, out });
    expect(lines[0]).toBe('No driver packages installed.');
  });

  it('shows printer table with one driver, one printer', async () => {
    const { out, lines } = collectOutput();
    const discovery = mockDiscovery('brother-ql', [
      {
        family: 'brother-ql',
        name: 'QL-820NWB',
        transport: 'usb',
        connectionId: 'Bus 003 Device 010',
      },
    ]);
    const importer = vi.fn(() => Promise.resolve({ discovery }));
    await listCommand({ importer, out });
    expect(lines[0]).toMatch(/Family\s+Model\s+Transport\s+Connection/);
    expect(lines[1]).toMatch(/brother-ql\s+QL-820NWB\s+usb\s+Bus 003 Device 010/);
  });

  it('aggregates printers across multiple drivers', async () => {
    const { out, lines } = collectOutput();
    const discoveryA = mockDiscovery('brother-ql', [
      {
        family: 'brother-ql',
        name: 'QL-820NWB',
        transport: 'usb',
        connectionId: 'Bus 003 Dev 010',
      },
    ]);
    const discoveryB = mockDiscovery('labelwriter', [
      {
        family: 'labelwriter',
        name: 'LabelWriter 450',
        transport: 'usb',
        connectionId: 'Bus 001 Dev 004',
      },
    ]);
    const importer = vi.fn((pkg: string) => {
      if (pkg === '@thermal-label/brother-ql-node')
        return Promise.resolve({ discovery: discoveryA });
      if (pkg === '@thermal-label/labelwriter-node')
        return Promise.resolve({ discovery: discoveryB });
      return Promise.reject(new Error('missing'));
    });
    await listCommand({ importer, out });
    const body = lines.slice(1);
    expect(body.some(l => l.includes('brother-ql') && l.includes('QL-820NWB'))).toBe(true);
    expect(body.some(l => l.includes('labelwriter') && l.includes('LabelWriter 450'))).toBe(true);
  });

  it('shows "no printers found" when drivers are installed but find nothing', async () => {
    const { out, lines } = collectOutput();
    const discovery = mockDiscovery('brother-ql', []);
    const importer = vi.fn((pkg: string) =>
      pkg === '@thermal-label/brother-ql-node'
        ? Promise.resolve({ discovery })
        : Promise.reject(new Error('missing')),
    );
    await listCommand({ importer, out });
    expect(lines[0]).toBe('No printers found.');
    expect(lines.some(l => l.includes('brother-ql'))).toBe(true);
  });

  it('--drivers flag shows package install status with all three known drivers', async () => {
    const { out, lines } = collectOutput();
    const discovery = mockDiscovery('brother-ql', []);
    const importer = vi.fn((pkg: string) => {
      if (pkg === '@thermal-label/brother-ql-node') return Promise.resolve({ discovery });
      if (pkg === '@thermal-label/labelwriter-node') return Promise.resolve({}); // installed, no discovery
      return Promise.reject(new Error('missing')); // labelmanager not installed
    });
    await listCommand({ drivers: true, importer, out });
    expect(lines[0]).toMatch(/Package\s+Status/);
    expect(lines.some(l => l.includes('brother-ql-node') && l.includes('installed'))).toBe(true);
    expect(
      lines.some(l => l.includes('labelwriter-node') && l.includes('no discovery export')),
    ).toBe(true);
    expect(lines.some(l => l.includes('labelmanager-node') && l.includes('not installed'))).toBe(
      true,
    );
  });
});
