import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { createApp } from '../server/app.ts';

const output = process.env.OUTPUT_DIR || '.verification/online-compat';
await mkdir(output, { recursive: true });
const app = await createApp({ filename: `${output}/online.sqlite`, rateLimit: 10000 });
// Reproduce a still-running older API returning heroes without newly added fields.
app.addHook('onSend', async (request, reply, payload) => {
  if (!request.url.startsWith('/api/v1/') || reply.statusCode >= 400 || typeof payload !== 'string') return payload;
  const removeNewFields = value => {
    if (!value || typeof value !== 'object') return;
    if (value.hero) {
      delete value.hero.potionTimers; delete value.hero.potionBindings; delete value.hero.potionRecovery;
    }
    for (const child of Object.values(value)) removeNewFields(child);
  };
  const data = JSON.parse(payload); removeNewFields(data); return JSON.stringify(data);
});
await app.listen({ host: '127.0.0.1', port: 0 });
const reservation = createHttpServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const vite = await createServer({ configFile: false, cacheDir: `${output}/vite-cache`, server: { host: '127.0.0.1', port, strictPort: true, watch: { ignored: ['**/.verification/**'] }, proxy: { '/api': { target: `http://127.0.0.1:${app.server.address().port}`, changeOrigin: false } } } });
await vite.listen();
const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
const errors = [];
try {
  for (const [name, engine] of [['webkit', webkit], ['chromium', chromium]]) {
    const browser = await engine.launch({ headless: true, ...(name === 'chromium' ? { channel: 'msedge' } : {}) });
    try {
      const page = await browser.newPage({ viewport: { width: 393, height: 695 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      page.on('pageerror', error => errors.push(`${name}: ${error.stack}`));
      await page.addInitScript(() => {
        Object.defineProperty(window.visualViewport, 'height', { get: () => window.testViewportHeight ?? innerHeight });
      });
      await page.route('**/src/main.ts*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.compatGame = game;') });
      });
      await page.goto(base + '/?mode=online');
      await page.getByRole('button', { name: '没有账号，去注册', exact: true }).click();
      await page.evaluate(() => { window.testViewportHeight = 423; visualViewport.dispatchEvent(new Event('resize')); });
      const layout = await page.locator('.mode-page').evaluate(node => ({ height: node.clientHeight, scroll: node.scrollHeight, top: node.firstElementChild.getBoundingClientRect().top, touch: getComputedStyle(document.body).touchAction }));
      assert.ok(layout.height <= 423 && layout.scroll > layout.height && layout.top >= 0 && layout.touch === 'pan-y', `scrollable keyboard viewport: ${JSON.stringify(layout)}`);
      if (name === 'chromium') {
        const touch = await page.context().newCDPSession(page);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 370, y: 350, id: 1 }] });
        for (const y of [300, 240, 180, 100]) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 370, y, id: 1 }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await touch.detach();
      } else {
        // Mobile WebKit automation has no wheel/swipe API; check its native scroll range.
        await page.locator('.mode-page').evaluate(node => node.scrollBy(0, 450));
      }
      await page.waitForFunction(() => document.querySelector('.mode-page').scrollTop > 100);
      await page.screenshot({ path: `${output}/${name}-login-keyboard.png`, scale: 'css' });
      const user = `compat_${randomUUID().slice(0, 8)}`, password = randomUUID();
      await page.locator('#online-username').fill(user); await page.locator('#online-password').fill(password); await page.locator('#online-confirm').fill(password);
      await page.getByRole('button', { name: '注册账号', exact: true }).click();
      await expect(page.locator('#auth-notice')).toContainText('注册成功');
      await page.locator('#online-username').fill(user); await page.locator('#online-password').fill(password);
      await page.evaluate(() => { window.testViewportHeight = undefined; visualViewport.dispatchEvent(new Event('resize')); });
      await page.getByRole('button', { name: '登录', exact: true }).click();
      await page.getByRole('button', { name: '新建角色', exact: true }).click();
      await page.getByLabel('角色名称', { exact: true }).fill('旧接口兼容');
      await page.getByRole('button', { name: '创建并进入', exact: true }).click();
      await page.waitForFunction(() => window.compatGame?.profile && !window.compatGame.paused);
      const identity = await page.evaluate(() => {
        const g = window.compatGame;
        return { id: g.profile.id, item: g.hero.equipment.weapon.id, timers: g.hero.potionTimers, bindings: g.hero.potionBindings, recovery: g.hero.potionRecovery, touch: getComputedStyle(document.body).touchAction, viewport: document.getElementById('app').style.getPropertyValue('--mode-viewport-height') };
      });
      assert.deepEqual(identity.timers, [0, 0, 0]); assert.equal(identity.bindings.length, 4); assert.deepEqual(identity.recovery, []);
      assert.equal(identity.touch, 'none'); assert.equal(identity.viewport, '');
      const frame = await page.evaluate(() => window.compatGame.frameId);
      await page.waitForFunction(frame => window.compatGame.frameId > frame + 3, frame);
      const joystick = await page.locator('#joystick').boundingBox();
      const start = await page.evaluate(() => ({ x: window.compatGame.position.x, z: window.compatGame.position.z }));
      await page.mouse.move(joystick.x + joystick.width * .8, joystick.y + joystick.height / 2); await page.mouse.down();
      await page.waitForFunction(start => Math.hypot(compatGame.position.x - start.x, compatGame.position.z - start.z) > .3, start);
      await page.mouse.up();
      await page.evaluate(() => { const g = window.compatGame; g.hero.skills.holyBolt = 1; g.hero.bindings.cleave = 'holyBolt'; g.hero.mana = 15; g.ui.update(0); });
      await page.locator('.cleave-skill').tap();
      await page.waitForFunction(() => window.compatGame.hero.mana < 15);
      await page.screenshot({ path: `${output}/${name}-camp.png`, scale: 'css' });
      for (const panel of ['character', 'inventory', 'skills', 'map', 'quest', 'mercenary', 'pause']) {
        await page.locator(`${panel === 'pause' ? '.top-tools' : '.bottom-nav'} [data-panel="${panel}"]`).tap();
        await expect(page.locator('#overlay .panel')).toBeVisible();
        await expect(page.locator('.panel-body')).not.toBeEmpty();
        await page.locator('.panel-close').tap();
      }
      await page.evaluate(async () => { const g = window.compatGame; g.hero.gold = 1234; if (!await g.flushSave()) throw new Error('save failed'); g.returnToProfiles(); });
      await page.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
      await page.getByRole('button', { name: '进入旅程', exact: true }).click();
      await page.waitForFunction(() => window.compatGame.profile && !window.compatGame.paused);
      assert.deepEqual(await page.evaluate(() => ({ id: compatGame.profile.id, item: compatGame.hero.equipment.weapon.id, gold: compatGame.hero.gold, timers: compatGame.hero.potionTimers })), { id: identity.id, item: identity.item, gold: 1234, timers: [0, 0, 0] });
      await page.evaluate(async () => {
        const g = window.compatGame, { CAMP } = await import('/src/camp.ts');
        g.position.set(CAMP.stash.x, 0, CAMP.stash.z); g.ui.openPanel('shared-stash');
        await g.ui.sharedStashScreen.transfer({ direction: 'unequip', slot: 'weapon' });
        if (g.hero.equipment.weapon || !g.hero.potionTimers || !g.hero.potionRecovery) throw new Error('incomplete stash response');
      });
      await expect(page.locator('.panel-shared-stash')).toBeVisible();
      await page.setViewportSize({ width: 852, height: 393 });
      await page.screenshot({ path: `${output}/${name}-stash-landscape.png`, scale: 'css' });
      assert.deepEqual(errors, []);
      console.log(`PASS ${name}: keyboard-height login scroll; older API profiles create, enter, move, cast, open seven panels, save, reload and transfer items without losing progress.`);
    } finally { await browser.close(); }
  }
} finally { await vite.close(); await app.close(); }
