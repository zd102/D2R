import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';
import { BASES, makeItem, placeItems } from '../src/items.ts';

const output = process.env.OUTPUT_DIR || '.verification/mobile-ui-browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], report = [];
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
async function enter(context) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.mobileGame = game;') });
  });
  const hero = newHero(); hero.gold = 10000; hero.skillPoints = 10; hero.cubeUnlocked = true;
  hero.strength = hero.dexterity = 999;
  hero.potions.fill(5);
  hero.inventory = [makeItem(BASES.find(base => base.baseCode === 'crs'), 'touch-sword')];
  placeItems(hero.inventory);
  await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(hero));
  await page.goto(`${base}?mode=local`);
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.mobileGame?.profile && !window.mobileGame.paused);
  await page.evaluate(() => { cancelAnimationFrame(window.mobileGame.frameId); window.mobileGame.ui.update(0); });
  return page;
}
async function reachable(page, selector, minimum = 44) {
  const failures = await page.locator(selector).evaluateAll((nodes, minimum) => nodes.filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden').flatMap(node => {
    const r = node.getBoundingClientRect(), target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return r.width < minimum - .5 || r.height < minimum - .5 || r.x < -.5 || r.y < -.5 || r.right > innerWidth + .5 || r.bottom > innerHeight + .5 || !node.contains(target)
      ? [{ node: node.outerHTML.slice(0, 160), bounds: r.toJSON(), target: target?.outerHTML.slice(0, 100) }] : [];
  }), minimum);
  assert.deepEqual(failures, [], `reachable ${selector}`);
}
async function fits(page) {
  const metrics = await page.locator('#overlay .panel').evaluate(node => {
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight, overflow: node.scrollWidth - node.clientWidth, vertical: node.scrollHeight - node.clientHeight };
  });
  assert.ok(metrics.x >= 0 && metrics.y >= 0 && metrics.right <= metrics.width + 1 && metrics.bottom <= metrics.height + 1 && metrics.overflow <= 1 && metrics.vertical <= 1, JSON.stringify(metrics));
  await reachable(page, '.panel-header > button');
}
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await enter(context);
  for (const [width, height] of [[390, 844], [320, 568], [360, 640], [430, 932], [568, 320], [667, 375], [844, 390], [932, 430]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { const g = window.mobileGame; g.ui.closePanel(); g.ui.update(0); g.renderer.render(g.world.scene, g.camera); });
    await reachable(page, '.hud .skill, #joystick, .hud .bottom-nav button, .hud .paladin-status button, .top-tools button');
    assert.ok(await page.locator('.resource .orb small').evaluateAll(nodes => nodes.every(node => {
      const r = node.getBoundingClientRect(), orb = node.closest('.orb').getBoundingClientRect();
      return r.top >= orb.top && r.bottom <= orb.bottom && r.left >= orb.left && r.right <= orb.right;
    })), 'current and maximum resources remain readable');
    const controls = await page.locator('.hud .skill, #joystick, .hud .paladin-status button').evaluateAll(nodes => nodes.map(node => ({ name: node.getAttribute('aria-label'), rect: node.getBoundingClientRect().toJSON() })));
    for (let a = 0; a < controls.length; a++) for (let b = a + 1; b < controls.length; b++) {
      const x = controls[a].rect, y = controls[b].rect;
      assert.ok(Math.min(x.right, y.right) <= Math.max(x.left, y.left) || Math.min(x.bottom, y.bottom) <= Math.max(x.top, y.top), `${width}: overlap ${controls[a].name} / ${controls[b].name}`);
    }
    await page.screenshot({ path: `${output}/hud-${width}x${height}.png` });
    // Exercise actual touch taps and ensure each physical skill button dispatches once.
    await page.evaluate(() => { const g = window.mobileGame; g.originalUseSkill = g.useSkill; g.touchCasts = []; g.useSkill = slot => { g.touchCasts.push(slot); return true; }; });
    for (const slot of ['cleave', 'ward', 'nova', 'dash', 'bolt', 'attack']) await page.locator(`.hud [data-skill="${slot}"]`).tap();
    assert.deepEqual(await page.evaluate(() => window.mobileGame.touchCasts), ['cleave', 'ward', 'nova', 'dash', 'bolt', 'attack']);
    await page.evaluate(() => { const g = window.mobileGame; g.useSkill = g.originalUseSkill; delete g.originalUseSkill; });
    await page.evaluate(() => { const g = window.mobileGame; g.originalDrink = g.drink; g.touchDrinks = []; g.drink = index => g.touchDrinks.push(index); });
    for (let slot = 0; slot < 4; slot++) await page.locator(`[data-potion-slot="${slot}"]`).tap();
    assert.ok(await page.evaluate(() => JSON.stringify(window.mobileGame.touchDrinks) === JSON.stringify(window.mobileGame.hero.potionBindings)));
    await page.evaluate(() => { const g = window.mobileGame; g.drink = g.originalDrink; delete g.originalDrink; });
    for (const panel of ['inventory', 'character', 'skills', 'map', 'quest', 'pause', 'shop', 'campaign', 'mercenary', 'shared-stash']) {
      await page.evaluate(panel => {
        const g = window.mobileGame;
        if (panel === 'inventory') g.ui.characterScreen.inventoryPane = 'items';
        if (panel === 'shared-stash') {
          const stash = g.world.sharedStash.position; g.position.set(stash.x, 0, stash.z);
          g.ui.sharedStashScreen.selected = undefined; g.ui.sharedStashScreen.pane = 'personal';
        }
        g.ui.openPanel(panel);
      }, panel);
      await fits(page);
      if (panel === 'inventory') {
        await reachable(page, '.inventory-primary-tabs button, .inventory-pane-tabs button');
        const binding = page.locator('[data-potion-binding="0"]');
        await binding.scrollIntoViewIfNeeded();
        await binding.selectOption('1');
        assert.equal(await page.evaluate(() => window.mobileGame.hero.potionBindings[0]), 1);
        await page.locator('[data-item="touch-sword"]').tap();
        await reachable(page, '.item-actions button');
        assert.ok((await page.locator('.item-detail-scroll').boundingBox()).height >= 80, 'item properties retain a readable scrolling area');
        await page.locator('[data-equip="touch-sword"]').tap();
        assert.equal(await page.evaluate(() => window.mobileGame.hero.equipment.weapon?.id), 'touch-sword');
        await page.locator('[data-unequip="weapon"]').tap();
        assert.ok(await page.evaluate(() => window.mobileGame.hero.inventory.some(item => item.id === 'touch-sword')));
      }
      if (panel === 'shared-stash') {
        await page.locator('[data-shared-item="touch-sword"]').tap();
        await reachable(page, '.shared-actions button');
      }
      if (panel === 'skills') {
        await page.locator('button[data-skill-pane="tree"]').tap();
        await page.locator('[data-select-skill]').first().tap();
        await expect(page.locator('.skill-inspector')).toBeVisible();
        await page.locator('button[data-skill-pane="bindings"]').tap();
        await expect(page.locator('.binding-grid')).toBeVisible();
        await page.locator('[data-binding="cleave"]').selectOption('attack');
        assert.equal(await page.evaluate(() => window.mobileGame.hero.bindings.cleave), 'attack');
      }
      await page.screenshot({ path: `${output}/${panel}-${width}x${height}.png` });
      await page.locator('.panel-header [data-action="close"]').tap();
      await expect(page.locator('#overlay')).toBeHidden();
    }
    report.push({ width, height, controls: controls.length, panels: 10 });
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => {
    const app = document.getElementById('app');
    for (const [side, value] of Object.entries({ left: '44px', right: '44px', top: '12px', bottom: '20px' })) app.style.setProperty(`--touch-${side}`, value);
  });
  await reachable(page, '.hud .skill, #joystick, .hud .bottom-nav button, .hud .paladin-status button, .top-tools button');
  await page.evaluate(() => window.mobileGame.ui.openPanel('inventory'));
  await fits(page);
  await page.screenshot({ path: `${output}/safe-insets-landscape.png` });
  await page.evaluate(() => {
    window.mobileGame.ui.closePanel();
    for (const side of ['left', 'right', 'top', 'bottom']) document.getElementById('app').style.removeProperty(`--touch-${side}`);
  });
  // Two fingers can move and attack together; lost capture, rotation and modals release both.
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await context.newCDPSession(page);
  const joystick = await page.locator('#joystick').boundingBox(), attack = await page.locator('.attack-skill').boundingBox();
  const touches = [{ x: joystick.x + joystick.width * .8, y: joystick.y + joystick.height / 2, id: 1 }, { x: attack.x + attack.width / 2, y: attack.y + attack.height / 2, id: 2 }];
  await page.evaluate(() => {
    window.touchPointers = [];
    for (const node of document.querySelectorAll('#joystick, .attack-skill')) node.addEventListener('pointerdown', event => window.touchPointers.push({ node, id: event.pointerId }), { once: true });
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches });
  assert.ok(await page.evaluate(() => window.mobileGame.joystick.length() > .5 && window.mobileGame.heldAttack));
  await page.evaluate(() => {
    for (const { node, id } of window.touchPointers) node.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: id, pointerType: 'touch' }));
  });
  await page.waitForFunction(() => !window.mobileGame.heldAttack && window.mobileGame.joystick.length() === 0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => !window.mobileGame.heldAttack && window.mobileGame.joystick.length() === 0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.setViewportSize({ width: 390, height: 844 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches });
  await page.evaluate(() => window.mobileGame.ui.openPanel('inventory'));
  assert.ok(await page.evaluate(() => !window.mobileGame.heldAttack && window.mobileGame.joystick.length() === 0));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await context.close();

  // Compare every computed style with the phone stylesheet disabled on desktop.
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pc = await enter(desktop);
  for (const [width, height] of [[1440, 900], [1024, 768], [844, 390], [390, 844]]) {
    await pc.setViewportSize({ width, height });
    for (const panel of [null, 'inventory', 'skills', 'pause']) {
      await pc.evaluate(panel => panel ? window.mobileGame.ui.openPanel(panel) : window.mobileGame.ui.closePanel(), panel);
      const difference = await pc.evaluate(() => {
        const sheet = [...document.styleSheets].find(sheet => sheet.ownerNode?.dataset?.viteDevId?.endsWith('/mobile-ui.css'));
        if (!sheet) throw new Error('phone stylesheet missing');
        const nodes = [...document.querySelectorAll('#app *')];
        const snapshot = () => nodes.map(node => { const css = getComputedStyle(node); return [...css].map(key => css.getPropertyValue(key)).join('|'); });
        const before = snapshot(); sheet.disabled = true; const after = snapshot(); sheet.disabled = false;
        return before.flatMap((value, i) => value === after[i] ? [] : [nodes[i].outerHTML.slice(0, 120)]);
      });
      assert.deepEqual(difference, [], `desktop styles unchanged at ${width}x${height} ${panel}`);
    }
  }
  await desktop.close();
  assert.deepEqual(errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log('PASS: 8 phone viewports, touch targets, 80 panels, equipment actions, skill and potion binding, simultaneous move/attack, rotation/modal release; desktop computed styles unchanged at 4 viewports.');
} finally { await browser.close(); }
