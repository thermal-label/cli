import { describe, expect, it } from 'vitest';

import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

import {
  labelBitmapToRawImageData,
  loadImageFile,
  renderImageLabel,
  renderTextLabel,
} from '../render.js';

function makePngBuffer(width: number, height: number, fill: [number, number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = fill[0];
    png.data[i * 4 + 1] = fill[1];
    png.data[i * 4 + 2] = fill[2];
    png.data[i * 4 + 3] = fill[3];
  }
  return PNG.sync.write(png);
}

function makeJpegBuffer(width: number, height: number, fill: [number, number, number]): Buffer {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = 255;
  }
  const encoded = jpeg.encode({ data, width, height }, 90);
  return Buffer.from(encoded.data);
}

describe('renderTextLabel', () => {
  it('produces an RGBA image sized to the rendered glyphs', () => {
    const img = renderTextLabel('AB');
    expect(img.width).toBeGreaterThan(0);
    expect(img.height).toBeGreaterThan(0);
    expect(img.data.length).toBe(img.width * img.height * 4);
    expect(img.data[3]).toBe(255);
  });

  it('applies scaleX / scaleY', () => {
    const base = renderTextLabel('A');
    const wide = renderTextLabel('A', { scaleX: 2 });
    const tall = renderTextLabel('A', { scaleY: 2 });
    expect(wide.width).toBe(base.width * 2);
    expect(tall.height).toBe(base.height * 2);
  });

  it('applies invert by producing different pixel data for the same text', () => {
    const normal = renderTextLabel('X');
    const inverted = renderTextLabel('X', { invert: true });
    expect(normal.width).toBe(inverted.width);
    expect(normal.height).toBe(inverted.height);
    expect(Buffer.from(normal.data).equals(Buffer.from(inverted.data))).toBe(false);
  });
});

describe('loadImageFile', () => {
  it('decodes a PNG', async () => {
    const buf = makePngBuffer(3, 2, [10, 20, 30, 255]);
    const readFileFn = (): Promise<Buffer> => Promise.resolve(buf);
    const img = await loadImageFile('/fake.png', readFileFn);
    expect(img.width).toBe(3);
    expect(img.height).toBe(2);
    expect(img.data.length).toBe(3 * 2 * 4);
  });

  it('decodes a JPEG (.jpg)', async () => {
    const buf = makeJpegBuffer(4, 2, [200, 150, 100]);
    const readFileFn = (): Promise<Buffer> => Promise.resolve(buf);
    const img = await loadImageFile('/fake.jpg', readFileFn);
    expect(img.width).toBe(4);
    expect(img.height).toBe(2);
    expect(img.data.length).toBe(4 * 2 * 4);
  });

  it('decodes a JPEG (.jpeg)', async () => {
    const buf = makeJpegBuffer(2, 2, [50, 50, 50]);
    const readFileFn = (): Promise<Buffer> => Promise.resolve(buf);
    const img = await loadImageFile('/fake.jpeg', readFileFn);
    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
  });

  it('rejects an unsupported extension', async () => {
    const readFileFn = (): Promise<Buffer> => Promise.resolve(Buffer.alloc(10));
    await expect(loadImageFile('/fake.bmp', readFileFn)).rejects.toThrow(/Unsupported.*\.bmp/);
  });

  it('rejects a missing extension', async () => {
    const readFileFn = (): Promise<Buffer> => Promise.resolve(Buffer.alloc(10));
    await expect(loadImageFile('/noext', readFileFn)).rejects.toThrow(/no extension/);
  });
});

describe('renderImageLabel', () => {
  it('converts a PNG through renderImage into black/white RGBA', async () => {
    const buf = makePngBuffer(4, 2, [0, 0, 0, 255]);
    const readFileFn = (): Promise<Buffer> => Promise.resolve(buf);
    const img = await renderImageLabel('/fake.png', { threshold: 128 }, readFileFn);
    expect(img.width).toBe(4);
    expect(img.height).toBe(2);
    for (let i = 0; i < img.data.length; i += 4) {
      expect(img.data[i]).toBe(0);
      expect(img.data[i + 1]).toBe(0);
      expect(img.data[i + 2]).toBe(0);
      expect(img.data[i + 3]).toBe(255);
    }
  });

  it('passes --rotate through to renderImage (rotation swaps dimensions)', async () => {
    const buf = makePngBuffer(4, 2, [255, 255, 255, 255]);
    const readFileFn = (): Promise<Buffer> => Promise.resolve(buf);
    const rotated = await renderImageLabel('/fake.png', { rotate: 90 }, readFileFn);
    expect(rotated.width).toBe(2);
    expect(rotated.height).toBe(4);
  });

  it('passes --invert through to renderImage', async () => {
    const buf = makePngBuffer(2, 2, [0, 0, 0, 255]);
    const readFileFn = (): Promise<Buffer> => Promise.resolve(buf);
    const normal = await renderImageLabel('/fake.png', {}, readFileFn);
    const inverted = await renderImageLabel('/fake.png', { invert: true }, readFileFn);
    expect(normal.data[0]).not.toBe(inverted.data[0]);
  });
});

describe('labelBitmapToRawImageData', () => {
  it('maps set bits to black and clear bits to white', () => {
    const img = labelBitmapToRawImageData({
      widthPx: 8,
      heightPx: 1,
      data: new Uint8Array([0b1010_1010]),
    });
    expect(img.width).toBe(8);
    expect(img.height).toBe(1);
    const pixels: number[] = [];
    for (let x = 0; x < 8; x++) pixels.push(img.data[x * 4] ?? 0);
    expect(pixels).toEqual([0, 255, 0, 255, 0, 255, 0, 255]);
  });

  it('handles widths not aligned to 8 bits', () => {
    const img = labelBitmapToRawImageData({
      widthPx: 3,
      heightPx: 2,
      data: new Uint8Array([0b1010_0000, 0b0101_0000]),
    });
    expect(img.width).toBe(3);
    expect(img.height).toBe(2);
    expect(img.data.length).toBe(3 * 2 * 4);
    expect(img.data[0]).toBe(0);
    expect(img.data[4]).toBe(255);
    expect(img.data[8]).toBe(0);
  });
});
