import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero, gainXp, learnSkill, stats, serializeSave } from '../src/model.ts';
import { SKILLS, EXPERIENCE } from '../src/paladin.ts';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch(), body = await response.text();
    assert.ok(body.includes('const game = new Game();'));
    await route.fulfill({ response, body: body.replace('const game = new Game();', 'const game = new Game(); window.combatGame = game;') });
  });
  const hero = newHero(); gainXp(hero, EXPERIENCE[79]);
  for (const skill of SKILLS) assert.ok(learnSkill(hero, skill.id));
  hero.bindings = { attack: 'attack', cleave: 'holyBolt', ward: 'holyShield', nova: 'blessedHammer', dash: 'prayer', bolt: 'holyBolt' };
  hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana;
  await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(hero));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.combatGame && !window.combatGame.paused);
  await page.evaluate(() => {
    const g = window.combatGame; cancelAnimationFrame(g.frameId);
    window.castEvents = [];
    const cast = g.combat.castAction.bind(g.combat);
    g.combat.castAction = (...args) => { const ok = cast(...args); if (ok) window.castEvents.push({ id: args[0], time: g.time }); return ok; };
  });
  const advance = frames => page.evaluate(frames => { for (let i = 0; i < frames; i++) window.combatGame.update(1 / 60); }, frames);
  const events = () => page.evaluate(() => window.castEvents);
  const reset = async () => {
    await page.evaluate(() => {
      const g = window.combatGame; g.ui.closePanel(); g.releaseInput();
      g.combat.actionCooldowns = {}; g.combat.lock = g.combat.stagger = g.combat.movementRecovery = 0;
      g.combat.zeal = null; g.combat.classes.sequence = undefined;
      g.hero.mana = 500; g.invincible = 100; g.hero.activeAura = null;
      g.hero.bindings.cleave = g.hero.bindings.bolt = 'holyBolt';
      g.body.position.set(0, .5, 11); g.position.set(0, 0, 11); g.updateCamera(1);
      window.castEvents = [];
    });
    await page.mouse.move(860, 400);
  };

  await reset(); await page.keyboard.down('Shift'); await page.mouse.down();
  await advance(1); await page.keyboard.press('q'); await page.keyboard.press('e');
  await page.mouse.up(); await page.keyboard.up('Shift'); await advance(1);
  assert.deepEqual((await events()).map(e => e.id), ['attack', 'holyBolt', 'blessedHammer'], 'different actions respond immediately');
  await page.evaluate(() => window.combatGame.ui.update(0));
  assert.equal(await page.locator('[data-skill="ward"]').first().evaluate(el => el.classList.contains('on-cooldown')), false, 'unused shield skill stays available');
  assert.equal(await page.locator('[data-skill="cleave"]').first().evaluate(el => el.classList.contains('on-cooldown')), true);

  await reset(); await page.keyboard.down('q'); await advance(90); await page.keyboard.up('q');
  const repeated = await events(); assert.ok(repeated.length >= 3, 'holding Q repeats without OS repeat events');
  const duration = await page.evaluate(() => window.combatGame.combat.lock + (window.combatGame.time - window.castEvents.at(-1).time));
  for (let i = 1; i < repeated.length; i++) assert.ok(repeated[i].time - repeated[i - 1].time >= duration - .001, 'repeats respect cast speed');
  await advance(60); assert.equal((await events()).length, repeated.length, 'release stops continuous casting');

  for (const key of ['w', 'r']) {
    await reset(); await page.keyboard.down(key); await advance(90); await page.keyboard.up(key);
    if (key === 'w') assert.equal((await events()).length, 1, 'buff does not waste mana by repeating');
    else assert.equal(await page.evaluate(() => window.combatGame.hero.activeAura), 'prayer', 'held aura stays enabled');
  }

  const nearEnd = async () => {
    await reset(); await page.keyboard.press('q');
    await page.evaluate(() => { const g = window.combatGame; while (g.combat.readyIn('holyBolt') > .14) g.update(1 / 60); });
  };
  for (const input of ['keyboard', 'right-click']) {
    await nearEnd();
    if (input === 'keyboard') await page.keyboard.press('q'); else await page.mouse.click(860, 400, { button: 'right' });
    assert.equal((await events()).length, 1, 'early command does not bypass cadence');
    assert.ok(await page.evaluate(() => !!window.combatGame.bufferedSkill), `${input} keeps its queued command after pointer release`);
    await advance(10); assert.equal((await events()).length, 2, `${input} command is buffered until ready`);
    await advance(50); assert.equal((await events()).length, 2, 'buffer fires only once');
  }

  await reset(); await page.keyboard.press('q'); await page.keyboard.press('q'); await advance(60);
  assert.equal((await events()).length, 1, 'commands too early in cooldown are not replayed later');

  await nearEnd(); await page.keyboard.press('q'); await page.keyboard.press('e'); await advance(60);
  assert.deepEqual((await events()).map(e => e.id), ['holyBolt', 'blessedHammer'], 'new skill replaces an older buffered command');

  for (const cancel of ['click-move', 'arrow-move', 'joystick', 'pause', 'blur', 'rebind', 'release']) {
    await nearEnd(); await page.keyboard.press('q');
    if (cancel === 'click-move') await page.mouse.click(910, 450);
    else if (cancel === 'arrow-move') await page.keyboard.down('ArrowRight');
    else await page.evaluate(cancel => {
      const g = window.combatGame;
      if (cancel === 'joystick') g.joystick.set(1, 0);
      if (cancel === 'pause') g.ui.openPanel('pause');
      if (cancel === 'blur') window.dispatchEvent(new Event('blur'));
      if (cancel === 'rebind') g.hero.bindings.cleave = 'blessedHammer';
      if (cancel === 'release') g.releaseInput();
    }, cancel);
    await advance(30);
    if (cancel === 'arrow-move') await page.keyboard.up('ArrowRight');
    await page.evaluate(() => { const g = window.combatGame; if (g.paused) g.ui.closePanel(); });
    await advance(30);
    assert.equal((await events()).length, 1, `${cancel} cancels pending input`);
  }

  await reset(); await page.keyboard.down('Shift'); await page.mouse.down(); await advance(120);
  await page.mouse.up(); await page.keyboard.up('Shift');
  const attacks = await events(); assert.ok(attacks.length >= 3 && attacks.every(e => e.id === 'attack'), 'held normal attack repeats');
  await advance(60); assert.equal((await events()).length, attacks.length, 'release stops normal attacks');

  for (const mode of ['mouse', 'wasd']) {
    for (const key of mode === 'mouse' ? ['q', 'w', 'e', 'r'] : ['q', 'e', 'r', ' ']) {
      await reset();
      await page.evaluate(mode => {
        const g = window.combatGame; g.setMovementMode(mode);
        for (const slot of ['cleave', 'ward', 'nova', 'dash', 'bolt']) g.hero.bindings[slot] = 'attack';
        g.ui.update(0);
      }, mode);
      await page.keyboard.down(key); await advance(100); await page.keyboard.up(key);
      const fallback = await events();
      assert.ok(fallback.length >= 3 && fallback.every(e => e.id === 'attack'), `${mode} ${key}: unconfigured key repeats normal attacks`);
      await advance(60); assert.equal((await events()).length, fallback.length);
      assert.equal(await page.locator('.panel-skills').count(), 0);
      assert.equal(await page.locator('[data-skill="cleave"] .skill-name').textContent(), '普通攻击');
    }
    await reset();
    await page.evaluate(() => window.combatGame.hero.bindings.bolt = 'attack');
    await page.mouse.click(860, 400, { button: 'right' });
    assert.deepEqual((await events()).map(e => e.id), ['attack'], `${mode}: unconfigured right click attacks`);
    assert.equal(await page.locator('.panel-skills').count(), 0);
  }
  await page.keyboard.press('t'); assert.equal(await page.locator('.panel-skills').count(), 1, 'T still opens skill configuration');
  assert.deepEqual(errors, []);
  console.log('Independent cooldown UI, held attacks/skills, one-shot buffs/auras, input buffering and cancellation passed');
} finally { await browser.close(); }
