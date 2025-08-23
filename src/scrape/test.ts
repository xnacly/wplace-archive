// @ts-ignore
import { randomDispatcher } from 'freebind'
import { ProxyAgent, fetch, setGlobalDispatcher } from "undici";

// const agent = new ProxyAgent("http://127.0.0.1:8100");

// setGlobalDispatcher(agent);
const dispatcher = randomDispatcher('fc00:dead:beef::/48')

const response = await fetch("https://api64.ipify.org/", {
	dispatcher,
})
const data = await response.text();

console.log(data);

