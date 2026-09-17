import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';
import { CHALLENGE_KEYS, createChallengeKey, createClassTorch } from '../src/items.ts';

const output = process.env.OUTPUT_DIR || '.verification/pandemonium';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.challengeTest = game;') });
  });
  const hero = newHero('sorceress'); hero.level = 99; hero.campaign.cleared = [25, 25, 25]; hero.difficultyLevel = 2; hero.unlockedDifficulty = 2;
  hero.inventory = [...CHALLENGE_KEYS.flatMap(key => [createChallengeKey(key.event), createChallengeKey(key.event)]), createClassTorch('paladin')];
  await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(hero));
  const url = new URL(process.env.BASE_URL || 'http://127.0.0.1:5173'); url.searchParams.set('mode', 'local');
  await page.goto(url.href);
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState?.inCamp && !window.eclipseState.paused);
  await page.locator('[data-action="mystery-portal"]').click();
  await expect(page.locator('[data-pandemonium-entry]')).toBeVisible();
  const missing = await page.evaluate(() => {
    const g = window.challengeTest, saved = g.hero.inventory;
    g.hero.inventory = saved.filter(item => item.event !== 'key-hate');
    const before = g.hero.inventory.map(item => item.id);
    const result = g.enterPandemonium(); g.ui.renderPanel();
    const disabled = document.querySelector('[data-pandemonium-entry]').disabled;
    const intact = JSON.stringify(before) === JSON.stringify(g.hero.inventory.map(item => item.id));
    g.hero.inventory = saved; g.ui.renderPanel();
    return { result, disabled, intact };
  });
  assert.deepEqual(missing, { result: false, disabled: true, intact: true });
  await expect(page.locator('[data-pandemonium-entry]')).toBeEnabled();
  await expect(page.locator('.portal-keys')).toContainText('恐惧之钥 2/1');
  await page.screenshot({ path: `${output}/portal-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-pandemonium-entry]')).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.portal-card')].every(el => el.scrollWidth <= el.clientWidth)), true);
  await page.screenshot({ path: `${output}/portal-mobile.png` });
  const rollback = await page.evaluate(() => {
    const game = window.challengeTest, original = game.commitSave;
    const before = game.hero.inventory.map(item => item.id);
    game.commitSave = (_success, failure) => { failure(); return false; };
    const result = game.enterPandemonium(); game.commitSave = original;
    return { result, intact: JSON.stringify(before) === JSON.stringify(game.hero.inventory.map(item => item.id)), camp: game.inCamp, area: game.specialArea };
  });
  assert.deepEqual(rollback, { result: false, intact: true, camp: true, area: undefined });
  await page.locator('[data-pandemonium-entry]').click();
  await page.waitForFunction(() => window.eclipseState?.area.id === 'pandemonium' && !window.eclipseState.paused);
  const entry = await page.evaluate(() => {
    const g = window.challengeTest;
    return { keys: g.hero.inventory.filter(item => item.event?.startsWith('key-')).length, alive: g.enemies.filter(e => !e.dead).length, stage: g.challengeStage, hp: g.enemies[0].maxHp, diff: g.hero.difficultyLevel };
  });
  assert.equal(entry.keys, 3); assert.equal(entry.alive, 1); assert.equal(entry.stage, 0); assert.equal(entry.diff, 2); assert.ok(entry.hp > 900000);
  const navigation = await page.evaluate(() => {
    const g = window.challengeTest;
    return { boss: g.world.path(g.position, g.world.layout.boss).length, exit: g.world.path(g.position, g.world.layout.exit).length, reopen: g.enterPandemonium(), keys: g.hero.inventory.filter(item => item.event?.startsWith('key-')).length };
  });
  assert.ok(navigation.boss > 0 && navigation.exit > 0); assert.equal(navigation.reopen, false); assert.equal(navigation.keys, 3);
  for (let stage = 0; stage < 6; stage++) {
    const result = await page.evaluate(stage => {
      const g = window.challengeTest, enemy = g.enemies.find(e => e.boss && !e.dead);
      const before = g.loot.length;
      g.killEnemy(enemy); const after = g.loot.length; g.killEnemy(enemy);
      return { stage: g.challengeStage, name: enemy.name, aura: enemy.affixes?.[0]?.aura, alive: g.enemies.filter(e => e.boss && !e.dead).length, drops: after - before, duplicate: g.loot.length !== after, completed: g.hero.bossDefeated,
        torches: g.loot.filter(l => l.item?.catalogId === 'unique-401').length };
    }, stage);
    assert.equal(result.stage, stage + 1); assert.equal(result.alive, stage === 5 ? 0 : 1); assert.ok(result.drops > 0);
    assert.equal(result.duplicate, false); assert.equal(result.completed, stage === 5); assert.equal(result.torches, stage === 5 ? 1 : 0);
    if (stage === 1) assert.equal(result.aura, 'holyFreeze');
    if (stage === 3) assert.equal(result.aura, 'conviction');
    if (stage === 1) {
      await page.evaluate(() => window.challengeTest.returnToCamp());
      await page.waitForFunction(() => window.challengeTest.inCamp);
      await page.evaluate(async () => {
        const { CAMP } = await import('/src/camp.ts'); const g = window.challengeTest;
        g.position.set(CAMP.returnPortal.x, 0, CAMP.returnPortal.z); g.resumeCampReturn();
      });
      await page.waitForFunction(() => !window.challengeTest.inCamp);
      assert.equal(await page.evaluate(() => window.challengeTest.challengeStage), 2);
    }
  }
  const pickup = await page.evaluate(async () => {
    const { transferItem } = await import('/src/model.ts'), { itemMods } = await import('/src/items.ts');
    const g = window.challengeTest, loot = g.loot.find(l => l.item?.catalogId === 'unique-401');
    loot.item.identified = true; const skills = itemMods(loot.item).sorceressSkills;
    g.collectLoot(loot); const blocked = g.loot.includes(loot);
    const old = g.hero.inventory.find(item => item.catalogId === 'unique-401'); transferItem(g.hero, old.id, 'stash');
    g.collectLoot(loot);
    return { skills, blocked, picked: !g.loot.includes(loot), count: g.hero.inventory.filter(item => item.catalogId === 'unique-401').length };
  });
  assert.deepEqual(pickup, { skills: 3, blocked: true, picked: true, count: 1 });
  await page.screenshot({ path: `${output}/challenge-complete.png` });
  assert.deepEqual(errors, []);
  console.log('Desktop/mobile portal, atomic keys, all six bosses, independent drops, camp resume, one class torch and duplicate pickup passed');
} finally { await browser.close(); }
