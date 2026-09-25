import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium, firefox, webkit } from 'playwright';

export const BROWSERS = ['chromium', 'firefox', 'webkit'];

export const VIEWPORT_PRESETS = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 },
};

const ENGINES = { chromium, firefox, webkit };

/**
 * Expand a viewport list into resolved sizes. Entries are preset names
 * (`desktop`, `tablet`, `mobile`) or custom `WxH` sizes (e.g. `1440x900`).
 *
 * @param {string[]} entries
 * @returns {{ name: string, width: number, height: number }[]}
 */
export function resolveViewports(entries) {
  const validNames = Object.keys(VIEWPORT_PRESETS).join(', ');
  return entries.map((entry) => {
    const preset = VIEWPORT_PRESETS[entry.toLowerCase()];
    if (preset) return { name: entry.toLowerCase(), ...preset };

    const match = /^(\d{2,5})x(\d{2,5})$/i.exec(entry);
    if (!match) {
      throw new Error(
        `Invalid viewport "${entry}". Use a preset (${validNames}) or a WxH size like 1440x900.`,
      );
    }
    const width = Number(match[1]);
    const height = Number(match[2]);
    return { name: `${width}x${height}`, width, height };
  });
}

function comboName(browser, viewport) {
  return `${browser}-${viewport.name}`;
}

/**
 * Capture screenshots of `url` for every browser/viewport combination.
 * A failed launch or navigation is recorded per combo; other combos continue.
 *
 * @param {object} options
 * @param {string} options.url
 * @param {string[]} options.browsers subset of BROWSERS
 * @param {{ name: string, width: number, height: number }[]} options.viewports resolved viewports
 * @param {string} options.shotsDir root directory for captures
 * @param {string} options.slug directory name for this URL's captures
 * @param {boolean} [options.fullPage=true]
 * @param {number} [options.waitMs=500] settle delay after network idle
 * @param {number} [options.timeoutMs=30000] navigation timeout
 * @param {(message: string) => void} [options.onProgress]
 * @returns {Promise<{ combo: string, browser: string, viewport: string, file: string|null, error: string|null }[]>}
 */
export async function captureAll({
  url,
  browsers,
  viewports,
  shotsDir,
  slug,
  fullPage = true,
  waitMs = 500,
  timeoutMs = 30000,
  onProgress = () => {},
}) {
  const outDir = path.join(shotsDir, slug);
  const results = [];

  for (const browserName of browsers) {
    const engine = ENGINES[browserName];
    if (!engine) {
      for (const viewport of viewports) {
        results.push({
          combo: comboName(browserName, viewport),
          browser: browserName,
          viewport: viewport.name,
          file: null,
          error: `Unknown browser "${browserName}"`,
        });
      }
      continue;
    }

    let browser;
    try {
      browser = await engine.launch();
    } catch (error) {
      for (const viewport of viewports) {
        results.push({
          combo: comboName(browserName, viewport),
          browser: browserName,
          viewport: viewport.name,
          file: null,
          error: `Failed to launch ${browserName}: ${error.message.split('\n')[0]}`,
        });
      }
      continue;
    }

    try {
      for (const viewport of viewports) {
        const combo = comboName(browserName, viewport);
        onProgress(`capturing ${combo}…`);
        try {
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            deviceScaleFactor: 1,
            reducedMotion: 'reduce',
          });
          const page = await context.newPage();
          await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
          await page.waitForTimeout(waitMs);
          const buffer = await page.screenshot({ fullPage, animations: 'disabled' });
          await fs.mkdir(outDir, { recursive: true });
          const file = path.join(outDir, `${combo}.png`);
          await fs.writeFile(file, buffer);
          await context.close();
          results.push({ combo, browser: browserName, viewport: viewport.name, file, error: null });
        } catch (error) {
          results.push({
            combo,
            browser: browserName,
            viewport: viewport.name,
            file: null,
            error: error.message.split('\n')[0],
          });
        }
      }
    } finally {
      await browser.close();
    }
  }

  return results;
}
