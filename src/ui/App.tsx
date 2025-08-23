import { useLayoutEffect, useState } from "react";
import { ColorSpecification, LayerSpecification, Map } from "maplibre-gl";
import 'maplibre-gl/dist/maplibre-gl.css';
import "./App.css"

// const TILE_URL = 'http://localhost:8000/{z}/{x}/{y}.png'; // gdal2tiles output
const TILE_URL = '/tiles/{z}/{x}/{y}.png'; // gdal2tiles output
const TILE_SIZE = 512; // must match --tilesize used in gdal2tiles
const MIN_ZOOM = 6;
const MAX_ZOOM = 11; // or your chosen max

const WORLD_N = 85.0511287798066;     // top latitude in EPSG:3857
const WORLD_W = -180;                  // left longitude
const INITIAL_CENTER: [number, number] = [WORLD_W + 1e-6, WORLD_N - 1e-6];

function App() {
	const [count, setCount] = useState(0);

	useLayoutEffect(() => {
		const map = new Map({
			container: 'map',
			style: {
				version: 8,
				sources: {
					world: {
						type: 'raster',
						tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
						tileSize: 256,
						attribution: '© OpenStreetMap contributors',
						minzoom: 0,
						maxzoom: 19
					},
					mytiles: {
						type: 'raster',
						tiles: [TILE_URL],
						tileSize: TILE_SIZE,
						scheme: 'xyz',
						minzoom: MIN_ZOOM,
						maxzoom: MAX_ZOOM
					}
				},
				layers: [
                    {
                        id: 'world',
                        type: 'raster',
                        source: 'world',
                        paint: {
                            'raster-opacity': 0
                        }
                    },
                    {
                        id: 'background',
                        type: 'background',
                        paint: {
                            'background-color': '#ffffff' as ColorSpecification,
                            'background-opacity': 1
                        }
                    },
                     {
                        id: 'mytiles',
						type: 'raster',
						source: 'mytiles',
						paint: {
                            'raster-resampling': 'nearest',
							'raster-opacity': 1,
						}
					},
				]
			},
			// minZoom: MIN_ZOOM,
			// maxZoom: MAX_ZOOM,
			renderWorldCopies: false,
			center: INITIAL_CENTER,
			zoom: 13,
            // bounds: [ [WORLD_W, WORLD_N], [0, 0] ],
			// maxBounds: [[WORLD_W, -WORLD_N], [180, WORLD_N]],
		});

		// Optional: if your tiles are georeferenced and you want to zoom to an area:
		// map.fitBounds([-4, 41, 25, 57]); // [west, south, east, north]

		return () => {
			map.remove();
		};
	}, []);

	return <div id="map"></div>;
}

export default App;
