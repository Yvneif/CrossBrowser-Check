import { promises as fs } from 'node:fs';
import { PNG } from 'pngjs';
import { compareImages } from './diff.js';
import { captureAll, BROWSERS, VIEWPORT_PRESETS } from './capture.js';
import { slugifyUrl, baselinePath } from './baseline.js';

/**
 * Decide the status of a single capture.
 *
 * @param {{ error: string|null, hasBaseline: boolean, diffPercent: number|null }} capture
 * @param {number} maxDiffPercent budget above which a combo is flagged
 * @returns {'error'|'new'|'fail'|'pass'}
 */
export function evaluateStatus({ error, hasBaseline, diffPercent }, maxDiffPercent) {
  if (error) return 'error';
  if (!hasBaseline) return 'new';
  return diffPercent > maxDiffPercent ? 'fail' : 'pass';
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run the full pipeline for one URL: capture across browsers/viewports,
 * compare each capture against its baseline, and assemble the run data.
 *
 * Exit-code convention: 0 = all pass/new, 1 = at least one combo flagged,
 * 2 = at least one capture error.
 *
 * @param {object} options
 * @param {string} options.url
 * @param {string[]} [options.browsers] defaults to all three
 * @param {string[]} [options.viewports] preset/custom entries, defaults to all three presets
 * @param {string} options.shotsDir
 * @param {string} options.baselinesDir
 * @param {number} [options.pixelmatchThreshold=0.1]
 * @param {number} [options.maxDiffPercent=1]
 * @param {boolean} [options.fullPage=true]
 * @param {number} [options.waitMs=500]
 * @param {number} [options.timeoutMs=30000]
 * @param {(message: string) => void} [options.onProgress]
 * @returns {Promise<{ runData: object, exitCode: number }>}
 */
export async function runComparison({
  url,
  browsers = BROWSERS,
  viewports = Object.keys(VIEWPORT_PRESETS),
  shotsDir,
  baselinesDir,
  pixelmatchThreshold = 0.1,
  maxDiffPercent = 1,
  fullPage = true,
  waitMs = 500,
  timeoutMs = 30000,
  onProgress = () => {},
}) {
  const slug = slugifyUrl(url);
  const captures = await captureAll({
    url,
    browsers,
    viewports,
    shotsDir,
    slug,
    fullPage,
    waitMs,
    timeoutMs,
    onProgress,
  });

  const results = [];
  for (const capture of captures) {
    const baselineFile = baselinePath(baselinesDir, slug, capture.combo);
    const hasBaseline = capture.file !== null && (await fileExists(baselineFile));

    let diffPercent = null;
    let diffPixels = null;
    let totalPixels = null;
    let sizeMismatch = false;
    let diffFile = null;

    if (capture.file && hasBaseline) {
      const [baselineBuffer, currentBuffer] = await Promise.all([
        fs.readFile(baselineFile),
        fs.readFile(capture.file),
      ]);
      const comparison = compareImages(baselineBuffer, currentBuffer, {
        threshold: pixelmatchThreshold,
      });
      diffPercent = comparison.diffPercent;
      diffPixels = comparison.diffPixels;
      totalPixels = comparison.totalPixels;
      sizeMismatch = comparison.sizeMismatch;
      diffFile = capture.file.replace(/\.png$/, '-diff.png');
      await fs.writeFile(diffFile, PNG.sync.write(comparison.diffImage));
    }

    const status = evaluateStatus(
      { error: capture.error, hasBaseline, diffPercent },
      maxDiffPercent,
    );

    results.push({
      combo: capture.combo,
      browser: capture.browser,
      viewport: capture.viewport,
      status,
      diffPercent,
      diffPixels,
      totalPixels,
      sizeMismatch,
      error: capture.error,
      files: {
        baseline: hasBaseline ? baselineFile : null,
        current: capture.file,
        diff: diffFile,
      },
    });
  }

  const summary = {
    total: results.length,
    passed: results.filter((r) => r.status === 'pass').length,
    failed: results.filter((r) => r.status === 'fail').length,
    new: results.filter((r) => r.status === 'new').length,
    errors: results.filter((r) => r.status === 'error').length,
  };

  const runData = {
    url,
    slug,
    timestamp: new Date().toISOString(),
    options: { pixelmatchThreshold, maxDiffPercent },
    results,
    summary,
  };

  const exitCode = summary.errors > 0 ? 2 : summary.failed > 0 ? 1 : 0;
  return { runData, exitCode };
}
