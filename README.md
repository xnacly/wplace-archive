# WPlace - World Archive

## Map: [wplace.samuelscheit.com](https://wplace.samuelscheit.com/)

A project to scrape, archive and visualize the entire https://wplace.live map.

The map is divided into 2048x2048 tiles, each with a dimension of 1000x1000 pixels.
Each tile is stored as a PNG file in the `tiles/` directory (not saved to git).
It uses [proton-proxy](https://github.com/samuelscheit/proton-proxy) to parallelize and speed up the scraping process.

## Setup

1. Clone the repository
2. Install dependencies with `npm install`
3. Start a proxy server at `http://localhost:8100`
4. Run the scraper with `node src/scrape/fetch.ts` (NodeJS version 24 is needed or use [bun](https://bun.sh/))
