import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import PQueue from "p-queue";
import { join } from "path";
import { tilesDir, readdirRecursive, getAllTiles, emptyTile, sleep } from "./util.ts";
import sharp from "sharp";
// import { HttpProxyAgent } from "http-proxy-agent";
import { Agent, ProxyAgent, fetch } from "undici";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

mkdirSync(tilesDir, { recursive: true });

let calls = 0;
const concurrency = 68;

const client = new Agent({
	keepAliveMaxTimeout: 1000 * 60 * 10,
	keepAliveTimeout: 1000 * 60 * 10,
	keepAliveTimeoutThreshold: 0,
	pipelining: 100,
});

const agents = Array.from({ length: concurrency }, (value, index) => {
	return {
		agent: new ProxyAgent({
			uri: `http://127.0.0.1:${8100 + index + 1}`,
			// uri: `http://127.0.0.1:8100`,
			pipelining: 10,
			// keepAliveTimeout: 1000 * 60 * 10,
			// keepAliveTimeoutThreshold: 0,
			// keepAliveMaxTimeout: 1000 * 60 * 10,
			// allowH2: true,
			// clientFactory(origin, opts) {
			// 	return client;
			// 	return new Agent({
			// 		keepAliveMaxTimeout: 1000 * 60 * 10,
			// 		keepAliveTimeout: 1000 * 60 * 10,
			// 		keepAliveTimeoutThreshold: 0,
			// 		pipelining: 100,
			// 	});
			// },
		}),
		requests: 0,
		timeSinceStart: Date.now(),
	};
});

async function fetchTile(x: number, y: number, tries = 0) {
	const yDir = join(tilesDir, y.toString().padStart(4, "0"));
	const fileName = join(yDir, x.toString().padStart(4, "0") + ".png");
	mkdirSync(yDir, { recursive: true });

	calls++;
	const agentIndex = calls % agents.length;
	agents[agentIndex].requests++;
	const { agent, requests, timeSinceStart } = agents[agentIndex];
	const diff = Date.now() - timeSinceStart;
	try {
		if (requests >= 60 && diff < 60 * 1000) {
			const wait = 60 * 1000 - diff;
			console.log(`Agent ${agentIndex} reached 60 requests in ${diff} ms, waiting ${wait} ms...`);
			await sleep(wait);
			agents[agentIndex].requests = 0;
			agents[agentIndex].timeSinceStart = Date.now();
		}

		var response = await fetch(`https://backend.wplace.live/files/s0/tiles/${x}/${y}.png`, {
			// proxy: `http://localhost:8100`,
			dispatcher: agent,
			keepalive: true,
		});
	} catch (error) {
		if (tries >= 3) {
			throw new Error(`Failed to fetch tile at ${x}, ${y} after 3 attempts: ${error}`);
		}
		await sleep(1000 * tries);
		return fetchTile(x, y, tries + 1);
	}

	if (response.status === 404) {
		writeFileSync(fileName, emptyTile);

		// return null
		return emptyTile; // no pixel has been place in this tile yet
	}
	if (response.status === 429) {
		const retryAfter = response.headers.get("Retry-After") || response.headers.get("X-RateLimit-Reset");
		if (!retryAfter) {
			throw new Error("Rate limit exceeded, but no retry-after header provided");
		}

		const retryAfterMs = parseInt(retryAfter, 10) * 1000;

		console.warn(
			`Rate limit exceeded, retrying after ${retryAfterMs} ms for tile ${x}, ${y}, after ${requests} calls with agent ${agentIndex} ${diff} ms since start`
		);

		calls = 0;

		await new Promise((resolve) => setTimeout(resolve, retryAfterMs));

		return fetchTile(x, y, tries + 1);
	}

	if (!response.ok) {
		throw new Error(`Failed to fetch tile at ${x}, ${y}: ${response.statusText} (${response.status})`);
	}

	const arrayBuffer = await response.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	writeFileSync(fileName, buffer);

	return buffer;
}

const tiles = getAllTiles();

// const maxExistingX = Math.max(...tiles.map((tile) => tile.x), 0);
const maxExistingY = tiles.reduce((max, tile) => (tile.y > max ? tile.y : max), 0);

let maxY = 2048;
let maxX = 2048;

let lastCall = Date.now();

console.log("starting at Y", maxExistingY);

const queue = new PQueue({
	// concurrency,
	interval: 1000 * 60,
	intervalCap: concurrency,
});

let tilesCount = 0;

setInterval(() => {
	console.log(`Tiles per second: ${tilesCount / 10}`);
	tilesCount = 0;
}, 10000);

for (let y = maxExistingY; y < maxY; y++) {
	for (let x = 0; x < maxX; x++) {
		const filePath = join(tilesDir, y.toString().padStart(4, "0"), x.toString().padStart(4, "0") + ".png");
		if (existsSync(filePath)) continue;

		queue.add(async () => {
			try {
				const result = await fetchTile(x, y);

				tilesCount++;

				console.log(`Fetched tile ${x}, ${y} at ${new Date().toLocaleTimeString()}`);
			} catch (error) {
				console.error(`Error fetching tile ${x}, ${y}:`, error);
			}
		});

		await queue.onSizeLessThan(concurrency * 2);
	}
}
