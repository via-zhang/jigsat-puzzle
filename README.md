# jigSAT Puzzle: Explore the world with satellite puzzles

jigSAT Puzzle is an interactive, educational web game where you piece together satellite images of different locations on Earth by rotating tiles.

## How to Play

1.  **Choose a Mode:**
    *   **Randomize:** The game selects a famous location (e.g., Grand Canyon, Machu Picchu, Mount Everest) and finds a clear satellite image.
    *   **Choose Location:** Click anywhere on the global map and choose a specific date to generate a puzzle for that exact location.
2.  **The Game Type:**
    *   **Rotate:** On a grid of randomly-rotated tiles (2x2, 3x3, or 4x4), click to rotate each tile until the image aligns.
    *   **Jigsaw:** Drag and drop tiles from a tray onto the grid. In 4x4 and 5x5 mode, tiles have jigsaw shapes; in the other modes, the tiles are square. On phones and tablets you can also tap a tile and then tap a slot to place it.
3.  **Analysis Tools:**
    *   While solving (or after winning), toggle between different spectral views (True Color, Vegetation, Water, Urban) to see the landscape through different "lenses."

## Structure

This application is built using **React**, **TypeScript**, and **Leaflet**, with Sentinel-2 satellite imagery from **Microsoft Planetary Computer**.

### 1. Satellite Imagery (Sentinel-2)
We use data from the **Sentinel-2 Level-2A** collection.
*   **Source:** European Space Agency (ESA) Copernicus Program.
*   **Resolution:** 10m per pixel.
*   **Host:** Microsoft Planetary Computer STAC API.

### 2. How Images are Selected
To ensure a playable puzzle, the app performs rigorous filtering:
1.  **Cloud Filtering:** Queries the STAC API for images with <35% cloud cover (for Random mode) or <50% (for Choose mode).
2.  **Cropping:** Every image is requested with the Planetary Computer `item/bbox` endpoint, so it is cropped to the same ~50 km square around the chosen location.
3.  **Mosaicking:** Sentinel-2 images are captured in long "strips" and tiles. The app fetches every image from the same day that overlaps the area and layers them on an HTML Canvas (clearest on top) to fill any gaps.

### 3. Spectral Indices
Each index is a normalized difference of two Sentinel-2 bands:

*   **B03 (Green)**, **B04 (Red)**, **B08 (Near-Infrared / NIR)**, **B11 (Short-wave Infrared / SWIR)**

| Mode | Name | Formula | Description |
|------|------|---------|-------------|
| **VISUAL** | True Color | RGB | Standard red, green, and blue imagery that represents how we would naturally see it. |
| **NDVI** | Normalized Difference Vegetation Index | `(NIR - Red) / (NIR + Red)` | Highlights live green vegetation. |
| **NDWI** | Normalized Difference Water Index | `(Green - NIR) / (Green + NIR)` | Highlights open water. |
| **NDBI** | Normalized Difference Built-up Index | `(SWIR - NIR) / (SWIR + NIR)` | Highlights built-up areas (and bare rock/soil). |

How they are calculated (`services/spectralIndices.ts`):

*   **Reflectance offset:** Sentinel-2 products from processing baseline 04.00 (January 2022) onwards store `reflectance × 10000 + 1000`. The 1000 offset is removed before computing each index; very dark pixels are floored at a tiny positive reflectance so the formula never divides by zero.
*   **Server-side calculation:** the three indices are computed by the Planetary Computer data API (TiTiler expressions) on the original 16-bit values and returned together in one lossless PNG (R = NDVI, G = NDWI, B = NDBI, each scaled from −1…1 to 0…255).
*   **Coloring:** the browser converts each value back to −1…1 and colors it with the mode's color ramp; values beyond the ends of the ramp are clamped. The on-screen legend uses exactly the same color stops.
*   **Masks:** the Scene Classification Layer (SCL) is used to show clouds, cloud shadows and cirrus in gray, and (for NDVI and NDBI, where the index is not meaningful over water) water in flat blue.

## Technologies Used

*   **Frontend:** React 19, TypeScript
*   **Styling:** Tailwind CSS
*   **Mapping:** Leaflet
*   **Icons:** Lucide React
*   **API:** Microsoft Planetary Computer STAC & Data APIs

## Running Locally

Requires Node.js 22 (see `.nvmrc`).

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm ci
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```
4.  Open `http://localhost:3000` in your browser.

Other scripts: `npm run typecheck` (TypeScript check), `npm test` (unit tests) and `npm run build` (production build into `dist/`).

## Deployment

The site is deployed to GitHub Pages by GitHub Actions (`.github/workflows/deploy.yml`). Every push to `main` type-checks, tests and builds the app, then publishes `dist/` to Pages. You can also run the workflow manually from the **Actions** tab.

## License

This project is open source. Satellite data is provided by the European Space Agency via Microsoft Planetary Computer and is subject to their respective usage terms.
