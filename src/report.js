import { promises as fs } from 'node:fs';
import path from 'node:path';

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const STATUS_LABELS = {
  pass: 'PASS',
  fail: 'FAIL',
  new: 'NEW',
  error: 'ERROR',
};

function statusPill(status) {
  return `<span class="pill ${esc(status)}">${STATUS_LABELS[status] ?? esc(status)}</span>`;
}

function formatPercent(value) {
  return value === null || value === undefined ? '—' : `${value.toFixed(3)}%`;
}

function formatPixels(result) {
  if (result.diffPixels === null || result.diffPixels === undefined) return '';
  return `${result.diffPixels.toLocaleString()} px of ${result.totalPixels.toLocaleString()}`;
}

function imagePanel(url, kind, label) {
  if (!url) {
    return `<figure class="panel empty"><figcaption>${esc(label)}</figcaption><div class="missing">n/a</div></figure>`;
  }
  return `<figure class="panel">
    <figcaption>${esc(label)}</figcaption>
    <a href="${esc(url)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(url)}" alt="${esc(kind)}" /></a>
  </figure>`;
}

function sliderCard(result, images) {
  if (!images.baseline || !images.current) return '';
  return `<div class="slider">
    <div class="slider-frame">
      <img src="${esc(images.baseline)}" alt="baseline" />
      <img class="overlay" src="${esc(images.current)}" alt="current" data-slider-overlay />
      <span class="slider-tag left">baseline</span>
      <span class="slider-tag right">current</span>
    </div>
    <input type="range" min="0" max="100" value="50" data-slider />
  </div>`;
}

function resultCard(result, images, options) {
  const flagged = result.status === 'fail';
  const note = result.sizeMismatch
    ? '<p class="note">Image sizes differ between baseline and capture (content height/width changed) — compared on a padded canvas.</p>'
    : '';
  const errorBlock = result.error ? `<p class="error-detail">${esc(result.error)}</p>` : '';

  return `<article class="card ${esc(result.status)}">
    <header>
      <h3>${esc(result.combo)}</h3>
      <div class="meta">
        <span class="diff-percent ${flagged ? 'flagged' : ''}">${formatPercent(result.diffPercent)}</span>
        ${statusPill(result.status)}
      </div>
    </header>
    <p class="pixels">${esc(formatPixels(result))}${flagged ? ` &middot; over ${esc(options.maxDiffPercent)}% budget` : ''}</p>
    ${errorBlock}${note}
    <div class="panels">
      ${imagePanel(images.baseline, 'baseline', 'Baseline')}
      ${imagePanel(images.current, 'current', 'Current')}
      ${imagePanel(images.diff, 'diff', 'Diff overlay')}
    </div>
    ${sliderCard(result, images)}
  </article>`;
}

const SCRIPT = `
document.querySelectorAll('[data-slider]').forEach(function (input) {
  input.addEventListener('input', function () {
    var overlay = input.parentElement.querySelector('[data-slider-overlay]');
    if (overlay) overlay.style.clipPath = 'inset(0 ' + (100 - input.value) + '% 0 0)';
  });
});
`;

const STYLES = `
:root {
  --bg: #0f1117; --panel: #171a23; --border: #262b3a; --text: #e6e9f2; --muted: #8b93a7;
  --pass: #2fbf71; --fail: #e5484d; --new: #3b82f6; --error: #f5a524; --accent: #7c6cf6;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
.wrap { max-width: 1280px; margin: 0 auto; padding: 32px 24px 64px; }
header.run h1 { margin: 0 0 4px; font-size: 22px; }
header.run .url { color: var(--accent); font-family: ui-monospace, monospace; font-size: 14px; word-break: break-all; }
header.run .stamp { color: var(--muted); font-size: 13px; margin-top: 4px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; margin: 16px 0 8px; }
.chip { background: var(--panel); border: 1px solid var(--border); border-radius: 999px; padding: 4px 12px; font-size: 13px; color: var(--muted); }
.chip b { color: var(--text); }
.chip.pass b { color: var(--pass); } .chip.fail b { color: var(--fail); }
.chip.new b { color: var(--new); } .chip.error b { color: var(--error); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 20px; margin-top: 24px; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.card.fail { border-color: color-mix(in srgb, var(--fail) 55%, var(--border)); }
.card.error { border-color: color-mix(in srgb, var(--error) 55%, var(--border)); }
.card header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.card h3 { margin: 0; font-size: 15px; font-family: ui-monospace, monospace; }
.card .meta { display: flex; align-items: center; gap: 8px; }
.diff-percent { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.diff-percent.flagged { color: var(--fail); font-weight: 600; }
.pill { font-size: 11px; font-weight: 700; letter-spacing: .04em; border-radius: 999px; padding: 3px 10px; }
.pill.pass { background: color-mix(in srgb, var(--pass) 18%, transparent); color: var(--pass); }
.pill.fail { background: color-mix(in srgb, var(--fail) 18%, transparent); color: var(--fail); }
.pill.new { background: color-mix(in srgb, var(--new) 18%, transparent); color: var(--new); }
.pill.error { background: color-mix(in srgb, var(--error) 18%, transparent); color: var(--error); }
.pixels { margin: 6px 0 0; color: var(--muted); font-size: 12.5px; min-height: 1em; }
.error-detail { margin: 8px 0 0; color: var(--error); font-size: 13px; }
.note { margin: 8px 0 0; color: var(--error); font-size: 12.5px; }
.panels { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; }
.panel { margin: 0; min-width: 0; }
.panel figcaption { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: 4px; }
.panel img { width: 100%; height: 130px; object-fit: contain; object-position: top left; background: #fff; border: 1px solid var(--border); border-radius: 6px; display: block; }
.panel.empty .missing { height: 130px; display: grid; place-items: center; color: var(--muted); background: var(--bg); border: 1px dashed var(--border); border-radius: 6px; font-size: 12px; }
.slider { margin-top: 14px; }
.slider-frame { position: relative; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; background: #fff; }
.slider-frame img { display: block; width: 100%; }
.slider-frame .overlay { position: absolute; inset: 0; clip-path: inset(0 50% 0 0); }
.slider-tag { position: absolute; top: 6px; font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; background: rgba(15,17,23,.75); color: #fff; border-radius: 4px; padding: 2px 6px; }
.slider-tag.left { left: 6px; } .slider-tag.right { right: 6px; }
.slider input[type="range"] { width: 100%; margin-top: 8px; accent-color: var(--accent); }
footer.run { margin-top: 32px; color: var(--muted); font-size: 12.5px; border-top: 1px solid var(--border); padding-top: 16px; }
footer.run code { background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; }
`;

/**
 * Render the HTML gallery report as a string.
 *
 * @param {object} runData run metadata + results (see run.js).
 * @param {{ images: Record<string, {baseline: string|null, current: string|null, diff: string|null}> }} refs
 *   report-relative image URLs per combo.
 */
export function renderReportHtml(runData, { images }) {
  const { summary, options } = runData;
  const cards = runData.results
    .map((result) => resultCard(result, images[result.combo] ?? {}, options))
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Visual diff — ${esc(runData.slug)}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="wrap">
  <header class="run">
    <h1>Cross-browser visual diff</h1>
    <div class="url">${esc(runData.url)}</div>
    <div class="stamp">${esc(runData.slug)} &middot; ${esc(runData.timestamp)}</div>
    <div class="chips">
      <span class="chip"><b>${summary.total}</b> combos</span>
      <span class="chip pass">passed <b>${summary.passed}</b></span>
      <span class="chip fail">flagged <b>${summary.failed}</b></span>
      <span class="chip new">new <b>${summary.new}</b></span>
      <span class="chip error">errors <b>${summary.errors}</b></span>
      <span class="chip">flag when diff &gt; <b>${esc(options.maxDiffPercent)}%</b></span>
      <span class="chip">pixelmatch threshold <b>${esc(options.pixelmatchThreshold)}</b></span>
    </div>
  </header>
  <main class="grid">
${cards}
  </main>
  <footer class="run">
    Diff highlighting: changed pixels are drawn in red over a faded baseline. Accept the current captures with
    <code>vdiff accept</code> to promote them to the new baseline.
  </footer>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

/**
 * Copy result images into the report folder and write the HTML gallery.
 *
 * @param {object} runData results whose `files` entries are absolute source paths (or null).
 * @param {{ outDir: string }} options
 * @returns {Promise<string>} path of the written `index.html`.
 */
export async function writeReport(runData, { outDir }) {
  const imagesDir = path.join(outDir, 'images');
  await fs.mkdir(imagesDir, { recursive: true });

  const imageUrls = {};
  for (const result of runData.results) {
    imageUrls[result.combo] = { baseline: null, current: null, diff: null };
    for (const kind of ['baseline', 'current', 'diff']) {
      const source = result.files?.[kind];
      if (!source) continue;
      const fileName = `${result.combo}-${kind}.png`;
      try {
        await fs.copyFile(source, path.join(imagesDir, fileName));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        continue; // source vanished between run and report — render the panel as n/a
      }
      imageUrls[result.combo][kind] = `images/${fileName}`;
    }
  }

  const html = renderReportHtml(runData, { images: imageUrls });
  const htmlPath = path.join(outDir, 'index.html');
  await fs.writeFile(htmlPath, html);
  return htmlPath;
}
