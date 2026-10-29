#!/usr/bin/env node
// End-to-end smoke run of the simulator in headless Chromium (Playwright).
//
//   node simulator/test/e2e/smoke.mjs [--out DIR] [--only id,id] [--phone]
//
// Starts serve.mjs on a free port, opens every demo scenario and every
// interactive preset, seeks through each scenario, keys a few DSKY commands,
// and fails on console errors, page errors, failed requests or horizontal
// overflow. Screenshots go to --out (default: a temp directory).
// Playwright is not a dependency of this repository; install it (or use an
// environment that provides it) to run this script.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is not installed; skipping the e2e smoke run.');
  process.exit(0);
}

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const OUT = opt('--out') || mkdtempSync(join(tmpdir(), 'agc-e2e-'));
const ONLY = opt('--only')?.split(',') || null;
const PHONE = args.includes('--phone');
mkdirSync(OUT, { recursive: true });

const PORT = 8300 + Math.floor((process.pid % 500));
const serveFile = fileURLToPath(new URL('../../serve.mjs', import.meta.url));
const server = spawn(process.execPath, [serveFile], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve) => server.stdout.once('data', resolve));
const BASE = `http://127.0.0.1:${PORT}/simulator/`;

const problems = [];
const browser = await chromium.launch();

async function openPage(viewport) {
  const page = await browser.newPage({ viewport });
  const tag = () => page.url().split('#')[1] || '/';
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`[console] ${tag()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`[pageerror] ${tag()}: ${err.message}`));
  page.on('requestfailed', (req) => problems.push(`[request] ${tag()}: ${req.url()} ${req.failure()?.errorText}`));
  page.on('response', (res) => {
    if (res.status() >= 400) problems.push(`[http ${res.status()}] ${tag()}: ${res.url()}`);
  });
  return page;
}

async function checkOverflow(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 1) problems.push(`[overflow] ${label}: page is ${over}px wider than the viewport`);
}

const viewport = PHONE ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const page = await openPage(viewport);
await page.goto(BASE);
await page.waitForFunction(() => window.agcApp && window.agcApp.director);

const { scenarios, presets } = await page.evaluate(() => ({
  scenarios: window.agcApp.uiState().scenarios.map((s) => ({ id: s.id, title: s.title })),
  presets: window.agcApp.uiState().presets.map((p) => ({ id: p.id, title: p.title })),
}));

for (const sc of scenarios) {
  if (ONLY && !ONLY.includes(sc.id)) continue;
  await page.goto(`${BASE}#/demo/${sc.id}`);
  await page.waitForFunction((id) => window.agcApp.director.state.scenarioId === id, sc.id);
  for (const [i, frac] of [0.02, 0.35, 0.7, 0.999].entries()) {
    await page.evaluate(async (f) => {
      const d = window.agcApp.director;
      d.pause();
      await d.seek(d.state.start + f * (d.state.end - d.state.start));
    }, frac);
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(OUT, `demo-${sc.id}-${i}.png`) });
  }
  // Let it play a moment to exercise the live path.
  await page.evaluate(() => {
    const d = window.agcApp.director;
    d.seek(d.state.start + 0.5 * (d.state.end - d.state.start)).then(() => { d.setSpeed(8); d.play(); });
  });
  await page.waitForTimeout(1500);
  await checkOverflow(page, `demo ${sc.id}`);
  const state = await page.evaluate(() => window.agcApp.director.state);
  if (state.error) problems.push(`[director] ${sc.id}: ${state.error}`);
  console.log(`demo ${sc.id}: ok (${sc.title})`);
}

for (const pr of presets) {
  if (ONLY && !ONLY.includes(pr.id)) continue;
  await page.goto(`${BASE}#/interactive/${pr.id}`);
  await page.waitForFunction((id) => window.agcApp.preset?.id === id, pr.id);
  await page.waitForTimeout(800);
  // Key a lamp test and a clock monitor the way a user would.
  for (const k of ['v', '3', '5', 'e']) await page.keyboard.press(k);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, `interactive-${pr.id}-v35.png`) });
  await page.waitForTimeout(5200);
  for (const k of ['v', '1', '6', 'n', '3', '6', 'e']) await page.keyboard.press(k);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, `interactive-${pr.id}.png`) });
  await checkOverflow(page, `interactive ${pr.id}`);
  console.log(`interactive ${pr.id}: ok (${pr.title})`);
}

await browser.close();
server.kill();

console.log(`\nScreenshots: ${OUT}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${[...new Set(problems)].join('\n')}`);
  process.exit(1);
}
console.log('No console errors, page errors, failed requests or overflow.');
