#!/usr/bin/env node
// Temporary debug script — inspect Keep checklist editor DOM structure
// Run: node scraper/debug-keep.js

const { chromium } = require('playwright');
const path         = require('path');
const CONFIG       = require('./config');
const SESSION_FILE = path.join(__dirname, '.session', 'state.json');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context  = await browser.newContext({ storageState: SESSION_FILE });
  const page     = await context.newPage();

  await page.goto('https://keep.google.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('div[role="textbox"]').length > 0, { timeout: 30000, polling: 500 });
  await page.waitForTimeout(2000);

  // Click Shopping List open
  await page.evaluate(() => {
    const els = document.querySelectorAll('div[role="textbox"]');
    for (const el of els) {
      if (el.innerText.trim() === 'Shopping List') { el.click(); return; }
    }
  });

  await page.waitForSelector('.oT9UPb', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const info = await page.evaluate(() => {
    const editor = document.querySelector('.oT9UPb');
    if (!editor) return { error: 'No .oT9UPb editor found' };

    const allCheckboxes = Array.from(editor.querySelectorAll('div[role="checkbox"]'));

    // Sample first 3, middle 3, last 3
    const mid   = Math.floor(allCheckboxes.length / 2);
    const idxs  = [0, 1, 2, mid - 1, mid, mid + 1, allCheckboxes.length - 3, allCheckboxes.length - 2, allCheckboxes.length - 1].filter((i) => i >= 0 && i < allCheckboxes.length);
    const unique = [...new Set(idxs)];

    const sample = unique.map((i) => {
      const cb   = allCheckboxes[i];
      const row  = cb.parentElement?.parentElement;
      const rect = cb.getBoundingClientRect();
      const p1   = cb.parentElement;
      const p2   = p1?.parentElement;
      const p3   = p2?.parentElement;
      return {
        i,
        text:          (row?.innerText || '').replace(/\n/g, ' ').slice(0, 40),
        ariaChecked:   cb.getAttribute('aria-checked'),
        rect:          { w: Math.round(rect.width), h: Math.round(rect.height), top: Math.round(rect.top), bottom: Math.round(rect.bottom) },
        p1class:       (p1?.className || '').slice(0, 60),
        p2class:       (p2?.className || '').slice(0, 60),
        p3class:       (p3?.className || '').slice(0, 60),
        p1hidden:      p1?.hasAttribute('hidden'),
        p2hidden:      p2?.hasAttribute('hidden'),
        p1ariaHidden:  p1?.getAttribute('aria-hidden'),
        p2ariaHidden:  p2?.getAttribute('aria-hidden'),
        p1display:     getComputedStyle(p1 || cb).display,
        p2display:     getComputedStyle(p2 || cb).display,
      };
    });

    // All role=button text in editor
    const buttons = Array.from(editor.querySelectorAll('[role="button"]')).map((b) => ({
      text:  (b.innerText || b.getAttribute('aria-label') || '').replace(/\n/g, ' ').slice(0, 80),
      class: (b.className || '').slice(0, 60),
    }));

    // Unique parent classes at p2 level (helps identify section containers)
    const p2Classes = [...new Set(allCheckboxes.map((cb) => (cb.parentElement?.parentElement?.className || '').slice(0, 80)))];

    return { totalCheckboxes: allCheckboxes.length, sample, buttons, p2Classes };
  });

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
}

main().catch((err) => { console.error(err.message); process.exit(1); });
