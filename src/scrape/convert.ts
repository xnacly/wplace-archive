import { join } from "path";
import { getAllTiles } from "./util";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "fs";

const tiles = getAllTiles();

const rawDir = join(__dirname, "..", "..", "raw");

for (const tile of tiles) {
	const yDir = join(rawDir, tile.y.toString().padStart(4, "0"));
	mkdirSync(yDir, { recursive: true });
	const fileName = join(yDir, `${tile.x.toString().padStart(4, "0")}.raw`);

	sharp(tile.path)
		.raw()
		.toBuffer()
		.then((buffer) => {
			writeFileSync(fileName, buffer);
			console.log(`Converted tile ${tile.x}, ${tile.y}, ${tile.path} to raw format at ${fileName}`);
		});
}
