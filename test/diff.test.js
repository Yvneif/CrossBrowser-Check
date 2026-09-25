import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { compareImages } from '../src/diff.js';

function solidPng(width, height, [r, g, b]) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

function withPixel(buffer, width, x, y, [r, g, b]) {
  const png = PNG.sync.read(buffer);
  const idx = (y * width + x) * 4;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = 255;
  return PNG.sync.write(png);
}

describe('compareImages', () => {
  it('reports zero difference for identical images', () => {
    const image = solidPng(10, 10, [200, 100, 50]);
    const result = compareImages(image, image);

    expect(result.diffPixels).toBe(0);
    expect(result.diffPercent).toBe(0);
    expect(result.sizeMismatch).toBe(false);
    expect(result.totalPixels).toBe(100);
  });

  it('detects a single changed pixel', () => {
    const baseline = solidPng(10, 10, [200, 100, 50]);
    const current = withPixel(baseline, 10, 3, 4, [10, 250, 10]);
    const result = compareImages(baseline, current);

    expect(result.diffPixels).toBe(1);
    expect(result.diffPercent).toBeCloseTo(1, 5);
    expect(result.sizeMismatch).toBe(false);
  });

  it('computes diffPercent against the comparison canvas size', () => {
    const baseline = solidPng(20, 10, [200, 100, 50]);
    const current = solidPng(20, 10, [200, 100, 50]);
    const changed = withPixel(current, 20, 0, 0, [250, 10, 10]);
    const changed2 = withPixel(changed, 20, 19, 9, [250, 10, 10]);
    const result = compareImages(baseline, changed2);

    expect(result.diffPixels).toBe(2);
    expect(result.diffPercent).toBeCloseTo(1, 5); // 2 of 200 pixels
  });

  it('flags size mismatch and diffs over the padded canvas', () => {
    const baseline = solidPng(4, 4, [220, 30, 30]);
    const current = solidPng(4, 6, [220, 30, 30]);
    const result = compareImages(baseline, current);

    expect(result.sizeMismatch).toBe(true);
    // baseline padded with white rows 4-5; current is red there -> 8 differing pixels
    expect(result.diffPixels).toBe(8);
    expect(result.totalPixels).toBe(24);
    expect(result.diffPercent).toBeCloseTo(33.333333, 4);
    expect(result.dimensions).toEqual({ width: 4, height: 6 });
  });

  it('produces a diff image with red highlight at changed pixels', () => {
    const baseline = solidPng(10, 10, [200, 100, 50]);
    const current = withPixel(baseline, 10, 5, 5, [10, 250, 10]);
    const result = compareImages(baseline, current);

    expect(result.diffImage).toBeInstanceOf(PNG);
    expect(result.diffImage.width).toBe(10);
    expect(result.diffImage.height).toBe(10);

    const idx = (5 * 10 + 5) * 4;
    const [r, g, b] = [
      result.diffImage.data[idx],
      result.diffImage.data[idx + 1],
      result.diffImage.data[idx + 2],
    ];
    expect(r).toBeGreaterThan(150);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it('returns a zero-diff image for identical input', () => {
    const image = solidPng(8, 8, [0, 0, 255]);
    const result = compareImages(image, image);

    expect(result.diffImage).toBeInstanceOf(PNG);
    expect(result.diffImage.width).toBe(8);
  });
});
