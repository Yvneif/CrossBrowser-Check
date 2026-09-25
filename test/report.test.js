import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderReportHtml, writeReport } from '../src/report.js';

const tempDirs = [];

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vdiff-report-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

const runData = {
  url: 'https://example.com/page',
  slug: 'example-com-page',
  timestamp: '2026-09-14T07:00:00.000Z',
  options: { pixelmatchThreshold: 0.1, maxDiffPercent: 1 },
  results: [
    {
      combo: 'chromium-desktop',
      browser: 'chromium',
      viewport: 'desktop',
      status: 'fail',
      diffPercent: 2.5,
      diffPixels: 2560,
      totalPixels: 102400,
      sizeMismatch: false,
      error: null,
      files: { baseline: '/abs/b.png', current: '/abs/c.png', diff: '/abs/d.png' },
    },
    {
      combo: 'firefox-mobile',
      browser: 'firefox',
      viewport: 'mobile',
      status: 'pass',
      diffPercent: 0,
      diffPixels: 0,
      totalPixels: 102400,
      sizeMismatch: false,
      error: null,
      files: { baseline: '/abs/b.png', current: '/abs/c.png', diff: '/abs/d.png' },
    },
    {
      combo: 'webkit-tablet',
      browser: 'webkit',
      viewport: 'tablet',
      status: 'error',
      diffPercent: null,
      diffPixels: null,
      totalPixels: null,
      sizeMismatch: false,
      error: 'browser launch failed',
      files: { baseline: null, current: null, diff: null },
    },
  ],
  summary: { total: 3, passed: 1, failed: 1, new: 0, errors: 1 },
};

describe('renderReportHtml', () => {
  const html = renderReportHtml(runData, {
    images: {
      'chromium-desktop': {
        baseline: 'images/chromium-desktop-baseline.png',
        current: 'images/chromium-desktop-current.png',
        diff: 'images/chromium-desktop-diff.png',
      },
      'firefox-mobile': {
        baseline: 'images/firefox-mobile-baseline.png',
        current: 'images/firefox-mobile-current.png',
        diff: 'images/firefox-mobile-diff.png',
      },
      'webkit-tablet': { baseline: null, current: null, diff: null },
    },
  });

  it('embeds the run metadata', () => {
    expect(html).toContain('https://example.com/page');
    expect(html).toContain('example-com-page');
  });

  it('renders every combo', () => {
    expect(html).toContain('chromium-desktop');
    expect(html).toContain('firefox-mobile');
    expect(html).toContain('webkit-tablet');
  });

  it('shows image references and diff percentage', () => {
    expect(html).toContain('images/chromium-desktop-diff.png');
    expect(html).toContain('2.5');
  });

  it('marks failing and erroring combos', () => {
    expect(html).toContain('fail');
    expect(html).toContain('browser launch failed');
  });

  it('escapes HTML in user-provided url', () => {
    const escaped = renderReportHtml(
      { ...runData, url: 'https://example.com/<script>' },
      { images: {} },
    );
    expect(escaped).toContain('https://example.com/&lt;script&gt;');
    expect(escaped).not.toContain('example.com/<script>');
  });
});

describe('writeReport', () => {
  it('writes index.html and copies result images next to it', async () => {
    const outDir = await makeTempDir();
    const sources = await makeTempDir();
    for (const name of ['b.png', 'c.png', 'd.png']) {
      await fs.writeFile(path.join(sources, name), `data-${name}`);
    }

    const run = structuredClone(runData);
    run.results[0].files = {
      baseline: path.join(sources, 'b.png'),
      current: path.join(sources, 'c.png'),
      diff: path.join(sources, 'd.png'),
    };

    const htmlPath = await writeReport(run, { outDir });

    expect(htmlPath).toBe(path.join(outDir, 'index.html'));
    const html = await fs.readFile(htmlPath, 'utf8');
    expect(html).toContain('images/chromium-desktop-baseline.png');

    expect(
      await fs.readFile(path.join(outDir, 'images', 'chromium-desktop-diff.png'), 'utf8'),
    ).toBe('data-d.png');
  });

  it('does not fail when a result has no image files', async () => {
    const outDir = await makeTempDir();
    const htmlPath = await writeReport(structuredClone(runData), { outDir });
    const html = await fs.readFile(htmlPath, 'utf8');
    expect(html).toContain('webkit-tablet');
    await expect(fs.access(path.join(outDir, 'images'))).resolves.toBeUndefined();
  });
});
