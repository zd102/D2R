import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero } from '../src/model.ts';
import { BASES, makeItem } from '../src/items.ts';
import { CATALOG_SPECIALS } from '../src/item-catalog-current.ts';
import { catalogSkill } from '../src/item-effects.ts';
import { PROFILE_PREFIX, LAST_PROFILE_KEY } from '../src/saves.ts';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const hero = newHero(); hero.level = 99; hero.strength = 300; hero.dexterity = 300;
    const entry = CATALOG_SPECIALS.find(entry => entry.properties.some(([code,param,,rank]) => code === 'charged' && catalogSkill(param) === 'teleport' && rank === 1));
    hero.equipment.weapon = { ...makeItem(BASES[0], 'charge-weapon'), catalogId: entry.id, mods: {} };
    const profile = { version: 2, id: 'item-skills', name: '装备技能验证', createdAt: 1, updatedAt: 1, revision: 1, hero };
    await page.addInitScript(({ profile, prefix, last }) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(prefix + profile.id, JSON.stringify(profile)); localStorage.setItem(last, profile.id); sessionStorage.setItem('seeded', 'yes'); } }, { profile, prefix: PROFILE_PREFIX, last: LAST_PROFILE_KEY });
    const url=new URL(process.env.BASE_URL || 'http://127.0.0.1:5173'); url.searchParams.set('mode','local'); await page.goto(url.href);
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.eclipseState.profileId === 'item-skills' && window.eclipseState.inCamp && !window.eclipseState.paused);
    await page.keyboard.press('t');
    if(width<700) await page.locator('button[data-skill-pane="bindings"]').click();
    const select = page.locator('[data-binding="dash"]');
    await expect(select.locator('option[value="charged:teleport:1"]')).toContainText('聚气');
    await select.selectOption('charged:teleport:1'); await expect(select).toHaveValue('charged:teleport:1');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.keyboard.press('Escape');
    // Weapon swapping must reconcile even while the old charged action is bound.
    await page.keyboard.press('x');
    await page.waitForFunction(() => window.eclipseState.bindings.dash === 'attack');
    await page.keyboard.press('t');
    if(width<700) await page.locator('button[data-skill-pane="bindings"]').click();
    await expect(select).toHaveValue('attack'); await expect(select.locator('option[value="charged:teleport:1"]')).toHaveCount(0);
    await page.keyboard.press('Escape'); await page.keyboard.press('x'); await page.keyboard.press('t');
    if(width<700) await page.locator('button[data-skill-pane="bindings"]').click();
    await expect(select.locator('option[value="charged:teleport:1"]')).toHaveCount(1);
    await expect(select).toHaveValue('charged:teleport:1');
    await page.keyboard.press('Escape'); await page.keyboard.press('x');
    await page.waitForFunction(() => window.eclipseState.weaponSet === 1);
    await page.waitForFunction(() => !window.eclipseState.saveBusy);
    await page.reload();
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.eclipseState.profileId === 'item-skills' && window.eclipseState.inCamp && !window.eclipseState.paused);
    await page.waitForFunction(() => window.eclipseState.weaponSet === 1 && window.eclipseState.bindings.dash === 'attack');
    await page.keyboard.press('x'); await page.keyboard.press('t');
    if(width<700) await page.locator('button[data-skill-pane="bindings"]').click();
    await expect(select).toHaveValue('charged:teleport:1');
    console.log(`Independent weapon layouts and inactive charge persistence passed at ${width}px`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
