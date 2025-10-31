// @ts-ignore
import { randomDispatcher, dispatcherFromIP } from './freebind/dispatcher.js';
// @ts-ignore
import ipaddr from 'ipaddr.js';
import { ProxyAgent, fetch, setGlobalDispatcher } from "undici";
import { config } from "dotenv"
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({
	path: join(__dirname, '..', '..', '.env')
})

const BASE_IP = process.env.FREEBIND_BASE_IP
if (!BASE_IP) throw new Error('FREEBIND_BASE_IP environment variable is not set');

const BASE_IP_VALUE = ipaddr.parse(BASE_IP).toByteArray()
	.reduce<bigint>((acc, byte) => (acc << 8n) + BigInt(byte), 0n);
const IPV6_MAX = (1n << 128n) - 1n;
export const MAX_OFFSET = IPV6_MAX - BASE_IP_VALUE;


let ipStart = 1n;

export function setIPStart(offset: bigint) {
	if (offset < 0n || offset > MAX_OFFSET) {
		throw new Error('IP offset out of range');
	}
	ipStart = offset + BigInt(Math.floor(Math.random() * 10000000));
	// ipStart = offset
}

function bigintToIPv6(value: bigint): string {
	const bytes = new Array<number>(16);

	let remaining = value;
	for (let idx = 15; idx >= 0; idx -= 1) {
		bytes[idx] = Number(remaining & 0xffn);
		remaining >>= 8n;
	}

	return ipaddr.fromByteArray(bytes).toString();
}

let count = 0

// Increment the base IPv6 address sequentially until the 128-bit space is exhausted.
function getNextIP(): string {
	if (ipStart > MAX_OFFSET) {
		throw new Error('IPv6 range exhausted');
	}

	const ipValue = BASE_IP_VALUE + ipStart;

	// if (++count >= 50) {
	// 	count = 0
	// }
	ipStart += 1n;

	return bigintToIPv6(ipValue);
}

export function getDispatcher() {
	return randomDispatcher(`${BASE_IP}/48`)
}
