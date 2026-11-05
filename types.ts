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
  };
  assets: {
    visual: {
      href: string;
    };
  };
}

export interface MosaicData {
  // We hold the raw canvases to generate different views on the fly
  visualCanvas: HTMLCanvasElement; // Optimized RGB (assets=visual)
  bandsCanvas: HTMLCanvasElement; // R=B04, G=B03, B=B08
  swirCanvas: HTMLCanvasElement; // R=B11
  dateString: string;
  isMosaic: boolean;
}