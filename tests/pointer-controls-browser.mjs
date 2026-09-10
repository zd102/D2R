import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, gainXp, learnSkill, stats, serializeSave } from '../src/model.ts';
import { SKILLS, EXPERIENCE } from '../src/paladin.ts';

const output = process.env.OUTPUT_DIR || '.verification/pointer-controls-check';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const state = page => page.evaluate(() => window.eclipseState);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
async function seed(page) {
  page.on('pageerror', error => errors.push(error.message));
  const hero = newHero(); gainXp(hero, EXPERIENCE[39]);
  for (const skill of SKILLS) assert.ok(learnSkill(hero, skill.id));
  hero.bindings = { attack: 'zeal', cleave: 'holyBolt', ward: 'holyShield', nova: 'blessedHammer', dash: 'charge', bolt: 'holyBolt' };
  hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana;
  await page.addInitScript(save => { if (!sessionStorage.getItem('pointer-fixture')) { localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('pointer-fixture', '1'); } }, serializeSave(hero));
  await page.goto(base); await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState?.inCamp && !window.eclipseState.paused);
}
function facingCursor(snapshot) {
  const dx = snapshot.controls.aim.x - snapshot.position.x, dz = snapshot.controls.aim.z - snapshot.position.z;
  assert.ok((Math.sin(snapshot.controls.facing) * dx + Math.cos(snapshot.controls.facing) * dz) / Math.hypot(dx, dz) > .995, 'hero front points toward the cursor');
}
async function stopped(page) {
  await page.waitForTimeout(120); const before = (await state(page)).position;
  await page.waitForTimeout(200); assert.ok(distance(before, (await state(page)).position) < .03, 'released navigation stays stopped');
}
async function arrived(page) {
  const destination = (await state(page)).controls.destination;
  await page.mouse.move(720, 350);
  await page.waitForFunction(() => !window.eclipseState.controls.destination, undefined, { timeout: 10000 });
  if (destination) assert.ok(distance(destination, (await state(page)).position) < .15, 'release commits the final route destination');
  await stopped(page);
}
async function nonblank(page) {
  const colors = await page.locator('#game-canvas').evaluate(canvas => {
    const copy = document.createElement('canvas'); copy.width = copy.height = 64; const ctx = copy.getContext('2d'); ctx.drawImage(canvas, 0, 0, 64, 64);
    const data = ctx.getImageData(0, 0, 64, 64).data, colors = new Set();
    for (let i = 0; i < data.length; i += 4) colors.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
    return colors.size;
  });
  assert.ok(colors > 100, `nonblank scene: ${colors} colors`);
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }); await seed(page);
  assert.deepEqual(await page.locator('.skill-group kbd').allTextContents(), ['鼠左', 'Q', 'W', 'E', 'R', '鼠右']);
  const idleFacing = (await state(page)).controls.facing;
  await page.mouse.move(930, 470); await page.waitForTimeout(100);
  assert.equal((await state(page)).controls.facing, idleFacing, 'hover does not rotate an idle hero');
  const start = await state(page); await page.mouse.down(); await page.waitForTimeout(500);
  const first = await state(page); assert.ok(distance(start.position, first.position) > .4); assert.equal(first.controls.gesture, 'move');
  await page.waitForTimeout(400); assert.ok(distance(first.controls.aim, (await state(page)).controls.aim) > .2, 'stationary pointer is reprojected with the moving camera');
  await page.mouse.move(510, 470, { steps: 8 }); await page.waitForTimeout(250);
  const turned = await state(page); assert.ok(distance(turned.controls.destination, first.controls.destination) > 3); assert.equal(turned.controls.dragging, true);
  const direction = turned.controls.destination;
  assert.ok(Math.sin(turned.controls.facing) * (direction.x - turned.position.x) + Math.cos(turned.controls.facing) * (direction.z - turned.position.z) > 0, 'drag movement faces the route');
  await page.screenshot({ path: `${output}/desktop-drag.png` }); await nonblank(page);
  await page.mouse.up(); assert.equal((await state(page)).controls.gesture, null); await arrived(page);

  await page.mouse.move(900, 490); const beforeRight = await state(page);
  await page.mouse.down({ button: 'right' }); await page.mouse.move(960, 450, { steps: 4 }); await page.waitForTimeout(450);
  const draggedRight = await state(page); assert.equal(draggedRight.controls.gesture, 'move'); assert.equal(draggedRight.projectiles, 0);
  assert.ok(draggedRight.mana >= beforeRight.mana, 'right drag does not spend mana'); assert.ok(distance(beforeRight.position, draggedRight.position) > .3);
  await page.mouse.up({ button: 'right' }); await arrived(page);
  await page.mouse.click(850, 450, { button: 'right' }); await page.waitForFunction(() => window.eclipseState.controls.projectiles.length > 0);
  assert.ok((await state(page)).mana < draggedRight.mana, 'right click casts the assigned skill once');
  await page.waitForTimeout(1000);

  await page.mouse.move(900, 460); await page.keyboard.down('Shift'); const stationary = (await state(page)).position;
  await page.mouse.down(); await page.mouse.move(550, 470, { steps: 5 }); await page.waitForTimeout(350);
  assert.equal((await state(page)).controls.gesture, 'attack'); assert.ok(distance(stationary, (await state(page)).position) < .03, 'Shift attack does not turn into drag navigation');
  await page.mouse.up(); await page.keyboard.up('Shift'); await page.waitForTimeout(900);

  await page.mouse.move(560, 460); await page.keyboard.down('ArrowRight'); await page.waitForTimeout(150); await page.keyboard.press('q');
  await page.waitForFunction(() => window.eclipseState.controls.projectiles.some(projectile => projectile.kind === 'bolt'));
  const cast = await state(page), projectile = cast.controls.projectiles.find(projectile => projectile.kind === 'bolt');
  const dx = cast.controls.aim.x - cast.position.x, dz = cast.controls.aim.z - cast.position.z;
  assert.ok((projectile.direction.x * dx + projectile.direction.z * dz) / Math.hypot(dx, dz) > .995); facingCursor(cast);
  await page.keyboard.up('ArrowRight'); await page.screenshot({ path: `${output}/desktop-cast.png` });
  await page.waitForTimeout(1000);
  await page.keyboard.down('ArrowRight'); await page.mouse.click(880, 430, { button: 'right' });
  await page.waitForFunction(() => window.eclipseState.projectiles > 0); await page.keyboard.up('ArrowRight'); await page.waitForTimeout(900);
  const noWasd = (await state(page)).position;
  for (const key of ['a', 's', 'd']) { await page.keyboard.down(key); await page.waitForTimeout(200); await page.keyboard.up(key); }
  assert.ok(distance(noWasd, (await state(page)).position) < .03, 'A/S/D no longer move the player');
  await page.keyboard.down('w'); await page.waitForFunction(() => window.eclipseState.holyShield > 0); await page.waitForTimeout(200); await page.keyboard.up('w');
  assert.ok(distance(noWasd, (await state(page)).position) < .03, 'W casts its skill without movement');
  await page.keyboard.press('t'); await expect(page.locator('[data-binding]')).toHaveCount(6);
  await page.locator('[data-binding="ward"]').selectOption('holyBolt'); await page.keyboard.press('Escape');
  await page.reload(); await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState?.inCamp && !window.eclipseState.paused);
  assert.equal((await state(page)).bindings.ward, 'holyBolt', 'the W binding survives reload');
  await page.mouse.move(900, 460); await page.keyboard.press('w'); await page.waitForFunction(() => window.eclipseState.projectiles > 0); await page.waitForTimeout(900);

  await page.mouse.move(910, 450); await page.mouse.down(); await page.waitForTimeout(250); await page.keyboard.press('i');
  await page.getByRole('dialog').waitFor(); assert.equal((await state(page)).paused, true);
  assert.equal((await state(page)).controls.gesture, null); await stopped(page); await page.mouse.up(); await page.keyboard.press('Escape'); await stopped(page);
  await page.mouse.move(920, 440); await page.mouse.down(); await page.waitForTimeout(200);
  await page.locator('#game-canvas').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', buttons: 0 });
  assert.equal((await state(page)).controls.gesture, null); await page.mouse.up(); await stopped(page);

  await page.mouse.move(910, 470); await page.mouse.down(); await page.mouse.move(950, 460); await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'left' }); assert.equal((await state(page)).controls.gesture, 'move');
  await page.mouse.up({ button: 'right' }); await arrived(page);
  const button = await page.locator('[data-panel="inventory"]').boundingBox(), beforeUI = (await state(page)).position;
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2); await page.mouse.down(); await page.mouse.move(900, 440); await page.waitForTimeout(250); await page.mouse.up();
  assert.equal((await state(page)).controls.gesture, null); assert.ok(distance(beforeUI, (await state(page)).position) < .03, 'dragging from UI never starts world navigation');
  await page.mouse.move(920, 450); await page.mouse.down(); await page.waitForTimeout(200); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await state(page)).controls.gesture, null); assert.equal((await state(page)).paused, true); await page.mouse.up(); await stopped(page);
  console.log('Mouse holds, live repathing, both buttons, aimed keys, facing, release, cancellation, UI isolation and blur passed');
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await seed(mobile);
  const beforeTouch = (await state(mobile)).position; await mobile.touchscreen.tap(300, 350); await mobile.waitForTimeout(500);
  assert.ok(distance(beforeTouch, (await state(mobile)).position) > .2); assert.equal((await state(mobile)).controls.pointerAim, false);
  assert.equal((await state(mobile)).controls.gesture, null); await mobile.locator('[data-skill="cleave"]').tap();
  await mobile.waitForFunction(() => window.eclipseState.projectiles > 0); await nonblank(mobile);
  await mobile.screenshot({ path: `${output}/mobile-touch.png` });
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 844, height: 390 }]) {
    await mobile.setViewportSize(viewport);
    const rects = await mobile.locator('.action-row .skill').evaluateAll(buttons => buttons.map(button => { const rect = button.getBoundingClientRect(); return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, textFits: button.scrollWidth <= button.clientWidth + 2 }; }));
    assert.equal(rects.length, 8);
    assert.ok(rects.every(rect => rect.x >= 0 && rect.y >= 0 && rect.right <= viewport.width && rect.bottom <= viewport.height && rect.textFits), JSON.stringify({ viewport, rects }));
    await mobile.screenshot({ path: `${output}/skill-bar-${viewport.width}.png` });
  }
  console.log('Touch movement, skill buttons and mobile canvas passed'); await mobile.close(); assert.deepEqual(errors, []);
} finally { await browser.close(); }
