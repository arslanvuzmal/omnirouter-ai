import { chromium } from '@playwright/test';

/**
 * Ad-hoc screenshot helper used during development.
 *
 * Usage: node scripts/shot.mjs <url> <outputPath> [width] [height] [fullPage]
 */
const [, , url, output, width = '1280', height = '769', fullPage = 'false'] =
  process.argv;

if (!url || !output) {
  console.error('Usage: node scripts/shot.mjs <url> <output> [w] [h] [fullPage]');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(width), height: Number(height) },
  deviceScaleFactor: 2,
});

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.screenshot({ path: output, fullPage: fullPage === 'true' });
await browser.close();

console.log(`captured ${url} -> ${output}`);
