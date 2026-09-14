import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero, serializeSave } from '../src/model.ts';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch(), body = await response.text();
    assert.ok(body.includes('const game = new Game();'));
    await route.fulfill({ response, body: body.replace('const game = new Game();', 'const game = new Game(); window.comboGame = game;') });
  });
  await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(newHero('amazon')));
  const url = new URL(process.env.BASE_URL || 'http://127.0.0.1:5173');
  url.searchParams.set('mode', 'local');
  await page.goto(url.href);
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.comboGame && !window.comboGame.paused);
  const results = await page.evaluate(async () => {
    const { newHero } = await import('/src/model.ts');
    const { BASES, makeItem } = await import('/src/items.ts');
    const g = window.comboGame, c = g.combat, results = [];
    cancelAnimationFrame(g.frameId);
    // Record strike dispatches while keeping actual cast, cooldown and update logic.
    let hits = [];
    c.classes.spear = c.classes.missile = () => hits.push(g.time);
    c.classes.nearby = () => [{}, {}, {}];
    for (const id of ['jab', 'fend', 'strafe']) for (const ias of [0, 120]) for (const dt of [1 / 60, 1 / 30]) {
      g.hero = newHero('amazon');
      Object.assign(g.hero, { level: 90, strength: 200, dexterity: 200, mana: 10000 });
      g.hero.skills[id] = 20;
      const weapon = makeItem(BASES.find(base => base.baseCode === (id === 'strafe' ? 'sbw' : 'spr')));
      weapon.speed = 0; weapon.mods = { ias };
      g.hero.equipment.weapon = weapon; g.hero.equipment.shield = null;
      c.actionCooldowns = {}; c.stagger = 0; c.cancelCombo();
      hits = []; g.time = 0;
      if (!c.castAction(id, true)) throw new Error(`Cannot cast ${id}`);
      const count = c.classes.sequence.remaining;
      c.update(0);
      const immediate = hits.length;
      while (c.classes.sequence && g.time < 5) { g.time += dt; c.update(dt); }
      results.push({ id, ias, dt, count, immediate, hits: [...hits], ready: c.readyIn(id), recast: c.castAction(id, true) });
      c.cancelCombo();
      c.actionCooldowns = {}; g.hero.mana = 10000;
      c.castAction(id, true); c.update(0); c.cancelCombo(true);
      const before = hits.length;
      for (let i = 0; i < 60; i++) c.update(dt);
      if (hits.length !== before) throw new Error('Cancelled combo kept attacking');
    }
    return results;
  });
  for (const row of results) {
    assert.equal(row.immediate, 1, `${row.id}: first hit is immediate`);
    assert.equal(row.hits.length, row.count);
    assert.equal(row.ready, 0, `${row.id}: ready on final hit`);
    assert.equal(row.recast, true);
    const gaps = row.hits.slice(1).map((time, i) => time - row.hits[i]);
    assert.ok(Math.max(...gaps) - Math.min(...gaps) <= row.dt + 1e-6, 'cadence does not accumulate frame rounding');
    if (row.ias) {
      const slow = results.find(other => other.id === row.id && !other.ias && other.dt === row.dt);
      assert.ok(row.hits[1] < slow.hits[1], `${row.id}: IAS shortens individual gaps`);
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS: Jab, Fend and Strafe individual IAS gaps, immediate first hit, final-hit recast, cancellation and 30/60 FPS cadence');
} finally { await browser.close(); }
