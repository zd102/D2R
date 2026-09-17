import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero, serializeSave } from '../src/model.ts';
import { enterGame } from './browser-helpers.mjs';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.deathGame = game;') });
  });
  await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(newHero()));
  await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:5173'}/?mode=local`);
  await enterGame(page);
  await page.evaluate(() => cancelAnimationFrame(window.deathGame.frameId));
  for (const area of [0, 4, 9, 14, 19, 24]) {
    const result = await page.evaluate(async area => {
      const g = window.deathGame;
      const { MONSTERS } = await import('/src/bestiary.ts');
      g.hero.campaign.current = area; g.hero.bossDefeated = false; g.loadArea(false);
      const boss = g.enemies.find(e => e.boss), mc = g.monsterCombat;
      const untouched = g.spawnEnemy(boss.spawn.x + 3, boss.spawn.z, 'boss');
      const defeated = g.spawnEnemy(boss.spawn.x - 3, boss.spawn.z, 'boss');
      defeated.dead = true; defeated.hp = 0;
      const equipmentIds = equipment => JSON.stringify(Object.entries(equipment).map(([slot, item]) => [slot, item?.id]));
      const gear = equipmentIds(g.hero.equipment), alternate = equipmentIds(g.hero.alternate);
      const checks = [];
      for (let attempt = 0; attempt < 2; attempt++) {
        boss.active = true; boss.engaged = true; boss.hp = boss.maxHp / 3;
        boss.actor.group.position.x += 5; boss.body.position.x += 5;
        boss.poison = { dps: 100, remaining: 10 }; boss.bleed = 100; boss.stunned = 5;
        boss.path = [g.position.clone()]; mc.state(boss).cloned = true;
        const add = g.spawnEnemy(boss.spawn.x, boss.spawn.z, 'demon', MONSTERS.skeleton);
        add.owner = boss.id; add.summoned = true;
        g.invincible = 0; g.hero.hp = 1; g.hero.mana = 0;
        g.combat.hurt(1e9, 'magic');
        checks.push(g.dead && g.hero.corpse === null && gear === equipmentIds(g.hero.equipment));
        checks.push(boss.hp === boss.maxHp && boss.actor.group.position.x === boss.spawn.x && boss.body.position.z === boss.spawn.z);
        checks.push(!boss.active && !boss.poison && !boss.bleed && !boss.stunned && !boss.path.length && !mc.states.has(boss.id));
        checks.push(!g.enemies.includes(add) && !g.world.physics.bodies.includes(add.body));
        g.revive();
        checks.push(!g.dead && gear === equipmentIds(g.hero.equipment) && alternate === equipmentIds(g.hero.alternate));
        checks.push(untouched.hp === untouched.maxHp && !untouched.active && defeated.dead && defeated.hp === 0);
      }
      return checks;
    }, area);
    assert.ok(result.every(Boolean), `Area ${area}: ${JSON.stringify(result)}`);
  }
  assert.deepEqual(errors, []);
  console.log('Death regression passed: retained gear, repeated deaths, six bosses, summons, inactive and defeated bosses.');
} finally {
  await browser.close();
}
