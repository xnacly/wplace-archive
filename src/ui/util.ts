import canvasSize from "canvas-size";
import { Map } from "maplibre-gl";
import PQueue, { Queue } from "p-queue";

export function lon2tile(lon: number, z: number) {
	return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}
export function lat2tile(lat: number, z: number) {
	const rad = (lat * Math.PI) / 180;
	return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z));
}

export function tilesInView(map: Map, z: number) {
	const b = map.getBounds(); // LngLatBounds
	const west = b.getWest(),
		south = b.getSouth();
	const east = b.getEast(),
		north = b.getNorth();

	// handle antimeridian crossing
	const wrap = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;

	const xMin = lon2tile(wrap(west), z);
	const xMax = lon2tile(wrap(east), z);
	const yMin = lat2tile(north, z);
	const yMax = lat2tile(south, z);

	// If crossing the antimeridian, split into two ranges
	const n = Math.pow(2, z);
	const ranges =
		xMax >= xMin
			? [{ x0: xMin, x1: xMax }]
			: [
					{ x0: 0, x1: xMax },
					{ x0: xMin, x1: n - 1 },
				];

	const tiles = [];
	for (const { x0, x1 } of ranges) {
		for (let x = x0; x <= x1; x++) {
			for (let y = yMin; y <= yMax; y++) {
				tiles.push({ z, x: ((x % n) + n) % n, y });
			}
		}
	}
	return tiles;
}

function expandTemplate(
	template: string,
	t: {
		z: string | number;
		x: string | number;
		y: string | number;
	}
) {
	// handle subdomains like {a,b,c} or {s}
	let urls = [template];

	// {a,b,c} pattern
	const braced = template.match(/\{([^}]+)\}/g) || [];
	braced.forEach((token) => {
		const content = token.slice(1, -1);
		if (content.includes(",")) {
			const options = content.split(",");
			urls = urls.flatMap((u) => options.map((opt) => u.replace(token, opt)));
		}
	});

	// standard placeholders
	urls = urls.map(
		(u) =>
			u.replace(/\{z\}/g, t.z.toString()).replace(/\{x\}/g, t.x.toString()).replace(/\{y\}/g, t.y.toString()).replace(/\{s\}/g, "a") // pick a default subdomain if {s}
	);

	return urls;
}

async function* stitchTilesToCanvas(
	tiles: {
		z: number;
		x: number;
		y: number;
	}[],
	template: string,
	tileSize = 1000,
	canvas?: OffscreenCanvas
) {
	const cols = Math.max(...tiles.map((t) => t.x)) - Math.min(...tiles.map((t) => t.x)) + 1;
	const rows = Math.max(...tiles.map((t) => t.y)) - Math.min(...tiles.map((t) => t.y)) + 1;
	const minX = Math.min(...tiles.map((t) => t.x));
	const minY = Math.min(...tiles.map((t) => t.y));

	const targetWidth = cols * tileSize;
	const targetHeight = rows * tileSize;

	const maxArea = await canvasSize.maxArea({
		usePromise: true,
		max: 100000, // 100 megapixels
		step: 1000,
	});

	const maxRes = maxArea.width * maxArea.height;

	if (targetWidth * targetHeight > maxRes) {
		throw new Error(
			`Please zoom further in to reduce the image size.\nThe requested image is ${targetWidth}x${targetHeight} pixels, which exceeds the maximum possible size of your browser ${maxArea.width}x${maxArea.height} pixels.`
		);
	}

	if (!canvas) {
		canvas = new OffscreenCanvas(targetWidth, targetHeight);
	}

	canvas.width = targetWidth;
	canvas.height = targetHeight;
	const ctx = canvas.getContext("2d")!;

	const total = tiles.length;
	yield { type: "start", total, canvas };

	for (let i = 0; i < tiles.length; i++) {
		try {
			const t = tiles[i];
			const url = expandTemplate(template, t)[0];
			const img = new Image();
			img.crossOrigin = "anonymous";

			await new Promise((res, rej) => {
				img.onload = res;
				img.onerror = (e) => rej(e);
				img.src = url;
			});

			const dx = (t.x - minX) * tileSize;
			const dy = (t.y - minY) * tileSize;
			ctx.drawImage(img, dx, dy);

			yield { type: "progress", loaded: i + 1, total };
		} catch (error) {}
	}

	new Promise((r) => setTimeout(r, 5000)).then(() => {
		// Optionally remove if appended elsewhere
	});

	return canvas;
}

export async function* getImageFromMap(map: Map, source, canvas?: OffscreenCanvas) {
	// const z = Math.floor(map.getZoom());
	const z = 11;
	const visibleTiles = tilesInView(map, z);

	// @ts-ignore
	const templates = source!.tiles as string[];

	// Usage
	const template = templates[0];
	const generator = stitchTilesToCanvas(visibleTiles, template, 1000, canvas);

	for await (const update of generator) {
		yield update;
	}
}

export async function logTileUrls(map: Map) {
	const z = 11;
	const visibleTiles = tilesInView(map, z);

	// @ts-ignore
	const templates = map.getSource("mytiles")!.tiles as string[];

	const urls = [];

	for (const t of visibleTiles) {
		for (const tpl of templates) {
			urls.push(...expandTemplate(tpl, t));
		}
	}

	console.log(urls); // direct tile image URLs you can fetch
}
