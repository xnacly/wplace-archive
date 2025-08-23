import { readdirSync } from "fs";
import { dirname, join } from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __filname = fileURLToPath(import.meta.url);
const __dirname = dirname(__filname);

export const tilesDir = join(__dirname, "..", "..", "tiles");
export const rawDir = join(__dirname, "..", "..", "raw");
export const TILE_SIZE = 1000;

export const emptyTile = await sharp({
	create: {
		width: 1000,
		height: 1000,
		channels: 4,
		background: { r: 0, g: 0, b: 0, alpha: 0 },
	},
})
	.png()
	.toBuffer();

export function readdirRecursive(dir: string): string[] {
	const entries = readdirSync(dir, { withFileTypes: true });
	let files: string[] = [];

	for (const entry of entries) {
		if (entry.isDirectory()) {
			files = files.concat(readdirRecursive(join(dir, entry.name)));
		} else if (entry.isFile()) {
			files.push(join(dir, entry.name));
		}
	}

	return files;
}

export function getAllTiles(raw = false) {
	const extension = raw ? ".raw" : ".png";
	const dir = raw ? rawDir : tilesDir;
	return readdirRecursive(dir)
		.map((data) => {
			if (!data.endsWith(extension)) return null;

			const parts = data.split("/");
			const fileName = parts.pop() || "";
			const x = Number(fileName.replace(extension, ""));
			const y = Number(parts.pop()!);

			return { x, y, path: data };
		})
		.filter((tile) => tile !== null)
		.sort((a, b) => {
			if (a!.y === b!.y) return a!.x - b!.x;
			return a!.y - b!.y;
		});
}

export function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}	
