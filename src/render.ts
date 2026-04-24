import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

import {
  renderImage as bitmapRenderImage,
  renderText as bitmapRenderText,
  type LabelBitmap,
  type RawImageData,
} from '@mbtech-nl/bitmap';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

export interface TextOptions {
  scaleX?: number;
  scaleY?: number;
  invert?: boolean;
}

export interface ImageOptions {
  threshold?: number;
  dither?: boolean;
  invert?: boolean;
  rotate?: 0 | 90 | 180 | 270;
}

export type ReadFileFn = (path: string) => Promise<Buffer>;

export function renderTextLabel(text: string, options: TextOptions = {}): RawImageData {
  const bitmap = bitmapRenderText(text, {
    scaleX: options.scaleX ?? 1,
    scaleY: options.scaleY ?? 1,
    invert: options.invert ?? false,
  });
  return labelBitmapToRawImageData(bitmap);
}

export async function renderImageLabel(
  path: string,
  options: ImageOptions = {},
  readFileFn: ReadFileFn = readFile,
): Promise<RawImageData> {
  const rgba = await loadImageFile(path, readFileFn);
  const bitmap = bitmapRenderImage(rgba, {
    threshold: options.threshold ?? 128,
    dither: options.dither ?? false,
    invert: options.invert ?? false,
    rotate: options.rotate ?? 0,
  });
  return labelBitmapToRawImageData(bitmap);
}

export async function loadImageFile(
  path: string,
  readFileFn: ReadFileFn = readFile,
): Promise<RawImageData> {
  const buf = await readFileFn(path);
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case '.png': {
      const png = PNG.sync.read(buf);
      return {
        width: png.width,
        height: png.height,
        data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength),
      };
    }
    case '.jpg':
    case '.jpeg': {
      const decoded = jpeg.decode(buf, { useTArray: true });
      const src = decoded.data;
      return {
        width: decoded.width,
        height: decoded.height,
        data: new Uint8Array(src.buffer, src.byteOffset, src.byteLength),
      };
    }
    default:
      throw new Error(
        `Unsupported image format '${ext === '' ? '(no extension)' : ext}'. Supported: PNG, JPEG.`,
      );
  }
}

export function labelBitmapToRawImageData(bitmap: LabelBitmap): RawImageData {
  const { widthPx, heightPx, data } = bitmap;
  const bytesPerRow = Math.ceil(widthPx / 8);
  const rgba = new Uint8Array(widthPx * heightPx * 4);
  for (let y = 0; y < heightPx; y++) {
    for (let x = 0; x < widthPx; x++) {
      const byte = data[y * bytesPerRow + (x >> 3)] ?? 0;
      const bit = (byte >> (7 - (x & 7))) & 1;
      const v = bit === 1 ? 0 : 255;
      const idx = (y * widthPx + x) * 4;
      rgba[idx] = v;
      rgba[idx + 1] = v;
      rgba[idx + 2] = v;
      rgba[idx + 3] = 255;
    }
  }
  return { width: widthPx, height: heightPx, data: rgba };
}
