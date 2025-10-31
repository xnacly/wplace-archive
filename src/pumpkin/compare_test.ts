import { dirname, join } from "path";
import { hasPumpkin } from "./compare.ts";
import { fileURLToPath } from "url";
import sharp from "sharp";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const test = await sharp(join(__dirname, "search.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });


console.log(await hasPumpkin(test))

console.time("test")
console.log(await hasPumpkin(test))
console.timeEnd("test")
