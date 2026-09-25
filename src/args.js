const BOOLEAN_FLAGS = new Set(['viewport-only', 'open']);

const FLAG_ALIASES = {
  browsers: 'browsers',
  viewports: 'viewports',
  'max-diff-percent': 'max-diff-percent',
  'pixelmatch-threshold': 'pixelmatch-threshold',
  'viewport-only': 'viewport-only',
  wait: 'wait',
  only: 'only',
  slug: 'slug',
  open: 'open',
  timeout: 'timeout',
};

const COMMANDS = new Set(['run', 'accept', 'report', 'help']);

/**
 * Parse CLI argv into `{ command, url, flags }`.
 *
 * Flags may be `--key value`, `--key=value`, or bare booleans (`--open`).
 * Unknown flags and missing positional arguments throw with a helpful message.
 *
 * @param {string[]} argv process.argv entries after node/script.
 */
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || !COMMANDS.has(command)) {
    throw new Error(
      `Unknown command "${command ?? ''}". Expected one of: run, accept, report, help.`,
    );
  }

  const flags = {};
  const positionals = [];
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    let name = token.slice(2);
    let value;
    const eq = name.indexOf('=');
    if (eq !== -1) {
      value = name.slice(eq + 1);
      name = name.slice(0, eq);
    }
    if (!(name in FLAG_ALIASES)) {
      throw new Error(`Unknown option "--${name}". Run "vdiff help" to list options.`);
    }
    if (BOOLEAN_FLAGS.has(name)) {
      flags[name] = value === undefined ? true : value === 'true';
      continue;
    }
    if (value === undefined) {
      value = rest[++i];
      if (value === undefined) {
        throw new Error(`Option "--${name}" requires a value.`);
      }
    }
    flags[name] = value;
  }

  let url;
  if (command === 'run') {
    url = positionals[0];
    if (!url) {
      throw new Error('"run" requires a URL, e.g. vdiff run https://example.com');
    }
  } else if (positionals.length > 0) {
    throw new Error(
      `Command "${command}" takes no positional arguments (got "${positionals[0]}").`,
    );
  }

  return { command, url, flags };
}
