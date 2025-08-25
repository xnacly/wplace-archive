import { sha } from "bun";
import { readFileSync } from "fs";
import fs from "fs/promises"
import PQueue from "p-queue";
import { dirname, join } from "path"
import sharp from "sharp";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const input = join(__dirname, "..", "tiles")

const folder = await fs.readdir(input);

const start = Date.now();
let i = 0;

const queue = new PQueue({ concurrency: 10 })

// folder.forEach(async (x) => {
// 	const folderPath = join(input, x)
// 	const stat = await fs.stat(folderPath)
// 	if (!stat.isDirectory()) return


// 	const files = await fs.readdir(folderPath)

// 	files.forEach(async (y) => {
// 		const filePath = join(folderPath, y)
// 		const yName = y.replace(".png", "")
// 		const newFilePath = join(__dirname, "..", "public", "tiles3", "10", x, y)

// 		await fs.mkdir(dirname(newFilePath), { recursive: true })

// 		queue.add(async () => {
// 			await sharp(filePath).resize({
// 				width: 500,
// 				height: 500,
// 				kernel: sharp.kernel.cubic
// 			}).toFile(newFilePath)

// 			console.log("Written", newFilePath)
// 		})
// 	})

// })


const image = await sharp(`/Users/user/Developer/wplace/tiles/34/66.png`).resize({
	width: 500,
	height: 500,
	kernel: sharp.kernel.nearest,
}).raw({
}).toBuffer()

const colorPalette = [
	[0, 0, 0],
	[60, 60, 60],
	[120, 120, 120],
	[210, 210, 210],
	[255, 255, 255],
	[96, 0, 24],
	[237, 28, 36],
	[255, 127, 39],
	[246, 170, 9],
	[249, 221, 59],
	[255, 250, 188],
	[14, 185, 104],
	[19, 230, 123],
	[135, 255, 94],
	[12, 129, 110],
	[16, 174, 166],
	[19, 225, 190],
	[40, 80, 158],
	[64, 147, 228],
	[96, 247, 242],
	[107, 80, 246],
	[153, 177, 251],
	[120, 12, 153],
	[170, 56, 185],
	[224, 159, 249],
	[203, 0, 122],
	[236, 31, 128],
	[243, 141, 169],
	[104, 70, 52],
	[149, 104, 42],
	[248, 178, 119],

]; // [r, g, b][]

// Expecting 3 channels (r, g, b without alpha).
for (let i = 0; i < image.length; i += 4) {
	let a = image[i + 3];
	let r = image[i + 0] * a / 256;
	let g = image[i + 1] * a / 256;
	let b = image[i + 2] * a / 256;

	if (a < 100 && r < 20 && g < 20 && b < 20) {
		// image[i + 3] = 0;
		continue
	}

	if (a <= 250 && a > 0) {
		// image[i + 0] = 0;
		// image[i + 1] = 0;
		// image[i + 2] = 0;
		// image[i + 3] = 255;
		// continue
		// a = image[i + 0] *= 1.1
		// g = image[i + 1] *= 1.1
		// b = image[i + 2] *= 1.1
		// a = image[i + 3] *= 1.1

		if (r > 255) r = 255;
		if (g > 255) g = 255;
		if (b > 255) b = 255;
		if (a > 255) a = 255;

		a = image[i + 3] = 255;
	}

	let closestColor = colorPalette[0];
	let minDistance = Number.MAX_SAFE_INTEGER;

	for (const color of colorPalette) {
		const distance = Math.sqrt(
			Math.pow(r - color[0], 2) +
			Math.pow(g - color[1], 2) +
			Math.pow(b - color[2], 2));

		if (distance < minDistance) {
			minDistance = distance;
			closestColor = color;
		}
	}


	image[i + 0] = closestColor[0];
	image[i + 1] = closestColor[1];
	image[i + 2] = closestColor[2];
}

// sharp(image, { raw: { width: 64, height: 64, channels: 3 } }).toFile('output.png');

sharp(image, {
	raw: {
		width: 500,
		height: 500,
		channels: 4
	}
}).toFile(`/Users/user/Developer/wplace/public/tiles3/10/34/66.png`)
