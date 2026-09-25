import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { slugifyUrl, saveBaselines } from '../src/baseline.js';

const tempDirs = [];

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vdiff-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('slugifyUrl', () => {
  it('slugs host, port and path', () => {
    expect(slugifyUrl('http://localhost:8000/demo/site/index.html')).toBe(
      'localhost-8000-demo-site-index-html',
    );
  });

  it('slugs a bare domain', () => {
    expect(slugifyUrl('https://example.com')).toBe('example-com');
  });

  it('includes query strings and strips trailing separators', () => {
    expect(slugifyUrl('https://example.com/a/b?x=1')).toBe('example-com-a-b-x-1');
    expect(slugifyUrl('https://example.com/')).toBe('example-com');
  });
});

describe('saveBaselines', () => {
  it('copies all current captures for the slug into the baseline dir', async () => {
    const root = await makeTempDir();
    const shotsDir = path.join(root, 'shots', 'example-com');
    await fs.mkdir(shotsDir, { recursive: true });
    await fs.writeFile(path.join(shotsDir, 'chromium-desktop.png'), 'a');
    await fs.writeFile(path.join(shotsDir, 'firefox-mobile.png'), 'b');

    const copied = await saveBaselines({
      shotsDir: path.join(root, 'shots'),
      baselinesDir: path.join(root, 'baselines'),
      slug: 'example-com',
    });

    expect(copied.sort()).toEqual(['chromium-desktop.png', 'firefox-mobile.png']);
    expect(
      await fs.readFile(
        path.join(root, 'baselines', 'example-com', 'chromium-desktop.png'),
        'utf8',
      ),
    ).toBe('a');
    expect(
      await fs.readFile(path.join(root, 'baselines', 'example-com', 'firefox-mobile.png'), 'utf8'),
    ).toBe('b');
  });

  it('copies only the requested combos when `only` is given', async () => {
    const root = await makeTempDir();
    const shotsDir = path.join(root, 'shots', 'example-com');
    await fs.mkdir(shotsDir, { recursive: true });
    await fs.writeFile(path.join(shotsDir, 'chromium-desktop.png'), 'a');
    await fs.writeFile(path.join(shotsDir, 'firefox-mobile.png'), 'b');

    const copied = await saveBaselines({
      shotsDir: path.join(root, 'shots'),
      baselinesDir: path.join(root, 'baselines'),
      slug: 'example-com',
      only: ['chromium-desktop'],
    });

    expect(copied).toEqual(['chromium-desktop.png']);
    await expect(
      fs.readFile(path.join(root, 'baselines', 'example-com', 'firefox-mobile.png'), 'utf8'),
    ).rejects.toThrow();
  });

  it('throws a clear error when there is nothing to accept', async () => {
    const root = await makeTempDir();
    await expect(
      saveBaselines({
        shotsDir: path.join(root, 'shots'),
        baselinesDir: path.join(root, 'baselines'),
        slug: 'missing-slug',
      }),
    ).rejects.toThrow(/no captures/i);
  });
});
