import axios from "axios";
import { createWriteStream, createReadStream, mkdirSync, readdirSync, renameSync, unlinkSync } from "fs";
import { dirname } from "path";
import { Readable } from "stream";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function downloadArchive(repo: string = "murolem/wplace-archives", releaseTag?: string, outDir = __dirname + "/../archive") {
	const { data: release } = await axios(`https://api.github.com/repos/${repo}/releases/tags/${releaseTag || "latest"}`);

	const release_tag_name = releaseTag || release.tag_name;

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
		const sizeMB = (asset.size / 1024 / 1024).toFixed(1);
		process.stdout.write(`Downloading ${asset.name} (0/${sizeMB} MB)\n`);
		const maxRetries = 5;
		let attempt = 0;
		while (attempt < maxRetries) {
			try {
				const response = await axios<Readable>(asset.browser_download_url, { responseType: "stream" });
				const stream: Readable = response.data as unknown as Readable;
				const fileStream = createWriteStream(partPath);
				let loaded = 0;
				return await new Promise<PartResult>((resolve, reject) => {
					stream.on("data", (chunk: Buffer) => {
						loaded += chunk.length;
						if (loaded === asset.size || loaded % (32 * 1024 * 1024) < chunk.length) {
							const pct = Math.min(100, Math.round((loaded / asset.size) * 100));
							process.stdout.write(`\r${asset.name} ${pct}% ${(loaded / 1024 / 1024).toFixed(1)}/${sizeMB} MB   `);
						}
					});
					stream.on("error", (err) => {
						reject(err);
					});
					fileStream.on("error", (err) => {
						reject(err);
					});
					fileStream.on("finish", () => {
						process.stdout.write(`\r${asset.name} 100% ${sizeMB}/${sizeMB} MB\n`);
						resolve({ index, name: asset.name, path: partPath, size: asset.size });
					});
					stream.pipe(fileStream);
				});
			} catch (err: any) {
				attempt++;
				if (attempt < maxRetries) {
					process.stdout.write(
						`\nError downloading ${asset.name} (attempt ${attempt}): ${err.code || err.message}. Retrying...\n`,
					);
					await new Promise((res) => setTimeout(res, 2000 * attempt));
				} else {
					process.stdout.write(`\nFailed to download ${asset.name} after ${maxRetries} attempts.\n`);
					throw err;
				}
			}
		}
		throw new Error(`Failed to download ${asset.name} after ${maxRetries} attempts.`);
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
}
