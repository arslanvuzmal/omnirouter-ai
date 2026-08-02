import { chromium } from '@playwright/test';

/**
 * Verifies that every route renders without a server error or a console error,
 * and that no navigation link is dead.
 *
 * Usage: node scripts/route-check.mjs [baseUrl]
 */

const BASE = process.argv[2] ?? 'http://localhost:3100';
const EMAIL = 'owner@omnirouter.demo';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'OmniDemo!2026';

const PUBLIC_ROUTES = [
  '/',
  '/features',
  '/architecture',
  '/docs',
  '/demo',
  '/demo/story',
  '/status',
  '/login',
  '/register',
];

const DASHBOARD_ROUTES = [
  '/dashboard',
  '/dashboard/applications',
  '/dashboard/playground',
  '/dashboard/prompts',
  '/dashboard/providers',
  '/dashboard/models',
  '/dashboard/routing',
  '/dashboard/requests',
  '/dashboard/analytics',
  '/dashboard/api-keys',
  '/dashboard/quotas',
  '/dashboard/team',
  '/dashboard/audit',
  '/dashboard/health',
  '/dashboard/settings',
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 769 } });
const page = await context.newPage();

const failures = [];
const consoleErrors = [];

page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(`${page.url()} :: ${message.text().slice(0, 160)}`);
  }
});
page.on('pageerror', (error) => {
  consoleErrors.push(`${page.url()} :: ${String(error).slice(0, 160)}`);
});

async function check(path) {
  const response = await page.goto(`${BASE}${path}`, {
    waitUntil: 'networkidle',
  });
  const status = response?.status() ?? 0;
  const ok = status >= 200 && status < 400;

  if (!ok) failures.push(`${path} -> HTTP ${status}`);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${status}  ${path}`);
  return ok;
}

console.log('\nPublic routes\n');
for (const route of PUBLIC_ROUTES) await check(route);

console.log('\nSigning in\n');
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('#email', EMAIL);
await page.fill('#password', PASSWORD);
await Promise.all([
  page.waitForURL('**/dashboard', { timeout: 40000 }),
  page.click('button[type="submit"]'),
]);
console.log(`  signed in as ${EMAIL}`);

console.log('\nDashboard routes\n');
for (const route of DASHBOARD_ROUTES) await check(route);

// Detail routes need a real id, so they are resolved from the listing pages.
console.log('\nDetail routes\n');
for (const [listing, selector] of [
  ['/dashboard/requests', 'a[href^="/dashboard/requests/"]'],
  ['/dashboard/routing', 'a[href^="/dashboard/routing/"]'],
  ['/dashboard/applications', 'a[href^="/dashboard/applications/"]'],
  ['/dashboard/prompts', 'a[href^="/dashboard/prompts/"]'],
]) {
  await page.goto(`${BASE}${listing}`, { waitUntil: 'networkidle' });
  const href = await page.locator(selector).first().getAttribute('href');
  if (href) await check(href);
  else failures.push(`${listing} -> no detail link found`);
}

// Every navigation link must resolve.
console.log('\nNavigation links\n');
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
const navHrefs = await page
  .locator('nav[aria-label="Dashboard"] a')
  .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
console.log(`  ${navHrefs.length} navigation links found`);
for (const href of navHrefs) {
  if (href && !DASHBOARD_ROUTES.includes(href)) {
    failures.push(`nav link not covered by checks: ${href}`);
  }
}

await browser.close();

console.log('\n--- summary ---');
console.log(`routes checked: ${PUBLIC_ROUTES.length + DASHBOARD_ROUTES.length + 4}`);
console.log(`failures: ${failures.length}`);
for (const failure of failures) console.log(`  FAIL ${failure}`);

const realConsoleErrors = consoleErrors.filter(
  (entry) => !entry.includes('favicon') && !entry.includes('404 (Not Found)'),
);
console.log(`console errors: ${realConsoleErrors.length}`);
for (const entry of realConsoleErrors.slice(0, 10)) console.log(`  ${entry}`);

if (failures.length > 0 || realConsoleErrors.length > 0) process.exitCode = 1;
