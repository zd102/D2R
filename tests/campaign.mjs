import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, stats, serializeSave } from '../src/model.ts';
import { LEVELS } from '../src/campaign.ts';
import { enterGame, openCampaign, savedProfile } from './browser-helpers.mjs';

await mkdir('.verification', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173', errors = [];
let page;
const state = () => page.evaluate(() => window.eclipseState);
async function fight() {
  const s = await state(); assert.equal(s.dead, false, 'Test hero survives'); if (s.paused) return false;
  const target = s.enemies.filter(enemy => (!enemy.boss || s.area.questReady) && Math.hypot(enemy.x - s.position.x, enemy.z - s.position.z) < 7)
    .sort((a, b) => Math.hypot(a.x - s.position.x, a.z - s.position.z) - Math.hypot(b.x - s.position.x, b.z - s.position.z))[0];
  if (!target || target.screen.x < 160 || target.screen.x > 1180 || target.screen.y < 115 || target.screen.y > 730) return false;
  await page.mouse.click(target.screen.x, target.screen.y); await page.waitForTimeout(300); return true;
}
async function travel(kind, id = 0, radius = kind === 'quest' ? 3.35 : 3.2) {
  for (let tries = 0; tries < 200; tries++) {
    if (await fight()) continue;
    const s = await state(); if (s.bossDefeated && kind === 'boss') return;
    const goal = s.objectives.find(point => point.kind === kind && point.id === id);
    assert.ok(goal, `${kind} ${id} exists`);
    if (Math.hypot(s.position.x - goal.x, s.position.z - goal.z) < radius) return;
    const point = goal.route[0]; assert.ok(point, `Route to ${kind}: ${JSON.stringify(s.position)}`);
    const dx = point.screen.x - 720, dy = point.screen.y - 480, factor = Math.min(1, 320 / Math.max(1, Math.abs(dx)), 220 / Math.max(1, Math.abs(dy)));
    await page.mouse.click(720 + dx * factor, 480 + dy * factor); await page.waitForTimeout(300);
  }
  throw new Error(`Travel timed out in ${(await state()).area.name}: ${kind}`);
}
function veteran(index = 0, ready = false, diff = 0) {
  const hero = newHero(); hero.level = 70; hero.strength = 100; hero.vitality = 500; hero.energy = 100;
  hero.equipment.weapon.minDamage = 1200; hero.equipment.weapon.maxDamage = 1800; hero.equipment.weapon.mods = { attackRating: 1000, lifeSteal: 20, ias: 100 };
  hero.gold = 1000; hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana; hero.potions = [99, 99];
  hero.difficultyLevel = diff; hero.unlockedDifficulty = diff; hero.campaign.current = index;
  hero.campaign.cleared = diff === 0 ? [index, 0, 0] : diff === 1 ? [25, index, 0] : [25, 25, index];
  if (ready) { const quest = LEVELS[index].quest; if (quest.kind === 'kill') hero.campaign.kills = quest.count; else hero.campaign.objects = Array.from({ length: quest.count }, (_, i) => i); }
  return hero;
}
async function open(hero) {
  if (page) await page.close();
  page = await browser.newPage({ viewport: { width: 1440, height: 960 } }); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(save => { if (!sessionStorage.getItem('campaign-combat-fixture')) { localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('campaign-combat-fixture', '1'); } }, serializeSave(hero));
  await page.goto(base); await enterGame(page);
}
async function defeatBoss() {
  await travel('boss');
  for (let tries = 0; tries < 50 && !(await state()).bossDefeated; tries++) { await fight(); await page.waitForTimeout(150); }
  assert.equal((await state()).bossDefeated, true); await expect(page.locator('.panel-victory')).toBeVisible();
}
try {
  await open(veteran());
  await travel('supply'); await page.keyboard.press('f'); await expect(page.locator('.panel-shop')).toBeVisible();
  await page.locator('[data-action="close"]').click();
  await travel('boss'); await defeatBoss();
  assert.equal((await state()).campaign.kills, 8); assert.deepEqual((await state()).campaign.cleared, [1, 0, 0]); assert.equal((await state()).unlockedDifficulty, 0);
  await page.screenshot({ path: '.verification/campaign-first-clear.png' });
  await page.locator('[data-action="next"]').click(); assert.equal((await state()).campaign.current, 1); assert.equal((await state()).paused, false);
  for (let id = 0; id < 2; id++) {
    await travel('quest', id);
    for (let tries = 0; tries < 20 && !(await state()).campaign.objects.includes(id); tries++) { await fight(); await page.keyboard.press('f'); await page.waitForTimeout(200); }
    assert.ok((await state()).campaign.objects.includes(id));
  }
  await defeatBoss(); assert.deepEqual((await state()).campaign.cleared, [2, 0, 0]);
  await page.reload(); await enterGame(page); assert.equal((await state()).bossDefeated, false); assert.equal((await state()).area.questReady, true); assert.equal((await state()).enemies.filter(e => e.boss).length, 1); assert.deepEqual((await savedProfile(page)).hero.campaign.cleared, [2, 0, 0]);
  await openCampaign(page); await page.locator('[data-enter-level="0"]').click();
  assert.deepEqual((await state()).campaign.cleared, [2, 0, 0]); assert.equal((await state()).campaign.kills, 8); assert.equal((await state()).bossDefeated, false);
  console.log('Kill quest, guarded interaction quest, two bosses, next level, reload and replay passed');
  for (const index of [4, 9, 14, 19, 24]) {
    await open(veteran(index, true)); await defeatBoss();
    const s = await state(); assert.equal(s.campaign.cleared[0], index + 1); assert.equal(s.unlockedDifficulty, index === 24 ? 1 : 0);
    await page.screenshot({ path: `.verification/campaign-boss-${LEVELS[index].act + 1}.png` });
    if (index === 4 || index === 24) {
      const before = (await savedProfile(page)).hero, dropIds = (await state()).loot.map(item => item.id);
      await page.locator('[data-replay-current]').click(); await expect(page.locator('[data-replay-current="confirm"]')).toBeVisible();
      if (index === 4) {
        await page.screenshot({ path: '.verification/boss-replay-confirm-desktop.png' });
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.locator('.panel-victory').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
        await page.locator('[data-replay-current="confirm"]').scrollIntoViewIfNeeded();
        await expect(page.locator('[data-cancel-replay]')).toBeVisible(); await page.screenshot({ path: '.verification/boss-replay-confirm-mobile.png' });
        await page.setViewportSize({ width: 1440, height: 960 });
      }
      await page.locator('[data-cancel-replay]').click(); assert.equal((await state()).bossDefeated, true); assert.deepEqual((await state()).loot.map(item => item.id), dropIds);
      await page.locator('[data-replay-current]').click(); await page.locator('[data-replay-current="confirm"]').click();
      const fresh = await state(); assert.equal(fresh.bossDefeated, false); assert.equal(fresh.area.questReady, true); assert.equal(fresh.loot.length, 0); assert.equal(fresh.enemies.filter(e => e.boss).length, 1);
      assert.deepEqual(fresh.campaign.cleared, before.campaign.cleared);
      await defeatBoss(); const after = (await savedProfile(page)).hero;
      assert.deepEqual(after.questRewards, before.questRewards); assert.deepEqual(after.campaign.cleared, before.campaign.cleared); assert.equal(after.unlockedDifficulty, before.unlockedDifficulty);
      assert.ok((await state()).loot.some(item => item.item), 'Repeat boss kills still drop equipment');
      console.log('Repeat boss fight, loot, cancel confirmation and no duplicate first-clear rewards:', LEVELS[index].boss);
    }
    await page.locator('[data-action="next"]').click();
    assert.equal((await state()).campaign.current, index === 24 ? 0 : index + 1); assert.equal((await state()).difficulty, index === 24 ? 1 : 0);
    assert.equal((await state()).bossDefeated, false); assert.equal((await state()).paused, false);
    console.log('Act boss and progression passed:', LEVELS[index].boss);
  }
  await open(veteran(24, true, 1)); await defeatBoss(); assert.equal((await state()).unlockedDifficulty, 2);
  await page.locator('[data-action="next"]').click(); assert.equal((await state()).difficulty, 2);
  assert.deepEqual(errors, []); console.log('Nightmare completion unlocks Hell only after all 25 levels');
} catch (error) {
  if (page && !page.isClosed()) { console.log('Failure state:', JSON.stringify(await state())); await page.screenshot({ path: '.verification/campaign-failure.png' }); }
  throw error;
} finally { await browser.close(); }
