import { describe, expect, it } from 'vitest';
import { resolveViewports } from '../src/capture.js';

describe('resolveViewports', () => {
  it('expands preset names to pixel dimensions', () => {
    expect(resolveViewports(['desktop'])).toEqual([{ name: 'desktop', width: 1280, height: 800 }]);
    expect(resolveViewports(['tablet', 'mobile'])).toEqual([
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'mobile', width: 375, height: 667 },
    ]);
  });

  it('accepts custom WxH sizes', () => {
    expect(resolveViewports(['1440x900'])).toEqual([
      { name: '1440x900', width: 1440, height: 900 },
    ]);
  });

  it('mixes presets and custom sizes', () => {
    expect(resolveViewports(['mobile', '800x600'])).toEqual([
      { name: 'mobile', width: 375, height: 667 },
      { name: '800x600', width: 800, height: 600 },
    ]);
  });

  it('rejects unknown presets and malformed sizes', () => {
    expect(() => resolveViewports(['fridge'])).toThrow(/fridge/);
    expect(() => resolveViewports(['800'])).toThrow(/800/);
    expect(() => resolveViewports(['axb'])).toThrow(/axb/);
  });
});
