import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
try {
  for (const mobile of [true, false]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: mobile, hasTouch: mobile });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/browser-protection-fixture', route => route.fulfill({ contentType: 'text/html', body: `
      <meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/style.css">
      <div id="app"><form><input aria-label="Name" required><button id="submit">Submit</button></form>
      <label><input type="checkbox" id="check">Check</label><button id="disabled" disabled>Disabled</button>
      <div id="dynamic"><button id="repeat">Repeat</button></div>
      <div id="scroll" style="height:200px;overflow:auto;touch-action:pan-y"><div style="height:1000px">Scrollable text</div></div>
      <textarea aria-label="Notes"></textarea></div>
      <script type="module">
      import { protectBrowserBehavior } from '/src/browser-behavior.ts';
      protectBrowserBehavior(document.getElementById('app'));
      window.count=0; window.submits=0;
      document.querySelector('form').addEventListener('submit', e => { e.preventDefault(); window.submits++; });
      document.getElementById('dynamic').addEventListener('click', () => {
        window.count++; document.getElementById('dynamic').innerHTML='<button id="repeat">Repeat</button>';
      });
      window.ready=true;
      </script>` }));
    await page.goto(`${base}/browser-protection-fixture`);
    await page.waitForFunction(() => window.ready);
    const activate = locator => mobile ? locator.tap() : locator.click();
    for (let i = 0; i < 6; i++) await activate(page.locator('#repeat'));
    assert.equal(await page.evaluate(() => window.count), 6, 'replacement buttons activate once');
    await activate(page.locator('#submit'));
    assert.equal(await page.evaluate(() => window.submits), 0, 'native required validation remains active');
    await activate(page.getByRole('textbox', { name: 'Name', exact: true }));
    await page.keyboard.type('Hero');
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Hero');
    await activate(page.locator('#submit'));
    assert.equal(await page.evaluate(() => window.submits), 1, 'native form submission works');
    await activate(page.locator('label'));
    await expect(page.locator('#check')).toBeChecked();
    assert.equal(await page.locator('#repeat').evaluate(node => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); node.dispatchEvent(event); return event.defaultPrevented;
    }), mobile, 'only touch UI suppresses context menus');
    assert.equal(await page.locator('textarea').evaluate(node => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); node.dispatchEvent(event); return event.defaultPrevented;
    }), false, 'editing context menu is retained');
    if (mobile) {
      assert.ok(await page.locator('input[required]').evaluate(node => parseFloat(getComputedStyle(node).fontSize) >= 16));
      assert.equal(await page.locator('#app').evaluate(node => {
        const event = new Event('gesturestart', { bubbles: true, cancelable: true }); node.dispatchEvent(event); return event.defaultPrevented;
      }), true, 'Safari gesture fallback cancels pinch zoom');
      const cdp = await page.context().newCDPSession(page), rect = await page.locator('#scroll').boundingBox();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + 80, y: rect.y + 170, id: 1 }] });
      for (const y of [140, 100, 60, 20]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rect.x + 80, y: rect.y + y, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => document.getElementById('scroll').scrollTop > 30);
      assert.equal(await page.evaluate(() => visualViewport.scale), 1);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: global touch protection, dynamic buttons, native validation/submission, input editing, labels, scrolling and desktop context menus');
} finally { await browser.close(); }
