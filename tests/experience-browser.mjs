import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';

const output = process.env.OUTPUT_DIR || '.verification/experience';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], reports = [];
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width !== 1440, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch(), body = await response.text();
      assert.ok(body.includes('const game = new Game();'));
      await route.fulfill({ response, body: body.replace('const game = new Game();', 'const game = new Game(); window.experienceGame = game;') });
    });
    const hero = newHero(); hero.level = 12; hero.skills.holyBolt = hero.skills.prayer = 1;
    hero.bindings.cleave = 'holyBolt'; hero.bindings.ward = 'prayer';
    await page.addInitScript(save => {
      if (!localStorage.getItem('eclipse-ii-save-v1')) localStorage.setItem('eclipse-ii-save-v1', save);
    }, serializeSave(hero));
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173/?mode=local');
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.experienceGame?.profile && !window.experienceGame.paused);
    if (viewport.height > 580) {
      await expect(page.locator('.quest-track')).toBeVisible();
      await expect(page.locator('.quest-track')).toContainText('选择关卡出发');
      await page.screenshot({ path: `${output}/camp-${viewport.width}.png` });
      await page.locator('.quest-track').click();
    } else await page.getByRole('button', { name: '远征传送阵', exact: true }).click();
    await expect(page.locator('.panel-campaign')).toBeVisible({ timeout: 15000 });
    await page.locator('[data-enter-level="0"]').click();
    await page.waitForFunction(() => !window.experienceGame.inCamp && !window.experienceGame.paused);
    const paint = () => page.evaluate(() => {
      const g = window.experienceGame; g.updateCamera(1); g.renderer.render(g.world.scene, g.camera); g.ui.update(0);
    });
    await page.evaluate(async () => {
      const g = window.experienceGame; cancelAnimationFrame(g.frameId);
      for (const enemy of g.enemies) { enemy.dead = true; enemy.actor.group.visible = false; }
      const { BASES, makeItem } = await import('/src/items.ts');
      const make = (id, rarity = 'common') => ({ ...makeItem(BASES[0], id), rarity, sockets: 0 });
      const drops = [
        { item: make('ordinary') }, { item: make('magic', 'magic') },
        { item: { ...make('socketed'), sockets: 3 } }, { item: make('unique', 'unique') }, { rune: 'el' },
      ];
      for (const drop of drops) g.addLoot({ ...drop, id: g.nextId++, x: g.position.x, z: g.position.z, mesh: new g.actor.group.constructor() });
      g.hero.mana = 0;
    });
    await paint();
    const labels = page.locator('.loot-label');
    await expect(labels).toHaveCount(5);
    await expect(page.locator('.cleave-skill .skill-resource-state')).toHaveText('缺蓝');
    await expect(page.locator('.cleave-skill')).toHaveAttribute('aria-label', /消耗 2 法力.*法力不足/);
    await expect(page.locator('.ward-skill')).not.toHaveClass(/no-mana/);
    if (viewport.width === 1440) {
      await page.locator('.cleave-skill').hover();
      await expect(page.locator('#ui-tooltip')).toContainText('法力不足');
    }
    await page.locator('.cleave-skill').click();
    await expect(page.locator('.toast strong').filter({ hasText: /^法力不足$/ })).toBeVisible();
    await page.evaluate(() => { window.experienceGame.hero.mana = 15; });
    await paint();
    await expect(page.locator('.cleave-skill .skill-resource-state')).toBeHidden();
    await page.locator('.loot-filter-toggle').click(); await paint();
    await expect(labels).toHaveCount(3);
    await expect(page.locator('.loot-filter-toggle')).toHaveAttribute('aria-pressed', 'true');
    assert.equal(await page.evaluate(() => window.experienceGame.loot.length), 5, 'filtering never removes drops');

    // A keyboard override is temporary and releases when focus is lost.
    await page.keyboard.down('Alt'); await paint(); await expect(labels).toHaveCount(5);
    await page.keyboard.up('Alt'); await paint(); await expect(labels).toHaveCount(3);
    await page.keyboard.down('Alt');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.keyboard.up('Alt');
    await expect(page.locator('.panel-pause')).toBeVisible();
    assert.equal(await page.evaluate(() => window.experienceGame.keys.has('alt')), false);
    await expect(page.locator('#loot-label-mode')).toHaveValue('focus');
    await page.locator('#loot-label-mode').selectOption('all');
    await page.locator('.panel-close').click(); await paint(); await expect(labels).toHaveCount(5);
    await page.keyboard.press('l'); await paint(); await expect(labels).toHaveCount(3);
    assert.equal(await page.evaluate(() => {
      const g = window.experienceGame, before = g.lootLabelMode;
      for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true, [modifier]: true }));
      return g.lootLabelMode === before;
    }), true, 'browser modifier shortcuts never change the loot preference');

    // Clicking a retained equipment label still collects exactly that item.
    const socketId = await page.evaluate(() => window.experienceGame.loot.find(drop => drop.item?.id === 'socketed').id);
    await page.locator(`[data-loot="${socketId}"]`).click(); await paint();
    assert.ok(await page.evaluate(() => window.experienceGame.hero.inventory.some(item => item.id === 'socketed')));

    // Ordinary labels arriving first must not crowd out a later unique item or rune.
    await page.evaluate(async () => {
      const g = window.experienceGame;
      for (const loot of g.loot) g.disposeObject(loot.mesh);
      g.loot = [];
      const { BASES, makeItem } = await import('/src/items.ts');
      for (let index = 0; index < 30; index++) g.addLoot({ id: g.nextId++, item: { ...makeItem(BASES[0], `crowd-${index}`), rarity: 'common', sockets: 0 }, x: g.position.x, z: g.position.z, mesh: new g.actor.group.constructor() });
      g.addLoot({ id: g.nextId++, item: { ...makeItem(BASES[0], 'late-unique'), rarity: 'unique' }, x: g.position.x, z: g.position.z, mesh: new g.actor.group.constructor() });
      g.addLoot({ id: g.nextId++, rune: 'ber', x: g.position.x, z: g.position.z, mesh: new g.actor.group.constructor() });
      g.setLootLabelMode('all');
    });
    await paint();
    const priorityIds = await page.evaluate(() => window.experienceGame.loot.filter(drop => drop.item?.id === 'late-unique' || drop.rune).map(drop => drop.id));
    for (const id of priorityIds) await expect(page.locator(`[data-loot="${id}"]`)).toBeVisible();
    await page.keyboard.press('l'); await paint();
    await page.screenshot({ path: `${output}/loot-${viewport.width}.png` });

    const metrics = await page.evaluate(async () => {
      const { stats } = await import('/src/model.ts');
      const g = window.experienceGame; g.hero.mana = stats(g.hero).maxMana; g.ui.update(0);
      const observer = new MutationObserver(() => {});
      for (const selector of ['.hud', '.ally-resources']) observer.observe(document.querySelector(selector), { subtree: true, attributes: true, childList: true, characterData: true });
      const start = performance.now();
      for (let frame = 0; frame < 60; frame++) g.ui.update(0);
      const mutations = observer.takeRecords().length; observer.disconnect();
      const button = document.querySelector('.loot-filter-toggle'), rect = button.getBoundingClientRect();
      const overlaps = [...document.querySelectorAll('.hud,#joystick,#mobile-attack,#context-action')].filter(node => node.getClientRects().length).filter(node => {
        const other = node.getBoundingClientRect(); return rect.right > other.left && rect.left < other.right && rect.bottom > other.top && rect.top < other.bottom;
      }).map(node => node.id || node.className);
      const validMeters = [...document.querySelectorAll('.ally-resource')].every(node => Number(node.getAttribute('aria-valuenow')) <= Number(node.getAttribute('aria-valuemax')));
      return { mutations, updateMs: performance.now() - start, validMeters, overlaps, toggleHeight: rect.height, overflow: document.documentElement.scrollWidth - innerWidth };
    });
    assert.equal(metrics.mutations, 0, 'unchanged HUD and overhead resources must not mutate DOM');
    assert.ok(metrics.validMeters, 'fractional resource maxima remain valid accessible meters');
    assert.deepEqual(metrics.overlaps, [], 'loot control stays clear of combat controls');
    assert.ok(metrics.toggleHeight >= 44 && metrics.overflow <= 1);
    reports.push({ ...viewport, ...metrics });

    await page.keyboard.press('Escape');
    await page.locator('#loot-label-mode').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/settings-${viewport.width}.png` });
    await page.reload();
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.experienceGame?.profile && !window.experienceGame.paused);
    assert.equal(await page.evaluate(() => window.experienceGame.lootLabelMode), 'focus', 'setting survives reload');
    await page.evaluate(() => { const g = window.experienceGame; g.setMovementMode('wasd'); g.ui.update(0); });
    await expect(page.locator('#quest-step')).toHaveText(viewport.width === 1440 ? '靠近传送阵后按 F' : '靠近传送阵后点交互');
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify(reports, null, 2));
  console.log('PASS: camp guidance, resource feedback, label filtering, priority, pickup, persistence and idle HUD', reports);
} finally { await browser.close(); }
