import { MPC_STAC_API, MPC_DATA_API, VisMode, VISUALIZATION_MODES, CLOUD_MASK_COLOR, WATER_MASK_COLOR } from '../constants';
import { SentinelItem, MosaicData } from '../types';
import {
  RGB,
  INDEX_CHANNELS,
  buildIndexExpression,
  decodeIndexByte,
  getBoaOffset,
  hexToRgb,
  interpolateColor,
  isCloudClass,
  isWaterClass,
} from './spectralIndices';

/**
 * Calculates a bounding box centered on a lat/lng.
 * @param lat Latitude
 * @param lng Longitude
 * @param radiusKm Radius in kilometers
 * @returns [minLng, minLat, maxLng, maxLat]
 */
export const getBoundingBox = (lat: number, lng: number, radiusKm: number = 50): number[] => {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos(lat * (Math.PI / 180)));

  return [
    lng - lngDelta,
    lat - latDelta,
    lng + lngDelta,
    lat + latDelta
  ];
};

/**
 * Helper to check if the union of available item BBoxes covers the requested BBox.
 */
const checkBBoxCoverage = (requestBBox: number[], items: any[]): boolean => {
    if (!items || items.length === 0) return false;

    // requestBBox: [minLng, minLat, maxLng, maxLat]
    const reqMinLng = requestBBox[0];
    const reqMinLat = requestBBox[1];
    const reqMaxLng = requestBBox[2];
    const reqMaxLat = requestBBox[3];

    // Calculate the extent (union) of all items for this date
    let unionMinLng = Infinity;
    let unionMinLat = Infinity;
    let unionMaxLng = -Infinity;
    let unionMaxLat = -Infinity;

    items.forEach(item => {
        if (item.bbox) {
            unionMinLng = Math.min(unionMinLng, item.bbox[0]);
            unionMinLat = Math.min(unionMinLat, item.bbox[1]);
            unionMaxLng = Math.max(unionMaxLng, item.bbox[2]);
            unionMaxLat = Math.max(unionMaxLat, item.bbox[3]);
        }
    });

    // Check if the union covers the request with a small epsilon
    const epsilon = 0.001; 
    
    return (
        unionMinLng <= reqMinLng + epsilon &&
        unionMinLat <= reqMinLat + epsilon &&
        unionMaxLng >= reqMaxLng - epsilon &&
        unionMaxLat >= reqMaxLat - epsilon
    );
};

/**
 * Gets a list of days in a specific month/year that have available imagery for the location.
 */
export const getMonthlyAvailability = async (
  bbox: number[],
  year: number,
  month: number // 1-12
): Promise<string[]> => {
  const startDate = new Date(Date.UTC(year, month - 1, 1)).toISOString().split('T')[0];
  const lastDay = new Date(Date.UTC(year, month, 0)).getDate();
  const endDate = new Date(Date.UTC(year, month - 1, lastDay)).toISOString().split('T')[0];

  const searchBody = {
    collections: ["sentinel-2-l2a"],
    bbox: bbox,
    datetime: `${startDate}/${endDate}`,
    query: {
      "eo:cloud_cover": { "lt": 50 } 
    },
    limit: 100,
    fields: { include: ['properties.datetime', 'bbox'] }
  };

  try {
    const response = await fetch(`${MPC_STAC_API}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(searchBody)
    });

    if (!response.ok) return [];
    
    const data = await response.json();
    
    const itemsByDate: Record<string, any[]> = {};
    
    data.features.forEach((f: any) => {
      if (f.properties?.datetime) {
        const dateStr = f.properties.datetime.split('T')[0];
        if (!itemsByDate[dateStr]) {
            itemsByDate[dateStr] = [];
        }
        itemsByDate[dateStr].push(f);
      }
    });

    const validDates: string[] = [];

    for (const [date, items] of Object.entries(itemsByDate)) {
        if (checkBBoxCoverage(bbox, items)) {
            validDates.push(date);
        }
    }

    return validDates.sort();
  } catch (e) {
    console.error("Availability check failed", e);
    return [];
  }
};

/**
 * Searches for items for a mosaic on a specific date.
 */
const getMosaicItems = async (bbox: number[], date: string) => {
    const searchBody = {
        collections: ["sentinel-2-l2a"],
        bbox: bbox,
        datetime: `${date}T00:00:00Z/${date}T23:59:59Z`,
        query: { "eo:cloud_cover": { "lt": 90 } },
        sort: [{ field: "eo:cloud_cover", direction: "desc" }]
    };

    const response = await fetch(`${MPC_STAC_API}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchBody)
    });

    if (!response.ok) throw new Error("Failed to search for daily imagery");
    const data = await response.json();
    return data.features as SentinelItem[] || [];
};

/** Output size (pixels) of the square mosaic. Images are requested at this size, so no upscaling. */
const MOSAIC_SIZE = 768;

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image failed to load: ${url}`));
    img.src = url;
  });

const createCanvas = (size: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  // willReadFrequently keeps pixel reads exact and fast for the index layers.
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return { canvas, ctx };
};

/**
 * Main Data Fetching Function.
 *
 * For every scene captured on `date` we request three images, all cropped to the
 * same bounding box so they line up exactly:
 *   1. True colour (TCI asset) as WebP.
 *   2. NDVI / NDWI / NDBI computed on the server from offset-corrected reflectance,
 *      packed into the R/G/B channels of a lossless PNG.
 *   3. The Scene Classification Layer (SCL) for cloud / water masks.
 * Scenes are drawn from cloudiest to clearest, so the clearest scene ends up on top
 * and others only fill gaps (transparent no-data areas).
 */
export const generateMosaic = async (
  bbox: number[],
  date: string,
  _visMode?: VisMode
): Promise<MosaicData> => {
  const items = await getMosaicItems(bbox, date);
  if (items.length === 0) throw new Error("No imagery available for this date.");

  // Metadata
  const times = items.map(i => new Date(i.properties.datetime).toISOString().substring(11, 16));
  const uniqueTimes = Array.from(new Set(times)).sort();
  const timeRange = uniqueTimes.length > 1
    ? `${date} (${uniqueTimes[0]} - ${uniqueTimes[uniqueTimes.length-1]} UTC)`
    : `${date} ${uniqueTimes[0]} UTC`;

  const isMosaic = uniqueTimes.length > 1;

  const size = MOSAIC_SIZE;
  const visual = createCanvas(size);
  const indices = createCanvas(size);
  const scl = createCanvas(size);

  // Fixed precision keeps URLs stable so the browser can cache them.
  const bboxPath = bbox.map(n => n.toFixed(5)).join(',');
  const cropUrl = (itemId: string, format: 'png' | 'webp', query: string) =>
    `${MPC_DATA_API}/item/bbox/${bboxPath}/${size}x${size}.${format}` +
    `?collection=sentinel-2-l2a&item=${encodeURIComponent(itemId)}&${query}`;

  // Download all scenes in parallel, then draw them in order.
  const layers = await Promise.all(items.map(async (item) => {
    const offset = getBoaOffset(item);
    const indexQuery = [
      `expression=${encodeURIComponent(buildIndexExpression(offset))}`,
      'asset_as_band=true',
      'rescale=-1,1', 'rescale=-1,1', 'rescale=-1,1',
    ].join('&');

    const [vis, idx, cls] = await Promise.allSettled([
      loadImage(cropUrl(item.id, 'webp', 'assets=visual')),
      loadImage(cropUrl(item.id, 'png', indexQuery)),
      loadImage(cropUrl(item.id, 'png', 'assets=SCL')),
    ]);
    return { item, vis, idx, cls };
  }));

  let failed = 0;
  for (const { item, vis, idx, cls } of layers) {
    if (vis.status !== 'fulfilled' || idx.status !== 'fulfilled') {
      failed++;
      console.warn('Skipping scene that failed to load:', item.id);
      continue;
    }
    visual.ctx.drawImage(vis.value, 0, 0, size, size);
    indices.ctx.drawImage(idx.value, 0, 0, size, size);
    if (cls.status === 'fulfilled') scl.ctx.drawImage(cls.value, 0, 0, size, size);
  }
  if (failed === layers.length) throw new Error("Failed to load satellite imagery.");

  // VALIDATION: Check for cut-off (transparent pixels)
  const visualData = visual.ctx.getImageData(0, 0, size, size).data;
  let transparentPixels = 0;

  for (let i = 3; i < visualData.length; i += 4) {
      if (visualData[i] === 0) {
          transparentPixels++;
      }
  }

  const coveragePct = 1.0 - (transparentPixels / (size * size));

  if (coveragePct < 0.85) {
      throw new Error(`INSUFFICIENT_COVERAGE`);
  }

  return {
    visualCanvas: visual.canvas,
    indexCanvas: indices.canvas,
    sclCanvas: scl.canvas,
    dateString: timeRange,
    isMosaic
  };
};

const CLOUD_RGB = hexToRgb(CLOUD_MASK_COLOR);
const WATER_RGB = hexToRgb(WATER_MASK_COLOR);

export const renderLayer = (data: MosaicData, mode: VisMode): string => {
    const { visualCanvas, indexCanvas, sclCanvas } = data;
    const width = visualCanvas.width;
    const height = visualCanvas.height;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = width;
    outCanvas.height = height;
    const ctx = outCanvas.getContext('2d')!;

    if (mode === 'VISUAL') {
        ctx.drawImage(visualCanvas, 0, 0);
        return outCanvas.toDataURL('image/jpeg', 0.9);
    }

    const config = VISUALIZATION_MODES[mode];
    const channel = INDEX_CHANNELS[mode];

    const indexData = indexCanvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height).data;
    const sclData = sclCanvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height).data;
    const output = ctx.createImageData(width, height);
    const out = output.data;

    // Pre-compute the colour for each of the 256 possible index bytes.
    const lut: (RGB | null)[] = Array.from({ length: 256 }, (_, b) => interpolateColor(decodeIndexByte(b), config.stops));

    for (let i = 0; i < indexData.length; i += 4) {
        if (indexData[i + 3] === 0) {
            // No data: leave transparent (shows as black in the JPEG output).
            continue;
        }

        // SCL is single-band (grey); alpha 0 means no classification available.
        const sclClass = sclData[i + 3] === 0 ? -1 : sclData[i];
        let rgb: RGB | null;
        if (isCloudClass(sclClass)) {
            rgb = CLOUD_RGB;
        } else if (config.maskWater && isWaterClass(sclClass)) {
            rgb = WATER_RGB;
        } else {
            rgb = lut[indexData[i + channel]];
        }
        if (!rgb) continue;

        out[i] = rgb[0];
        out[i + 1] = rgb[1];
        out[i + 2] = rgb[2];
        out[i + 3] = 255;
    }

    ctx.putImageData(output, 0, 0);
    return outCanvas.toDataURL('image/jpeg', 0.9);
};

export const findRandomGoodDate = async (bbox: number[]): Promise<string | null> => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);
    
    const searchBody = {
        collections: ["sentinel-2-l2a"],
        bbox: bbox,
        datetime: `${startDate.toISOString()}/${endDate.toISOString()}`,
        query: { "eo:cloud_cover": { "lt": 35 } },
        limit: 50,
        fields: { include: ['properties.datetime', 'bbox'] }
    };

    try {
        const res = await fetch(`${MPC_STAC_API}/search`, {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify(searchBody)
        });
        const data = await res.json();
        if (data.features && data.features.length > 0) {
            for (const feature of data.features) {
                if (checkBBoxCoverage(bbox, [feature])) {
                     return feature.properties.datetime.split('T')[0];
                }
            }
            return data.features[0].properties.datetime.split('T')[0];
        }
        return null;
    } catch {
        return null;
    }
}
