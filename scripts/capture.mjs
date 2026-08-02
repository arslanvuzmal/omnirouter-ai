import { mkdir } from 'node:fs/promises';

import { chromium } from '@playwright/test';

/**
 * Portfolio screenshot capture.
 *
 * Signs in as a real seeded account and drives the real application, so every
 * image is a genuine capture of the running product rather than a mock-up.
 *
 * Usage: node scripts/capture.mjs [baseUrl]
 */

const BASE = process.argv[2] ?? 'http://localhost:3100';
const OUT = 'portfolio/screenshots';
const DESKTOP = { width: 1280, height: 769 };
const MOBILE = { width: 390, height: 844 };

const EMAIL = 'owner@omnirouter.demo';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'OmniDemo!2026';

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: DESKTOP,
  deviceScaleFactor: 2,
});
const page = await context.newPage();

const captured = [];

async function shot(name, { fullPage = false } = {}) {
  // Settle layout and any chart animation before capturing.
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}`, fullPage });
  captured.push(name);
  console.log(`  captured ${name}`);
}

async function go(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
}

console.log(`\nCapturing portfolio screenshots from ${BASE}\n`);

// 01 — landing
await go('/');
await shot('01-landing-page.png');

// Sign in with a real account against the real form.
await go('/login');
await page.fill('#email', EMAIL);
await page.fill('#password', PASSWORD);
await Promise.all([
  page.waitForURL('**/dashboard', { timeout: 30_000 }),
  page.click('button[type="submit"]'),
]);

// 02 — dashboard overview
await shot('02-overview-dashboard.png');

// 09 — analytics
await go('/dashboard/analytics');
await shot('09-usage-analytics.png');

// 03/04 — routing policy builder and decision preview
await go('/dashboard/routing');
await shot('03-routing-policy-builder.png');

const policyLink = page.locator('a[href^="/dashboard/routing/"]').first();
if ((await policyLink.count()) > 0) {
  await policyLink.click();
  await page.waitForLoadState('networkidle');
  await shot('04-routing-decision-preview.png');
}

// 05 — playground
await go('/dashboard/playground');
await shot('05-playground.png');

// 08 — request explorer
await go('/dashboard/requests');
await shot('08-request-inspector.png');

// 07 — a request that actually fell back, so the trace shows a real recovery
await go('/dashboard/requests?fallback=true');
const fallbackRow = page.locator('a[href^="/dashboard/requests/"]').first();
if ((await fallbackRow.count()) > 0) {
  await fallbackRow.click();
  await page.waitForLoadState('networkidle');
  await shot('07-fallback-trace.png', { fullPage: true });
}

// 10 — provider health
await go('/dashboard/health');
await shot('10-provider-health.png');

// 11 — API key management
await go('/dashboard/api-keys');
await shot('11-api-key-management.png');

// 06 — model comparison
await go('/demo/story');
await shot('06-model-comparison.png', { fullPage: true });

// 12 — mobile dashboard
await page.setViewportSize(MOBILE);
await go('/dashboard');
await shot('12-mobile-dashboard.png');

await browser.close();

console.log(`\n${captured.length} screenshots written to ${OUT}\n`);
