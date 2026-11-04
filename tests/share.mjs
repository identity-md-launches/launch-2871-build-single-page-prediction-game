// Render the editable social artwork into its required static PNG runtime asset.
import { readFile } from "node:fs/promises";
import { dependency } from "./harness.mjs";
const { chromium } = await dependency("playwright");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  const font = (
    await readFile("public/fonts/nunito-sans-latin.woff2")
  ).toString("base64");
  const svg = await readFile("src/assets/share.svg", "utf8");
  await page.setContent(
    `<style>@font-face{font-family:'Nunito Sans';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:400 800}body{margin:0;line-height:0}</style>${svg}`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "public/share.png" });
  console.log(
    "Rendered public/share.png (1200 × 630) from src/assets/share.svg",
  );
} finally {
  await browser.close();
}
