import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';

describe('parseArgs', () => {
  it('parses the command and positional url', () => {
    expect(parseArgs(['run', 'http://localhost:3000'])).toEqual({
      command: 'run',
      url: 'http://localhost:3000',
      flags: {},
    });
  });

  it('parses space-separated and equals-separated flag values', () => {
    const parsed = parseArgs([
      'run',
      'https://example.com',
      '--max-diff-percent',
      '2.5',
      '--browsers=chromium,firefox',
    ]);
    expect(parsed.flags).toEqual({ 'max-diff-percent': '2.5', browsers: 'chromium,firefox' });
  });

  it('parses boolean flags', () => {
    const parsed = parseArgs(['run', 'https://example.com', '--viewport-only', '--open']);
    expect(parsed.flags).toEqual({ 'viewport-only': true, open: true });
  });

  it('rejects unknown flags', () => {
    expect(() => parseArgs(['run', 'https://example.com', '--frobnicate'])).toThrow(/frobnicate/);
  });

  it('rejects run without a url', () => {
    expect(() => parseArgs(['run'])).toThrow(/url/i);
  });

  it('rejects unknown commands', () => {
    expect(() => parseArgs(['deploy'])).toThrow(/deploy/);
  });
});
