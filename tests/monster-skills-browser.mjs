import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';
import { enterGame } from './browser-helpers.mjs';

const output = process.env.OUTPUT_DIR || '.verification/monster-skills';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.monsterSkillsGame = game;') });
  });
  const hero = newHero(); hero.vitality = 100000; hero.level = 90;
  await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(hero));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173'); await enterGame(page);
  await page.evaluate(() => cancelAnimationFrame(window.monsterSkillsGame.frameId));
  for (const area of [4, 9, 14, 19, 24]) {
    const result = await page.evaluate(async area => {
      const g = window.monsterSkillsGame, { ATTACKS } = await import('/src/monster-combat.ts'), { stats } = await import('/src/model.ts');
      g.hero.campaign.current = area; g.hero.campaign.cleared = [area, 0, 0];
      g.hero.campaign.kills = 999; g.hero.campaign.objects = Array.from({ length: 20 }, (_, i) => i);
      g.hero.bossDefeated = false; g.loadArea(false); g.started = false; g.hero.hp = stats(g.hero).maxHp;
      const boss = g.enemies.find(e => e.boss);
      for (const enemy of g.enemies) if (enemy !== boss) { g.world.physics.removeBody(enemy.body); g.disposeObject(enemy.actor.group); }
      g.enemies = [boss]; boss.active = true; boss.cooldown = 1000;
      const origin = boss.actor.group.position.clone(), route = g.world.path(g.world.layout.spawn, origin);
      const point = route.findLast(p => p.distanceTo(origin) >= 2.5) ?? route[0];
      g.position.copy(point); g.body.position.set(point.x, .5, point.z); g.updateCamera(1);
      const tested = [], mc = g.monsterCombat;
      for (const id of boss.definition.attacks) {
        for (const object of [...mc.missiles, ...mc.hazards]) g.disposeObject(object.mesh);
        for (const entry of mc.meleeCasts) g.disposeObject(entry.cast.mesh);
        mc.missiles.length = mc.hazards.length = mc.meleeCasts.length = 0;
        for (const enemy of g.enemies) if (enemy !== boss) { g.world.physics.removeBody(enemy.body); g.disposeObject(enemy.actor.group); }
        g.enemies = [boss]; mc.prisons.length = 0;
        boss.actor.group.position.copy(origin); boss.body.position.set(origin.x, .5, origin.z); boss.hp = boss.maxHp * .4;
        mc.state(boss).cloned = false; mc.state(boss).summons = 0;
        g.position.copy(point); g.body.position.set(point.x, .5, point.z); g.invincible = 0;
        mc.startCast(boss, id); const cast = mc.state(boss).cast;
        if (!cast || !cast.mesh.parent) throw new Error(`Missing warning: ${id}`);
        g.renderer.render(g.world.scene, g.camera);
        mc.state(boss).cast = undefined; g.disposeObject(cast.mesh); mc.resolve(boss, cast);
        const shape = ATTACKS[id].shape;
        if (['bolt', 'fan', 'nova'].includes(shape) && !mc.missiles.length) throw new Error(`Missing missiles: ${id}`);
        if (['pool', 'line', 'wall'].includes(shape) && !mc.hazards.length) throw new Error(`Missing ground effect: ${id}`);
        if (shape === 'summon' && !g.enemies.some(e => e.summoned)) throw new Error(`Missing summon: ${id}`);
        if (shape === 'prison' && (mc.prisons[0]?.guards.length !== 4 || !mc.imprisoned(g.position))) throw new Error('Bone prison did not trap target');
        if (shape === 'teleport' && boss.actor.group.position.equals(origin)) throw new Error('Baal teleport did not move');
        g.renderer.render(g.world.scene, g.camera); tested.push(id);
      }
      // Render a signature attack for each boss after the execution checks.
      const id = ['poisonFan', 'jab', 'chargedBolt', 'redLightning', 'coldWave'][Math.floor(area / 5)];
      mc.startCast(boss, id); g.ui.update(.2); g.renderer.render(g.world.scene, g.camera);
      return { area, tested, resistances: boss.resistances, calls: g.renderer.info.render.calls };
    }, area);
    assert.ok(result.tested.length >= 3 && result.calls > 0);
    assert.ok(Object.values(result.resistances).every(r => r <= 85));
    console.log(JSON.stringify(result));
    await page.screenshot({ path: `${output}/boss-${area}.png` });
  }
  await page.evaluate(async () => {
    const g = window.monsterSkillsGame, { MONSTERS } = await import('/src/bestiary.ts');
    g.monsterCombat.debuffs = { bloodMana: 6, defense: 6, decrepify: 5 };
    g.hero.holyShield = 30; g.ui.update(.2);
    const champion = g.spawnEnemy(g.position.x + 1, g.position.z, 'demon', MONSTERS.fallen);
    g.makeChampion(champion); g.ui.update(.2); g.renderer.render(g.world.scene, g.camera);
  });
  for (const name of ['bloodMana', 'defense', 'decrepify']) await expect(page.locator(`[data-status="monster-${name}"]`)).toBeVisible();
  await expect(page.locator('.champion-label').first()).toBeVisible();
  await page.screenshot({ path: `${output}/champion-and-curses.png` });
  await page.evaluate(() => { const g = window.monsterSkillsGame; g.dead = true; g.revive(); g.ui.update(.2); });
  await expect(page.locator('[data-status="monster-bloodMana"]')).toHaveCount(0);
  assert.deepEqual(errors, []); console.log('All five chapter bosses: real warnings, projectiles, hazards, summons, destructible prison and teleport rendered.');
} finally { await browser.close(); }
