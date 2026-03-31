import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;

try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Missing playwright runtime. Install browser binaries first (for example via `pnpm dlx playwright@1.53.0 install chromium`).');
  process.exit(1);
}

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const OUT_DIR = path.resolve('.planning/phases/01-layout-shell/artifacts');
const targets = [
  { file: 'desktop-shell-scroll.png', viewport: { width: 1512, height: 982 } },
  { file: 'tablet-shell-scroll.png', viewport: { width: 1024, height: 1366 } },
  { file: 'mobile-shell-scroll.png', viewport: { width: 390, height: 844 } },
];

async function captureViewport(browser, target) {
  const context = await browser.newContext({ viewport: target.viewport });
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);

  const publisherButton = page.getByRole('button', { name: 'Publisher' });

  if (await publisherButton.isVisible().catch(() => false)) {
    await publisherButton.click();
    await page.waitForTimeout(600);
  }

  const onboardingPanel = page.locator('form:has-text("Site onboarding")').first();

  if (await onboardingPanel.count()) {
    await onboardingPanel.evaluate((element) => {
      element.scrollBy({ top: 300, behavior: 'instant' });
    });
    await page.waitForTimeout(300);
  } else {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(300);
  }

  await page.screenshot({
    path: path.join(OUT_DIR, target.file),
    fullPage: false,
  });

  await context.close();
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    for (const target of targets) {
      await captureViewport(browser, target);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
