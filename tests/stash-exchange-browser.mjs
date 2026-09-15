import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';
import { BASES, makeItem } from '../src/items.ts';
const enterGame = async page => {
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.stashGame?.profile && !window.stashGame.paused);
};

const output = process.env.OUTPUT_DIR || '.verification/stash-exchange-browser'; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 }, hasTouch: width < 700 });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/main.ts*', async route => { const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.stashGame = game;') }); });
    const hero = newHero(), ring = id => makeItem(BASES.find(base => base.baseCode === 'rin'), id);
    hero.inventory = [{ ...ring('bag'), width: 2, height: 3, x: 0, y: 0 }];
    hero.stash = [{ ...ring('personal'), x: 0, y: 0 }];
    await page.addInitScript(({ save, shared }) => { if (!localStorage.getItem('stash-test')) { localStorage.setItem('eclipse-ii-save-v1', save); localStorage.setItem('eclipse-ii-shared-stash-v1', JSON.stringify({ version: 1, revision: 1, checkpoints: {}, items: shared })); localStorage.setItem('stash-test', '1'); } }, { save: serializeSave(hero), shared: [{ ...ring('one'), x: 0, y: 0 }, { ...ring('two'), x: 1, y: 2 }] });
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173/?mode=local'); await enterGame(page);
    await page.evaluate(() => cancelAnimationFrame(window.stashGame.frameId));
    await page.evaluate(async () => {
      const g = window.stashGame; await g.flushSave();
      const p = g.world.sharedStash.position; g.position.set(p.x, 0, p.z); g.body.position.set(p.x, .5, p.z); g.useSharedStash();
    });
    const pane = async side => { const button = page.locator(`[data-shared-pane="${side}"]`); if (await button.isVisible()) await button.click(); };
    const wait = () => page.waitForFunction(() => !window.stashGame.ui.sharedStashScreen.busy);
    const state = () => page.evaluate(() => ({ hero: window.stashGame.hero, shared: window.stashGame.saves.readShared().items }));
    const touch = width < 700 ? await page.context().newCDPSession(page) : undefined;
    const drag = async (id, target, cell) => {
      const source = await page.locator(`[data-shared-item="${id}"]`).boundingBox(); assert.ok(source);
      const point = await page.locator(target).evaluate((el, cell) => { const r = el.getBoundingClientRect(); return cell ? { x: r.x + (cell.x + .5) * el.clientWidth / 10, y: r.y + (cell.y + .5) * el.clientHeight / Number(el.dataset.rows) } : { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, cell);
      if (touch) {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: source.x + 5, y: source.y + 5, id: 1 }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 1 }] });
      } else { await page.mouse.move(source.x + 5, source.y + 5); await page.mouse.down(); await page.mouse.move(point.x, point.y, { steps: 15 }); }
      await expect(page.locator('.item-drag-ghost')).toHaveAttribute('data-valid', 'true');
      if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await page.mouse.up();
      await wait(); await expect(page.locator('.shared-error')).toHaveCount(0);
    };
    if (width > 700) {
      await drag('bag', '[data-container="shared"]', { x: 0, y: 0 });
      let saved = await state(); assert.deepEqual(saved.hero.inventory.map(item => item.id).sort(), ['one', 'two']); assert.equal(saved.shared[0].id, 'bag');
      await drag('bag', '[data-container="inventory"]', { x: 0, y: 0 });
      assert.equal((await state()).hero.inventory[0].id, 'bag');
      await page.locator('[data-shared-view="stash"]').click();
      await drag('personal', '[data-container="shared"]', { x: 0, y: 0 });
      assert.equal((await state()).hero.stash[0].id, 'one');
      await drag('personal', '[data-container="stash"]', { x: 0, y: 0 });
      assert.equal((await state()).hero.stash[0].id, 'personal');
    } else {
      await pane('personal'); await drag('bag', '[data-shared-pane="shared"]');
      assert.ok((await state()).shared.some(item => item.id === 'bag'));
      await pane('shared'); await drag('bag', '[data-shared-pane="personal"]');
      assert.equal((await state()).hero.inventory[0].id, 'bag');
      await pane('personal'); await page.locator('[data-shared-view="stash"]').click();
    }
    await expect(page.locator('[data-container="stash"]')).toHaveAttribute('data-rows', '30');
    await page.locator('[data-shared-sort="stash"]').click(); await wait();
    await pane('shared'); await expect(page.locator('[data-container="shared"]')).toHaveAttribute('data-rows', '50');
    assert.ok(await page.locator('[data-container="shared"]').evaluate(el => el.clientWidth / 10 >= 24), 'expanded stash retains readable cells');
    await page.locator('[data-shared-sort="shared"]').click(); await wait();
    assert.ok((await state()).shared.every(item => item.y === 0));
    await page.screenshot({ path: `${output}/sorted-${width}.png` });
    await page.keyboard.press('Escape'); await page.keyboard.press('i');
    await page.locator('[data-bag-view="stash"]').click(); await page.locator('[data-action="sort-stash"]').click();
    await page.evaluate(() => window.stashGame.flushSave());
    const before = await state(); await page.reload(); await enterGame(page);
    const after = await state(); assert.deepEqual(after.hero.stash, before.hero.stash); assert.deepEqual(after.shared, before.shared);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.close(); console.log(`Shared exchange, sort and reload passed: ${width}`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
