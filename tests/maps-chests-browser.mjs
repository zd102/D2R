import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, stats } from '../src/model.ts';
import { LEVELS, levelLayout } from '../src/campaign.ts';
import { PROFILE_PREFIX } from '../src/saves.ts';
import { enterGame, openCampaign } from './browser-helpers.mjs';

const output = '.verification/maps-chests';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173', errors = [];
const state = page => page.evaluate(() => window.eclipseState);
const hero = newHero(); hero.level = 90; hero.vitality = 2000; hero.campaign.cleared = [25, 25, 25]; hero.unlockedDifficulty = 2;
hero.hp = stats(hero).maxHp; hero.equipment.weapon.mods = { attackRating: 3000 }; hero.equipment.weapon.minDamage = 1200; hero.equipment.weapon.maxDamage = 1600;
async function start(viewport, touch = false) {
  const page = await browser.newPage({ viewport, isMobile: touch, hasTouch: touch });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch(), body = await response.text();
    await route.fulfill({ response, body: body.replace('const game = new Game();', 'const game = new Game(); window.mapVerification = game;') });
  });
  await page.addInitScript(({ hero, prefix }) => {
    if (sessionStorage.getItem('maps-fixture')) return;
    localStorage.setItem(prefix + 'map-test', JSON.stringify({ version: 2, id: 'map-test', name: '探索者', createdAt: 1, updatedAt: 1, revision: 1, hero }));
    sessionStorage.setItem('maps-fixture', '1');
  }, { hero, prefix: PROFILE_PREFIX });
  await page.goto(base); await enterGame(page); return page;
}
async function choose(page, index) {
  await openCampaign(page);
  await page.locator(`[data-campaign-act="${Math.floor(index / 5)}"]`).click();
  await page.locator(`[data-enter-level="${index}"]`).click();
  await page.waitForFunction(index => !window.eclipseState.inCamp && window.eclipseState.campaign.current === index && !window.eclipseState.paused, index);
}
async function approach(page, id, range = 2.9) {
  const touch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  for (let tries = 0; tries < 100; tries++) {
    const s = await state(page), chest = s.chests.find(chest => chest.id === id);
    if (chest.opened || Math.hypot(s.position.x - chest.x, s.position.z - chest.z) <= range) return;
    const next = chest.route[0]; assert.ok(next, 'Chest route exists');
    const { width, height } = page.viewportSize(), dx = next.screen.x - width / 2, dy = next.screen.y - height / 2;
    const factor = Math.min(1, width * .25 / Math.max(1, Math.abs(dx)), height * .11 / Math.max(1, Math.abs(dy)));
    const x = width / 2 + dx * factor, y = height / 2 + dy * factor;
    if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    await page.waitForTimeout(180);
  }
  throw new Error(`Chest ${id} approach timed out: ${JSON.stringify((await state(page)).position)}`);
}
async function pixels(page) {
  const sample = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 100;
    const ctx = canvas.getContext('2d'); ctx.drawImage(document.querySelector('#game-canvas'), 0, 0, 100, 100);
    const data = ctx.getImageData(0, 0, 100, 100).data, colors = new Set(); let lit = 0;
    for (let i = 0; i < data.length; i += 4) { colors.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`); if (data[i] + data[i + 1] + data[i + 2] > 100) lit++; }
    return { lit, colors: colors.size };
  });
  assert.ok(sample.lit > 1500 && sample.colors > 65, JSON.stringify(sample));
}
try {
  const page = await start({ width: 1440, height: 960 });
  let minFloor = Infinity, maxFloor = 0;
  for (const level of LEVELS) {
    if (level.index) await choose(page, level.index);
    const s = await state(page), layout = levelLayout(level);
    assert.equal(s.area.gridSize, 101); minFloor = Math.min(minFloor, s.area.floorCells); maxFloor = Math.max(maxFloor, s.area.floorCells);
    assert.equal(s.chests.length, layout.chests.length); assert.equal(s.enemies.filter(e => e.boss).length, 1);
    const inaccessibleEnemies = await page.evaluate(() => {
      const g=window.mapVerification;
      return g.enemies.filter(enemy=>{
        const p=enemy.actor.group.position,end=g.world.path(g.position,p).at(-1);
        return !g.world.canWalk(p,p) || !end || Math.hypot(end.x-p.x,end.z-p.z)>1;
      }).map(enemy=>enemy.name);
    });
    assert.deepEqual(inaccessibleEnemies,[],`${level.id}: every monster spawns on accessible ground`);
    assert.ok(s.area.floorCells > 900, `${level.id}: larger navigable area`);
    for (const p of [...s.objectives, ...s.chests]) {
      assert.ok(p.route.length, `${level.id}: path to ${p.kind ?? 'chest'} ${p.id}`);
      const end = p.route.at(-1); assert.ok(Math.hypot(end.x - p.x, end.z - p.z) <= (p.kind === 'quest' ? 3.4 : 3), `${level.id}: interactable ${p.kind ?? 'chest'} ${p.id}`);
    }
    const blockedSegments = await page.evaluate(points => {
      const g = window.mapVerification, failures = [];
      for (const target of points) {
        let from = g.position;
        for (const to of g.world.path(from, target)) {
          if (!g.world.canWalk(from, to)) failures.push({ from: { x: from.x, z: from.z }, to: { x: to.x, z: to.z }, target });
          from = to;
        }
      }
      return failures;
    }, [...s.objectives, ...s.chests].map(p => ({ x: p.x, z: p.z })));
    assert.deepEqual(blockedSegments, [], `${level.id}: every route segment clears physical building footprints`);
    await pixels(page);
    if ([0, 3, 8, 11, 17, 21].includes(level.index)) {
      await page.keyboard.press('m'); await page.screenshot({ path: `${output}/layout-${level.index}.png` }); await page.keyboard.press('Escape');
    }
  }
  console.log('25 expanded layouts: routes to every quest, boss, exit, supply and chest; floor range', minFloor, maxFloor);
  await choose(page, 0);
  await approach(page, 0, 8);
  const target = page.getByRole('button', { name: '打开箱子 1', exact: true });
  await target.click();
  await page.waitForFunction(() => window.eclipseState.chests[0].opened);
  await page.waitForTimeout(250);
  assert.ok((await state(page)).chests[0].lidAngle < -1);
  await page.screenshot({ path: `${output}/opened-desktop.png` });
  const before = (await state(page)).chests.filter(chest => chest.opened).length;
  await page.keyboard.press('f'); assert.equal((await state(page)).chests.filter(chest => chest.opened).length, before);
  await approach(page, 1); await page.keyboard.press('f');
  assert.equal((await state(page)).chests[1].opened, true);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '返回营地', exact: true }).click();
  assert.equal((await state(page)).chests.length, 0);
  await choose(page, 0); assert.ok((await state(page)).chests.every(chest => !chest.opened));
  await page.close();

  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const mobile = await start(viewport, true);
    // In landscape, get the label clear of the bottom HUD before tapping it.
    await approach(mobile, 0, viewport.height < 580 ? 2.2 : 7);
    // A touch along a smoothed route can hit and open the chest while approaching.
    if (!(await state(mobile)).chests[0].opened) await mobile.getByRole('button', { name: '打开箱子 1', exact: true }).tap();
    await mobile.waitForFunction(() => window.eclipseState.chests[0].opened);
    await pixels(mobile); await mobile.screenshot({ path: `${output}/opened-${viewport.width}.png` });
    await mobile.keyboard.press('m'); await expect(mobile.locator('.panel-map')).toBeVisible();
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await mobile.screenshot({ path: `${output}/map-${viewport.width}.png` }); await mobile.close();
  }
  assert.deepEqual(errors, []); console.log('Mouse auto approach, F interaction, chest animation, single opening, camp/reset and touch passed');
} catch (error) {
  for (const [i, context] of browser.contexts().entries()) for (const page of context.pages()) await page.screenshot({ path: `${output}/failure-${i}.png` }).catch(() => {});
  console.log('Browser errors:', errors); throw error;
} finally { await browser.close(); }
