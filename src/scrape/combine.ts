import sharp from "sharp";
import { tilesDir, readdirRecursive, getAllTiles, TILE_SIZE } from "./util";
import { readFile } from "fs/promises";

const tiles = getAllTiles(true).slice(0, 100);

const maxX = Math.max(...tiles.map((tile) => tile.x), 0);
const maxY = Math.max(...tiles.map((tile) => tile.y), 0);
const minX = Math.min(...tiles.map((tile) => tile.x), 0);
const minY = Math.min(...tiles.map((tile) => tile.y), 0);

console.log("Tiles in range:", minX, minY, maxX, maxY);


const imageWidth = (maxX - minX + 1) * TILE_SIZE;
const imageHeight = (maxY - minY + 1) * TILE_SIZE;

console.log("Image size:", imageWidth, "x", imageHeight);

let img = sharp({
	create: {
		width: imageWidth,
		height: imageHeight,
		channels: 4,
		background: { r: 0, g: 0, b: 0, alpha: 0 },
	},
	limitInputPixels: false,
});

const options = [];

for (const tile of tiles) {
	const x = tile.x - minX;
	const y = tile.y - minY;

	console.log(`Processing tile ${tile.x}, ${tile.y} at position (${x}, ${y})`);

	const buffer = await readFile(tile.path);

	options.push({
		input: buffer,
		raw: {
			width: TILE_SIZE,
			height: TILE_SIZE,
			channels: 4,
		},
		left: x * TILE_SIZE,
		top: y * TILE_SIZE,
	});
}

console.log("Compositing tiles...");

await img.composite(options as any).toFile(__dirname+"/../../combined.png");

console.log("Combined image saved as combined.png");
