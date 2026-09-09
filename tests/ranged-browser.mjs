import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, stats, serializeSave } from '../src/model.ts';
import { BASES, makeItem } from '../src/items.ts';
import { savedProfile } from './browser-helpers.mjs';

const output = process.env.OUTPUT_DIR || '.verification/ranged-browser';
await mkdir(output, { recursive: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], state = page => page.evaluate(() => window.eclipseState);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const weapon = (code, id) => makeItem(BASES.find(base => base.baseCode === code), id);
async function fixture(viewport = { width: 1440, height: 960 }, touch = false) {
  const page = await browser.newPage({ viewport, isMobile: touch, hasTouch: touch });
  page.on('pageerror', error => errors.push(error.message));
  const hero = newHero(); hero.level = 40; hero.dexterity = 80; hero.strength = 80; hero.vitality = 200; hero.gold = 1000;
  hero.equipment.weapon = weapon('sbw', 'test-bow'); hero.equipment.shield = null;
  hero.alternate.weapon = weapon('lxb', 'test-crossbow');
  hero.inventory = [weapon('jav', 'test-javelin'), weapon('tkf', 'test-knife'), weapon('tax', 'test-axe'),
    { id: 'test-quiver', name: '箭矢', baseCode: 'aqv', misc: true, slot: 'amulet', rarity: 'common', power: 0, level: 1, value: 1 }];
  hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana;
  await page.addInitScript(save => {
    if (!sessionStorage.getItem('ranged-fixture')) { localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('ranged-fixture', '1'); }
  }, serializeSave(hero));
  await page.goto(base); await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState?.inCamp && !window.eclipseState.paused && window.eclipseState.ranged.model === 'bow');
  return page;
}
async function canvasCheck(page) {
  const colors = await page.locator('#game-canvas').evaluate(canvas => {
    const copy = document.createElement('canvas'); copy.width = copy.height = 80;
    const ctx = copy.getContext('2d'); ctx.drawImage(canvas, 0, 0, 80, 80);
    const data = ctx.getImageData(0, 0, 80, 80).data, colors = new Set();
    for (let i = 0; i < data.length; i += 4) colors.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
    return colors.size;
  });
  assert.ok(colors > 100, `Scene has ${colors} colors`);
  const before = await page.locator('#game-canvas').evaluate(canvas => canvas.toDataURL());
  await page.waitForTimeout(150);
  assert.notEqual(await page.locator('#game-canvas').evaluate(canvas => canvas.toDataURL()), before, 'Scene animates');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
  const status = await page.locator('.paladin-status').evaluate(node => {
    const r = node.getBoundingClientRect();
    return [...node.children].filter(child => !child.hidden).every(child => {
      const c = child.getBoundingClientRect(); return c.left >= r.left - 1 && c.right <= r.right + 1 && child.scrollWidth <= child.clientWidth + 1;
    });
  });
  assert.ok(status, 'Ammo and aura status text fit');
}
async function fire(page, kind, file) {
  await page.waitForTimeout(1000);
  const start = await state(page), viewport = page.viewportSize();
  await page.mouse.move(viewport.width * .64, viewport.height * .5);
  await page.keyboard.down('Shift'); await page.mouse.down();
  await page.waitForFunction(kind => window.eclipseState.controls.projectiles.some(p => p.kind === kind), kind);
  const first = await state(page); await page.mouse.up(); await page.keyboard.up('Shift');
  assert.equal(first.ranged.ammo, start.ranged.ammo - 1);
  assert.ok(distance(start.position, first.position) < .03, 'Shooting does not move the hero');
  await page.waitForTimeout(50); const next = await state(page);
  assert.ok(next.controls.projectiles.length && distance(first.controls.projectiles[0], next.controls.projectiles[0]) > .1, 'Missile travels');
  await page.screenshot({ path: `${output}/${file}.png` }); await canvasCheck(page);
  await page.waitForTimeout(1000);
}
async function equip(page, id, kind) {
  await page.keyboard.press('i'); await page.locator(`[data-item="${id}"]`).click();
  await page.locator(`[data-equip="${id}"]`).click(); await page.keyboard.press('Escape');
  await page.waitForFunction(kind => window.eclipseState.ranged.model === kind, kind);
}
try {
  const page = await fixture(); await expect(page.locator('#ammo-label')).toHaveText('箭 60');
  await fire(page, 'arrow', 'desktop-bow');
  await page.keyboard.press('x'); await page.waitForFunction(() => window.eclipseState.ranged.model === 'crossbow');
  await fire(page, 'arrow', 'desktop-crossbow');
  assert.deepEqual((await state(page)).ranged.reserves, { arrows: 59, bolts: 59 });
  await page.keyboard.press('x');
  await page.keyboard.press('i'); await page.locator('[data-item="test-quiver"]').click();
  await page.locator('[data-use-ammo="test-quiver"]').click();
  assert.equal((await state(page)).ranged.ammo, 119);
  await expect(page.locator('[data-item="test-quiver"]')).toHaveCount(0); await page.keyboard.press('Escape');
  for (const [id, kind] of [['test-javelin', 'javelin'], ['test-knife', 'knife'], ['test-axe', 'axe']]) {
    await equip(page, id, kind); await fire(page, 'throw', `desktop-${kind}`);
  }
  await page.keyboard.press('i'); await page.locator('[data-item="test-axe"]').click();
  await expect(page.locator('.item-basics')).toContainText('129 / 130');
  await page.locator('[data-action="repair"]').click();
  assert.equal((await state(page)).ranged.ammo, 130); await page.keyboard.press('Escape');
  await equip(page, 'test-bow', 'bow');

  // Walk to the existing supply service using its actual navigation route.
  for (let step = 0; step < 50; step++) {
    const s = await state(page), supply = s.objectives.find(p => p.kind === 'supply');
    if (distance(s.position, supply) < 3.3) break;
    const waypoint = supply.route[Math.min(4, supply.route.length - 1)]; assert.ok(waypoint);
    await page.mouse.click(waypoint.screen.x, waypoint.screen.y); await page.waitForTimeout(200);
  }
  await page.keyboard.press('f'); await page.locator('.panel-shop').waitFor();
  const gold = (await state(page)).gold;
  await page.locator('[data-buy-ammo="arrows"]').click();
  await page.locator('[data-buy-ammo="bolts"]').click();
  assert.deepEqual((await state(page)).ranged.reserves, { arrows: 179, bolts: 119 });
  assert.equal((await state(page)).gold, gold - 50);
  await page.screenshot({ path: `${output}/desktop-supply.png` }); await page.keyboard.press('Escape');
  assert.deepEqual((await savedProfile(page)).hero.ammo, { arrows: 179, bolts: 119 });
  await page.reload(); await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState?.inCamp && !window.eclipseState.paused);
  assert.deepEqual((await state(page)).ranged.reserves, { arrows: 179, bolts: 119 });

  await page.getByRole('button', { name: '远征传送阵', exact: true }).click();
  await page.locator('[data-enter-level="0"]').click();
  await page.waitForFunction(() => !window.eclipseState.inCamp && !window.eclipseState.paused);
  let damagedAtRange = false;
  for (let step = 0; step < 100 && !damagedAtRange; step++) {
    const s = await state(page), enemy = s.enemies.filter(e => !e.boss).sort((a, b) => distance(a, s.position) - distance(b, s.position))[0];
    assert.ok(enemy); const before = enemy.hp;
    await page.mouse.click(enemy.screen.x, enemy.screen.y); await page.waitForTimeout(150);
    const next = await state(page), after = next.enemies.find(e => e.id === enemy.id);
    if ((!after || after.hp < before) && distance(next.position, after || enemy) > 3) damagedAtRange = true;
  }
  assert.ok(damagedAtRange, 'Clicking a monster deals damage while outside melee range');
  await page.screenshot({ path: `${output}/desktop-combat.png` }); await page.close();
  console.log('Bow/crossbow/throwing flight, weapon models, equipment swaps, ammo, repair, supply, reload and ranged monster hit passed');

  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 844, height: 390 }]) {
    const mobile = await fixture(viewport, true);
    const before = await state(mobile);
    await mobile.locator('#mobile-attack').tap();
    await mobile.waitForFunction(() => window.eclipseState.ranged.ammo === 59);
    assert.ok(distance(before.position, (await state(mobile)).position) < .03);
    await canvasCheck(mobile); await mobile.screenshot({ path: `${output}/mobile-${viewport.width}.png` });
    await mobile.close();
  }
  assert.deepEqual(errors, []); console.log('Touch ranged attack, status layout, nonblank animated canvas and desktop/mobile screenshots passed');
} catch (error) {
  for (const [i, context] of browser.contexts().entries()) for (const page of context.pages()) await page.screenshot({ path: `${output}/failure-${i}.png` }).catch(() => {});
  console.log('Browser errors:', errors); throw error;
} finally { await browser.close(); }
