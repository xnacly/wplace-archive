import fs from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const input = join(__dirname, "tiles")

const folder = fs.readdirSync(input);

let i = 0;
let start = Date.now();

folder.forEach((x) => {
	const folderPath = join(input, x)
	const stat = fs.statSync(folderPath)
	if (!stat.isDirectory()) return


	const files = fs.readdirSync(folderPath)

	files.forEach((y) => {
		const filePath = join(folderPath, y)
		const yName = y.replace(".png", "")
		const newFilePath = join(__dirname, "public", "tiles", "11", x, y + ".png")

		fs.mkdirSync(join(__dirname, "public", "tiles", "11", x), { recursive: true })

		fs.copyFileSync(filePath, newFilePath)

		
		i++

		if (i % 1000 === 0) {
			const duration = (Date.now() - start) / 1000;
			const rate = (i / duration).toFixed(2);
			console.log("Copied", (i++).toLocaleString(), `(${rate} files/sec)`)
		}
	})
})

