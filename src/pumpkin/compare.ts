import { dirname, join } from "path";
import sharp, { type OutputInfo } from "sharp";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type NativePumpkin = {
	setPumpkinData(data: Buffer, width: number, height: number, channels: number): void;
	findPumpkin(data: Buffer, width: number, height: number, channels: number): { x: number; y: number } | null;
};

const addonPath = join(__dirname, "..", "..", "build", "Release", "pumpkin.node");
const nativePumpkin: NativePumpkin = require(addonPath);

const pumpkinReady = (async () => {
	const pumpkinPath = join(__dirname, "pumpkin.png");
	const pumpkin = await sharp(pumpkinPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

	const { data, info } = pumpkin;

	if (info.channels !== 4) {
		throw new Error(`Unexpected pumpkin channel count: ${info.channels}`);
	}

	nativePumpkin.setPumpkinData(data, info.width, info.height, info.channels);

	return info;
})();

export async function hasPumpkin(input: { data: Buffer; info: OutputInfo }, logMatches = false) {
	const { data, info } = input;

	if (info.channels !== 4) {
		throw new Error(`Unexpected search image channel count: ${info.channels}`);
	}

	await pumpkinReady;

	const match = nativePumpkin.findPumpkin(data, info.width, info.height, info.channels);

	if (match && logMatches) {
		console.log("Match found at:", match);
	}

	return match ?? undefined;
}
