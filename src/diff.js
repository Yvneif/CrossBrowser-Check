import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const WHITE = [255, 255, 255, 255];

function createCanvas(width, height) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = WHITE[0];
    png.data[i + 1] = WHITE[1];
    png.data[i + 2] = WHITE[2];
    png.data[i + 3] = WHITE[3];
  }
  return png;
}

/** Copy `source` into the top-left corner of a white `width`x`height` canvas. */
export function padTo(source, width, height) {
  if (source.width === width && source.height === height) return source;
  const canvas = createCanvas(width, height);
  PNG.bitblt(source, canvas, 0, 0, source.width, source.height, 0, 0);
  return canvas;
}

/**
 * Compare two PNG buffers pixel-by-pixel.
 *
 * Images of different sizes are padded with white down-right to the largest
 * width/height of the pair; the result is flagged with `sizeMismatch: true`.
 *
 * @param {Buffer} baselineBuffer
 * @param {Buffer} currentBuffer
 * @param {{ threshold?: number }} options pixelmatch color threshold (0..1).
 * @returns {{
 *   diffPercent: number,
 *   diffPixels: number,
 *   totalPixels: number,
 *   sizeMismatch: boolean,
 *   dimensions: { width: number, height: number },
 *   diffImage: PNG,
 * }}
 */
export function compareImages(baselineBuffer, currentBuffer, { threshold = 0.1 } = {}) {
  const baseline = PNG.sync.read(baselineBuffer);
  const current = PNG.sync.read(currentBuffer);

  const width = Math.max(baseline.width, current.width);
  const height = Math.max(baseline.height, current.height);
  const sizeMismatch = baseline.width !== current.width || baseline.height !== current.height;

  const paddedBaseline = padTo(baseline, width, height);
  const paddedCurrent = padTo(current, width, height);
  const diffImage = createCanvas(width, height);

  const totalPixels = width * height;
  const diffPixels = pixelmatch(
    paddedBaseline.data,
    paddedCurrent.data,
    diffImage.data,
    width,
    height,
    {
      threshold,
      diffColor: [255, 0, 0],
    },
  );

  return {
    diffPercent: totalPixels === 0 ? 0 : (diffPixels / totalPixels) * 100,
    diffPixels,
    totalPixels,
    sizeMismatch,
    dimensions: { width, height },
    diffImage,
  };
}
