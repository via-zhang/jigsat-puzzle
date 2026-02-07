# jigSAT Puzzle: Explore the world with satellite puzzles

jigSAT Puzzle is an interactive, educational web game where you piece together satellite images of different locations on Earth by rotating tiles.

## How to Play

1.  **Choose a Mode:**
    *   **Randomize:** The game selects a famous location (e.g., Grand Canyon, Machu Picchu, Mount Everest) and finds a clear satellite image.
    *   **Choose Location:** Click anywhere on the global map and choose a specific date to generate a puzzle for that exact location.
2.  **The Game Type:**
    *   **Rotate:** On a grid of randomly-rotated tiles (2x2, 3x3, or 4x4), click to rotate each tile until the image aligns.
    *   **Jigsaw:** Drag and drop tiles from a tray onto the grid. In 4x4 mode, tiles have jigsaw shapes, and in the other modes, the tiles are square.
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
2.  **Mosaicking:** Sentinel-2 images are captured in long "strips." The app fetches multiple overlapping images from the same day and stitches them together on an HTML Canvas to ensure there are no gaps. 

### 3. Client-Side Spectral Analysis
When you load a location, the following spectral bands are processed:
*   **B04 (Red)**
*   **B03 (Green)**
*   **B02 (Blue)**
*   **B08 (Near-Infrared / NIR)**
*   **B11 (Short-wave Infrared / SWIR)**

These bands are used to calculate indices using the HTML5 Canvas API:

| Mode | Name | Formula | Description |
|------|------|---------|-------------|
| **VISUAL** | True Color | RGB | Standard red, green, and blue imagery that represents how we would naturally see it. |
| **NDVI** | Normalized Difference Vegetation Index | `(NIR - Red) / (NIR + Red)` | Highlights live green vegetation. |
| **NDWI** | Normalized Difference Water Index | `(Green - NIR) / (Green + NIR)` | Highlights water content. |
| **NDBI** | Normalized Difference Built-up Index | `(SWIR - NIR) / (SWIR + NIR)` | Highlights built-up areas like roads and buildings. |

## Technologies Used

*   **Frontend:** React 19, TypeScript
*   **Styling:** Tailwind CSS
*   **Mapping:** Leaflet
*   **Icons:** Lucide React
*   **API:** Microsoft Planetary Computer STAC & Data APIs

## Running Locally

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm start
    ```
4.  Open `http://localhost:3000` in your browser.

## License

This project is open source. Satellite data is provided by the European Space Agency via Microsoft Planetary Computer and is subject to their respective usage terms.
