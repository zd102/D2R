import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { enterGame, savedProfile } from './browser-helpers.mjs';
import { PROFILE_PREFIX } from '../src/saves.ts';

await mkdir('.verification', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const state = () => page.evaluate(() => window.eclipseState);
async function key(key) { await page.keyboard.press(key); }
async function fight() {
  let s = await state();
  if (s.dead) throw new Error('Player died');
  if (s.paused) return;
  const near = s.enemies.filter(e => Math.hypot(e.x - s.position.x, e.z - s.position.z) < 8 && (s.shrines.length === 3 || !e.name.includes('莫德雷克'))).sort((a, b) => Math.hypot(a.x - s.position.x, a.z - s.position.z) - Math.hypot(b.x - s.position.x, b.z - s.position.z));
  if (near.length) {
    if (s.hp < 95) await key('1'); if (s.mana < 35) await key('2');
    const target = near[0];
    if (target.screen.x > 160 && target.screen.x < 1180 && target.screen.y > 110 && target.screen.y < 730) await page.mouse.click(target.screen.x, target.screen.y);
    await key('e'); await key('q');
    await page.waitForTimeout(700);
  }
}
async function travel(index, closeEnough = 3.3) {
  for (let attempts = 0; attempts < 100; attempts++) {
    await fight();
    const s = await state(), goal = s.objectives[index];
    if (s.bossDefeated && index === 3) return;
    if (Math.hypot(s.position.x - goal.x, s.position.z - goal.z) < closeEnough) return;
    const route = goal.route;
    assert.ok(route.length, `Path to objective ${index} at ${JSON.stringify(s.position)}`);
    const next = route[0].screen;
    const dx = next.x - 720, dy = next.y - 480;
    const factor = Math.min(1, 320 / Math.max(1, Math.abs(dx)), 220 / Math.max(1, Math.abs(dy)));
    await page.mouse.click(720 + dx * factor, 480 + dy * factor);
    await page.waitForTimeout(450);
  }
  throw new Error(`Travel timed out: ${JSON.stringify(await state())}`);
}
try {
  await page.goto(base); await enterGame(page);
  for (let i = 0; i < 12; i++) {
    const s = await state(); if (s.kills >= 3) break;
    const target = s.enemies.filter(e => e.screen.x > 200 && e.screen.x < 1170 && e.screen.y > 120 && e.screen.y < 750).sort((a, b) => Math.hypot(a.x - s.position.x, a.z - s.position.z) - Math.hypot(b.x - s.position.x, b.z - s.position.z))[0];
    if (target) await page.mouse.click(target.screen.x, target.screen.y);
    await fight(); await page.waitForTimeout(650);
  }
  let s = await state(); assert.ok(s.kills >= 2, `Real combat kills: ${s.kills}`);
  console.log('Fresh-character combat:', JSON.stringify({ kills: s.kills, hp: s.hp, level: s.level }));
  await page.screenshot({ path: '.verification/combat.png' });
  // A durable saved character keeps the full quest traversal deterministic and short.
  await page.getByRole('button', { name: '保存旅程', exact: true }).click();
  const fixture = await savedProfile(page);
  Object.assign(fixture.hero, { strength: 90, spirit: 90, vitality: 100, hp: 600, mana: 340, gold: 500, potions: [50, 50], points: 3 });
  await page.addInitScript(({ fixture, prefix }) => {
    if (!sessionStorage.getItem('fixture-loaded')) {
      localStorage.setItem(prefix + fixture.id, JSON.stringify(fixture)); sessionStorage.setItem('fixture-loaded', '1');
    }
  }, { fixture, prefix: PROFILE_PREFIX });
  await page.reload(); await enterGame(page);
  await travel(4);
  await key('f'); await page.getByRole('dialog', { name: '旅者补给' }).waitFor();
  const goldBefore = (await state()).gold;
  await page.locator('[data-buy="0"]').click(); assert.equal((await state()).gold, goldBefore - 25);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  console.log('Shop transaction passed');
  for (const index of [0, 1, 2]) {
    await travel(index);
    for (let tries = 0; tries < 12; tries++) {
      await fight(); await key('f');
      if ((await state()).shrines.includes(index)) break;
      await page.waitForTimeout(450);
    }
    assert.ok((await state()).shrines.includes(index), `Shrine ${index} cleansed`);
    console.log('Shrine cleansed:', index);
  }
  await travel(3);
  for (let i = 0; i < 30 && !(await state()).bossDefeated; i++) { await fight(); await page.waitForTimeout(400); }
  assert.equal((await state()).bossDefeated, true, 'Boss defeated');
  await page.getByRole('dialog', { name: '长夜将尽' }).waitFor();
  await page.screenshot({ path: '.verification/victory.png' });
  assert.ok((await state()).loot.some(l => l.item), 'Boss drops equipment');
  console.log('Campaign completed:', JSON.stringify({ kills: (await state()).kills, shrines: (await state()).shrines }));
  await page.getByRole('button', { name: '收集战利品', exact: true }).click();
  await page.keyboard.press('i'); await page.getByRole('dialog', { name: '行囊' }).waitFor();
  const bagItem = page.locator('.inventory-grid button').first();
  if (await bagItem.count()) { await bagItem.click(); await page.getByRole('button', { name: '装备', exact: true }).click(); }
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.keyboard.press('c'); await page.getByRole('button', { name: '提升力量', exact: true }).click(); await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.reload(); await enterGame(page);
  assert.equal((await state()).shrines.length, 3); assert.equal((await state()).bossDefeated, true);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '进入第 2 周目', exact: true }).click();
  await enterGame(page);
  await page.waitForFunction(() => window.eclipseState?.stage === 2);
  assert.equal((await state()).shrines.length, 0); assert.equal((await state()).bossDefeated, false);
  assert.deepEqual(errors, []);
  console.log('Equipment, allocation, reload and next journey passed');
} catch (error) { console.log('Failure state:', JSON.stringify(await state())); await page.screenshot({ path: '.verification/campaign-failure.png' }); throw error; }
finally { await browser.close(); }
