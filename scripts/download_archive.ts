import { mkdirSync, readdirSync, renameSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { downloadArchive } from "./download_archive_util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const releaseTag = args[0];
const repo = args[1] || "murolem/wplace-archives";
const outDir = args[2] || __dirname + "/../archive";

console.log(`Downloading archive from repo: ${repo}, release tag: ${releaseTag || "latest"}, output dir: ${outDir}`);

await downloadArchive(repo, releaseTag, outDir);

const [archive] = readdirSync(outDir);

const tilesDir = __dirname + "/../public/tiles";

mkdirSync(tilesDir, { recursive: true });

// zoom level 11
renameSync(outDir + "/" + archive, tilesDir + "/11/");
