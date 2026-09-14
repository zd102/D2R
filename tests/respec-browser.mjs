import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero, gainXp, allocateAttribute, learnSkill, serializeSave } from '../src/model.ts';
import { EXPERIENCE } from '../src/paladin.ts';
import { enterGame, savedProfile } from './browser-helpers.mjs';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const hero = newHero(); gainXp(hero, EXPERIENCE[9]);
    const points = hero.points, skillPoints = hero.skillPoints;
    hero.questRewards = ['0:shrine0']; hero.respecUsed = [0];
    allocateAttribute(hero, 'vitality', 5); learnSkill(hero, 'sacrifice');
    await page.addInitScript(save => {
      if (!sessionStorage.getItem('respec-fixture')) {
        localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('respec-fixture', '1');
      }
    }, serializeSave(hero));
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173'); await enterGame(page);
    await page.keyboard.press('c');
    await expect(page.getByText('可不限次数重置', { exact: true })).toBeVisible();
    await page.locator('[data-action="respec"]').click();
    await page.locator('[data-action="cancel-respec"]').click();
    assert.equal((await savedProfile(page)).hero.points, points - 5);
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-action="respec"]').click();
      await page.locator('[data-action="confirm-respec"]').click();
      const saved = (await savedProfile(page)).hero;
      assert.equal(saved.points, points); assert.equal(saved.skillPoints, skillPoints);
      assert.equal(saved.vitality, 25); assert.equal(saved.skills.sacrifice, 0);
      await expect(page.locator('[data-action="respec"]')).toBeEnabled();
      await page.locator('[data-allocate="vitality"]').first().click();
      await page.locator('.sheet-actions [data-panel="skills"]').click();
      if (viewport.width <= 700) await page.locator('button[data-skill-pane="tree"]').click();
      await page.locator('[data-select-skill="sacrifice"]').click();
      await page.locator('[data-learn="sacrifice"]').click();
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      await page.keyboard.press('c');
    }
    await page.reload(); await enterGame(page); await page.keyboard.press('c');
    await page.locator('[data-action="respec"]').click(); await page.locator('[data-action="confirm-respec"]').click();
    assert.equal((await savedProfile(page)).hero.points, points);
    assert.equal((await savedProfile(page)).hero.skillPoints, skillPoints);
    assert.deepEqual(errors, []); await page.close();
  }
  console.log('Unlimited respec: desktop/mobile, cancel, reinvestment and save reload passed.');
} finally { await browser.close(); }
