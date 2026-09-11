import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, gainXp, learnSkill, stats, serializeSave } from '../src/model.ts';
import { SKILLS, EXPERIENCE } from '../src/paladin.ts';
import { BASES, makeItem, placeItems } from '../src/items.ts';
import { enterGame, savedProfile } from './browser-helpers.mjs';

const output = process.env.OUTPUT_DIR || '.verification';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const hero = newHero(); gainXp(hero, EXPERIENCE[39]);
for (const skill of SKILLS) assert.equal(learnSkill(hero, skill.id), true, skill.id);
hero.gold = 1500; hero.strength = 65; hero.dexterity = 80; hero.vitality = 100;
hero.bindings = { ...hero.bindings, attack: 'zeal', cleave: 'blessedHammer', nova: 'holyShield', dash: 'charge', bolt: 'holyBolt' };
hero.equipment.armor = makeItem(BASES.find(item => item.name === '皮甲'), 'test-armor');
hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana;
const sword = makeItem(BASES.find(item => item.name === '水晶剑'), 'spirit-base'); sword.sockets = 4;
const ring = makeItem(BASES.find(item => item.name === '戒指'), 'test-ring'); ring.rarity = 'rare'; ring.mods = { fcr: 10, allRes: 12 }; ring.identified = false;
hero.inventory = [sword, ring]; placeItems(hero.inventory); hero.runes = ['tal', 'thul', 'ort', 'amn'];
const errors = [];
const state = page => page.evaluate(() => window.eclipseState);
async function seed(page) {
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(save => { if (!sessionStorage.getItem('paladin-fixture')) { localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('paladin-fixture', '1'); } }, serializeSave(hero));
  await page.goto(base); await enterGame(page);
}
async function pixels(page) {
  return page.evaluate(() => {
    const sample = document.createElement('canvas'); sample.width = 100; sample.height = 100; const ctx = sample.getContext('2d'); ctx.drawImage(document.getElementById('game-canvas'), 0, 0, 100, 100);
    const data = ctx.getImageData(0, 0, 100, 100).data; let lit = 0; const colors = new Set();
    for (let i = 0; i < data.length; i += 4) { if (data[i] + data[i + 1] + data[i + 2] > 90) lit++; colors.add(`${data[i] >> 3},${data[i+1] >> 3},${data[i+2] >> 3}`); } return { lit, colors: colors.size };
  });
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); await seed(page);
  const sample = await pixels(page); assert.ok(sample.lit > 2000 && sample.colors > 100, JSON.stringify(sample));
  await page.keyboard.press('c'); await page.getByRole('dialog', { name: '圣骑士', exact: true }).waitFor();
  const beforePoints = (await state(page)).points; await page.getByRole('button', { name: '提升敏捷', exact: true }).click(); assert.equal((await state(page)).points, beforePoints - 1);
  await page.screenshot({ path: `${output}/paladin-character-desktop.png` });
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await page.keyboard.press('t');
  assert.equal(await page.locator('.skill-node').count(), 10);
  await page.locator('[data-select-skill="blessedHammer"]').click();
  const beforeSkills = (await state(page)).skillPoints; await page.locator('[data-learn="blessedHammer"]').click(); assert.equal((await state(page)).skillPoints, beforeSkills - 1);
  await page.screenshot({ path: `${output}/paladin-skills-desktop.png` });
  await page.locator('[data-tree="offensive"]').click(); await page.locator('[data-select-skill="concentration"]').click(); await page.locator('[data-activate-aura="concentration"]').click(); assert.equal((await state(page)).activeAura, 'concentration');
  await page.locator('[data-select-skill="fanaticism"]').click(); await page.locator('[data-activate-aura="fanaticism"]').click(); assert.equal((await state(page)).activeAura, 'fanaticism');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const mana = (await state(page)).mana; await page.keyboard.press('q'); await page.waitForFunction(() => window.eclipseState.projectiles > 0); assert.ok((await state(page)).mana < mana);
  await page.screenshot({ path: `${output}/paladin-hammer-desktop.png` });
  await page.waitForTimeout(650); await page.keyboard.press('e'); await page.waitForFunction(() => window.eclipseState.holyShield > 0);
  await page.keyboard.press('i'); assert.equal(await page.locator('.gear-slot').count(), 10);
  await page.locator('[data-item="test-ring"]').click(); await page.locator('[data-identify="test-ring"]').click(); await page.locator('[data-equip="test-ring"]').click();
  assert.equal((await savedProfile(page)).hero.equipment.ring.id, 'test-ring');
  await page.locator('[data-item="spirit-base"]').click(); await page.locator('.socket-editor summary').click(); for (const rune of ['tal','thul','ort','amn']) await page.locator(`[data-socket="${rune}"]`).click();
  assert.equal((await savedProfile(page)).hero.inventory.find(item => item.id === 'spirit-base').name, '精神');
  await page.screenshot({ path: `${output}/paladin-inventory-desktop.png` });
  await page.locator('[data-equip="spirit-base"]').click(); assert.equal((await savedProfile(page)).hero.equipment.weapon.name, '精神');
  await page.locator('[data-action="swap-weapons"]').click(); assert.equal((await savedProfile(page)).hero.alternate.weapon.name, '精神'); await page.locator('[data-action="swap-weapons"]').click();
  await page.locator('[data-item="starter-sword"]').click(); await page.locator('[data-stash="starter-sword"]').click(); await page.locator('[data-bag-view="stash"]').click(); await page.locator('[data-item="starter-sword"]').click(); await page.locator('[data-withdraw="starter-sword"]').click();
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await page.reload(); await enterGame(page);
  assert.equal((await state(page)).activeAura, 'fanaticism'); assert.equal((await state(page)).skills.blessedHammer, 2); assert.equal((await savedProfile(page)).hero.equipment.weapon.name, '精神');
  console.log('Paladin desktop: attributes, skill learning, auras, hammer, shield, identify, equip, runeword, stash, swap, reload', sample);
  await page.close();
  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 844, height: 390 }]) {
    const mobile = await browser.newPage({ viewport, isMobile: true, hasTouch: true }); await seed(mobile);
    const sample = await pixels(mobile); assert.ok(sample.lit > 1400 && sample.colors > 80, JSON.stringify(sample));
    await mobile.screenshot({ path: `${output}/paladin-game-${viewport.width}.png` });
    const initial = await mobile.locator('#game-canvas').evaluate(canvas => canvas.toDataURL()); await mobile.waitForTimeout(300); assert.notEqual(await mobile.locator('#game-canvas').evaluate(canvas => canvas.toDataURL()), initial);
    for (const panel of ['character', 'skills', 'inventory']) {
      await mobile.locator(`.bottom-nav [data-panel="${panel}"]`).tap();
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const fit = await mobile.locator('.panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1); assert.ok(fit, `${panel} overflow at ${viewport.width}`);
      await mobile.screenshot({ path: `${output}/paladin-${panel}-${viewport.width}.png` });
      await mobile.getByRole('button', { name: '关闭', exact: true }).tap();
    }
    await mobile.locator('[data-skill="nova"]').tap(); await mobile.waitForFunction(() => window.eclipseState.holyShield > 0);
    await mobile.close(); console.log('Paladin viewport passed', viewport, sample);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
