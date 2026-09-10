import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, gainXp, learnSkill, stats, serializeSave } from '../src/model.ts';
import { SKILLS, EXPERIENCE } from '../src/paladin.ts';
import { MOVEMENT_MODE_KEY } from '../src/controls.ts';

const output = process.env.OUTPUT_DIR || '.verification/wasd-controls';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch(), body = await response.text();
    assert.ok(body.includes('const game = new Game();'));
    await route.fulfill({ response, body: body.replace('const game = new Game();', 'const game = new Game(); window.wasdGame = game;') });
  });
  const hero = newHero(); gainXp(hero, EXPERIENCE[79]);
  for (const skill of SKILLS) assert.ok(learnSkill(hero, skill.id));
  hero.bindings = { attack: 'attack', cleave: 'holyBolt', ward: 'holyShield', nova: 'blessedHammer', dash: 'sacrifice', bolt: 'vengeance' };
  hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana;
  await page.addInitScript(save => {
    if (!sessionStorage.getItem('wasd-fixture')) { localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('wasd-fixture', '1'); }
  }, serializeSave(hero));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  const start = async () => {
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.wasdGame && !window.wasdGame.paused);
    await page.evaluate(() => {
      const g = window.wasdGame; cancelAnimationFrame(g.frameId); window.wasdCasts = [];
      const cast = g.combat.castAction.bind(g.combat);
      g.combat.castAction = (...args) => { const ok = cast(...args); if (ok) window.wasdCasts.push(args[0]); return ok; };
    });
  };
  await start();
  const advance = frames => page.evaluate(frames => { const g = window.wasdGame; for (let i = 0; i < frames; i++) { g.update(1 / 60); g.updateCamera(1); } g.ui.update(0); }, frames);
  const state = () => page.evaluate(() => {
    const g = window.wasdGame;
    return { x: g.position.x, z: g.position.z, path: g.path.length, speed: Math.hypot(g.body.velocity.x, g.body.velocity.z), casts: [...window.wasdCasts], mode: g.movementMode, facing: g.actor.group.rotation.y };
  });
  const reset = async () => {
    await page.evaluate(() => {
      const g = window.wasdGame; g.releaseInput(); g.combat.actionCooldowns = {};
      g.combat.lock = g.combat.stagger = g.combat.movementRecovery = 0; g.combat.zeal = null; g.combat.classes.sequence = undefined;
      g.hero.mana = 500; g.hero.stamina = 500; g.invincible = 100;
      g.body.position.set(0, .5, 11); g.position.set(0, 0, 11); g.actor.group.rotation.y = 1.2; g.updateCamera(1); window.wasdCasts = [];
    });
    await page.mouse.move(850, 420);
  };
  const labels = () => page.locator('.skill[data-skill] kbd').allTextContents();
  assert.equal((await state()).mode, 'mouse');
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('移动方式')).toHaveValue('mouse');
  await page.getByLabel('移动方式').selectOption('wasd');
  assert.deepEqual(await labels(), ['鼠左', 'Q', 'E', 'R', '空格', '鼠右']);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), MOVEMENT_MODE_KEY), 'wasd');
  await page.screenshot({ path: `${output}/desktop-mode.png` });
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByLabel('移动方式')).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: `${output}/menu-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 960 }); await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  await expect(page.getByRole('combobox', { name: '快捷技能 · 空格', exact: true })).toHaveValue('sacrifice');
  await expect(page.getByRole('combobox', { name: '快捷技能 · E', exact: true })).toHaveValue('holyShield');
  await page.keyboard.press('Escape');

  const distances = [];
  for (const [keys, x, y] of [['w', 0, -1], ['d', 1, 0], ['s', 0, 1], ['a', -1, 0], ['wd', 1, -1], ['sd', 1, 1], ['sa', -1, 1], ['wa', -1, -1]]) {
    await reset(); for (const key of keys) await page.keyboard.down(key);
    await advance(18); const moved = await state();
    const expectedX = (x + y) * Math.SQRT1_2, expectedZ = (y - x) * Math.SQRT1_2;
    const distance = Math.hypot(moved.x, moved.z - 11); distances.push(distance);
    assert.ok(distance > .6 && (moved.x * expectedX + (moved.z - 11) * expectedZ) / (distance * Math.hypot(x, y)) > .99, `${keys}: ${JSON.stringify(moved)}`);
    assert.deepEqual(moved.casts, [], 'movement keys do not cast skills');
    for (const key of keys) await page.keyboard.up(key);
    await advance(2); assert.equal((await state()).speed, 0, `${keys} stops on key release`);
  }
  assert.ok(Math.max(...distances) / Math.min(...distances) < 1.02, 'diagonal movement has the same speed');
  await reset(); for (const key of ['w', 's', 'a', 'd']) await page.keyboard.down(key);
  await advance(10); assert.equal((await state()).speed, 0);
  for (const key of ['w', 's', 'a', 'd']) await page.keyboard.up(key);

  for (const [key, id] of [['q', 'holyBolt'], ['e', 'holyShield'], ['r', 'blessedHammer'], ['Space', 'sacrifice']]) {
    await reset(); await page.keyboard.press(key); await advance(1);
    assert.deepEqual((await state()).casts, [id], `${key} selects the displayed slot`);
  }
  for (const button of ['left', 'right']) {
    await reset(); await page.mouse.down({ button });
    assert.deepEqual((await state()).casts, [button === 'left' ? 'attack' : 'vengeance'], `${button} fires on press`);
    await page.mouse.move(930, 450, { steps: 4 }); await advance(100);
    const held = await state(); assert.ok(held.casts.length >= 2, `${button} repeats`);
    assert.ok(Math.hypot(held.x, held.z - 11) < .01 && !held.path, 'dragging either button never moves the hero');
    await page.mouse.up({ button }); await advance(60);
    assert.equal((await state()).casts.length, held.casts.length, 'release stops casting');
    const facing = (await state()).facing; await page.mouse.move(410, 410); await advance(10);
    assert.equal((await state()).facing, facing, 'idle hover does not rotate the hero');

    await reset(); await page.keyboard.down('d'); await page.mouse.down({ button }); await advance(100);
    const combined = await state(); assert.ok(combined.casts.length >= 2 && Math.hypot(combined.x, combined.z - 11) > 1, 'held mouse attacks work during WASD movement');
    await page.mouse.up({ button }); await advance(5); assert.ok((await state()).speed > 1, 'releasing attack keeps held movement');
    await page.keyboard.up('d'); await advance(2);
  }

  await reset(); await page.keyboard.down('w'); await page.keyboard.down('q'); await advance(90);
  assert.ok((await state()).casts.length >= 3 && Math.hypot((await state()).x, (await state()).z - 11) > 1, 'keyboard skills repeat while moving');
  await page.keyboard.up('q'); await page.keyboard.up('w');

  await reset(); await page.mouse.down(); await page.mouse.down({ button: 'right' });
  assert.deepEqual((await state()).casts, ['attack', 'vengeance'], 'both mouse skill slots can be pressed together');
  await page.mouse.up({ button: 'right' }); await advance(60);
  assert.ok((await state()).casts.filter(id => id === 'attack').length > 1, 'releasing right keeps held left attacks');
  assert.equal((await state()).casts.filter(id => id === 'vengeance').length, 1);
  await page.mouse.up();
  await reset(); await page.mouse.down({ button: 'right' }); await page.mouse.down();
  await page.mouse.up(); await advance(60);
  assert.ok((await state()).casts.filter(id => id === 'vengeance').length > 1, 'releasing left keeps held right skills');
  assert.equal((await state()).casts.filter(id => id === 'attack').length, 1);
  await page.mouse.up({ button: 'right' });

  await reset();
  await page.evaluate(() => {
    const g = window.wasdGame, enemy = g.spawnEnemy(8, 8, 'skeleton');
    enemy.hp = enemy.maxHp = 1e6; g.monsterCombat.update = () => {}; window.wasdEnemy = enemy;
  });
  const enemyPoint = await page.evaluate(() => window.wasdGame.project(window.wasdEnemy.actor.group.position.clone().setY(.9)));
  await page.mouse.click(enemyPoint.x, enemyPoint.y); await advance(90);
  assert.ok((await state()).path === 0 && Math.hypot((await state()).x, (await state()).z - 11) < .01, 'clicking distant enemies never chases');
  await page.evaluate(() => { const g = window.wasdGame, e = window.wasdEnemy; g.world.physics.removeBody(e.body); g.disposeObject(e.actor.group); g.enemies = []; });
  await reset();
  const portal = await page.evaluate(() => window.eclipseState.objectives.find(o => o.kind === 'camp-portal').screen);
  await page.mouse.click(portal.x, portal.y); await advance(45);
  assert.equal((await state()).path, 0, 'distant portal clicks never start navigation');
  await page.evaluate(() => { const g = window.wasdGame; g.moveTo(g.position.clone().set(8, 0, 11)); });
  assert.equal((await state()).path, 0, 'interaction path requests are also disabled');

  await reset(); await page.keyboard.down('d'); await advance(5); await page.keyboard.press('Escape');
  await page.getByLabel('移动方式').selectOption('mouse'); await page.keyboard.up('d');
  assert.deepEqual(await labels(), ['鼠左', 'Q', 'W', 'E', 'R', '鼠右']);
  assert.deepEqual(await page.evaluate(() => window.wasdGame.hero.bindings), hero.bindings, 'switching never changes chosen skills');
  await page.keyboard.press('Escape'); await advance(10); assert.equal((await state()).speed, 0, 'switch clears held input');
  await reset(); await page.keyboard.press('w'); assert.deepEqual((await state()).casts, ['holyShield'], 'W casts again in mouse mode');
  await reset(); await page.keyboard.press('Space'); assert.deepEqual((await state()).casts, [], 'Space is not a skill in mouse mode');
  await page.mouse.click(930, 450); await advance(20); assert.ok(Math.hypot((await state()).x, (await state()).z - 11) > .5, 'mouse movement restored');
  await page.keyboard.press('Escape'); await page.getByLabel('移动方式').selectOption('wasd');
  await page.reload(); await start(); assert.equal((await state()).mode, 'wasd', 'setting survives reload');
  await advance(1); assert.deepEqual(await labels(), ['鼠左', 'Q', 'E', 'R', '空格', '鼠右']);
  await page.keyboard.down('d'); await advance(5); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up('d'); await page.keyboard.press('Escape'); await advance(10); assert.equal((await state()).speed, 0, 'blur clears movement');
  assert.deepEqual(errors, []);
  console.log('Esc mode selection, persistence, eight equal-speed directions, dynamic bindings, held combat while moving, mouse movement isolation and legacy controls passed');
} finally { await browser.close(); }
