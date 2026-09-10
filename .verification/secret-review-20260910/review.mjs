import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { newHero, serializeSave, stats } from '../../src/model.ts';
import { createWirtsLeg, specialItem } from '../../src/items.ts';

const output = '.verification/secret-review-20260910';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = { errors: [] };
function hero(catalysts, unlocked = true) {
  const h = newHero();
  if (unlocked) {
    h.level = 99; h.vitality = 2000; h.campaign.cleared = [25, 25, 25];
    h.campaign.current = 24; h.difficultyLevel = 2; h.unlockedDifficulty = 2;
  }
  h.inventory = catalysts; h.hp = stats(h).maxHp;
  return h;
}
async function start(h) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  page.on('pageerror', e => results.errors.push(e.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.reviewGame = game;');
    await route.fulfill({ response, body });
  });
  await page.addInitScript(save => {
    if (!sessionStorage.getItem('review-fixture')) {
      localStorage.setItem('eclipse-ii-save-v1', save);
      sessionStorage.setItem('review-fixture', '1');
    }
  }, serializeSave(h));
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState?.inCamp && !window.eclipseState.paused);
  return { context, page };
}
async function snapshot(page) {
  return page.evaluate(() => {
    const g = window.reviewGame;
    return { area: g.level.id, inCamp: g.inCamp, special: g.specialArea, difficulty: g.hero.difficultyLevel,
      campaign: structuredClone(g.hero.campaign), bossDefeated: g.hero.bossDefeated,
      inventory: g.hero.inventory.map(i => i.name), enemies: g.enemies.filter(e => !e.dead).length,
      bosses: g.enemies.filter(e => e.boss && !e.dead).map(e => ({ name: e.name, hp: e.maxHp, damage: e.damage, attacks: e.definition.attacks })) };
  });
}
async function enter(page, selector) {
  await page.locator('[data-action="mystery-portal"]').click();
  await page.locator(selector).click();
  await page.waitForFunction(() => !window.reviewGame.inCamp && !window.reviewGame.paused);
}
try {
  const empty = await start(hero([], false));
  await empty.page.locator('[data-action="mystery-portal"]').click();
  results.lockedPanel = await empty.page.locator('#overlay').innerText();
  await empty.page.screenshot({ path: `${output}/portal-locked.png` });
  await empty.context.close();

  const leg = createWirtsLeg(1), cow = await start(hero([leg]));
  await cow.page.locator('[data-action="mystery-portal"]').click();
  results.portalPanel = await cow.page.locator('#overlay').innerText();
  await cow.page.screenshot({ path: `${output}/portal-ready.png` });
  await cow.page.setViewportSize({ width: 390, height: 844 });
  await cow.page.screenshot({ path: `${output}/portal-mobile.png` });
  await cow.page.setViewportSize({ width: 1440, height: 960 });
  await cow.page.locator(`[data-cow-entry="${leg.id}"]`).click();
  await cow.page.waitForFunction(() => !window.reviewGame.inCamp && !window.reviewGame.paused);
  results.cowEntry = await snapshot(cow.page);
  results.cowGeometry = await cow.page.evaluate(() => {
    const g = window.reviewGame, l = g.world.layout, failures = [];
    for (const target of [l.boss, l.exit, l.supply, ...l.rooms, ...l.chests, ...g.enemies.map(e => e.actor.group.position)]) {
      let from = l.spawn;
      for (const to of g.world.path(l.spawn, target)) {
        if (!g.world.canWalk(from, to)) failures.push({ target: { x: target.x, z: target.z }, reason: 'blocked segment' });
        from = to;
      }
      if (Math.hypot(from.x - target.x, from.z - target.z) > 3) failures.push({ target: { x: target.x, z: target.z }, reason: 'unreachable' });
    }
    return { width: l.width, height: l.height, rooms: l.rooms.length, floorCells: g.world.floorCells.length,
      chests: l.chests.length, elites: g.enemies.filter(e => e.elite).length, failures };
  });
  await cow.page.evaluate(() => {
    const g = window.reviewGame, p = g.world.layout.rooms[0];
    g.body.position.set(p.x, .5, p.z + 7); g.position.set(p.x, 0, p.z + 7); g.updateCamera(1);
  });
  await cow.page.waitForTimeout(600);
  await cow.page.screenshot({ path: `${output}/cow-herd.png` });
  results.cowRender = await cow.page.evaluate(() => ({ calls: window.reviewGame.renderer.info.render.calls, triangles: window.reviewGame.renderer.info.render.triangles }));
  await cow.page.evaluate(() => window.reviewGame.ui.openPanel('quest'));
  results.cowQuest = await cow.page.locator('#overlay').innerText();
  await cow.page.screenshot({ path: `${output}/cow-quest.png` });
  await cow.page.locator('[data-panel="campaign"]').click();
  await cow.page.locator('[data-campaign-difficulty="0"]').click();
  await cow.page.locator('[data-campaign-act="0"]').click();
  await cow.page.locator('[data-enter-level="0"]').click();
  results.cowAfterCampaignClick = await snapshot(cow.page);
  await cow.context.close();

  const soj = specialItem('unique-122', () => .5), uber = await start(hero([soj]));
  await enter(uber.page, `[data-uber-entry="${soj.id}"]`);
  results.uberEntry = await snapshot(uber.page);
  await uber.page.evaluate(() => {
    const g = window.reviewGame;
    g.body.position.set(0, .5, -10); g.position.set(0, 0, -10); g.updateCamera(1);
  });
  await uber.page.waitForTimeout(700);
  await uber.page.screenshot({ path: `${output}/uber-arena.png` });
  await uber.page.setViewportSize({ width: 390, height: 844 });
  await uber.page.screenshot({ path: `${output}/uber-arena-mobile.png` });
  results.uberKill = await uber.page.evaluate(() => {
    const g = window.reviewGame, before = structuredClone(g.hero.campaign);
    g.killEnemy(g.enemies.find(e => e.boss));
    return { campaignUnchanged: JSON.stringify(before) === JSON.stringify(g.hero.campaign),
      exitVisible: g.world.exit.visible, loot: g.loot.map(l => ({ item: l.item?.name, catalog: l.item?.catalogId })) };
  });
  await uber.page.evaluate(() => window.reviewGame.ui.openPanel('campaign'));
  await uber.page.locator('[data-campaign-difficulty="0"]').click();
  await uber.page.locator('[data-campaign-act="0"]').click();
  await uber.page.locator('[data-enter-level="0"]').click();
  results.uberAfterCampaignClick = await snapshot(uber.page);
  await uber.page.evaluate(() => window.reviewGame.returnToCamp());
  results.uberReturn = await snapshot(uber.page);
  await uber.context.close();

  const resumeLeg = createWirtsLeg(2), resume = await start(hero([resumeLeg]));
  await enter(resume.page, `[data-cow-entry="${resumeLeg.id}"]`);
  await resume.page.reload();
  await resume.page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await resume.page.waitForFunction(() => window.eclipseState?.inCamp && !window.eclipseState.paused);
  results.afterReload = await snapshot(resume.page);
  results.navigationSweep = await resume.page.evaluate(async () => {
    const { GameWorld } = await import('/src/world.ts');
    const { SPECIAL_LEVELS, LEVELS } = await import('/src/campaign.ts');
    const results = [];
    for (const level of [...Object.values(SPECIAL_LEVELS), LEVELS[2]]) {
      for (const seed of [0, 17, 91919]) {
        const world = new GameWorld(level, false, seed), l = world.layout, failures = [];
        for (const target of [l.boss, l.exit, l.supply, ...l.rooms, ...l.chests, ...(world.mysteryCorpse ? [world.mysteryCorpse] : [])]) {
          let from = l.spawn;
          for (const to of world.path(l.spawn, target)) {
            if (!world.canWalk(from, to)) failures.push({ x: target.x, z: target.z, reason: 'blocked segment' });
            from = to;
          }
          if (Math.hypot(from.x - target.x, from.z - target.z) > 3) failures.push({ x: target.x, z: target.z, reason: 'unreachable' });
        }
        results.push({ area: level.id, seed, floorCells: world.floorCells.length, failures });
        world.dispose();
      }
    }
    return results;
  });
  await resume.context.close();
  console.log(JSON.stringify(results, null, 2));
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
