import { MPC_STAC_API, MPC_DATA_API, VisMode } from '../constants';
import { SentinelItem, MosaicData } from '../types';

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

/**
 * Main Data Fetching Function.
 */
export const generateMosaic = async (
  bbox: number[],
  date: string,
  visMode: VisMode 
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

  // Prepare Canvases
  const size = 1024;
  
  const visualCanvas = document.createElement('canvas');
  visualCanvas.width = size;
  visualCanvas.height = size;
  const visualCtx = visualCanvas.getContext('2d')!;

  const bandsCanvas = document.createElement('canvas');
  bandsCanvas.width = size;
  bandsCanvas.height = size;
  const bandsCtx = bandsCanvas.getContext('2d')!;

  const swirCanvas = document.createElement('canvas');
  swirCanvas.width = size;
  swirCanvas.height = size;
  const swirCtx = swirCanvas.getContext('2d')!;

  const loadAndDraw = (ctx: CanvasRenderingContext2D, url: string) => {
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        ctx.drawImage(img, 0, 0, size, size);
        resolve();
      };
      img.onerror = () => {
        console.warn("Tile failed to load:", url);
        resolve();
      };
      img.src = url;
    });
  };

  // Fix precision to avoid floating point issues in URL caching
  const bboxStr = bbox.map(n => n.toFixed(5)).join(",");
  const baseUrl = `${MPC_DATA_API}/item/preview.png?collection=sentinel-2-l2a&bbox=${bboxStr}`;

  // Cache buster
  const t = Date.now();

  for (const item of items) {
     // 1. Visual Asset
     const visualUrl = `${baseUrl}&item=${item.id}&assets=visual&format=png&width=512&height=512&_t=${t}`;
     
     // 2. Data Bands (B04, B03, B08)
     const bandsUrl = `${baseUrl}&item=${item.id}&assets=B04&assets=B03&assets=B08&rescale=0,5000&format=png&width=512&height=512&_t=${t}`;

     // 3. SWIR Band (B11)
     const swirUrl = `${baseUrl}&item=${item.id}&assets=B11&rescale=0,5000&format=png&width=512&height=512&_t=${t}`;

     await Promise.all([
        loadAndDraw(visualCtx, visualUrl),
        loadAndDraw(bandsCtx, bandsUrl),
        loadAndDraw(swirCtx, swirUrl)
     ]);
  }

  // VALIDATION: Check for cut-off (transparent pixels)
  const visualData = visualCtx.getImageData(0, 0, size, size).data;
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
    visualCanvas,
    bandsCanvas,
    swirCanvas,
    dateString: timeRange,
    isMosaic
  };
};

const interpolateColor = (val: number, colors: {pos: number, hex: string}[]) => {
    // Find bucket
    for (let i = 0; i < colors.length - 1; i++) {
        if (val >= colors[i].pos && val <= colors[i+1].pos) {
            const t = (val - colors[i].pos) / (colors[i+1].pos - colors[i].pos);
            const c1 = hexToRgb(colors[i].hex);
            const c2 = hexToRgb(colors[i+1].hex);
            return [
                c1[0] + (c2[0] - c1[0]) * t,
                c1[1] + (c2[1] - c1[1]) * t,
                c1[2] + (c2[2] - c1[2]) * t
            ];
        }
    }
    return hexToRgb(colors[colors.length-1].hex);
};

const hexToRgb = (hex: string) => {
    const bigint = parseInt(hex.slice(1), 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
};

const PALETTES = {
    NDVI: [
        {pos: -0.2, hex: "#d7191c"},
        {pos: 0.1, hex: "#fdae61"},
        {pos: 0.3, hex: "#ffffbf"},
        {pos: 0.5, hex: "#a6d96a"},
        {pos: 0.8, hex: "#1a9641"}
    ],
    NDWI: [
        {pos: -0.7, hex: "#f7fbff"},
        {pos: 0, hex: "#6baed6"},
        {pos: 0.7, hex: "#08306b"}
    ],
    NDBI: [
        {pos: -0.2, hex: "#9ebcda"},
        {pos: 0.0, hex: "#8c96c6"},
        {pos: 0.2, hex: "#8856a7"},
        {pos: 0.7, hex: "#810f7c"}
    ]
};

export const renderLayer = (data: MosaicData, mode: VisMode): string => {
    const { visualCanvas, bandsCanvas, swirCanvas } = data;
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

    const bandsData = bandsCanvas.getContext('2d')!.getImageData(0, 0, width, height);
    const swirData = swirCanvas.getContext('2d')!.getImageData(0, 0, width, height);
    const output = ctx.createImageData(width, height);

    const bufBands = bandsData.data;
    const bufSwir = swirData.data;
    const bufOut = output.data;

    for (let i = 0; i < bufBands.length; i += 4) {
        const B04 = bufBands[i];     
        const B03 = bufBands[i+1];   
        const B08 = bufBands[i+2];   

        const B11 = bufSwir[i];     

        let val = 0;
        let palette = PALETTES.NDVI;

        if (bufBands[i+3] === 0) {
            bufOut[i] = 0; bufOut[i+1] = 0; bufOut[i+2] = 0; bufOut[i+3] = 0; 
            continue;
        }

        if (mode === 'NDVI') {
            val = (B08 - B04) / (B08 + B04);
            palette = PALETTES.NDVI;
        } else if (mode === 'NDWI') {
            val = (B03 - B08) / (B03 + B08);
            palette = PALETTES.NDWI;
        } else if (mode === 'NDBI') {
            val = (B11 - B08) / (B11 + B08);
            palette = PALETTES.NDBI;
        }

        const [r, g, b] = interpolateColor(val, palette);
        bufOut[i] = r;
        bufOut[i+1] = g;
        bufOut[i+2] = b;
        bufOut[i+3] = 255; 
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
