import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

async function main() {
  const artifactDir = 'C:/Users/TheMe/.gemini/antigravity-ide/brain/252fff75-1a3c-443e-9f8a-567776e65b2d';
  const browser = await chromium.launch({ headless: true });
  
  // 1. Desktop 1440px
  const contextDesktop = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const pageDesktop = await contextDesktop.newPage();
  await pageDesktop.goto('http://localhost:5173/landing', { waitUntil: 'networkidle' });
  await pageDesktop.screenshot({ path: path.join(artifactDir, 'desktop_redesign_full.png'), fullPage: true });
  await pageDesktop.screenshot({ path: path.join(artifactDir, 'desktop_redesign_hero.png'), clip: { x: 0, y: 0, width: 1440, height: 900 } });
  
  // 2. Tablet 768px
  const contextTablet = await browser.newContext({
    viewport: { width: 768, height: 1024 }
  });
  const pageTablet = await contextTablet.newPage();
  await pageTablet.goto('http://localhost:5173/landing', { waitUntil: 'networkidle' });
  await pageTablet.screenshot({ path: path.join(artifactDir, 'tablet_redesign_full.png'), fullPage: true });

  // 3. Mobile 375px
  const contextMobile = await browser.newContext({
    viewport: { width: 375, height: 812 }
  });
  const pageMobile = await contextMobile.newPage();
  await pageMobile.goto('http://localhost:5173/landing', { waitUntil: 'networkidle' });
  await pageMobile.screenshot({ path: path.join(artifactDir, 'mobile_redesign_full.png'), fullPage: true });

  await browser.close();
  console.log('All redesign screenshots captured successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
