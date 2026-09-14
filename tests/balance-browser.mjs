import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave, stats, totalExperience } from '../src/model.ts';
import { LEVELS } from '../src/campaign.ts';
import { BOSSES } from '../src/bestiary.ts';
import { monsterStats } from '../src/balance.ts';
import { referenceHero } from './balance-fixtures.ts';
import { enterGame, savedProfile } from './browser-helpers.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
const base = process.env.BASE_URL || 'http://127.0.0.1:5173', output = process.env.OUTPUT_DIR || '.verification'; await mkdir(output, { recursive: true });
async function open(hero, viewport = { width: 1440, height: 960 }) {
  // Camp navigation is fixture setup; measure the requested viewport after entering combat.
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }); page.on('pageerror', e => errors.push(e.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch(), body = await response.text();
    assert.ok(body.includes('const game = new Game();'));
    await route.fulfill({ response, body: body.replace('const game = new Game();', 'const game = new Game(); window.balanceGame = game;') });
  });
  await page.route('**/src/world.ts*', async route => {
    const response = await route.fetch(), body = await response.text();
    assert.ok(body.includes('seed = nextMapSeed()'));
    await route.fulfill({ response, body: body.replace('seed = nextMapSeed()', 'seed = 20260910') });
  });
  await page.addInitScript(save => { if (!sessionStorage.getItem('balance-fixture')) { localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('balance-fixture', '1'); } }, serializeSave(hero));
  await page.goto(base); await enterGame(page); await page.setViewportSize(viewport); return page;
}
try {
  const starter = newHero(), page = await open(starter); let kills = 0;
  for (let attempt = 0; attempt < 360; attempt++) {
    const s = await page.evaluate(() => window.eclipseState); assert.equal(s.dead, false, 'Fresh Paladin survives with starter gear and potions');
    if (s.kills >= 8) { kills = s.kills; break; }
    // This is a combat budget check; pointer hit-testing has separate regressions.
    // Choose by reachable path length, not screen direction through cave walls.
    await page.evaluate(() => {
      const g = window.balanceGame;
      if (g.target && !g.target.dead && g.time - (g.balanceOrderTime ?? 0) < 4) return;
      const target = g.enemies.filter(e => !e.dead && !e.boss).map(enemy => {
        const path = g.world.path(g.position, enemy.actor.group.position);
        let length = 0, previous = g.position;
        for (const point of path) { length += previous.distanceTo(point); previous = point; }
        return { enemy, length: path.length && path.at(-1).distanceTo(enemy.actor.group.position) < 1 ? length : Infinity };
      }).sort((a, b) => a.length - b.length)[0];
      if (target && Number.isFinite(target.length)) { g.target = target.enemy; g.path = []; g.targetDestination = undefined; g.targetPathTimer = 0; g.balanceOrderTime = g.time; }
    });
    if (s.hp < 30) await page.keyboard.press('1');
    await page.waitForTimeout(250);
  }
  assert.ok(kills >= 8, `Starter gear can complete the first kill quest: ${JSON.stringify(await page.evaluate(() => ({ kills: window.eclipseState.kills, hp: window.eclipseState.hp, position: window.eclipseState.position })))}`);
  await page.keyboard.press('i'); const first = (await savedProfile(page)).hero;
  assert.ok(first.level >= 1 && first.level <= 3); assert.ok(totalExperience(first) > 0);
  await page.screenshot({ path: `${output}/balance-starter.png` }); await page.close();
  console.log('Fresh starter gear, limited potions and measured XP passed:', { level: first.level, experience: totalExperience(first), kills });

  for (const [level, difficulty, index, viewport] of [[41, 0, 24, { width: 1440, height: 960 }], [67, 1, 24, { width: 390, height: 844 }], [89, 2, 24, { width: 360, height: 640 }]]) {
    const hero = referenceHero(level, difficulty, 'hammer'); hero.campaign.current = index; hero.stage = index + 1;
    const page = await open(hero, viewport), snapshot = await page.evaluate(() => window.eclipseState), boss = snapshot.enemies.find(e => e.boss);
    assert.equal(boss.maxHp, monsterStats(BOSSES[index], LEVELS[index], difficulty, true).maxHp);
    assert.equal(boss.level, monsterStats(BOSSES[index], LEVELS[index], difficulty, true).level);
    const pixels = await page.evaluate(() => {
      const copy = document.createElement('canvas'); copy.width = copy.height = 64; const ctx = copy.getContext('2d'); ctx.drawImage(document.querySelector('#game-canvas'), 0, 0, 64, 64);
      const data = ctx.getImageData(0, 0, 64, 64).data, colors = new Set(); for (let i = 0; i < data.length; i += 4) colors.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`); return colors.size;
    }); assert.ok(pixels > 40);
    await page.locator('.bottom-nav [data-panel="character"]').click();
    await expect(page.locator('.paladin-sheet')).toContainText(`等级 ${level}`);
    await page.locator('.advanced-stats summary').click();
    await expect(page.locator('.advanced-stats')).toContainText((Math.round(stats(hero).manaRegen * 10) / 10).toFixed(1));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${output}/balance-character-${viewport.width}.png` });
    const saved = (await savedProfile(page)).hero;
    await page.setViewportSize({ width: 1440, height: 960 }); await page.reload(); await enterGame(page); await page.setViewportSize(viewport);
    const restored = (await savedProfile(page)).hero;
    assert.equal(restored.level, saved.level); assert.equal(restored.xp, saved.xp); assert.deepEqual(restored.equipment, saved.equipment); assert.deepEqual(restored.skills, saved.skills);
    await page.close(); console.log('Balanced boss stats, character sheet, canvas and persistence:', { difficulty, level, bossHp: boss.maxHp, viewport });
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
