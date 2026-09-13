import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';
import { AVAILABLE_RUNEWORDS, RUNE_ORDER } from '../src/items.ts';

const output = process.env.OUTPUT_DIR || '.verification/runeword-tooltip';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.recipeGame = game;') });
  });
  const hero = newHero(); hero.runes = [...RUNE_ORDER];
  await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(hero));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.evaluate(() => { const g = window.recipeGame; cancelAnimationFrame(g.frameId); g.ui.openPanel('inventory'); });
  await page.locator('[data-bag-view="runes"]').click();
  const snapshot = await page.evaluate(() => JSON.stringify(window.recipeGame.hero));
  const first = page.locator('[data-runeword]:visible').first(), tooltip = page.locator('#ui-tooltip');
  await first.hover(); await expect(tooltip).toBeVisible(); await expect(tooltip.locator('.item-affixes li').first()).toBeVisible();
  await expect(tooltip).toContainText(AVAILABLE_RUNEWORDS[0].name);
  await expect(first).toHaveAttribute('aria-describedby', 'ui-tooltip');
  await page.mouse.move(0, 0); await expect(tooltip).toBeHidden();
  await first.focus(); await page.keyboard.press('Enter'); await expect(tooltip).toBeVisible();
  await page.keyboard.press('Escape'); await expect(tooltip).toBeHidden();
  // Reopen if the existing Escape shortcut also closed the inventory panel.
  await page.evaluate(() => { const g = window.recipeGame; if (g.ui.panel !== 'inventory') g.ui.openPanel('inventory'); });
  const spiritIndex = AVAILABLE_RUNEWORDS.findIndex(word => word.name === '精神');
  await page.evaluate(index => { const g = window.recipeGame; g.ui.characterScreen.recipePage = Math.floor(index / 4); g.ui.renderPanel(); }, spiritIndex);
  const spirit = page.locator(`[data-runeword="${AVAILABLE_RUNEWORDS[spiritIndex].catalogId}"]`);
  await spirit.scrollIntoViewIfNeeded(); await page.mouse.move(0, 0);
  await page.waitForTimeout(180);
  await spirit.hover(); await expect(tooltip).toContainText('25 - 35');
  await expect(tooltip.locator('h4')).toHaveCount(2);
  await expect(tooltip).toContainText('盾牌'); await expect(tooltip).toContainText('武器');
  await page.screenshot({ path: `${output}/desktop.png` });
  await page.mouse.move(0, 0);
  await page.locator('[data-recipe-filter]').selectOption('ready'); await expect(tooltip).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-rune-pane="recipes"]').click();
  const card = page.locator('[data-runeword]:visible').first(); await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox(), cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + 24, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(tooltip).toBeVisible(); await expect(tooltip.locator('.item-affixes li').first()).toBeVisible();
  const rect = await tooltip.boundingBox(); assert.ok(rect.x >= 0 && rect.x + rect.width <= 391 && rect.y >= 0 && rect.y + rect.height <= 845);
  await page.screenshot({ path: `${output}/mobile.png` });
  await page.locator('.panel-header').click(); await expect(tooltip).toBeHidden();
  assert.equal(await page.evaluate(() => JSON.stringify(window.recipeGame.hero)), snapshot, 'inspection never changes items, runes or attributes');
  assert.deepEqual(errors, []);
  console.log('Recipe hover, attribute ranges, weapon/shield variants, keyboard, filtering, mobile touch and read-only inspection passed.');
} finally { await browser.close(); }
