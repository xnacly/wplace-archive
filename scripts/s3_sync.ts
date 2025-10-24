import axios from "axios";
import { Octokit } from "octokit";
import * as tar from "tar";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import PQueue from "p-queue";
// import { s3 } from "./s3_client";
import { parentPort, Worker, isMainThread, workerData } from "worker_threads";
import { cpus, tmpdir } from "os";
import { PassThrough } from "stream";
import { createGunzip } from "zlib";
import { awsS3 } from "./s3_client.ts";
import { ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { setGlobalDispatcher, Agent } from "undici";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

setGlobalDispatcher(
	new Agent({
		connections: null,
		// allowH2: true,
		pipelining: 1,
		keepAliveTimeout: 1000 * 60,
		maxConcurrentStreams: 1000,
		maxRequestsPerClient: 1000,
	})
);

const octokit = new Octokit();

const owner = "murolem";
const repo = "wplace-archives";

const BASE_TMP_DIR = path.join(tmpdir(), "wplace", "tiles");

const ensureDir = async (dir: string) => {
	await fsp.mkdir(dir, { recursive: true });
};

async function streamConcatenateAsset(asset: any, tries = 0) {
	try {
		const response = await axios({
			url: asset.browser_download_url,
			method: "GET",
			responseType: "stream",
			onDownloadProgress(progressEvent) {
				const percent = Math.floor((progressEvent.loaded / (asset.size || 1)) * 100);
				console.log(
					`Downloading ${asset.name}: ${percent}% | ${Math.floor(progressEvent.loaded / 1024 / 1024)} MB of ${Math.floor((asset.size || 0) / 1024 / 1024)} MB`
				);
			},
		});

		return response.data as ReadableStream;
	} catch (error) {
		if (tries >= 3) {
			console.error(`Failed to download asset ${asset.name} after ${tries} tries:`, error);
			throw error;
		}

		return streamConcatenateAsset(asset, tries + 1);
	}
}

async function streamConcatenateAssets(assets: any[], keys = new Set<string>(), releaseName: string) {
	let extractedCount = 0;

	const parseStream = new tar.Parser({});
	const queue = new PQueue({ concurrency: 1000 });

	parseStream.on("entry", (entry) =>
		queue.add(async () => {
			try {
				// console.log(`Processing entry: ${entry.path} (${entry.type})`);
				if (entry.type !== "File") {
					entry.resume();
					return;
				}

				const originalPath: string = entry.path;
				const fileName = originalPath.split("/").slice(1).join("/"); // drop top-level folder to match previous behavior
				const s3Key = `tiles/${releaseName}/${fileName}`;

				if (keys.has(s3Key)) {
					console.log(`Skipping existing file: ${originalPath}`);
					entry.resume();
					return;
				}

				const content = await new Promise<Buffer>((resolve, reject) => {
					const chunks: Buffer[] = [];
					entry.on("data", (chunk: Buffer) => {
						chunks.push(chunk);
					});
					entry.on("end", () => {
						resolve(Buffer.concat(chunks));
					});
					entry.on("error", (err: any) => {
						reject(err);
					});
				});

				extractedCount++;

				await uploadToS3({
					releaseName,
					fileName,
					content,
				});
			} catch (error) {
				console.error("Error processing entry:", error);
			}
		})
	);

	const QUEUE = Object.getOwnPropertySymbols(parseStream).find((s) => s.description === "queue")!;
	const BUFFER = Object.getOwnPropertySymbols(parseStream).find((s) => s.description === "buffer")!;

	for (const asset of assets) {
		const stream = await streamConcatenateAsset(asset);

		for await (const chunk of stream) {
			// @ts-ignore
			console.log(`${asset.name} | Queue ${queue.size} | Running: ${queue.pending} | Backlog Tar ${parseStream[QUEUE].length}`);
			// @ts-ignore
			if (parseStream[QUEUE]?.length > 200) {
				await new Promise((resolve) => parseStream.once("drain", resolve));
				console.log("Backpressure: drained parser queue");
			}
			await queue.onSizeLessThan(1); // maximum backpressure

			// console.log(`Writing chunk of size ${chunk.length} to parser`);

			parseStream.write(chunk);
		}

		console.log(`Finished streaming asset: ${asset.name}`);
	}

	await queue.onIdle();

	parseStream.end();

	return extractedCount;
}

async function uploadToS3(opts: { releaseName: string; fileName: string; content: Buffer }) {
	if (!opts.fileName || opts.fileName.endsWith("/")) return;
	if (opts.content.length === 0 && !opts.fileName.includes(".")) return;

	const key = `tiles/${opts.releaseName}/${opts.fileName}`;

	const url = await getSignedUrl(
		awsS3,
		new PutObjectCommand({
			Bucket: process.env.S3_BUCKET_NAME,
			Key: key,
		})
	);

	await fetch(url, {
		method: "PUT",
		body: opts.content as any,
	});

	// await awsS3.send(
	// 	new PutObjectCommand({
	// 		Bucket: process.env.S3_BUCKET_NAME,
	// 		Key: key,
	// 		Body: opts.content,
	// 	})
	// );

	// console.time(`Uploading to S3: ${key}`);
	// await s3.write(key, opts.content, {});
	// console.timeEnd(`Uploading to S3: ${key}`);

	// console.log(`Uploaded to S3: ${key} (${Math.ceil(opts.content.length / 1024)} KB)`);
}

async function downloadRelease(release: any) {
	// Discover existing keys in S3 so we can skip
	const keys = new Set<string>();
	let continuationToken: string | undefined;

	while (true) {
		// const page = await s3.list({
		// 	prefix: `tiles/${release.name}/`,
		// 	maxKeys: 1000,
		// 	continuationToken,
		// });

		const page = await awsS3.send(
			new ListObjectsV2Command({
				Bucket: process.env.S3_BUCKET_NAME,
				Prefix: `tiles/${release.name}/`,
				MaxKeys: 1000,
				ContinuationToken: continuationToken,
			})
		);

		for (const obj of page.Contents ?? []) {
			if (obj.Key) keys.add(obj.Key);
		}

		const isTruncated = page.IsTruncated;
		const next = page.NextContinuationToken;
		if (!isTruncated || !next) break;
		continuationToken = next;
	}
	console.log("Existing tiles in S3:", keys.size, "for release", release.name);

	// Fetch the list of assets for this release
	const assetsResp = await octokit.rest.repos.listReleaseAssets({
		owner,
		repo,
		per_page: 100,
		page: 1,
		release_id: release.id,
	});

	const assetsSorted = assetsResp.data.slice().sort((a, b) => a.name.localeCompare(b.name));

	const { name } = release;
	const baseDir = path.join(BASE_TMP_DIR, name);
	await ensureDir(baseDir);

	// Create a tar parser and stream entries to disk one-by-one

	let extractedCount = await streamConcatenateAssets(assetsSorted, keys, release.name);

	console.log(`${name} | ${extractedCount} files from the archive`);
}

async function main() {
	let page = 0;
	let toFetch = [];

	release_loop: while (true) {
		const { data } = await octokit.rest.repos.listReleases({
			owner,
			repo,
			per_page: 100,
			page,
		});

		// console.log(data);

		for (const release of data) {
			if (!release.published_at) continue;
			const publishedAt = new Date(release.published_at);
			const now = new Date();
			const ageDays = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);

			if (ageDays > 7) {
				if (!toFetch.length) {
					toFetch.push(data.at(-1)!);
				}

				// console.log(`Skipping release ${release.tag_name} (published ${ageDays.toFixed(1)} days ago)`);
				break release_loop;
			}
			toFetch.push(release);
		}

		if (data.length < 100) {
			break;
		}
	}

	const workers = [];

	// const cpuCount = 1; // cpus().length;
	const cpuCount = cpus().length;

	const releasesPerWorker = Math.ceil(toFetch.length / cpuCount);

	for (let i = 0; i < cpuCount; i++) {
		const start = i * releasesPerWorker;
		const end = start + releasesPerWorker;
		const releasesForThisWorker = toFetch.slice(start, end);

		if (releasesForThisWorker.length === 0) continue;

		if (cpuCount === 1) {
			for (const release of releasesForThisWorker) {
				await downloadRelease(release);
			}
			return;
		}

		const worker = new Worker(__filename, {
			workerData: {
				releases: releasesForThisWorker,
			},
		});

		workers.push(
			new Promise<void>((resolve, reject) => {
				worker.on("message", (msg) => {
					console.log("Worker message:", msg);
				});
				worker.on("error", (err) => {
					reject(err);
				});
				worker.on("exit", (code) => {
					if (code !== 0) {
						reject(new Error(`Worker stopped with exit code ${code}`));
					} else {
						resolve();
					}
				});
			})
		);
	}
}
// downloadArchive();

if (isMainThread) {
	main();
} else {
	(async () => {
		const releases: any[] = workerData.releases;
		for (const release of releases) {
			await downloadRelease(release);
		}
		parentPort?.postMessage("Worker done");
	})();
}
