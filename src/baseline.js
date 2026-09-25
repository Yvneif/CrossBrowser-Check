import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Convert a URL into a filesystem-safe directory slug, e.g. `localhost-8000-demo-index-html`. */
export function slugifyUrl(url) {
  const parsed = new URL(url);
  const raw = [parsed.host, parsed.pathname, parsed.search].join('');
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'site';
}

/**
 * Promote current captures to baseline. Copies `shots/<slug>/*.png` into
 * `baselines/<slug>/`, optionally restricted to the given combo names.
 *
 * @returns {Promise<string[]>} names of the files copied (e.g. `chromium-desktop.png`).
 */
export async function saveBaselines({ shotsDir, baselinesDir, slug, only = null }) {
  const sourceDir = path.join(shotsDir, slug);
  const targetDir = path.join(baselinesDir, slug);

  let entries;
  try {
    entries = (await fs.readdir(sourceDir)).filter((name) => name.endsWith('.png'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `No captures found for slug "${slug}" in ${sourceDir} — run a capture first.`,
        { cause: error },
      );
    }
    throw error;
  }
  if (entries.length === 0) {
    throw new Error(`No captures found for slug "${slug}" in ${sourceDir} — run a capture first.`);
  }

  const wanted = only
    ? entries.filter((name) => only.includes(name.replace(/\.png$/, '')))
    : entries;
  await fs.mkdir(targetDir, { recursive: true });
  for (const name of wanted) {
    await fs.copyFile(path.join(sourceDir, name), path.join(targetDir, name));
  }
  return wanted;
}

/** Full path of the baseline file for a given combo. */
export function baselinePath(baselinesDir, slug, combo) {
  return path.join(baselinesDir, slug, `${combo}.png`);
}
