// mercator.mjs
// Calcul GPS <-> tuiles Web Mercator en "milli-tuile" (0..999) ou en pixels

const DEFAULT_ZOOM: number = 11;   // Zoom de référence pour tes coordonnées Tl/Px
const SCALE: number = 1000;        // milli-tuile
const TILE_SIZE: number = 256;     // taille d'une tuile (pixels)
const MAX_MERCATOR_LAT: number = 85.05112878;

function clampLat(lat: number): number {
	return Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
}

// GPS -> (TlX, TlY, PxX, PxY) au zoom donné (milli-tuile)
export function gpsToTlPx(latDeg: number, lngDeg: number, { z = DEFAULT_ZOOM, scale = SCALE }: { z?: number; scale?: number } = {}): { TlX: number; TlY: number; PxX: number; PxY: number; z: number } {
	const N: number = 2 ** z;
	const lat: number = clampLat(latDeg) * Math.PI / 180;

	const x: number = N * (lngDeg + 180) / 360;
	const y: number = N * (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2;

	let TlX: number = Math.floor(x);
	let TlY: number = Math.floor(y);
	let PxX: number = Math.round((x - TlX) * scale);
	let PxY: number = Math.round((y - TlY) * scale);

	// Gestion du cas rare où l'arrondi donne scale
	if (PxX === scale) { TlX += 1; PxX = 0; }
	if (PxY === scale) { TlY += 1; PxY = 0; }

	return { TlX, TlY, PxX, PxY, z };
}

// (TlX, TlY, PxX, PxY) -> GPS (milli-tuile)
export function tlPxToGps(TlX: number, TlY: number, PxX: number, PxY: number, { z = DEFAULT_ZOOM, scale = SCALE }: { z?: number; scale?: number } = {}): { lat: number; lng: number } {
	const N: number = 2 ** z;
	const x: number = TlX + PxX / scale;
	const y: number = TlY + PxY / scale;

	const lng: number = (x / N) * 360 - 180;
	const lat: number = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / N))) * 180 / Math.PI;

	return { lat, lng };
}

// GPS -> (tileX, tileY, pixelX, pixelY) au zoom donné (pixels)
export function gpsToTilePixel(latDeg: number, lngDeg: number, z: number, tileSize: number = TILE_SIZE): { tileX: number; tileY: number; pixelX: number; pixelY: number; z: number; tileSize: number } {
	const N: number = 2 ** z;
	const lat: number = clampLat(latDeg) * Math.PI / 180;

	const fx: number = N * (lngDeg + 180) / 360;
	const fy: number = N * (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2;

	let tileX: number = Math.floor(fx);
	let tileY: number = Math.floor(fy);
	let pixelX: number = Math.round((fx - tileX) * tileSize);
	let pixelY: number = Math.round((fy - tileY) * tileSize);

	if (pixelX === tileSize) { pixelX = 0; tileX += 1; }
	if (pixelY === tileSize) { pixelY = 0; tileY += 1; }

	return { tileX, tileY, pixelX, pixelY, z, tileSize };
}
