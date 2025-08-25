import fs from "fs/promises"
import { dirname, join } from "path"
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const input = join(__dirname, "..", "tiles")

const folder = await fs.readdir(input);

const start = Date.now();
let i = 0;

folder.forEach(async (x) => {
	const folderPath = join(input, x)
	const stat = await fs.stat(folderPath)
	if (!stat.isDirectory()) return


	const files = await fs.readdir(folderPath)

	files.forEach(async (y) => {
		const filePath = join(folderPath, y)
		const yName = y.replace(".png", "")
		const newFilePath = join(__dirname, "..", "public", "tiles3", "11", x, y)

		await fs.mkdir(dirname(newFilePath), { recursive: true })

		await fs.copyFile(filePath, newFilePath)

		i++

		if (i % 1000 === 0) {
			const duration = (Date.now() - start) / 1000;
			const rate = (i / duration).toFixed(2);
			console.log("Copied", (i++).toLocaleString(), `(${rate} files/sec)`)
		}
	})

})

