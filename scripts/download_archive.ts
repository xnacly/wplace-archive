import axios from "axios";
import { mkdirSync, readdirSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";
import { Readable } from "stream";
import tar from "tar-fs";
import { fileURLToPath } from "url";
import {execSync} from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { data } = await axios("https://api.github.com/repos/murolem/wplace-archives/releases?per_page=100");

const release_tag_name = process.argv[2] || data[0].tag_name;
const release = data.find((r: any) => r.tag_name === release_tag_name);
if (!release) {
	throw new Error(`Release not found: ${release_tag_name}. Available releases: ${data.map((r: any) => r.tag_name).join(", ")}`);
}

const { assets } = release;

console.log(assets);

const downloadPromises = assets.map(async (asset: any) => {
	const response = await axios<ArrayBuffer>(asset.browser_download_url, {
		responseType: "arraybuffer",
		onDownloadProgress(progressEvent) {
			console.log(
				`Downloading ${asset.name}: ${(progressEvent.loaded! / 1024 / 1024).toFixed(1)}mb/${(progressEvent.total! / 1024 / 1024).toFixed(1)}mb ${Math.round((progressEvent.loaded / asset.size) * 100)}%`
			);
		},
	});

	const buffer = Buffer.from(response.data);

	return {
		...asset,
		data: buffer,
	};
});

const results: {
	name: string;
	data: Buffer;
}[] = await Promise.all(downloadPromises);

const buffer = Buffer.concat(results.sort((a, b) => a.name.localeCompare(b.name)).map((r) => r.data));

writeFileSync(__dirname + "/archive.tar.gz", buffer);

const outDir = __dirname + "/../archive";

mkdirSync(outDir, { recursive: true });

// await tar.extract({
// 	z: true,
// 	file: __dirname + "/archive.tar.gz",
// 	cwd: outDir,
// 	onwarn(message, data) {
// 		console.warn(message, data);
// 	},
// 	ondone() {
// 		console.log("Extraction complete");
// 	},
// 	onWriteEntry(entry) {
// 		console.log("Extracting", entry.path);
// 	},
// });

// tar.extract(outDir, {

// })

execSync(`tar -xzf ${__dirname + "/archive.tar.gz"} -C ${outDir}`, {
	stdio: "pipe",
})

const [archive] = readdirSync(outDir);

const tilesDir = __dirname + "/../public/tiles";

mkdirSync(tilesDir, { recursive: true });

// zoom level 11
renameSync(outDir + "/" + archive, tilesDir + "/11/");


export {};
