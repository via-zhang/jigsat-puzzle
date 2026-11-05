import { GeoLocation } from './types';

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
  legendGradient: string;
  legendLabels: [string, string];
}

export const VISUALIZATION_MODES: Record<VisMode, VisConfig> = {
  VISUAL: {
    id: 'VISUAL',
    label: 'True Color',
    description: 'Standard red, green, and blue imagery that represents how we would naturally see it.',
    legendGradient: '',
    legendLabels: ['', '']
  },
  NDVI: {
    id: 'NDVI',
    label: 'Vegetation (NDVI)',
    description: 'Normalized Difference Vegetation Index: Highlights live green vegetation',
    legendGradient: 'linear-gradient(to right, #d7191c, #fdae61, #ffffbf, #a6d96a, #1a9641)',
    legendLabels: ['Barren', 'Vegetation']
  },
  NDWI: {
    id: 'NDWI',
    label: 'Water (NDWI)',
    description: 'Normalized Difference Water Index: Highlights water content',
    legendGradient: 'linear-gradient(to right, #f7fbff, #6baed6, #08306b)',
    legendLabels: ['Dry', 'Water']
  },
  NDBI: {
    id: 'NDBI',
    label: 'Built-up (NDBI)',
    description: 'Normalized Difference Built-up Index: Highlights built-up areas like roads and buildings',
    legendGradient: 'linear-gradient(to right, #9ebcda, #8c96c6, #8856a7, #810f7c)',
    legendLabels: ['Natural', 'Built-Up']
  }
};