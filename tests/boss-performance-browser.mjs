import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero, serializeSave } from '../src/model.ts';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.bossGame = game;') });
  });
  await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(newHero()));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.evaluate(() => cancelAnimationFrame(window.bossGame.frameId));
  for (const area of [0, 4, 24, 'cow', 'uberDiablo']) {
    const result = await page.evaluate(area => {
      const g = window.bossGame;
      g.hero.campaign.current = typeof area === 'number' ? area : 0;
      g.hero.campaign.cleared = [g.hero.campaign.current, 0, 0];
      g.hero.campaign.kills = 999; g.hero.campaign.objects = Array.from({ length: 20 }, (_, i) => i);
      g.hero.bossDefeated = false; g.specialArea = typeof area === 'string' ? area : undefined;
      g.loadArea(false);
      const boss = g.enemies.find(e => e.boss);
      g.position.copy(boss.actor.group.position); g.updateCamera(1);
      const render = () => g.renderer.render(g.world.scene, g.camera);
      render(); render();
      const lights = () => { let count = 0; g.world.scene.traverseVisible(o => { if (o.isPointLight) count++; }); return count; };
      const before = lights();
      const inactiveIntensity = g.world.exitLight.intensity;
      const materials = new Set();
      g.world.scene.traverseVisible(o => { for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) if (m.isMeshStandardMaterial) materials.add(m); });
      // Portal stone shares materials with batched scenery, but its newly visible
      // ordinary meshes legitimately need a different geometry shader variant.
      g.world.exit.traverse(o => { for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) materials.delete(m); });
      const programs = () => [...materials].reduce((sum, m) => sum + (g.renderer.properties.get(m).programs?.size || 0), 0);
      const beforePrograms = programs();
      const start = performance.now(); g.killEnemy(boss); const killMs = performance.now() - start;
      const renderStart = performance.now(); render(); const renderMs = performance.now() - renderStart;
      const afterPrograms = programs();
      const kills = g.hero.kills, drops = g.loot.length;
      g.killEnemy(boss);
      return { area, before, after: lights(), beforePrograms, afterPrograms, killMs, renderMs,
        inactiveIntensity, activeIntensity: g.world.exitLight.intensity,
        dead: boss.dead, cleared: g.hero.bossDefeated, portal: g.world.exit.visible, drops,
        duplicateSafe: kills === g.hero.kills && drops === g.loot.length };
    }, area);
    console.log(JSON.stringify(result));
    assert.ok(result.dead && result.cleared && result.portal && result.drops > 0 && result.duplicateSafe);
    assert.equal(result.inactiveIntensity, 0);
    assert.equal(result.activeIntensity, 8);
    assert.equal(result.after, result.before, 'boss portal must preserve the scene light count');
    assert.equal(result.afterPrograms, result.beforePrograms, 'existing lit materials must reuse their shaders after boss death');
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
