import chalk from 'chalk';

import type { DiscoveredPrinter } from '@thermal-label/contracts';

import {
  discoverAll,
  KNOWN_DRIVERS,
  listDriverStatus,
  loadDrivers,
  type DriverStatus,
  type DynamicImporter,
} from '../discovery.js';

export type OutFn = (line: string) => void;

export interface ListCommandOptions {
  drivers?: boolean;
  importer?: DynamicImporter;
  out?: OutFn;
}

const DRIVER_INSTALL_HINTS: Record<string, string> = {
  '@thermal-label/brother-ql-node': 'Brother QL series',
  '@thermal-label/labelwriter-node': 'Dymo LabelWriter',
  '@thermal-label/labelmanager-node': 'Dymo LabelManager',
};

export async function listCommand(options: ListCommandOptions = {}): Promise<void> {
  const out = options.out ?? defaultOut;

  if (options.drivers === true) {
    const statuses = await listDriverStatus(KNOWN_DRIVERS, options.importer);
    printDriverStatusTable(out, statuses);
    return;
  }

  const drivers = await loadDrivers(KNOWN_DRIVERS, options.importer);
  if (drivers.length === 0) {
    printNoDriversInstalled(out);
    return;
  }

  const printers = await discoverAll(drivers.map(d => d.discovery));
  if (printers.length === 0) {
    printNoPrintersFound(
      out,
      drivers.map(d => d.discovery.family),
    );
    return;
  }

  printPrinterTable(out, printers);
}

function printPrinterTable(out: OutFn, printers: readonly DiscoveredPrinter[]): void {
  const header = ['Family', 'Model', 'Transport', 'Connection'];
  const rows = [header];
  for (const p of printers) {
    rows.push([p.device.family, p.device.name, p.transport, p.connectionId]);
  }
  const widths = header.map((_, col) => Math.max(...rows.map(r => (r[col] ?? '').length)));
  for (const [i, row] of rows.entries()) {
    const formatted = row.map((v, col) => v.padEnd(widths[col] ?? 0)).join('  ');
    out(i === 0 ? chalk.bold(formatted) : formatted);
  }
}

function printDriverStatusTable(out: OutFn, statuses: readonly DriverStatus[]): void {
  const header = ['Package', 'Status'];
  const rows: string[][] = [header];
  for (const s of statuses) {
    rows.push([s.packageName, formatStatus(s)]);
  }
  const widths = header.map((_, col) => Math.max(...rows.map(r => visibleLength(r[col] ?? ''))));
  for (const [i, row] of rows.entries()) {
    const formatted = row
      .map((v, col) => v + ' '.repeat(Math.max(0, (widths[col] ?? 0) - visibleLength(v))))
      .join('  ');
    out(i === 0 ? chalk.bold(formatted) : formatted);
  }
}

function formatStatus(s: DriverStatus): string {
  if (!s.installed) return `${chalk.red('✗')} not installed`;
  if (!s.hasDiscoveryExport) {
    return `${chalk.yellow('●')} installed, no discovery export`;
  }
  return `${chalk.green('✓')} installed`;
}

function visibleLength(s: string): string['length'] {
  return s.replaceAll(/\[[0-9;]*m/g, '').length;
}

function printNoDriversInstalled(out: OutFn): void {
  out('No driver packages installed.');
  out('');
  out('Install a driver for your printer:');
  for (const pkg of KNOWN_DRIVERS) {
    const hint = DRIVER_INSTALL_HINTS[pkg] ?? '';
    out(`  pnpm add ${pkg}${hint === '' ? '' : `   # ${hint}`}`);
  }
  out('');
  out("Then run 'thermal-label list' again.");
}

function printNoPrintersFound(out: OutFn, families: readonly string[]): void {
  out('No printers found.');
  out('');
  out(`Installed drivers: ${families.join(', ')}`);
  out('Make sure your printer is connected via USB or accessible via TCP.');
}

function defaultOut(line: string): void {
  process.stdout.write(`${line}\n`);
}
