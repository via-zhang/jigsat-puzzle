export interface GeoLocation {
  lat: number;
  lng: number;
  name?: string;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface PuzzleState {
  tiles: number[]; // Array of 9 rotation values (0, 90, 180, 270)
  isComplete: boolean;
  moves: number;
}

export interface SentinelItem {
  id: string;
  bbox: number[];
  properties: {
    datetime: string;
    "eo:cloud_cover": number;
    "s2:processing_baseline"?: string;
  };
  assets: {
    visual: {
      href: string;
    };
  };
}

export interface MosaicData {
  // We hold the raw canvases to generate different views on the fly
  visualCanvas: HTMLCanvasElement; // True colour (assets=visual)
  indexCanvas: HTMLCanvasElement; // R=NDVI, G=NDWI, B=NDBI, each rescaled from [-1, 1] to [0, 255]; A=valid data
  sclCanvas: HTMLCanvasElement; // Sentinel-2 Scene Classification Layer (class value in R)
  dateString: string;
  isMosaic: boolean;
}