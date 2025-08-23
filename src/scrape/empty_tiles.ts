import { readdirSync, statSync, writeFileSync } from "fs";
import { emptyTile, tilesDir } from "./util";

readdirSync(tilesDir).forEach((yFolder) => {
	const stat = statSync(`${tilesDir}/${yFolder}`);
	if (!stat.isDirectory()) return;

	const files = new Set(
		readdirSync(`${tilesDir}/${yFolder}`)
			.filter((x) => x.endsWith(".png"))
			.map((x) => Number(x.replace(".png", "")))
	);

	for (let i = 0; i < 2048; i++) {
		if (files.has(i)) continue;

		const fileName = `${tilesDir}/${yFolder}/${i.toString().padStart(4, "0")}.png`;

		console.log(`Creating empty tile: ${fileName}`);

		writeFileSync(fileName, emptyTile);
	}
});
