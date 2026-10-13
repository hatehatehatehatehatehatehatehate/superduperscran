// browser-test.mjs: headless end-to-end check of Eli's Scrandle Rip.
// Starts serve.py with a temp answers dir, plays real games with mouse + keyboard,
// and verifies every answer landed in answers.jsonl / answers.csv. Also smoke-tests file://.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '/home/johnssmith/.hermes/hermes-agent/node_modules/playwright/index.mjs';

const root = new URL('.', import.meta.url).pathname;
const shots = path.join(root, 'screenshots');
fs.mkdirSync(shots, { recursive: true });
const answersDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esr-answers-'));
const port = 8800 + Math.floor(Math.random() * 150);
const server = spawn('python3', ['serve.py', '--port', String(port), '--no-open', '--answers-dir', answersDir], { cwd: root, stdio: 'ignore' });
const stop = () => { try { server.kill(); } catch { /* already gone */ } };
process.on('exit', stop);
const base = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(base + 'api/health')).ok) break; } catch { /* not up yet */ }
  await new Promise(r => setTimeout(r, 100));
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const watch = page => {
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
};
const readAnswers = () => fs.readFileSync(path.join(answersDir, 'answers.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const page = await browser.newPage({ viewport: { width: 1360, height: 980 } });
watch(page);
await page.goto(base);
await page.getByRole('button', { name: /Serve it up/ }).waitFor();
await page.waitForFunction(() => window.__esr.Saver.mode === 'file');
assert.match(await page.textContent('#save-text'), /answers\.jsonl/);
assert.ok(await page.evaluate(() => window.__esr.DB.foods.length) > 1000, 'food database loaded');
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(shots, 'lobby.png') });

// categories: locked venues can't be chosen; dishes can
await page.getByRole('button', { name: 'Venues', exact: true }).click();
assert.ok(await page.locator('.cat.locked').count() >= 10, 'unfilled venue types show as locked');
await page.locator('.cat.locked').first().click({ force: true }); // aria-disabled, but still explains itself
await page.getByText('waiting for photos').waitFor();
await page.getByRole('button', { name: 'Dishes', exact: true }).click();
await page.locator('[data-cat="dish:pie"]').click();
assert.equal(await page.evaluate(() => window.__esr.ui.settings.categoryId), 'dish:pie');
await page.getByRole('button', { name: /Serve it up/ }).click();

// music started on the first gesture
await page.waitForFunction(() => window.__esr.Sound.isPlaying());
assert.match(await page.textContent('#music-btn'), /on/);

// ---- classic game: 10 rounds, alternating mouse clicks and keyboard
await page.locator('#arena .card').first().waitFor();
const seen = new Set();
for (let round = 1; round <= 10; round++) {
  const pair = await page.evaluate(() => window.__esr.ui.game.pair.map(f => ({ id: f.id, source: f.source, dishes: f.dishes })));
  for (const f of pair) { assert.ok(!seen.has(f.id), 'no repeats'); seen.add(f.id); assert.ok(f.dishes.includes('pie'), 'category respected'); }
  assert.equal(pair[0].source, pair[1].source, 'same rating source');
  const imgOk = await page.locator('#arena img').evaluateAll(imgs => Promise.all(imgs.map(i => i.complete ? i.naturalWidth > 0
    : new Promise(r => { i.onload = () => r(true); i.onerror = () => r(false); }))));
  assert.deepEqual(imgOk, [true, true], 'both Scrandle photos load from the local cache');
  if (round === 1) { await page.waitForTimeout(500); await page.screenshot({ path: path.join(shots, 'game.png') }); }
  if (round % 2) await page.locator('#arena .card').nth(round % 4 === 1 ? 0 : 1).click();
  else await page.keyboard.press(round % 4 === 0 ? 'ArrowLeft' : '2');
  await page.locator('#next-btn').waitFor();
  if (round === 1) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(shots, 'reveal.png') }); }
  if (round < 10) await page.keyboard.press('Enter'); else await page.locator('#next-btn').click();
}
await page.locator('.grade').waitFor();
await page.screenshot({ path: path.join(shots, 'results.png'), fullPage: true });
assert.equal(await page.locator('.history > div').count(), 10);
await page.waitForFunction(() => window.__esr.Saver.serverCount === 10 && window.__esr.Saver.mode === 'file');

// ---- the answers really are in the files
const lines = readAnswers();
assert.equal(lines.length, 10);
const local = await page.evaluate(() => JSON.parse(localStorage.getItem('esr:answers')));
assert.deepEqual(lines.map(l => l.pickedId), local.map(l => l.pickedId), 'file matches what was played');
assert.ok(lines.every(l => l.category === 'dish:pie' && l.mode === 'classic' && typeof l.correct === 'boolean' && l.ms >= 0));
const csv = fs.readFileSync(path.join(answersDir, 'answers.csv'), 'utf8').trim().split(/\r?\n/);
assert.equal(csv.length, 11, 'CSV header + 10 rows');
assert.ok(csv[0].startsWith('ts,session,mode'));

// ---- pass the plate: 2 players x 3 rounds
await page.getByRole('button', { name: 'Back to the lobby' }).click();
await page.locator('[data-mode="party"]').click();
await page.locator('[data-player="0"]').fill('Eli');
await page.locator('[data-player="1"]').fill('Sam');
await page.locator('[data-rounds="3"]').click();
await page.getByRole('button', { name: 'Everything', exact: true }).click();
await page.locator('[data-cat="all:everything"]').click();
await page.getByRole('button', { name: /Serve it up/ }).click();
const turns = [];
for (let i = 0; i < 6; i++) {
  await page.locator('#arena .card').first().waitFor();
  turns.push((await page.textContent('#turn')).trim());
  await page.keyboard.press('1');
  await page.locator('#next-btn').waitFor();
  await page.locator('#next-btn').click();
}
assert.deepEqual(turns, ["Eli's turn", "Sam's turn", "Eli's turn", "Sam's turn", "Eli's turn", "Sam's turn"]);
await page.locator('.podium').waitFor();
await page.screenshot({ path: path.join(shots, 'party-results.png'), fullPage: true });
await page.waitForFunction(() => window.__esr.Saver.serverCount === 16);
assert.deepEqual([...new Set(readAnswers().slice(10).map(r => r.player))].sort(), ['Eli', 'Sam']);

// ---- mobile layout
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
watch(phone);
await phone.goto(base);
await phone.locator('[data-mode="classic"]').tap();
await phone.getByRole('button', { name: /Serve it up/ }).tap();
await phone.locator('#arena .card').first().waitFor();
await phone.waitForTimeout(600);
await phone.screenshot({ path: path.join(shots, 'mobile.png'), fullPage: true });
assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll on phones');

// ---- file:// still plays (answers stay in the browser log)
const offline = await browser.newPage();
watch(offline);
await offline.goto('file://' + root + 'index.html');
await offline.getByRole('button', { name: /Serve it up/ }).waitFor();
assert.equal(await offline.evaluate(() => window.__esr.Saver.mode), 'local');
await offline.getByRole('button', { name: /Serve it up/ }).click();
await offline.locator('#arena .card').first().click();
await offline.locator('#next-btn').waitFor();
assert.equal(await offline.evaluate(() => JSON.parse(localStorage.getItem('esr:answers')).length), 1);

await browser.close();
stop();
fs.rmSync(answersDir, { recursive: true, force: true });
assert.deepEqual(errors, [], 'no console errors');
console.log(`browser test passed: 16 answers saved to file, screenshots in ${path.relative(root, shots)}/`);

