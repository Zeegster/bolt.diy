import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;

try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Missing playwright runtime. Install browsers: pnpm dlx playwright@1.53.0 install chromium');
  process.exit(1);
}

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const OUT_DIR = path.resolve(process.env.OUT_DIR ?? '.planning/tmp-screenshots');
const FILE_PREFIX = process.env.FILE_PREFIX ?? '';
const STRICT_RUNTIME = process.env.STRICT_RUNTIME === '1';

const targets = [
  { name: 'desktop', viewport: { width: 1512, height: 982 } },
  { name: 'tablet', viewport: { width: 1024, height: 1366 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
];

const runtimeErrors = [];

function prefixed(name) {
  return FILE_PREFIX ? `${FILE_PREFIX}-${name}` : name;
}

async function openPublisherIfAvailable(page) {
  const publisherButton = page.getByRole('button', { name: 'Publisher' });

  if (await publisherButton.isVisible().catch(() => false)) {
    await publisherButton.click();
    await page.waitForTimeout(800);
  }
}

async function exerciseWorkspace(page) {
  const sectionNames = ['Основное', 'Дизайн', 'SEO'];

  for (const sectionName of sectionNames) {
    const sectionButton = page.getByRole('button', { name: sectionName }).first();

    if (await sectionButton.isVisible().catch(() => false)) {
      await sectionButton.click();
      await page.waitForTimeout(250);
    }
  }

  const sourceToggle = page.getByRole('button', { name: /Intake Source panel/i }).first();

  if (await sourceToggle.isVisible().catch(() => false)) {
    await sourceToggle.click();
    await page.waitForTimeout(200);
    await sourceToggle.click();
    await page.waitForTimeout(200);
  }

  await page.evaluate(() => {
    const scrollOwners = Array.from(document.querySelectorAll < HTMLElement > '.modern-scrollbar').filter(
      (element) => element.scrollHeight > element.clientHeight + 20,
    );

    for (const [index, element] of scrollOwners.entries()) {
      element.scrollTop = Math.min(element.scrollHeight, Math.round(element.clientHeight * 0.6) + index * 120);
    }
  });

  await page.waitForTimeout(250);
}

async function captureTarget(browser, target) {
  const context = await browser.newContext({ viewport: target.viewport });
  const page = await context.newPage();

  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(`[console:${target.name}] ${message.text()}`);
    }
  });

  page.on('pageerror', (error) => {
    runtimeErrors.push(`[pageerror:${target.name}] ${error.message}`);
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);

  await openPublisherIfAvailable(page);
  await exerciseWorkspace(page);

  const filePath = path.join(OUT_DIR, `${prefixed(target.name)}-scroll.png`);

  await page.screenshot({ path: filePath, fullPage: false });
  await context.close();
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    for (const target of targets) {
      await captureTarget(browser, target);
    }
  } finally {
    await browser.close();
  }

  if (runtimeErrors.length > 0) {
    console.error('Runtime errors detected during smoke run:');

    for (const error of runtimeErrors) {
      console.error(`- ${error}`);
    }

    if (STRICT_RUNTIME) {
      process.exit(1);
    }
  } else {
    console.log('Runtime smoke: no console/page errors detected.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
