// Looks at a page of the running app while a shot is written: node peek.mjs URL out.png ['steps as JS, `page` given']
import { chromium } from 'playwright';
const [url, out, steps] = process.argv.slice(2);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(3000);
try { if (steps) console.log(await new Function('page', `return (async () => { ${steps} })()`)(page) ?? ''); }
catch (e) { console.log('FAILED', e.message.split('\n')[0]); }
if (out) await page.screenshot({ path: out });
await browser.close();
