import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero } from '../src/model.ts';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.knockbackGame = game;') });
  });
  const hero = newHero(); hero.level = 30; hero.campaign.cleared[0] = 20;
  await page.addInitScript(hero => localStorage.setItem('eclipse-ii-profile-v2:knockback-test', JSON.stringify({ version: 2, id: 'knockback-test', name: '击退回归', createdAt: 1, updatedAt: 1, revision: 1, hero })), hero);
  await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:5173'}?mode=local`);
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState?.inCamp && !window.eclipseState.paused);
  for (const level of [0, 4]) {
    assert.equal(await page.evaluate(level => window.knockbackGame.enterLevel(level, 0), level), true);
    await page.waitForFunction(() => !window.eclipseState.inCamp && !window.eclipseState.saveBusy);
    const result = await page.evaluate(async () => {
      const g = window.knockbackGame;
      const { clearObstacles } = await import('/src/navigation.ts');
      g.paused = true; g.releaseInput();
      g.mercenary.clear(); g.hero.mercenary = undefined;
      const targets = [g.enemies.find(e => !e.boss), g.enemies.find(e => e.boss)];
      const spawn = g.position.clone(), direction = spawn.clone().set(1, 0, 0);
      let lane = false;
      for (let z = -g.world.gridOffsetZ + 2; z < g.world.gridOffsetZ - 2 && !lane; z++)
        for (let x = -g.world.gridOffset + 2; x < g.world.gridOffset - 8; x++) {
          spawn.set(x, 0, z);
          if (g.world.canWalk(spawn, spawn.clone().addScaledVector(direction, 6))
            && clearObstacles(g.world.obstacles, spawn, spawn.clone().addScaledVector(direction, 6), 1.2)) { lane = true; break; }
        }
      if (!lane) throw new Error('No clear fixture lane');
      const updateMonsters = g.monsterCombat.update; g.monsterCombat.update = () => {};
      for (const e of g.enemies) { e.dead = true; g.world.physics.removeBody(e.body); }
      const results = [];
      for (const target of targets) {
        target.dead = false; target.body.velocity.set(0, 0, 0); g.world.physics.addBody(target.body);
        const point = spawn.clone().addScaledVector(direction, 2);
        target.actor.group.position.copy(point); target.body.position.set(point.x, .5, point.z);
        g.position.copy(spawn); g.body.position.set(spawn.x, .5, spawn.z); g.body.velocity.set(0, 0, 0);
        g.path = [spawn.clone().addScaledVector(direction, 6)]; g.movementMode = 'mouse';
        g.paused = false;
        for (let frame = 0; frame < 180; frame++) g.update(1 / 60);
        g.paused = true;
        const moved = target.actor.group.position.distanceTo(point), stopped = g.position.distanceTo(point);
        const knocked = g.combat.knockback(target, .8, spawn);
        results.push({ boss: target.boss, moved, stopped, knocked });
        target.dead = true; g.world.physics.removeBody(target.body);
      }
      const { hireMercenary } = await import('/src/mercenary.ts');
      const { BASES, makeItem } = await import('/src/items.ts');
      g.hero.gold = 100000; hireMercenary(g.hero, true);
      const spear = makeItem(BASES.find(base => base.baseCode === 'spr'));
      spear.mods = { knockback: 1, ias: 100 }; g.hero.mercenary.equipment.weapon = spear;
      g.position.copy(spawn); g.mercenary.clear(); g.mercenary.sync();
      const target = targets[0], point = spawn.clone().addScaledVector(direction, 2);
      target.dead = false; target.hp = target.maxHp = 1e9; target.defense = 0;
      target.actor.group.position.copy(point); target.body.position.set(point.x, .5, point.z);
      const random = Math.random; Math.random = () => .1;
      try { for (let frame = 0; frame < 110; frame++) g.mercenary.update(1 / 60); }
      finally { Math.random = random; }
      if (Math.abs(target.actor.group.position.distanceTo(point) - .8) > 1e-6 || target.hp >= 1e9 || !g.mercenary.canStrike(target))
        throw new Error('Mercenary must resume attacking without repeatedly driving the target away');
      target.dead = true;
      g.monsterCombat.update = updateMonsters;
      await g.flushSave(); g.returnToCamp(); await g.flushSave(); g.paused = false;
      return results;
    });
    for (const row of result) {
      assert.ok(row.moved < 1e-6, JSON.stringify(row));
      assert.ok(row.stopped >= (row.boss ? 1.25 : .77), 'monsters still block movement');
      assert.equal(row.knocked, !row.boss);
    }
    console.log(`Level ${level}: ordinary monster and boss resist walking pushes; boss resists knockback`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
