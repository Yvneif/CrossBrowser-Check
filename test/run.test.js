import { describe, expect, it } from 'vitest';
import { evaluateStatus } from '../src/run.js';

describe('evaluateStatus', () => {
  it('marks error captures as error regardless of diff', () => {
    expect(
      evaluateStatus({ error: 'launch failed', hasBaseline: false, diffPercent: null }, 1),
    ).toBe('error');
    expect(evaluateStatus({ error: 'launch failed', hasBaseline: true, diffPercent: 50 }, 1)).toBe(
      'error',
    );
  });

  it('marks captures without a baseline as new', () => {
    expect(evaluateStatus({ error: null, hasBaseline: false, diffPercent: null }, 1)).toBe('new');
  });

  it('flags diffs over the budget as fail', () => {
    expect(evaluateStatus({ error: null, hasBaseline: true, diffPercent: 1.01 }, 1)).toBe('fail');
    expect(evaluateStatus({ error: null, hasBaseline: true, diffPercent: 12 }, 1)).toBe('fail');
  });

  it('marks diffs at or under the budget as pass', () => {
    expect(evaluateStatus({ error: null, hasBaseline: true, diffPercent: 1 }, 1)).toBe('pass');
    expect(evaluateStatus({ error: null, hasBaseline: true, diffPercent: 0 }, 1)).toBe('pass');
  });
});
