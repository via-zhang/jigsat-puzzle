import { describe, expect, it } from 'vitest';
import {
  buildIndexExpression,
  decodeIndexByte,
  getBoaOffset,
  interpolateColor,
  isCloudClass,
  normalizedDifferenceExpression,
  stopsToCssGradient,
} from './spectralIndices';
import { VISUALIZATION_MODES } from '../constants';

/** Evaluates a generated expression the way the tile server would (numexpr subset). */
const evaluate = (expr: string, bands: Record<string, number>): number => {
  const js = expr
    .replace(/where\(/g, '__where(')
    .replace(/\b(B\d{2})\b/g, (_, b) => String(bands[b]));
  return new Function('__where', `return ${js};`)((c: boolean, a: number, b: number) => (c ? a : b));
};

describe('getBoaOffset', () => {
  it('uses the processing baseline when present', () => {
    expect(getBoaOffset({ properties: { datetime: '2025-03-20T16:05:09Z', 's2:processing_baseline': '05.11' } })).toBe(1000);
    expect(getBoaOffset({ properties: { datetime: '2025-03-20T16:05:09Z', 's2:processing_baseline': '04.00' } })).toBe(1000);
    expect(getBoaOffset({ properties: { datetime: '2021-06-01T16:05:09Z', 's2:processing_baseline': '03.00' } })).toBe(0);
  });

  it('falls back to the acquisition date', () => {
    expect(getBoaOffset({ properties: { datetime: '2022-01-25T00:00:00Z' } })).toBe(1000);
    expect(getBoaOffset({ properties: { datetime: '2021-12-31T00:00:00Z' } })).toBe(0);
  });
});

describe('normalizedDifferenceExpression', () => {
  const ndvi = normalizedDifferenceExpression('B08', 'B04', 1000);

  it('removes the BOA offset before computing the ratio', () => {
    // Vegetation: NIR reflectance 0.40, red 0.04  ->  NDVI = 0.36 / 0.44
    const value = evaluate(ndvi, { B08: 1000 + 4000, B04: 1000 + 400 });
    expect(value).toBeCloseTo(0.36 / 0.44, 6);
    // Without the correction the same pixel reads only ~0.56.
    expect((5000 - 1400) / (5000 + 1400)).toBeLessThan(value);
  });

  it('never divides by zero for pixels at or below the offset', () => {
    expect(evaluate(ndvi, { B08: 1000, B04: 1000 })).toBe(0);
    expect(evaluate(ndvi, { B08: 900, B04: 950 })).toBe(0);
    expect(Number.isFinite(evaluate(ndvi, { B08: 1000, B04: 1300 }))).toBe(true);
  });

  it('works for products without an offset', () => {
    const noOffset = normalizedDifferenceExpression('B08', 'B04', 0);
    expect(evaluate(noOffset, { B08: 3000, B04: 1000 })).toBeCloseTo(0.5, 6);
  });

  it('builds NDVI;NDWI;NDBI in that channel order', () => {
    const parts = buildIndexExpression(1000).split(';');
    expect(parts).toHaveLength(3);
    const px = { B03: 1000 + 800, B04: 1000 + 600, B08: 1000 + 3000, B11: 1000 + 1800 };
    expect(evaluate(parts[0], px)).toBeCloseTo((3000 - 600) / 3600, 6);
    expect(evaluate(parts[1], px)).toBeCloseTo((800 - 3000) / 3800, 6);
    expect(evaluate(parts[2], px)).toBeCloseTo((1800 - 3000) / 4800, 6);
  });
});

describe('decodeIndexByte', () => {
  it('inverts rescale=-1,1', () => {
    expect(decodeIndexByte(0)).toBe(-1);
    expect(decodeIndexByte(255)).toBe(1);
    expect(decodeIndexByte(128)).toBeCloseTo(0, 2);
  });
});

describe('interpolateColor', () => {
  const stops = [
    { pos: -0.2, hex: '#ff0000' },
    { pos: 0.8, hex: '#0000ff' },
  ];

  it('clamps values below the first stop to the first colour', () => {
    // Regression: these used to get the *last* colour (water rendered as dense vegetation).
    expect(interpolateColor(-0.9, stops)).toEqual([255, 0, 0]);
  });

  it('clamps values above the last stop', () => {
    expect(interpolateColor(1, stops)).toEqual([0, 0, 255]);
  });

  it('interpolates between stops', () => {
    expect(interpolateColor(0.3, stops)).toEqual([128, 0, 128]);
  });

  it('returns null for non-finite values', () => {
    expect(interpolateColor(NaN, stops)).toBeNull();
    expect(interpolateColor(Infinity, stops)).toBeNull();
  });
});

describe('legend', () => {
  it('places gradient stops at their true positions', () => {
    const g = stopsToCssGradient([
      { pos: -0.5, hex: '#000000' },
      { pos: 0, hex: '#888888' },
      { pos: 1.5, hex: '#ffffff' },
    ]);
    expect(g).toBe('linear-gradient(to right, #000000 0.0%, #888888 25.0%, #ffffff 100.0%)');
  });

  it('every index mode has ascending stops', () => {
    for (const mode of ['NDVI', 'NDWI', 'NDBI'] as const) {
      const stops = VISUALIZATION_MODES[mode].stops;
      expect(stops.length).toBeGreaterThan(1);
      for (let i = 1; i < stops.length; i++) expect(stops[i].pos).toBeGreaterThan(stops[i - 1].pos);
    }
  });
});

describe('cloud mask', () => {
  it('masks cloud, shadow, cirrus and defective classes only', () => {
    expect([1, 3, 8, 9, 10].every(isCloudClass)).toBe(true);
    expect([0, 2, 4, 5, 6, 7, 11].some(isCloudClass)).toBe(false);
  });
});
