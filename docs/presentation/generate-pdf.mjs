import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(__dirname, "DillizntPresentation.html");
const pdfPath = resolve(__dirname, "DillizntPresentation.pdf");

const browser = await chromium.launch();
const page = await browser.newPage();

await page.setViewportSize({ width: 1920, height: 1080 });
await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });

// Wait for fonts to load
await page.waitForTimeout(2000);

await page.pdf({
  path: pdfPath,
  width: "1920px",
  height: "1080px",
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  printBackground: true,
  preferCSSPageSize: false,
});

console.log(`PDF saved to ${pdfPath}`);
await browser.close();
