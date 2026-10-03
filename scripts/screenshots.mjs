// Usage: node scripts/screenshots.mjs <baseUrl> <outDir> <path...>   (WIDTHS=360,768,1280,1536)
// Screenshots pages at several widths and reports console errors and horizontal overflow.
import { chromium } from "playwright";
const [,, base, out, ...pages] = process.argv;
const widths = (process.env.WIDTHS || "360,1280").split(",").map(Number);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error" || m.type()==="warning") errors.push(`[${w}] ${page.url()} ${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`[${w}] ${page.url()} pageerror: ${e.message}`));
  for (const p of pages) {
    await page.goto(base + p, { waitUntil: "networkidle" });
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0,0); });
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) errors.push(`[${w}] ${p} HORIZONTAL OVERFLOW ${await page.evaluate(() => document.documentElement.scrollWidth)}`);
    const name = (p === "/" ? "home" : p.replace(/[/?=&]/g, "_")) + `-${w}.png`;
    await page.screenshot({ path: `${out}/${name}`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
console.log(errors.join("\n") || "no console errors");
