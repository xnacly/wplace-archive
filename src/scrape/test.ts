import { ProxyAgent, fetch, setGlobalDispatcher } from "undici";

const agent = new ProxyAgent("http://127.0.0.1:8100");

setGlobalDispatcher(agent);

const response = await fetch("https://api.myip.com", {
	dispatcher: agent,
})
const json = await response.json();

console.log(json);

