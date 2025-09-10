import axios from "axios";
import { createWriteStream, createReadStream, mkdirSync, readdirSync, renameSync, unlinkSync } from "fs";
import { dirname } from "path";
import { Readable } from "stream";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function downloadArchive(repo: string = "murolem/wplace-archives", releaseTag?: string, outDir = __dirname + "/../archive") {
	let page = 1;

	do {
		const { data } = await axios(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page++}`);

		var release_tag_name = releaseTag || data[0].tag_name;
		var release = data.find((r: any) => r.tag_name === release_tag_name);
	} while (!release);

	const { assets } = release;

	console.log(`Found ${assets.length} assets in release ${release_tag_name}.`);

	// Download all parts in parallel to temp files, then concatenate.
	const outArchivePath = __dirname + "/archive.tar.gz";
	const partsDir = __dirname + "/archive_parts";
	mkdirSync(partsDir, { recursive: true });

	const sortedAssets = [...assets].sort((a: any, b: any) => a.name.localeCompare(b.name));
	console.log(`Downloading ${sortedAssets.length} parts in parallel...`);

	type PartResult = { index: number; name: string; path: string; size: number };

	async function downloadPart(asset: any, index: number): Promise<PartResult> {
		const partPath = `${partsDir}/part_${index.toString().padStart(4, "0")}_${asset.name}`;
		const response = await axios<Readable>(asset.browser_download_url, { responseType: "stream" });
		const stream: Readable = response.data as unknown as Readable;
		const fileStream = createWriteStream(partPath);
		let loaded = 0;
		const sizeMB = (asset.size / 1024 / 1024).toFixed(1);
		process.stdout.write(`Downloading ${asset.name} (0/${sizeMB} MB)\n`);
		return new Promise<PartResult>((resolve, reject) => {
			stream.on("data", (chunk: Buffer) => {
				loaded += chunk.length;
				if (loaded === asset.size || loaded % (32 * 1024 * 1024) < chunk.length) {
					const pct = Math.min(100, Math.round((loaded / asset.size) * 100));
					process.stdout.write(`\r${asset.name} ${pct}% ${(loaded / 1024 / 1024).toFixed(1)}/${sizeMB} MB   `);
				}
			});
			stream.on("error", reject);
			fileStream.on("error", reject);
			fileStream.on("finish", () => {
				process.stdout.write(`\r${asset.name} 100% ${sizeMB}/${sizeMB} MB\n`);
				resolve({ index, name: asset.name, path: partPath, size: asset.size });
			});
			stream.pipe(fileStream);
		});
	}

	const resultsParts: PartResult[] = await Promise.all(sortedAssets.map((a, i) => downloadPart(a, i)));
	console.log("All parts downloaded. Concatenating...");

	// Concatenate in order
	await new Promise<void>(async (resolve, reject) => {
		const combinedStream = createWriteStream(outArchivePath, { flags: "w" });
		combinedStream.on("error", reject);
		for (const part of resultsParts) {
			await new Promise<void>((res, rej) => {
				const rs = createReadStream(part.path);
				rs.on("error", rej);
				rs.on("end", res);
				rs.pipe(combinedStream, { end: false });
			});
		}
		combinedStream.end();
		combinedStream.on("finish", resolve);
	});

	console.log(`Combined archive written to ${outArchivePath}`);

	// Cleanup part files
	for (const part of resultsParts) {
		try {
			unlinkSync(part.path);
		} catch {}
	}
	// Optionally remove partsDir (keeping empty dir is harmless)

	mkdirSync(outDir, { recursive: true });

	execSync(`tar -xzf ${outArchivePath} -C ${outDir}`, {
		stdio: "pipe",
	});

	const [archive] = readdirSync(outDir);

	const tilesDir = __dirname + "/../public/tiles";

	mkdirSync(tilesDir, { recursive: true });

	// zoom level 11
	renameSync(outDir + "/" + archive, tilesDir + "/11/");
}

const args = process.argv.slice(2);
const releaseTag = args[0];
const repo = args[1] || "murolem/wplace-archives";
const outDir = args[2] || __dirname + "/../archive";

console.log(`Downloading archive from repo: ${repo}, release tag: ${releaseTag || "latest"}, output dir: ${outDir}`);

await downloadArchive(repo, releaseTag, outDir);
