import { GeoLocation } from './types';
import type { ColorStop } from './services/spectralIndices';

export const MPC_STAC_API = "https://planetarycomputer.microsoft.com/api/stac/v1";
export const MPC_DATA_API = "https://planetarycomputer.microsoft.com/api/data/v1";

export const PRESET_LOCATIONS: GeoLocation[] = [
  { lat: 36.0544, lng: -112.1401, name: "Grand Canyon, USA" },
  { lat: 27.9881, lng: 86.9250, name: "Mount Everest" },
  { lat: -3.4653, lng: -62.2159, name: "Amazon Rainforest, Brazil" },
  { lat: 30.0444, lng: 31.2357, name: "Cairo, Egypt" },
  { lat: 23.2677, lng: -75.4165, name: "Long Island, Bahamas" },
  { lat: -13.1631, lng: -72.5450, name: "Machu Picchu, Peru" },
  { lat: 40.7128, lng: -74.0060, name: "New York City, USA" },
  { lat: -25.3444, lng: 131.0369, name: "Uluru, Australia" },
  { lat: 25.7615, lng: -80.1964, name: "Miami, USA" },
  { lat: 29.9457, lng: -90.0721, name: "New Orleans, USA" },
];

export const DEFAULT_DATE_RANGE = {
  start: "2023-01-01",
  end: "2023-12-31"
};

export type VisMode = 'VISUAL' | 'NDVI' | 'NDWI' | 'NDBI';

export interface VisConfig {
  id: VisMode;
  label: string;
  description: string;
  /** Formula shown in the legend. */
  formula: string;
  /** Colour ramp (index value -> colour). Values beyond the ends are clamped. */
  stops: ColorStop[];
  legendLabels: [string, string];
  /** Paint water pixels (from the scene classification) with a flat colour. */
  maskWater: boolean;
}

/** Colour used for clouds, cloud shadows and cirrus in index views. */
export const CLOUD_MASK_COLOR = '#9ca3af';
/** Colour used for water in views where the index isn't meaningful over water. */
export const WATER_MASK_COLOR = '#3b6ea8';

export const VISUALIZATION_MODES: Record<VisMode, VisConfig> = {
  VISUAL: {
    id: 'VISUAL',
    label: 'True Color',
    description: 'Standard red, green, and blue imagery that represents how we would naturally see it.',
    formula: 'Red, Green, Blue (B04, B03, B02)',
    stops: [],
    legendLabels: ['', ''],
    maskWater: false
  },
  NDVI: {
    id: 'NDVI',
    label: 'Vegetation (NDVI)',
    description: 'Normalized Difference Vegetation Index: Highlights live green vegetation. Healthy plants reflect lots of near-infrared light and absorb red light.',
    formula: '(NIR − Red) / (NIR + Red)',
    stops: [
      { pos: -0.1, hex: '#a50026' },
      { pos: 0.1, hex: '#f46d43' },
      { pos: 0.25, hex: '#fee08b' },
      { pos: 0.45, hex: '#a6d96a' },
      { pos: 0.65, hex: '#1a9850' },
      { pos: 0.85, hex: '#00441b' }
    ],
    legendLabels: ['Bare / sparse', 'Dense vegetation'],
    maskWater: true
  },
  NDWI: {
    id: 'NDWI',
    label: 'Water (NDWI)',
    description: 'Normalized Difference Water Index: Highlights open water. Water reflects more green light than near-infrared light, so it has positive values. Sun glint and waves on open water can lower the values.',
    formula: '(Green − NIR) / (Green + NIR)',
    stops: [
      { pos: -0.6, hex: '#8c6d31' },
      { pos: -0.2, hex: '#f6e8c3' },
      { pos: 0, hex: '#f7fbff' },
      { pos: 0.2, hex: '#6baed6' },
      { pos: 0.6, hex: '#08306b' }
    ],
    legendLabels: ['Dry land', 'Water'],
    maskWater: false
  },
  NDBI: {
    id: 'NDBI',
    label: 'Built-up (NDBI)',
    description: 'Normalized Difference Built-up Index: Highlights built-up areas like roads and buildings, which reflect more short-wave infrared than near-infrared light. Bare soil can look similar.',
    formula: '(SWIR − NIR) / (SWIR + NIR)',
    stops: [
      { pos: -0.4, hex: '#1a9850' },
      { pos: -0.15, hex: '#d9f0d3' },
      { pos: 0, hex: '#f7f7f7' },
      { pos: 0.1, hex: '#c2a5cf' },
      { pos: 0.3, hex: '#762a83' }
    ],
    legendLabels: ['Vegetated', 'Built-up / bare'],
    maskWater: true
  }
};
