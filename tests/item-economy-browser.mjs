import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';
import { BASES, makeItem, placeItems } from '../src/items.ts';
import { enterGame, savedProfile } from './browser-helpers.mjs';

await mkdir('.verification', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173', errors = [];
const hero = newHero(); hero.gold = 160; hero.identifyScrolls = 0;
const amulet = makeItem(BASES.find(base => base.slot === 'amulet'), 'necklace');
hero.inventory = [{ ...amulet, id: 'charm', name: '生命护身符', charm: true, width: 1, height: 1, identified: false, rarity: 'magic', mods: { life: 10 } }, amulet]; placeItems(hero.inventory);
hero.stash = [{ ...amulet, id: 'stash-charm', name: '仓库护身符', charm: true, identified: false, rarity: 'magic', value: 120 }, { ...amulet, id: 'stash-necklace', identified: false, rarity: 'rare' }]; placeItems(hero.stash);
async function seed(page, fixture) {
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(save => { if (!sessionStorage.getItem('economy-fixture')) { localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('economy-fixture', '1'); } }, serializeSave(fixture));
  await page.goto(base); await enterGame(page); await page.locator('.bottom-nav [data-panel="inventory"]').click();
}
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const mobile = viewport.width < 700, page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile }); await seed(page, hero);
    const click = locator => mobile ? locator.tap() : locator.click();
    await expect(page.locator('[data-item="charm"] .lucide-scroll-text')).toHaveCount(1); await expect(page.locator('[data-item="necklace"] .lucide-gem')).toHaveCount(1);
    await click(page.locator('[data-item="charm"]')); await expect(page.locator('.item-showcase .lucide-scroll-text')).toHaveCount(1);
    await expect(page.locator('[data-identify="charm"]')).toHaveText('鉴定 · 80 金币'); await click(page.locator('[data-identify="charm"]'));
    assert.equal((await savedProfile(page)).hero.gold, 80); assert.equal((await savedProfile(page)).hero.identifyScrolls, 0);
    await click(page.locator('[data-item="necklace"]')); await expect(page.locator('.item-showcase .lucide-gem')).toHaveCount(1);
    await click(page.locator('[data-bag-view="stash"]'));
    await expect(page.locator('[data-item="stash-charm"] .lucide-scroll-text')).toHaveCount(1); await expect(page.locator('[data-item="stash-necklace"] .lucide-gem')).toHaveCount(1);
    await click(page.locator('[data-item="stash-charm"]')); await click(page.locator('[data-identify="stash-charm"]'));
    assert.equal((await savedProfile(page)).hero.gold, 0);
    await click(page.locator('[data-item="stash-necklace"]')); await expect(page.locator('[data-identify="stash-necklace"]')).toBeDisabled();
    await click(page.locator('[data-item="stash-charm"]')); await click(page.locator('[data-salvage="stash-charm"]'));
    let profile = await savedProfile(page); assert.equal(profile.hero.gold, 120); assert.equal(profile.hero.stash.some(item => item.id === 'stash-charm'), false); assert.equal(profile.hero.inventory.length, 2);
    await click(page.locator('[data-item="stash-necklace"]')); await expect(page.locator('[data-identify="stash-necklace"]')).toBeEnabled();
    await click(page.locator('[data-identify="stash-necklace"]')); assert.equal((await savedProfile(page)).hero.gold, 40);
    assert.equal(await page.locator('[data-action="buy-scroll"]').count(), 0); assert.equal(await page.getByText(/鉴定卷轴/).count(), 0);
    await page.screenshot({ path: `.verification/item-economy-${viewport.width}.png` });
    await page.reload(); await enterGame(page); profile = await savedProfile(page); assert.equal(profile.hero.gold, 40); assert.equal(profile.hero.stash[0].identified, true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.close();
    console.log('Gold identification, stash selling, distinct icons and persistence:', viewport);
  }
  const full = newHero(); full.inventory = Array.from({ length: 40 }, (_, i) => ({ ...amulet, id: `full-${i}`, width: 1, height: 1 })); placeItems(full.inventory); full.stash = [{ ...amulet, id: 'sell-full', value: 300 }];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); await seed(page, full);
  await page.locator('[data-bag-view="stash"]').click(); await page.locator('[data-item="sell-full"]').click(); await page.locator('[data-salvage="sell-full"]').click();
  assert.equal((await savedProfile(page)).hero.gold, 300); assert.equal((await savedProfile(page)).hero.inventory.length, 40); assert.equal((await savedProfile(page)).hero.stash.length, 0);
  await page.close(); assert.deepEqual(errors, []);
} finally { await browser.close(); }
