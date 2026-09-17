import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, stats } from '../src/model.ts';
import { LEVELS, eliteCount, levelLayout } from '../src/campaign.ts';
import { encounterPlan } from '../src/encounter-plan.ts';
import { SUPER_UNIQUE_AFFIXES } from '../src/monster-affixes.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { monsterStats } from '../src/balance.ts';
import { PROFILE_PREFIX } from '../src/saves.ts';
import { enterGame, openCampaign, savedProfile } from './browser-helpers.mjs';

const output = process.env.OUTPUT_DIR || '.verification/elites-check';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173/?mode=local', errors = [];
const state = page => page.evaluate(() => window.eclipseState);
const hero = newHero(); hero.level = 90; hero.vitality = 3000; hero.campaign.cleared = [25, 25, 25]; hero.unlockedDifficulty = 2;
hero.hp = stats(hero).maxHp; hero.equipment.weapon.mods = { attackRating: 10000 }; hero.equipment.weapon.minDamage = hero.equipment.weapon.maxDamage = 10000;
async function start(viewport, touch = false) {
  const page = await browser.newPage({ viewport, isMobile: touch, hasTouch: touch });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ hero, prefix }) => {
    if (sessionStorage.getItem('elite-fixture')) return;
    localStorage.setItem(prefix + 'elite-test', JSON.stringify({ version: 2, id: 'elite-test', name: '精英试炼', createdAt: 1, updatedAt: 1, revision: 1, hero }));
    sessionStorage.setItem('elite-fixture', '1');
  }, { hero, prefix: PROFILE_PREFIX });
  await page.goto(base); await enterGame(page); return page;
}
async function choose(page, index, difficulty) {
  await openCampaign(page);
  await page.locator(`[data-campaign-difficulty="${difficulty}"]`).click();
  await page.locator(`[data-campaign-act="${Math.floor(index / 5)}"]`).click();
  await page.locator(`[data-enter-level="${index}"]`).click();
  await page.waitForFunction(({ index, difficulty }) => !window.eclipseState.inCamp && window.eclipseState.campaign.current === index && window.eclipseState.difficulty === difficulty && !window.eclipseState.paused, { index, difficulty });
}
async function approachElite(page) {
  for (let i = 0; i < 120; i++) {
    const s = await state(page), elite = s.enemies.find(enemy => enemy.elite);
    assert.ok(elite, 'The elite remains alive before attacking');
    if (Math.hypot(elite.x - s.position.x, elite.z - s.position.z) < 6) return elite.id;
    const next = elite.route[0]; assert.ok(next, 'Path to elite');
    const { width, height } = page.viewportSize(), dx = next.screen.x - width / 2, dy = next.screen.y - height / 2;
    const scale = Math.min(1, width * .23 / Math.max(1, Math.abs(dx)), height * .1 / Math.max(1, Math.abs(dy)));
    await page.mouse.click(width / 2 + dx * scale, height / 2 + dy * scale); await page.waitForTimeout(180);
  }
  throw new Error('Elite approach timed out');
}
async function pixels(page) {
  const count = await page.evaluate(() => {
    const copy = document.createElement('canvas'); copy.width = copy.height = 80;
    const ctx = copy.getContext('2d'); ctx.drawImage(document.querySelector('#game-canvas'), 0, 0, 80, 80);
    const data = ctx.getImageData(0, 0, 80, 80).data, colors = new Set();
    for (let i = 0; i < data.length; i += 4) colors.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
    return colors.size;
  });
  assert.ok(count > 70);
}
async function defeatElite(page, id) {
  for (let tries = 0; tries < 80; tries++) {
    const elite = (await state(page)).enemies.find(enemy => enemy.id === id); if (!elite) break;
    await page.mouse.click(elite.screen.x, elite.screen.y); await page.waitForTimeout(200);
  }
  assert.ok(!(await state(page)).enemies.some(enemy => enemy.id === id));
  assert.equal((await state(page)).bossDefeated, false);
}
try {
  const page = await start({ width: 1440, height: 960 });
  // Allow retrying interactions after the complete 75-area matrix has passed.
  for (const difficulty of process.env.ELITE_INTERACTIONS_ONLY === '1' ? [] : [0, 1, 2]) {
    for (const area of LEVELS) {
      await choose(page, area.index, difficulty);
      const s = await state(page), elites = s.enemies.filter(enemy => enemy.elite);
      assert.equal(elites.length, eliteCount(area, difficulty));
      assert.equal(s.enemies.filter(enemy => enemy.boss).length, 1);
      assert.equal(s.enemies.filter(enemy => !enemy.boss && !enemy.elite).length, encounterPlan(area, levelLayout(area, s.area.seed), difficulty).normalCount);
      for (const elite of elites) {
        assert.equal(elite.boss, false); assert.equal(elite.summoned, false);
        const baseHp = monsterStats(MONSTERS[elite.species], area, difficulty, false, true).maxHp;
        assert.equal(elite.affixes.length, difficulty + 1);
        assert.ok(elite.maxHp >= baseHp && elite.maxHp <= Math.round(baseHp * 1.18));
        assert.ok(elite.route.length); const end = elite.route.at(-1);
        assert.ok(Math.hypot(end.x - elite.x, end.z - elite.z) < 1.5, `${area.id}/${difficulty}: elite reachable`);
      }
      const champions = s.enemies.filter(enemy => enemy.champion);
      assert.ok(champions.length >= elites.length * 2, 'Each elite has a champion pack');
      for (const champion of champions) {
        assert.ok(['champion', 'berserker', 'fanatic', 'ghostly', 'possessed'].includes(champion.champion));
        assert.equal(champion.elite, false); assert.equal(champion.boss, false);
        assert.ok(elites.some(e => e.pack === champion.pack && Math.hypot(e.x - champion.x, e.z - champion.z) < 6));
      }
      for (const enemy of s.enemies) assert.ok(Object.values(enemy.resistances).every(r => r <= 85));
      const boss = s.enemies.find(enemy => enemy.boss);
      assert.equal(boss.superUnique, !area.actBoss);
      assert.equal(boss.affixes.length, area.actBoss ? 0 : SUPER_UNIQUE_AFFIXES[boss.species].length + difficulty);
    }
    console.log(`All 25 maps: difficulty ${difficulty}, elite counts, attributes, normal packs, boss and routes passed`);
  }
  await choose(page, 0, 0); const id = await approachElite(page);
  await expect(page.locator('.elite-label').first()).toBeVisible();
  await expect(page.locator('.champion-label').first()).toBeVisible();
  await pixels(page); await page.screenshot({ path: `${output}/elite-desktop.png` });
  const canvasBefore = await page.locator('#game-canvas').evaluate(canvas => canvas.toDataURL());
  await page.waitForTimeout(300);
  assert.notEqual(await page.locator('#game-canvas').evaluate(canvas => canvas.toDataURL()), canvasBefore);
  await defeatElite(page, id);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '返回营地', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState.inCamp && !window.eclipseState.saveBusy);
  assert.equal((await state(page)).enemies.length, 0);
  await choose(page, 0, 0); assert.equal((await state(page)).enemies.filter(enemy => enemy.elite).length, 1);

  const rewards = (await savedProfile(page)).hero.questRewards;
  await page.evaluate(() => { Math.random = () => .1; });
  for (const difficulty of [0, 1, 2]) for (let repeat = 0; repeat < 2; repeat++) {
    await choose(page, 0, difficulty);
    const fresh = await state(page), runesBefore = (await savedProfile(page)).hero.runes.length;
    assert.equal(fresh.loot.length, 0); assert.equal(fresh.enemies.filter(enemy => enemy.elite).length, eliteCount(LEVELS[0], difficulty));
    const eliteId = await approachElite(page);
    // Guarantee the target's rune roll, without flooding the approach with loot
    // or changing map generation/pack rolls through a globally tiny RNG value.
    await page.evaluate(() => { Math.random = () => .01; });
    await defeatElite(page, eliteId);
    await page.evaluate(() => { Math.random = () => .1; });
    const after = await state(page), saved = (await savedProfile(page)).hero;
    assert.ok(after.loot.some(drop => drop.item), 'Repeated elite kills still drop equipment');
    assert.ok(after.loot.some(drop => drop.rune) || saved.runes.length > runesBefore, 'Repeated elite kills still drop runes');
    assert.deepEqual(saved.questRewards, rewards); assert.deepEqual(saved.campaign.cleared, [25, 25, 25]);
  }
  console.log('Cleared-stage elite farming twice in each difficulty preserves rewards and drops equipment/runes');

  const production = await page.evaluate(async () => {
    const { Game } = await import('/src/game.ts'), { GameWorld, createActor } = await import('/src/world.ts');
    const { newHero } = await import('/src/model.ts'), { LEVELS } = await import('/src/campaign.ts'), { MONSTERS } = await import('/src/bestiary.ts');
    const world = new GameWorld(LEVELS[0]), actor = createActor('hero'), drops = [], ranks = [];
    const game = { world, actor, position: actor.group.position, body: world.body(0, 11), level: LEVELS[0], hero: newHero(), profile: {}, enemies: [], nextId: 0, paused: false, dead: false, inCamp: false, path: [], begin() {}, save() {}, burst() {}, ui: { toast() {} }, audio: { play() {} }, monsterBatches: { add() {} }, monsterCombat: { cancel() {}, onDeath() {} }, addLoot(drop) { drops.push(drop); }, dropLoot(_point, rank) { ranks.push(rank); } };
    const original = Math.random;
    try {
      Math.random = () => 0;
      const chest = world.chests[0]; game.position.set(chest.x, 0, chest.z - 2);
      Game.prototype.openChest.call(game, chest.id); Game.prototype.openChest.call(game, chest.id);
      const elite = Game.prototype.spawnEnemy.call(game, 0, 11, 'demon', MONSTERS.fallen, true);
      Game.prototype.killEnemy.call(game, elite); Game.prototype.killEnemy.call(game, elite);
      return { drops: drops.map(({ gold, potion }) => ({ gold, potion })), opened: chest.opened, ranks, questKills: game.hero.campaign.kills, bossDefeated: game.hero.bossDefeated, cleared: game.hero.campaign.cleared };
    } finally { Math.random = original; world.dispose(); }
  });
  assert.deepEqual(production.drops, [{ gold: 6, potion: undefined }, { gold: undefined, potion: 0 }]);
  assert.equal(production.opened, true); assert.deepEqual(production.ranks, ['elite']);
  assert.equal(production.questKills, 1); assert.equal(production.bossDefeated, false); assert.deepEqual(production.cleared, [0, 0, 0]);
  await page.close();
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const mobile = await start(viewport, true); await approachElite(mobile);
    await expect(mobile.locator('.elite-label').first()).toBeVisible();
    assert.ok(await mobile.locator('.elite-label').evaluateAll(labels => labels.every(label => label.scrollWidth <= label.clientWidth + 1 && label.getBoundingClientRect().left >= 0 && label.getBoundingClientRect().right <= innerWidth)));
    await pixels(mobile); await mobile.screenshot({ path: `${output}/elite-${viewport.width}.png` }); await mobile.close();
  }
  assert.deepEqual(errors, []); console.log('Real elite kill, task progress, no duplicate rewards, camp/reset, chest supplies and desktop/mobile canvas passed');
} catch (error) {
  for (const [i, context] of browser.contexts().entries()) for (const page of context.pages()) await page.screenshot({ path: `${output}/failure-${i}.png` }).catch(() => {});
  console.log('Browser errors:', errors); throw error;
} finally { await browser.close(); }
