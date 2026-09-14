import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';
import { enterGame } from './browser-helpers.mjs';

const output = process.env.OUTPUT_DIR || '.verification/monster-diversity';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.diversityGame = game;') });
  });
  const hero = newHero(); hero.level = 90; hero.vitality = 100000; hero.equipment.shield = undefined;
  await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(hero));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173/?mode=local'); await enterGame(page);
  await page.evaluate(() => cancelAnimationFrame(window.diversityGame.frameId));
  for (const difficulty of [0, 1, 2]) {
    const result = await page.evaluate(async difficulty => {
      const g = window.diversityGame, { MONSTERS, encounterPool } = await import('/src/bestiary.ts');
      const { monsterStats } = await import('/src/balance.ts');
      g.hero.difficultyLevel = difficulty; g.hero.campaign.current = 20; g.hero.campaign.cleared = [25, 25, 25];
      g.hero.campaign.kills = 999; g.hero.campaign.objects = Array.from({ length: 20 }, (_, i) => i);
      g.hero.bossDefeated = false; g.loadArea(false); g.started = false;
      const pool = encounterPool(20, difficulty), population = g.enemies.filter(e => !e.boss);
      if (!population.every(e => pool.includes(e.definition.id))) throw new Error('Live spawn did not use the difficulty pool');
      // Use live spawning to cover every species, including the secret-area cow.
      for (const definition of Object.values(MONSTERS)) {
        const e = g.spawnEnemy(g.position.x, g.position.z, 'demon', definition);
        const expected = monsterStats(definition, g.level, difficulty, false, false, g.hero.playerCount);
        for (const key of ['maxHp', 'damage', 'defense', 'attackRating']) if (Math.abs(e[key]-expected[key]) > .001) throw new Error(`${definition.id}: ${key}`);
      }
      g.renderer.render(g.world.scene, g.camera);
      return { difficulty, pool, population: population.length, species: Object.keys(MONSTERS).length };
    }, difficulty);
    assert.equal(result.species, 38); assert.ok(result.population > 0); console.log(JSON.stringify(result));
  }
  for (const species of ['doll', 'mummy', 'soul', 'imp', 'overseer', 'frozen', 'unraveler', 'vampire']) {
    const result = await page.evaluate(async species => {
      const g = window.diversityGame, { MONSTERS } = await import('/src/bestiary.ts');
      const { stats } = await import('/src/model.ts');
      g.hero.campaign.current = 14; g.hero.bossDefeated = false; g.loadArea(false); g.started = false;
      for (const e of g.enemies) { g.world.physics.removeBody(e.body); g.disposeObject(e.actor.group); }
      g.enemies = []; const mc = g.monsterCombat;
      // The player and all targets share actual walkable ground in the boss room.
      const center = g.world.path(g.world.layout.spawn, g.world.layout.boss).at(-1) ?? g.world.layout.spawn;
      g.position.set(center.x, 0, center.z); g.body.position.set(center.x, .5, center.z);
      g.hero.poison = g.hero.cold = g.hero.curse = 0;
      const distant = ['soul', 'frozen', 'unraveler', 'vampire'].includes(species);
      const firingPoint = distant ? Array.from({ length: 32 }, (_, i) => g.position.clone().add({ x: Math.sin(i*Math.PI/16)*4.5, y: 0, z: Math.cos(i*Math.PI/16)*4.5 })).find(p => mc.walkable(p) && mc.lineOfSight(p, g.position)) : undefined;
      if (distant && !firingPoint) throw new Error('Missing clear firing lane');
      const enemy = g.spawnEnemy(firingPoint?.x ?? center.x, firingPoint?.z ?? center.z, 'demon', MONSTERS[species]); enemy.active = true; enemy.cooldown = 1000;
      g.hero.hp = stats(g.hero).maxHp; g.invincible = 0;
      const origin = enemy.actor.group.position.clone();
      let name;
      if (species === 'doll' || species === 'mummy') {
        g.killEnemy(enemy); const pending = mc.triggeredCasts.at(-1);
        if (!pending?.cast.mesh.parent) throw new Error('Death warning missing');
        name = pending.cast.spec.name;
        const advance = seconds => { for (let t = 0; t < seconds; t += .05) { g.time += .05; g.invincible = Math.max(0, g.invincible - .05); mc.update(.05); } };
        const before = g.hero.hp; advance(.2); if (g.hero.hp !== before) throw new Error('Death effect hit before warning');
        advance(.4); if (g.hero.hp >= before) throw new Error('Death effect did not damage through real combat');
        if (species === 'mummy' && !mc.hazards.some(h => h.spec.afterDeath)) throw new Error('Poison cloud vanished with corpse');
      } else {
        const id = { soul: 'lightning', imp: 'bossTeleport', overseer: 'rally', frozen: 'inferno', unraveler: 'inferno', vampire: 'meteor' }[species];
        let ally;
        if (species === 'overseer') { ally = g.spawnEnemy(center.x, center.z, 'demon', MONSTERS.bloodLord); ally.active = true; ally.cooldown = 1000; ally.hp = ally.maxHp * .5; }
        enemy.hp = enemy.maxHp * .5; const before = enemy.hp;
        mc.startCast(enemy, id); const cast = mc.state(enemy).cast;
        if (!cast?.mesh.parent) throw new Error('Signature warning missing'); name = cast.spec.name;
        g.renderer.render(g.world.scene, g.camera);
        mc.state(enemy).cast = undefined; g.disposeObject(cast.mesh); mc.resolve(enemy, cast);
        if (species === 'imp' && (enemy.actor.group.position.equals(origin) || enemy.hp !== before)) throw new Error('Imp blink failed or healed');
        if (species === 'overseer' && (ally.hp <= ally.maxHp * .5 || !mc.rallyBoost(ally))) throw new Error('Overseer failed to help ally');
        if (['soul', 'frozen', 'unraveler', 'vampire'].includes(species) && !mc.hazards.length) throw new Error('Signature hazard missing');
        mc.update(.05);
      }
      g.updateCamera(1); g.ui.update(.2); g.renderer.render(g.world.scene, g.camera);
      return { species, name, calls: g.renderer.info.render.calls };
    }, species);
    assert.ok(result.calls > 0); console.log(JSON.stringify(result));
    await page.screenshot({ path: `${output}/${species}.png` });
  }
  const phase = await page.evaluate(async () => {
    const g = window.diversityGame, { MONSTERS } = await import('/src/bestiary.ts');
    g.loadArea(false); g.started = false;
    if (g.monsterCombat.rallied.size || g.monsterCombat.triggeredCasts.length) throw new Error('Species effects leaked across areas');
    for (const enemy of g.enemies) enemy.active = false;
    const mc = g.monsterCombat, grid = g.world.grid, ghost = g.spawnEnemy(g.position.x, g.position.z, 'demon', MONSTERS.ghost);
    ghost.active = true; ghost.cooldown = 1000; mc.state(ghost).memory = 10;
    let found = false;
    search: for (let x = 2; x < grid.width-2; x++) for (let z = 2; z < grid.height-2; z++) {
      if (!grid.isWalkableAt(x, z)) continue;
      const px = x-Math.floor(grid.width/2), pz = z-Math.floor(grid.height/2);
      ghost.actor.group.position.set(px, 0, pz); ghost.body.position.set(px, .5, pz);
      for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) {
        const target = ghost.actor.group.position.clone().add({ x: dx, y: 0, z: dz });
        if (mc.startPhase(ghost, target)) { found = true; break search; }
      }
    }
    if (!found) throw new Error('No real wall crossing found');
    const exit = mc.state(ghost).phase.to.clone(); let frames = 0;
    while (mc.state(ghost).phase && frames++ < 100) { g.time += .05; mc.updateEnemy(ghost, .05); g.world.physics.step(.05); }
    if (mc.state(ghost).phase || !ghost.body.collisionResponse || !mc.walkable(ghost.actor.group.position) || ghost.actor.group.position.distanceTo(exit) > .01) throw new Error('Ghost failed physical wall crossing');
    return { frames, exited: true, collisionRestored: ghost.body.collisionResponse };
  });
  console.log(JSON.stringify({ ghostPhase: phase }));
  assert.deepEqual(errors, []);
  console.log('All species spawned in three difficulties; signature effects rendered and executed on real map geometry.');
} finally { await browser.close(); }
