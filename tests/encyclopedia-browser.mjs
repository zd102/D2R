import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { ENCYCLOPEDIA_ITEMS, ENCYCLOPEDIA_MONSTERS } from '../src/encyclopedia.ts';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const output = '.verification/encyclopedia-check';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
const storage = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
async function modelPixels(page) {
  return page.locator('.encyclopedia-model').evaluate(canvas => {
    const copy = document.createElement('canvas'); copy.width = copy.height = 100; const ctx = copy.getContext('2d');
    ctx.drawImage(canvas, 0, 0, 100, 100); const data = ctx.getImageData(0, 0, 100, 100).data;
    let colored = 0, edge = 0; const colors = new Set();
    for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
      const i = (y * 100 + x) * 4; if (data[i + 3] < 20) continue;
      colored++; colors.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
      if (x < 2 || y < 2 || x > 97 || y > 97) edge++;
    }
    return { colored, edge, colors: colors.size, image: canvas.toDataURL() };
  });
}
async function fits(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const rect = await page.getByRole('dialog', { name: '百科', exact: true }).boundingBox(), viewport = page.viewportSize();
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width + 1 && rect.y + rect.height <= viewport.height + 1);
  const overflowing = await page.locator('.encyclopedia-entry,.encyclopedia-tabs,.encyclopedia-filters,.encyclopedia-detail h3,.encyclopedia-stats>div,.encyclopedia-related').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length && node.scrollWidth > node.clientWidth + 2).map(node => node.textContent));
  assert.deepEqual(overflowing, []);
}
try {
  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }, { width: 360, height: 640 }, { width: 844, height: 390 }].filter(viewport => !process.env.VERIFY_WIDTH || viewport.width === Number(process.env.VERIFY_WIDTH))) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width < 900 }); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base); await page.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
    const before = await storage(page);
    await page.getByRole('button', { name: '打开百科', exact: true }).click();
    await expect(page.locator('#encyclopedia-count')).toHaveText(`${ENCYCLOPEDIA_ITEMS.length.toLocaleString()} 条记录`);
    await fits(page);
    const query = page.getByRole('searchbox', { name: '搜索装备或物品' });
    await query.fill('乔丹'); await expect(page.locator('.encyclopedia-entry')).toHaveCount(1);
    await page.locator('.encyclopedia-entry').click();
    await expect(page.locator('.encyclopedia-detail h3')).toHaveText('乔丹之石');
    await expect(page.locator('.encyclopedia-detail')).toContainText('+1 所有技能');
    await page.locator('[data-encyclopedia-difficulty="1"]').click();
    await expect(page.locator('[data-encyclopedia-link="andariel"]')).toBeVisible();
    await page.screenshot({ path: `${output}/item-${viewport.width}.png` });
    await page.locator('[data-encyclopedia-link="andariel"]').click();
    await expect(page.locator('.encyclopedia-detail h3')).toHaveText('安达利尔');
    await expect(page.locator('.encyclopedia-stats').first()).toContainText('14,000');
    await page.waitForTimeout(200);
    const model = await modelPixels(page); assert.ok(model.colored > 80 && model.colors > 12 && model.edge === 0, JSON.stringify({ ...model, image: undefined }));
    await page.waitForTimeout(500); assert.ok((await modelPixels(page)).image !== model.image, 'idle animation changes the model pixels');
    await page.getByRole('button', { name: '暂停预览动画', exact: true }).click();
    const frozen = await modelPixels(page); await page.waitForTimeout(150); assert.ok((await modelPixels(page)).image === frozen.image, 'pause freezes the model');
    const canvas = page.locator('.encyclopedia-model'); await canvas.scrollIntoViewIfNeeded(); const bounds = await canvas.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height / 2, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300);
    assert.ok((await modelPixels(page)).image !== frozen.image, 'drag rotates the model');
    await page.getByRole('button', { name: '重置视角', exact: true }).click();
    await fits(page); await page.screenshot({ path: `${output}/monster-${viewport.width}.png` });
    await page.getByRole('button', { name: '返回上一条目', exact: true }).click();
    await expect(page.locator('.encyclopedia-detail h3')).toHaveText('乔丹之石');
    if (viewport.width <= 700) await page.getByRole('button', { name: '返回列表', exact: true }).click();
    await page.getByRole('searchbox').fill('this-item-does-not-exist');
    await expect(page.locator('.encyclopedia-results')).toContainText('没有匹配的条目');
    await page.getByRole('button', { name: '重置筛选', exact: true }).first().click();
    await page.getByRole('button', { name: '下一页', exact: true }).click(); await expect(page.locator('.encyclopedia-pagination>span')).toContainText('2 /');
    await page.getByRole('combobox', { name: '排序', exact: true }).selectOption('level');
    await expect(page.locator('.encyclopedia-entry[aria-current="true"]')).toHaveCount(1);
    await page.locator('.encyclopedia-entry').first().focus(); await page.keyboard.press('ArrowDown');
    await expect(page.locator('.encyclopedia-entry').nth(1)).toHaveAttribute('aria-current', 'true');
    await page.getByRole('searchbox').fill('精神'); await page.getByRole('combobox', { name: '物品分类', exact: true }).selectOption('runeword');
    await page.locator('.encyclopedia-entry').click();
    await page.getByRole('combobox', { name: '符文之语底材', exact: true }).selectOption('统治者大盾');
    await expect(page.locator('.encyclopedia-mods')).toContainText('+35 冰冷抗性');
    await page.locator('.encyclopedia-recipe [data-encyclopedia-link="rune-tal"]').click();
    await expect(page.locator('.encyclopedia-detail h3')).toHaveText('塔尔符文');
    await page.getByRole('button', { name: '返回上一条目', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '符文之语底材', exact: true })).toHaveValue('统治者大盾');
    await page.getByRole('tab', { name: /^怪物/ }).click();
    await page.getByRole('combobox', { name: '怪物类型' }).selectOption('actBoss');
    await expect(page.locator('.encyclopedia-entry')).toHaveCount(5);
    await page.getByRole('combobox', { name: '出现章节' }).selectOption('4');
    await expect(page.locator('.encyclopedia-entry')).toHaveCount(1); await page.locator('.encyclopedia-entry').click();
    await page.locator('[data-encyclopedia-difficulty="2"]').click();
    await expect(page.locator('.encyclopedia-detail')).toContainText('185,000');
    await expect(page.locator('[data-encyclopedia-link="unique-401"]')).toBeVisible();
    await fits(page);
    await page.keyboard.press('Escape'); await page.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
    await expect(page.locator('.encyclopedia-model')).toHaveCount(0);
    assert.deepEqual(await storage(page), before); assert.equal(await page.evaluate(() => window.eclipseState.profileId), null);
    await page.getByRole('button', { name: '新建角色', exact: true }).click();
    await page.getByRole('textbox', { name: '角色名称', exact: true }).fill('百科验证'); await page.getByRole('button', { name: '创建并进入', exact: true }).click();
    await page.waitForFunction(() => window.eclipseState.profileName === '百科验证' && window.eclipseState.inCamp && !window.eclipseState.paused);
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: '保存并切换角色', exact: true }).click();
    await page.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
    const saved = await storage(page); await page.getByRole('button', { name: '打开百科' }).click();
    await page.getByRole('button', { name: '返回角色选择', exact: true }).click();
    assert.deepEqual(await storage(page), saved);
    await expect(page.getByRole('option', { name: '百科验证', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.close(); console.log(`Encyclopedia navigation, filters, item links, live models and read-only saves passed: ${viewport.width}x${viewport.height}`);
  }
  // Exercise every existing actor in the actual viewer, including both wide and tall body plans.
  if (!process.env.VERIFY_WIDTH) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base); await page.getByRole('button', { name: '打开百科' }).click(); await page.getByRole('tab', { name: /^怪物/ }).click();
    for (const entry of ENCYCLOPEDIA_MONSTERS) {
      await page.getByRole('searchbox').fill(entry.id); await page.locator(`[data-encyclopedia-entry="${entry.id}"]`).click();
      await page.waitForTimeout(50); const pixels = await modelPixels(page);
      assert.ok(pixels.colored > 60 && pixels.colors > 10 && pixels.edge === 0, `${entry.name}: ${pixels.colored}/${pixels.colors}/${pixels.edge}`);
    }
    await page.close(); console.log('All 62 monster previews render and fit');
  }
  const unavailable = await browser.newPage(); unavailable.on('pageerror', error => errors.push(error.message));
  await unavailable.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Unavailable', 'QuotaExceededError'); }; });
  await unavailable.goto(base); await unavailable.getByRole('button', { name: '打开百科' }).click();
  await unavailable.getByRole('searchbox').fill('乔丹'); await expect(unavailable.locator('.encyclopedia-entry')).toHaveCount(1);
  await unavailable.getByRole('button', { name: '返回角色选择', exact: true }).click(); await unavailable.close();
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
