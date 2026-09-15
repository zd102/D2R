import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero, gainXp, learnSkill, stats, serializeSave } from '../src/model.ts';
import { SKILLS, EXPERIENCE } from '../src/paladin.ts';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
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
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173?mode=local');
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
  assert.deepEqual(errors, []);
  console.log('Blessed Hammer browser regression passed: fixed launch, clockwise projection, independent aim/movement, lifetime');
} finally { await browser.close(); }
