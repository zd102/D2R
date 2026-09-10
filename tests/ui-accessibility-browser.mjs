import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const output = process.env.OUTPUT_DIR || '.verification/ui-accessibility';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 360, height: 740 }, { width: 844, height: 390 }]) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.accessibilityGame = game;') });
    });
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
    await page.getByRole('button', { name: '新建角色', exact: true }).click();
    await expect(page.locator('#profile-name')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('input[value=paladin]')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('input[value=amazon]')).toBeChecked();
    await expect(page.locator('.profile-class-preview')).toContainText('初始生命50');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('input[value=sorceress]')).toBeChecked();
    await expect(page.locator('.profile-class-preview')).toContainText('初始法力35');
    await page.keyboard.press('Tab');
    await expect(page.locator('#profile-name')).toBeFocused();
    await page.locator('#profile-name').fill('长夜旅者');
    await page.screenshot({ path: `${output}/keyboard-create-${viewport.width}.png` });
    await page.getByRole('button', { name: '创建并进入', exact: true }).click();
    await page.waitForFunction(() => window.accessibilityGame?.profile && !window.accessibilityGame.paused);
    await expect(page.locator('#game-canvas')).toBeFocused();
    assert.equal(await page.evaluate(() => window.accessibilityGame.hero.classId), 'sorceress');
    await page.evaluate(() => {
      const game = window.accessibilityGame;
      cancelAnimationFrame(game.frameId);
      game.hero.points = 2;
    });

    const characterButton = page.locator('.bottom-nav [data-panel=character]');
    await characterButton.click();
    const strength = await page.evaluate(() => window.accessibilityGame.hero.strength);
    const allocate = page.locator('[data-allocate=strength]:not([data-count])');
    await allocate.focus();
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => window.accessibilityGame.hero.strength), strength + 1);
    await expect(allocate).toBeFocused();
    await page.keyboard.press('Space');
    await expect(allocate).toBeDisabled();
    assert.equal(await page.evaluate(() => window.accessibilityGame.hero.strength), strength + 2);
    assert.ok(await page.evaluate(() => document.getElementById('overlay').contains(document.activeElement)), 'focus survives disabling the active action');
    await page.keyboard.press('Escape');
    await expect(characterButton).toBeFocused();

    await page.keyboard.press('i');
    await page.locator('[data-bag-view=inventory]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-bag-view=stash]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-bag-view=stash]')).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.locator('[data-bag-view=runes]')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(page.locator('[data-bag-view=inventory]')).toBeFocused();
    await page.keyboard.press('Escape');

    await page.keyboard.press('Escape');
    const guide = page.locator('.control-guide summary');
    await guide.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.control-guide')).toHaveAttribute('open', '');
    await page.keyboard.press('Tab');
    await expect(page.locator('#movement-mode')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(guide).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.locator('.control-guide')).not.toHaveAttribute('open', '');
    await page.locator('.fullscreen-setting').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('.panel-close')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('.fullscreen-setting')).toBeFocused();
    await page.locator('#volume').focus();
    await page.keyboard.press('End');
    await expect(page.locator('#volume-value')).toHaveText('100%');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await expect(page.locator('.panel-map')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('#overlay')).toBeHidden();
    const motion = await page.locator('.health .orb-fill').evaluate(el => getComputedStyle(el, '::before').animationDuration);
    assert.ok(parseFloat(motion) < .001, 'reduced motion stops the continuous orb animation');

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '保存并切换角色', exact: true }).click();
    await page.getByRole('button', { name: '删除角色', exact: true }).click();
    await expect(page.getByRole('button', { name: '保留角色', exact: true })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByRole('dialog', { name: '选择角色', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: '长夜旅者', exact: true })).toBeVisible();
    // The import screen contains a hidden file input; it must never receive tab focus.
    await page.evaluate(() => window.accessibilityGame.ui.openPanel('import-profile'));
    await page.locator('[data-profile-action=back]').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-profile-action=choose-file]')).toBeFocused();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `${output}/keyboard-roster-${viewport.width}.png` });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: keyboard class selection, live class stats, native Space activation, focus after repaint, tab navigation, disclosure access, modal focus loop, focus return, safe deletion default and reduced motion at desktop/mobile/landscape sizes');
} finally {
  await browser.close();
}
