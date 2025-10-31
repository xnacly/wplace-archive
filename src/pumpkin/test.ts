import { tlPxToGps } from "./mercator.ts";



const tileX = 87;
const tileY = 821;
const offsetX = 279;
const offsetY = 497;
const { lat, lng } = tlPxToGps(tileX, tileY, offsetX, offsetY,);

const response = await fetch(`https://backend.wplace.live/s0/pixel/${tileX}/${tileY}?x=${offsetX}&y=${offsetY}`)
const json = await response.json();

console.log(`\n🎃 Pumpkin ${json?.paintedBy.eventClaimNumber} at lat: ${lat}, lng: ${lng} - Event: ${json.event}\nhttps://wplace.live/?lat=${lat}&lng=${lng}&zoom=14\n`);
