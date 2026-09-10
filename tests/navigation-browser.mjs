import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero, gainXp, learnSkill, stats, serializeSave } from '../src/model.ts';
import { BASES, makeItem } from '../src/items.ts';
import { SKILLS, EXPERIENCE } from '../src/paladin.ts';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch(), body = await response.text();
    assert.ok(body.includes('const game = new Game();'));
    await route.fulfill({ response, body: body.replace('const game = new Game();', 'const game = new Game(); window.navigationGame = game;') });
  });
  const hero = newHero(); gainXp(hero, EXPERIENCE[39]);
  for (const skill of SKILLS) assert.ok(learnSkill(hero, skill.id));
  hero.bindings.cleave = hero.bindings.bolt = 'holyBolt';
  hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana;
  await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(hero));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState?.inCamp && !window.eclipseState.paused);

  // Capture the running instance only in this isolated test context, then drive
  // its real physics/combat/input at fixed timesteps independent of GPU speed.
  await page.waitForFunction(() => window.navigationGame);
  await page.evaluate(() => cancelAnimationFrame(window.navigationGame.frameId));
  const reset = () => page.evaluate(() => {
    const g = window.navigationGame;
    g.releaseInput(); g.combat.lock = g.combat.stagger = g.combat.movementRecovery = 0; g.combat.actionCooldowns = {}; g.combat.zeal = null; g.combat.classes.sequence = undefined;
    g.attackTime = 0; g.hero.mana = 500; g.hero.stamina = 500; g.invincible = 100;
    g.body.position.set(0, .5, 11); g.body.velocity.set(0, 0, 0); g.position.set(0, 0, 11);
    g.actor.group.rotation.y = 1.2; g.updateCamera(1);
  });
  const advance = frames => page.evaluate(frames => {
    const g = window.navigationGame, samples = [];
    for (let i = 0; i < frames; i++) {
      g.update(1 / 60); g.updateCamera(1);
      samples.push({ x: g.position.x, z: g.position.z, speed: Math.hypot(g.body.velocity.x, g.body.velocity.z), lock: g.combat.lock, movementLocked: g.combat.movementLocked, path: g.path.length, facing: g.actor.group.rotation.y });
    }
    return samples;
  }, frames);

  await reset(); await page.mouse.move(950, 420); await advance(20);
  assert.equal(await page.evaluate(() => window.navigationGame.actor.group.rotation.y), 1.2, 'idle hover preserves facing');

  await page.evaluate(() => {
    const g = window.navigationGame;
    g.moveTo(g.position.clone().set(3.3, 0, 8.3));
  });
  await page.mouse.move(450, 460);
  const clicked = await advance(110);
  assert.ok(clicked[0].speed > 0 && Math.sin(clicked[0].facing) > 0, 'click navigation faces travel even while hovering behind');
  assert.ok(clicked.every(s => !s.path || s.speed > 0), 'click path has no idle frames before arrival');
  const end = clicked.at(-1); assert.ok(Math.hypot(end.x - 3.3, end.z - 8.3) < .13, `click reaches fractional destination: ${JSON.stringify(end)}`);
  const facing = end.facing; await page.mouse.move(980, 420); await advance(10);
  assert.equal(await page.evaluate(() => window.navigationGame.actor.group.rotation.y), facing, 'hover after arrival preserves facing');

  await reset(); await page.mouse.move(920, 470); await page.mouse.down();
  let searchCount = await page.evaluate(() => {
    const g = window.navigationGame, find = g.world.finder.findPath;
    window.navigationSearches = 0;
    g.world.finder.findPath = function(...args) { window.navigationSearches++; return find.apply(this, args); };
    return window.navigationSearches;
  });
  const drag = await advance(25); await page.mouse.move(870, 445, { steps: 4 }); const redirected = await advance(25);
  assert.ok([...drag, ...redirected].every(s => s.speed > 1), 'click-to-drag motion has no waypoint or repath stalls');
  assert.equal(await page.evaluate(() => window.navigationSearches), searchCount, 'clear drag uses no A*');
  const destination = await page.evaluate(() => window.navigationGame.path.at(-1).toArray());
  await page.mouse.up(); const released = await advance(10);
  assert.ok(released.every(s => s.speed > 1), 'release keeps the committed route moving');
  await page.mouse.move(420, 400);
  const settled = (await advance(180)).at(-1);
  assert.ok(Math.hypot(settled.x - destination[0], settled.z - destination[2]) < .13, 'released movement reaches its last destination without following hover');
  assert.equal(settled.speed, 0);

  await reset();
  for (let click = 0; click < 12; click++) {
    const x = 920 - click % 3 * 12, y = 450 + click % 2 * 10;
    await page.mouse.move(x, y); await page.mouse.down();
    // Include small pointer drift and presses long enough to enter held mode.
    if (click % 2) await page.mouse.move(x + 8, y);
    if (click % 3 === 0) await page.evaluate(() => window.navigationGame.pointerGesture.started -= 250);
    assert.ok((await advance(3)).every(s => s.speed > 1), 'retargeting keeps moving');
    await page.mouse.up();
    assert.ok(await page.evaluate(() => Math.hypot(window.navigationGame.body.velocity.x, window.navigationGame.body.velocity.z) > 1), 'pointerup never zeroes velocity');
    assert.ok((await advance(3)).every(s => s.speed > 1), 'no idle frame between consecutive clicks');
  }

  for (const input of ['keyboard', 'right-click']) {
    await reset();
    await page.evaluate(() => { const g = window.navigationGame; g.moveTo(g.position.clone().set(8, 0, 11)); });
    await advance(5); await page.mouse.move(850, 410);
    if (input === 'keyboard') await page.keyboard.press('q');
    else await page.mouse.click(850, 410, { button: 'right' });
    assert.ok(await page.evaluate(() => window.navigationGame.combat.lock > .1), `${input} casts`);
    const recovery = await advance(70);
    assert.ok(recovery.some(s => s.lock > .1 && s.speed === 0 && s.path > 0), `${input} keeps route during recovery`);
    assert.ok(recovery.some(s => s.lock > .1 && s.speed > 1), `${input} resumes movement before the next cast is ready`);
  }

  await reset(); await page.mouse.move(920, 470); await page.mouse.down(); await advance(8);
  await page.keyboard.press('q'); const skillFacing = await page.evaluate(() => window.navigationGame.actor.group.rotation.y);
  await page.mouse.move(700, 380); const heldRecovery = await advance(12);
  assert.ok(heldRecovery.every(s => !s.movementLocked || s.facing === skillFacing), 'hover/drag cannot overwrite the committed cast facing during recovery');
  assert.ok((await advance(40)).some(s => s.speed > 1), 'held drag resumes after casting without another click');
  await page.mouse.up(); await advance(2);

  await reset();
  await page.evaluate(() => { const g = window.navigationGame; g.moveTo(g.position.clone().set(8, 0, 11)); g.combat.recover(.6); });
  await page.mouse.move(930, 400); await page.keyboard.press('q');
  assert.ok(await page.evaluate(() => window.navigationGame.path.length > 0), 'rejected skill during cooldown preserves navigation');
  assert.ok((await advance(70)).some(s => s.speed > 1), 'rejected skill does not strand the hero');

  await reset();
  const chase = await page.evaluate(() => {
    const g = window.navigationGame, enemy = g.spawnEnemy(9, 8, 'skeleton');
    enemy.hp = enemy.maxHp = 1e6; g.target = enemy; g.hero.bindings.attack = 'attack';
    const path = g.world.path, updateMonsters = g.monsterCombat.update;
    let requests = 0;
    g.world.path = function(...args) { requests++; return path.apply(this, args); };
    g.monsterCombat.update = () => {};
    for (let i = 0; i < 90; i++) {
      enemy.body.position.x = 9 + i * .015; enemy.body.position.z = 8;
      enemy.actor.group.position.set(enemy.body.position.x, 0, 8);
      g.update(1 / 60);
    }
    const approached = g.position.distanceTo(enemy.actor.group.position) < 8;
    // Once in range, attack recovery must not start new navigation work.
    enemy.body.position.set(g.position.x, .5, g.position.z - 1.6);
    enemy.actor.group.position.set(g.position.x, 0, g.position.z - 1.6);
    const before = requests, health = enemy.hp;
    for (let i = 0; i < 60; i++) g.update(1 / 60);
    const result = { approached, chaseRequests: before, attackRequests: requests - before, attacked: enemy.hp < health };
    g.world.path = path; g.monsterCombat.update = updateMonsters;
    g.world.physics.removeBody(enemy.body); g.disposeObject(enemy.actor.group); g.enemies = [];
    return result;
  });
  assert.ok(chase.approached && chase.chaseRequests > 0 && chase.chaseRequests <= 8, JSON.stringify(chase));
  assert.ok(chase.attacked && chase.attackRequests === 0, 'attack recovery preserves target without repeated path searches');

  // Real colliders and the expanded map, not just an empty mock grid.
  await reset();
  const obstacle = await page.evaluate(() => {
    const g = window.navigationGame;
    g.world.addCollider(-3, 11, 1, 3);
    g.moveTo(g.position.clone().set(-7, 0, 11));
    return g.path.map(p => ({ x: p.x, z: p.z }));
  });
  assert.ok(obstacle.length > 1, 'obstacle creates a detour');
  const detour = await advance(240), arrival = detour.at(-1);
  assert.ok(detour.every(s => !s.path || s.speed > 0), 'detour waypoints never insert an idle frame');
  assert.ok(Math.hypot(arrival.x + 7, arrival.z - 11) < .2, `detour arrives: ${JSON.stringify(arrival)}`);

  // The unrounded corridor beside the camp table is physically clear, even
  // though the old inflated integer grid marked it as a wall.
  await reset();
  await page.evaluate(() => {
    const g = window.navigationGame;
    g.body.position.set(3.3, .5, 9.9); g.position.set(3.3, 0, 9.9);
    g.moveTo(g.position.clone().set(9.6, 0, 9.9));
  });
  const besideTable = await advance(110);
  assert.ok(besideTable.every(s => Math.abs(s.z - 9.9) < .05), 'passes the visible table edge without an air-wall detour');
  assert.ok(Math.abs(besideTable.at(-1).x - 9.6) < .13, 'real physics permits the same close route as navigation');

  await reset();
  const item = makeItem(BASES[0]); Object.assign(item, { name: '锐利的短剑之火焰', identified: false, rarity: 'magic', sockets: 2 });
  const label = await page.evaluate(item => {
    const g = window.navigationGame, id = g.nextId++;
    g.addLoot({ id, x: 1, z: 10, item, mesh: g.actor.group.clone(false) });
    g.ui.update(1 / 60);
    return document.querySelector(`[data-loot="${id}"]`).textContent;
  }, item);
  assert.equal(label, `${item.base} [2孔]`, 'live ground label hides the affix and keeps sockets');
  assert.deepEqual(errors, []);
  console.log('Idle/arrival facing, continuous click and drag, fractional arrival, zero-A* open movement, cast recovery, rejected skills and collider detours passed');
} finally { await browser.close(); }
