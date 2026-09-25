#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parseArgs } from './args.js';
import { runComparison } from './run.js';
import { BROWSERS, VIEWPORT_PRESETS, resolveViewports } from './capture.js';
import { saveBaselines } from './baseline.js';
import { writeReport } from './report.js';

const SHOTS_DIR = 'shots';
const BASELINES_DIR = 'baselines';
const REPORT_DIR = 'report';
const RESULTS_FILE = 'results.json';

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  blue: (s) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

const STATUS_STYLE = {
  pass: (s) => c.green(s),
  fail: (s) => c.red(s),
  new: (s) => c.blue(s),
  error: (s) => c.yellow(s),
};

const HELP = `
${c.bold('vdiff')} — cross-browser visual regression checking

${c.bold('Usage')}
  vdiff run <url> [options]     capture, compare against baseline, write report
  vdiff accept [options]        promote the latest captures to the baseline
  vdiff report                  regenerate the HTML report from the last run
  vdiff help                    show this help

${c.bold('Options')}
  --browsers <list>             comma-separated subset of ${BROWSERS.join(',')} (default: all)
  --viewports <list>            presets (${Object.keys(VIEWPORT_PRESETS).join(',')}) or WxH sizes (default: all presets)
  --max-diff-percent <n>        flag combos whose diff exceeds this percent (default: 1)
  --pixelmatch-threshold <n>    per-pixel color sensitivity 0..1 (default: 0.1)
  --viewport-only               capture only the viewport, not the full page
  --wait <ms>                   settle delay after network idle (default: 500)
  --timeout <ms>                navigation timeout (default: 30000)
  --only <list>                 (accept) promote only these combos, e.g. chromium-desktop
  --slug <slug>                 (accept) operate on this slug instead of the last run
  --open                        (run) open the report in the default browser

${c.bold('Exit codes (run)')}
  0  all combos passed or are new
  1  at least one combo exceeded the diff budget
  2  at least one capture failed (browser launch, navigation, …)

Artifacts are written relative to the current directory:
  shots/       current captures + generated diff overlays
  baselines/   accepted reference screenshots
  report/      HTML gallery (index.html) + results.json
`;

function printSummary(runData) {
  console.log('');
  for (const result of runData.results) {
    const line = `  ${result.combo.padEnd(24)} ${result.status.toUpperCase().padEnd(6)} ${
      result.diffPercent === null
        ? ''
        : `${result.diffPercent.toFixed(3)}%  (${result.diffPixels.toLocaleString()} px)`
    }`;
    console.log((STATUS_STYLE[result.status] ?? ((s) => s))(line));
    if (result.status === 'new') {
      console.log(c.dim(`  ${' '.repeat(24)} no baseline yet — run "vdiff accept" to create one`));
    }
    if (result.status === 'error') {
      console.log(c.dim(`  ${' '.repeat(24)} ${result.error}`));
    }
  }
  const { summary } = runData;
  console.log(
    `\n  ${summary.total} combos: ${summary.passed} passed, ${summary.failed} flagged, ${summary.new} new, ${summary.errors} errors\n`,
  );
}

function openInBrowser(file) {
  const command =
    process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', file] : [file];
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

async function readLastResults() {
  const file = path.resolve(REPORT_DIR, RESULTS_FILE);
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const { command, url, flags } = parseArgs(process.argv.slice(2));

  if (command === 'help') {
    console.log(HELP);
    return 0;
  }

  if (command === 'accept') {
    let slug = flags.slug;
    if (!slug) {
      const last = await readLastResults();
      slug = last.slug;
    }
    const copied = await saveBaselines({
      shotsDir: path.resolve(SHOTS_DIR),
      baselinesDir: path.resolve(BASELINES_DIR),
      slug,
      only: flags.only
        ? String(flags.only)
            .split(',')
            .map((s) => s.trim())
        : null,
    });
    console.log(
      c.green(`\n  Accepted ${copied.length} capture(s) as the new baseline for "${slug}":`),
    );
    for (const name of copied) console.log(`    • ${name}`);
    console.log(c.dim('\n  Re-run "vdiff run <url>" to verify everything passes.\n'));
    return 0;
  }

  if (command === 'report') {
    const last = await readLastResults();
    const htmlPath = await writeReport(last, { outDir: path.resolve(REPORT_DIR) });
    console.log(c.green(`\n  Report regenerated: ${htmlPath}\n`));
    if (flags.open) openInBrowser(htmlPath);
    return 0;
  }

  // command === 'run'
  const viewports = resolveViewports(
    flags.viewports
      ? String(flags.viewports)
          .split(',')
          .map((s) => s.trim())
      : Object.keys(VIEWPORT_PRESETS),
  );
  const browsers = flags.browsers
    ? String(flags.browsers)
        .split(',')
        .map((s) => s.trim().toLowerCase())
    : [...BROWSERS];

  console.log(`\n${c.bold('vdiff run')} ${c.dim(url)}`);
  const { runData, exitCode } = await runComparison({
    url,
    browsers,
    viewports,
    shotsDir: path.resolve(SHOTS_DIR),
    baselinesDir: path.resolve(BASELINES_DIR),
    pixelmatchThreshold: Number(flags['pixelmatch-threshold'] ?? 0.1),
    maxDiffPercent: Number(flags['max-diff-percent'] ?? 1),
    fullPage: !flags['viewport-only'],
    waitMs: Number(flags.wait ?? 500),
    timeoutMs: Number(flags.timeout ?? 30000),
    onProgress: (message) => console.log(c.dim(`  ${message}`)),
  });

  printSummary(runData);

  const reportPath = path.resolve(REPORT_DIR);
  await fs.mkdir(reportPath, { recursive: true });
  await fs.writeFile(path.join(reportPath, RESULTS_FILE), JSON.stringify(runData, null, 2));
  const htmlPath = await writeReport(runData, { outDir: reportPath });
  console.log(c.dim(`  report: ${htmlPath}\n`));

  if (flags.open) openInBrowser(htmlPath);
  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`\n  ${c.red('error:')} ${error.message}\n`);
    process.exit(2);
  });
