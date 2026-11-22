// deck.html → deck.pdf and one PNG per slide (to look over). Run from scripts/demo_video (it has Playwright):
//   cd scripts/demo_video && node ../../docs/pitch/render.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(new URL("../../scripts/demo_video/package.json", import.meta.url))("playwright");
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await pg.goto("file://" + path.join(dir, "deck.html"), { waitUntil: "networkidle" });
await pg.evaluate(() => document.fonts.ready);
await pg.pdf({ path: path.join(dir, "deck.pdf"), width: "1920px", height: "1080px", printBackground: true });
const n = await pg.locator(".slide").count();
for (let i = 0; i < n; i++) await pg.locator(".slide").nth(i).screenshot({ path: path.join(dir, "preview", `${i + 1}.png`) });
console.log(`${n} slides`);
await b.close();
