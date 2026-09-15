import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, gainXp, learnSkill, stats, serializeSave } from '../src/model.ts';
import { SKILLS, EXPERIENCE } from '../src/paladin.ts';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
if (process.env.OUTPUT_DIR) await mkdir(process.env.OUTPUT_DIR, { recursive: true });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 }, isMobile: width < 700, hasTouch: width < 700, deviceScaleFactor: width < 700 ? 2 : 1 });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch(), body = await response.text();
      assert.ok(body.includes('const game = new Game();'));
      await route.fulfill({ response, body: body.replace('const game = new Game();', 'const game = new Game(); window.combatGame = game;') });
    });
    const hero = newHero(); gainXp(hero, EXPERIENCE[79]);
    for (const skill of SKILLS) assert.ok(learnSkill(hero, skill.id));
    hero.bindings = { attack: 'attack', cleave: 'holyBolt', ward: 'holyShield', nova: 'blessedHammer', dash: 'prayer', bolt: 'holyBolt' };
    hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana;
    await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(hero));
    const url = new URL(process.env.BASE_URL || 'http://127.0.0.1:5173'); url.searchParams.set('mode', 'local');
    await page.goto(url.href);
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.combatGame && !window.combatGame.paused);
    const result = await page.evaluate(() => {
      const g = window.combatGame; cancelAnimationFrame(g.frameId);
      g.enemies = []; g.hero.activeAura = null;
      // Isolate trajectory from random camp obstacles, while retaining real camera/rendering.
      g.world.grid.isWalkableAt = () => true;
      const paths = [];
      for (const aim of [[8, 0], [-8, 0], [0, 8], [0, -8]]) {
        g.position.set(0, 0, 11); g.updateCamera(1);
        g.combat.actionCooldowns = {}; g.combat.stagger = 0; g.hero.mana = 500;
        g.aim.copy(g.position); g.aim.x += aim[0]; g.aim.z += aim[1];
        if (!g.combat.castAction('blessedHammer', true)) throw new Error('Cast failed');
        const hammer = g.combat.projectiles.at(-1), center = hammer.origin.clone().setY(.9).project(g.camera);
        const points = [], positions = [];
        for (let i = 0; i <= 230; i++) {
          const p = hammer.mesh.position.clone().project(g.camera);
          points.push([p.x - center.x, center.y - p.y]);
          positions.push(hammer.mesh.position.toArray());
          if (i === 30) g.position.set(8, 0, 19);
          if (i < 230) g.combat.updateProjectile(hammer, .01);
        }
        paths.push({ points, positions, expired: !g.combat.updateProjectile(hammer, .01) });
      }
      return paths;
    });
    for (const path of result) {
      assert.ok(path.points[0][0] < 0 && path.points[0][1] < 0, 'launch appears upper-left');
      let angle = 0;
      for (let i = 1; i < path.points.length; i++) {
        const a = path.points[i - 1], b = path.points[i];
        const cross = a[0] * b[1] - a[1] * b[0];
        assert.ok(cross > 0, 'actual camera projects clockwise rotation');
        angle += Math.atan2(cross, a[0] * b[0] + a[1] * b[1]);
      }
      assert.ok(angle > Math.PI * 4 && angle < Math.PI * 6, 'two to three outward revolutions');
      assert.ok(path.expired, 'hammer expires at the end of its flight');
      assert.deepEqual(path.positions, result[0].positions, 'all cursor directions share a fixed trajectory after moving');
    }
    if (width < 700) {
      const cdp = await page.context().newCDPSession(page);
      for (const [fps, fcr, quality] of [[30, 48, 'low'], [60, 48, 'high'], [30, 125, 'low']]) {
        await page.evaluate(({ fcr, quality }) => {
          const g = window.combatGame; g.releaseInput(); g.combat.update(3);
          g.position.set(0, 0, 11); g.body.position.set(0, .5, 11); g.updateCamera(1);
          g.hero.bindings.attack = 'blessedHammer'; g.hero.mana = 500;
          g.hero.equipment.weapon.mods = { fcr }; g.combat.actionCooldowns = {};
          g.setQuality(quality); g.ui.update(0);
        }, { fcr, quality });
        const button = await page.locator('.attack-skill').boundingBox(); assert.ok(button);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: button.x + button.width / 2, y: button.y + button.height / 2 }] });
        const volley = await page.evaluate(fps => {
          const g = window.combatGame;
          for (let i = 0; i < fps * 3; i++) g.update(1 / fps);
          const hammers = g.combat.projectiles.filter(p => p.kind === 'hammer');
          if (hammers.length < 4) throw new Error(`Touch hold only produced ${hammers.length} hammers`);
          const [older, younger] = hammers.slice(-2);
          const gap = () => {
            const a = older.mesh.position.clone().sub(older.origin), b = younger.mesh.position.clone().sub(younger.origin);
            return Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);
          };
          const before = gap();
          for (let i = 0; i < fps / 5; i++) g.update(1 / fps);
          g.renderer.render(g.world.scene, g.camera);
          return { held: g.heldAttack, gapChange: Math.abs(Math.atan2(Math.sin(gap() - before), Math.cos(gap() - before))) };
        }, fps);
        assert.ok(volley.held, 'real touch hold continuously casts');
        assert.ok(volley.gapChange > .05, `mobile ${fps} FPS / ${fcr} FCR / ${quality}: volley must not rotate as rigid spokes`);
        if (process.env.OUTPUT_DIR) await page.screenshot({ path: `${process.env.OUTPUT_DIR}/hammer-${fps}-${fcr}-${quality}.png` });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        assert.equal(await page.evaluate(() => window.combatGame.heldAttack), false, 'touch release stops casting');
      }
      await cdp.detach();
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('Blessed Hammer browser regression passed: fixed launch, clockwise projection, independent aim/movement, lifetime, mobile touch volleys at 30/60 FPS and 48/125 FCR');
} finally { await browser.close(); }
