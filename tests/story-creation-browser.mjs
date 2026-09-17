import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.ts';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const app = await createApp({ filename: ':memory:', rateLimit: 10000, origins: [new URL(base).origin] });
await app.listen({ host: '127.0.0.1', port: 0 });
const api = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  for (const mode of ['local', 'online']) {
    const context = await browser.newContext({ viewport: { width: mode === 'local' ? 390 : 1440, height: 960 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const response = await route.fetch({ url: route.request().url().replace(new URL(base).origin, api) });
      await route.fulfill({ response });
    });
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.storyGame = game;') });
    });
    await page.goto(`${base}/?mode=${mode}`);
    if (mode === 'online') {
      await page.getByRole('button', { name: '没有账号，去注册', exact: true }).click();
      await page.locator('#online-username').fill('story_browser');
      await page.locator('#online-password').fill('story-browser-password-123');
      await page.locator('#online-confirm').fill('story-browser-password-123');
      await page.getByRole('button', { name: '注册账号', exact: true }).click();
      await expect(page.locator('#auth-notice')).toContainText('注册成功');
      await page.locator('#online-username').fill('story_browser');
      await page.locator('#online-password').fill('story-browser-password-123');
      await page.getByRole('button', { name: '登录', exact: true }).click();
    }
    const roster = () => page.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
    await roster();
    await page.getByRole('button', { name: '新建角色', exact: true }).click();
    await expect(page.locator('[name="completeStory"]')).toHaveCount(0);
    await page.getByLabel('角色名称', { exact: true }).fill('veteran');
    await page.getByRole('button', { name: '创建并进入', exact: true }).click();
    await page.waitForFunction(() => window.eclipseState?.profileName === 'veteran' && !window.eclipseState.paused);
    await page.evaluate(async () => {
      const g = window.storyGame;
      g.hero.campaign.cleared = [25, 25, 25];
      if (!await g.flushSave()) throw new Error('Fixture save failed');
      await g.returnToProfiles();
    });
    await roster();
    await page.getByRole('button', { name: '新建角色', exact: true }).click();
    const checkbox = page.getByRole('checkbox', { name: '通关剧情', exact: true });
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await expect(page.locator('.profile-class-preview')).toContainText('起始等级4');
    await page.getByLabel('角色名称', { exact: true }).fill('completed');
    await page.getByRole('button', { name: '创建并进入', exact: true }).click();
    await page.waitForFunction(() => window.eclipseState?.profileName === 'completed' && !window.eclipseState.paused);
    const check = async () => {
      const hero = await page.evaluate(() => window.storyGame.hero);
      assert.deepEqual(hero.campaign.cleared, [25, 25, 25]);
      assert.equal(hero.level, 4); assert.equal(hero.skillPoints, 18);
      assert.equal(hero.points, 30); assert.equal(hero.bonusLife, 60);
      assert.equal(hero.bonusResist, 15); assert.equal(hero.questRewards.length, 24);
      assert.equal(hero.gold, 0); assert.deepEqual(hero.runes, []);
      assert.equal(hero.cubeUnlocked, true);
    };
    await check();
    await page.evaluate(async () => { if (!await window.storyGame.flushSave()) throw new Error('Save failed'); });
    await page.reload(); await roster();
    await page.getByRole('option', { name: 'completed', exact: true }).click();
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.eclipseState?.profileName === 'completed' && !window.eclipseState.paused);
    await check();
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('Local/mobile and online/desktop story creation, rewards and reload passed');
} finally { await browser.close(); await app.close(); }
