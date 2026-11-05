/**
 * Pure helpers for spectral-index maths and colouring.
 *
 * Kept free of DOM/network code so it can be unit-tested.
 */

/** A colour stop on an index colour ramp. `pos` is an index value in [-1, 1]. */
export interface ColorStop {
  pos: number;
  hex: string;
}

export type RGB = [number, number, number];

/**
 * Sentinel-2 L2A products from processing baseline 04.00 onwards (25 Jan 2022)
 * store reflectance as DN = reflectance * 10000 + 1000. Planetary Computer serves
 * these values unchanged, so the 1000 offset has to be removed before computing
 * a normalized difference. Older products have no offset.
 */
export const BOA_ADD_OFFSET = 1000;
const OFFSET_START_DATE = '2022-01-25';

export const getBoaOffset = (item: {
  properties: { datetime: string; 's2:processing_baseline'?: string };
}): number => {
  const baseline = parseFloat(item.properties['s2:processing_baseline'] ?? '');
  if (!Number.isNaN(baseline)) {
    return baseline >= 4 ? BOA_ADD_OFFSET : 0;
  }
  // Fall back to the acquisition date when the baseline is missing.
  return item.properties.datetime.slice(0, 10) >= OFFSET_START_DATE ? BOA_ADD_OFFSET : 0;
};

/**
 * Builds the server-side (TiTiler / numexpr) expression for one normalized
 * difference, (a - b) / (a + b), on offset-corrected reflectance.
 *
 * Each band is converted with `where(B > offset + 1, B - offset, 1)`: this removes
 * the offset and floors reflectance at a tiny positive value (0.0001), so the
 * denominator is never zero or negative for very dark pixels (water, shadows).
 */
export const normalizedDifferenceExpression = (a: string, b: string, offset: number): string => {
  const refl = (band: string) => `where(${band}>${offset + 1},${band}-${offset},1)`;
  return `(${refl(a)}-${refl(b)})/(${refl(a)}+${refl(b)})`;
};

/**
 * Three-band expression returned as one RGBA PNG:
 *   R = NDVI  (B08, B04)
 *   G = NDWI  (B03, B08)  -- McFeeters
 *   B = NDBI  (B11, B08)
 * Each band is linearly rescaled from [-1, 1] to [0, 255]; alpha is the no-data mask.
 */
export const INDEX_CHANNELS = { NDVI: 0, NDWI: 1, NDBI: 2 } as const;

export const buildIndexExpression = (offset: number): string =>
  [
    normalizedDifferenceExpression('B08', 'B04', offset),
    normalizedDifferenceExpression('B03', 'B08', offset),
    normalizedDifferenceExpression('B11', 'B08', offset),
  ].join(';');

/** Converts a byte produced by `rescale=-1,1` back to an index value. */
export const decodeIndexByte = (byte: number): number => (byte / 255) * 2 - 1;

/**
 * Sentinel-2 Scene Classification (SCL) classes.
 * https://sentiwiki.copernicus.eu/web/s2-processing (Level-2A SCL)
 */
export const SCL = {
  NO_DATA: 0,
  SATURATED_OR_DEFECTIVE: 1,
  DARK_AREA: 2,
  CLOUD_SHADOW: 3,
  VEGETATION: 4,
  NOT_VEGETATED: 5,
  WATER: 6,
  UNCLASSIFIED: 7,
  CLOUD_MEDIUM_PROBABILITY: 8,
  CLOUD_HIGH_PROBABILITY: 9,
  THIN_CIRRUS: 10,
  SNOW_OR_ICE: 11,
} as const;

const CLOUD_CLASSES = new Set<number>([
  SCL.SATURATED_OR_DEFECTIVE,
  SCL.CLOUD_SHADOW,
  SCL.CLOUD_MEDIUM_PROBABILITY,
  SCL.CLOUD_HIGH_PROBABILITY,
  SCL.THIN_CIRRUS,
]);

export const isCloudClass = (scl: number): boolean => CLOUD_CLASSES.has(scl);
export const isWaterClass = (scl: number): boolean => scl === SCL.WATER;

export const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Maps an index value onto a colour ramp. Values outside the ramp are clamped to
 * the end colours (previously, values below the first stop wrongly received the
 * *last* colour). Non-finite values return null so callers can treat them as no-data.
 */
export const interpolateColor = (value: number, stops: ColorStop[]): RGB | null => {
  if (!Number.isFinite(value) || stops.length === 0) return null;
  if (value <= stops[0].pos) return hexToRgb(stops[0].hex);
  const last = stops[stops.length - 1];
  if (value >= last.pos) return hexToRgb(last.hex);

  for (let i = 0; i < stops.length - 1; i++) {
    const lo = stops[i];
    const hi = stops[i + 1];
    if (value >= lo.pos && value <= hi.pos) {
      const t = (value - lo.pos) / (hi.pos - lo.pos);
      const c1 = hexToRgb(lo.hex);
      const c2 = hexToRgb(hi.hex);
      return [
        Math.round(c1[0] + (c2[0] - c1[0]) * t),
        Math.round(c1[1] + (c2[1] - c1[1]) * t),
        Math.round(c1[2] + (c2[2] - c1[2]) * t),
      ];
    }
  }
  return hexToRgb(last.hex);
};

/**
 * CSS gradient whose stop positions match the ramp, so the legend shows exactly
 * the mapping used on the image (the old legend spaced colours evenly).
 */
export const stopsToCssGradient = (stops: ColorStop[]): string => {
  const min = stops[0].pos;
  const span = stops[stops.length - 1].pos - min;
  const parts = stops.map((s) => `${s.hex} ${(((s.pos - min) / span) * 100).toFixed(1)}%`);
  return `linear-gradient(to right, ${parts.join(', ')})`;
};
