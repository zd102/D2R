import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const output = process.env.OUTPUT_DIR || '.verification/memory-check'; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], samples = [], failures = [], started = Date.now();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    // Keep only counters and weak handles; the probe must not retain GPU objects itself.
    window.memoryContexts = [];
    const contexts = new WeakSet(), getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(...args) {
      const gl = getContext.apply(this, args);
      if (!gl || !['webgl', 'webgl2', 'experimental-webgl'].includes(args[0]) || contexts.has(gl)) return gl;
      contexts.add(gl); const counts = { lost: false }; window.memoryContexts.push(counts);
      this.addEventListener('webglcontextlost', () => { counts.lost = true; });
      for (const kind of ['Buffer', 'Texture', 'Program', 'Shader', 'Framebuffer', 'Renderbuffer', 'VertexArray']) {
        const create = gl[`create${kind}`], destroy = gl[`delete${kind}`]; if (!create || !destroy) continue;
        const live = new WeakSet(); counts[kind] = 0;
        gl[`create${kind}`] = function(...args) { const value = create.apply(this, args); if (value) { live.add(value); counts[kind]++; } return value; };
        gl[`delete${kind}`] = function(value) { if (value && live.delete(value)) counts[kind]--; return destroy.call(this, value); };
      }
      return gl;
    };
  });
  await page.route('**/src/main.ts*', async route => { const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.memoryGame = game;') }); });
  const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
  await page.evaluate(() => {
    const g = window.memoryGame; cancelAnimationFrame(g.frameId);
    window.memoryRender = () => { g.updateCamera(1); g.composer.render(); g.ui.update(1 / 30); };
    window.memoryStep = count => { for (let i = 0; i < count; i++) { g.invincible = 999; g.update(1 / 30); if (i % 10 === 0) window.memoryRender(); } window.memoryRender(); };
  });
  async function sample(phase, round) {
    await page.waitForTimeout(3500); // Let toasts, audio and context-loss callbacks finish.
    await page.evaluate(() => window.memoryRender()); await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage'), dom = await cdp.send('Memory.getDOMCounters');
    const state = await page.evaluate(() => {
      const g = window.memoryGame, info = g.renderer.info, counts = window.memoryContexts.filter(context => !context.lost);
      return { graphics: Object.fromEntries(['Buffer', 'Texture', 'Program', 'Shader', 'Framebuffer', 'Renderbuffer', 'VertexArray'].map(kind => [kind, counts.reduce((sum, context) => sum + (context[kind] || 0), 0)])), contexts: counts.length,
        geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs.length, materialReferences: info.programs.reduce((sum, program) => sum + program.usedTimes, 0),
        enemies: g.enemies.length, effects: g.effects.length, projectiles: g.combat.projectiles.length + g.combat.classes.missiles.length, fields: g.combat.classes.fields.length, summons: g.combat.classes.summons.length,
        labels: g.ui.labelNodes.size, floats: g.ui.floats.length, repairTimers: g.combat.repairTime instanceof Map ? g.combat.repairTime.size : null, canvases: document.querySelectorAll('canvas').length };
    });
    const row = { phase, round, heapMB: +(heap.usedSize / 1048576).toFixed(2), embedderMB: +((heap.embedderHeapUsedSize || 0) / 1048576).toFixed(2), backingMB: +((heap.backingStorageSize || 0) / 1048576).toFixed(2), ...dom, ...state };
    samples.push(row); console.log(JSON.stringify(row)); await writeFile(`${output}/samples.json`, JSON.stringify(samples, null, 2)); return row;
  }
  function stable(phase) {
    const rows = samples.filter(row => row.phase === phase), first = rows[0], last = rows.at(-1);
    if (last.heapMB > first.heapMB + 8) failures.push(`${phase}: retained JS heap grew ${last.heapMB - first.heapMB} MB`);
    for (const key of ['nodes', 'jsEventListeners', 'contexts', 'materialReferences']) if (last[key] > first[key] + (key === 'nodes' ? 40 : key === 'jsEventListeners' ? 2 : 0)) failures.push(`${phase}: ${key} grew ${first[key]} -> ${last[key]}`);
    for (const key of Object.keys(first.graphics)) if (last.graphics[key] > first.graphics[key]) failures.push(`${phase}: GPU ${key} grew ${first.graphics[key]} -> ${last.graphics[key]}`);
  }

  // Repeated model replacement on the roster, without reloading the page.
  for (let round = 0; round < 4; round++) {
    await page.evaluate(() => { const g = window.memoryGame; for (let i = 0; i < 5; i++) for (const id of ['amazon', 'sorceress', 'paladin']) { g.previewClass(id); window.memoryRender(); } });
    await sample('class-preview', round);
  }
  stable('class-preview');

  // The encyclopedia owns another WebGL context and its own animation/resize callbacks.
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: '打开百科', exact: true }).click();
      await page.locator('[data-encyclopedia-view="monsters"]').click();
      for (let entry = 0; entry < 6; entry++) await page.locator('[data-encyclopedia-entry]').nth(entry).click();
      await page.locator('[data-encyclopedia-action="exit"]').click();
    }
    await sample('encyclopedia', round);
  }
  stable('encyclopedia');

  await page.getByRole('button', { name: '新建角色', exact: true }).click();
  await page.getByRole('textbox', { name: '角色名称', exact: true }).fill('内存回归测试');
  await page.getByRole('button', { name: '创建并进入', exact: true }).click();
  await page.evaluate(() => { const h = window.memoryGame.hero; h.level = 99; h.strength = h.dexterity = h.vitality = h.energy = 999; h.campaign.cleared = [25, 25, 25]; h.unlockedDifficulty = 2; Object.keys(h.skills).forEach(key => h.skills[key] = 20); });
  for (let round = 0; round < 5; round++) {
    for (const index of [0, 5, 10, 15, 20]) await page.evaluate(index => {
      const g = window.memoryGame; if (!g.enterLevel(index)) throw new Error('Could not enter level'); window.memoryStep(3);
      // Visit/render the quest object before completing it, like an actual player.
      g.world.shrineMeshes.forEach((group, id) => { g.position.copy(group.position).addScalar(2); g.position.y = 0; g.body.position.set(g.position.x, .5, g.position.z); window.memoryRender(); g.world.completeObjective(id); window.memoryRender(); });
      if (!g.returnToCamp()) throw new Error('Could not return to camp'); window.memoryStep(3);
    }, index);
    await sample('area-transitions', round);
  }
  stable('area-transitions');

  for (let round = 0; round < 4; round++) {
    await page.evaluate(() => { const g = window.memoryGame; for (let i = 0; i < 10; i++) for (const panel of ['inventory', 'character', 'skills', 'map', 'quest', 'pause']) { g.ui.openPanel(panel); g.ui.closePanel(); } window.memoryRender(); });
    await sample('panels', round);
  }
  stable('panels');

  await page.evaluate(() => { const g = window.memoryGame; g.hero.inventory = [{ ...g.hero.equipment.weapon, id: 'memory-drag', x: 0, y: 0 }]; });
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('i'); const source = page.locator('.bag-item[data-item="memory-drag"]'), rect = await source.boundingBox();
      await page.mouse.move(rect.x + 10, rect.y + 10); await page.mouse.down(); await page.mouse.move(rect.x + 60, rect.y + 20, { steps: 3 });
      await expect(page.locator('.item-drag-ghost')).toBeVisible(); await page.keyboard.press('Escape'); await page.mouse.up();
      await expect(page.locator('.item-drag-ghost,.item-drag-hint,.item-drop-preview,.item-swap-preview')).toHaveCount(0); await page.keyboard.press('Escape');
    }
    await sample('drag-cancellation', round);
  }
  stable('drag-cancellation');

  // Discarded repair gear must not leave an ever-growing ID registry behind.
  await page.evaluate(() => {
    const g = window.memoryGame, original = g.hero.equipment.weapon;
    for (let i = 0; i < 1000; i++) { g.hero.equipment.weapon = { ...original, id: `repair-churn-${i}`, mods: { repairDurability: .25 }, durability: 0 }; g.combat.update(.01); }
    g.hero.equipment.weapon = original; window.memoryStep(3);
  });
  const repair = await sample('repair-gear', 0);
  if (repair.repairTimers !== null && repair.repairTimers > 10) failures.push(`repair-gear: retained ${repair.repairTimers} discarded repair IDs`);

  for (const classId of ['paladin', 'amazon', 'sorceress']) {
    await page.evaluate(async classId => {
      const { newHero, stats } = await import('/src/model.ts'), g = window.memoryGame;
      g.hero = newHero(classId); const h = g.hero; h.level = 99; h.strength = h.dexterity = h.vitality = h.energy = 999; Object.keys(h.skills).forEach(key => h.skills[key] = 20);
      h.hp = stats(h).maxHp; h.mana = stats(h).maxMana; g.loadArea(true);
    }, classId);
    for (let round = 0; round < 4; round++) {
      const castCount = await page.evaluate(classId => {
        const g = window.memoryGame;
        const skills = { paladin: ['attack', 'holyBolt', 'blessedHammer'], amazon: ['poisonJavelin', 'plagueJavelin', 'valkyrie', 'dopplezon'], sorceress: ['fireBall', 'frozenOrb', 'meteor', 'blizzard', 'hydra'] }[classId];
        let casts = 0;
        for (let i = 0; i < 5; i++) for (const id of skills) { g.aim.copy(g.position).add({ x: 2, y: 0, z: 2 }); g.hero.mana = 9999; if (g.combat.castAction(id, true)) casts++; window.memoryStep(75); }
        g.combat.classes.summons.forEach(summon => summon.life = 0); window.memoryStep(360);
        return casts;
      }, classId);
      assert.ok(castCount >= 15, `skills actually cast in ${classId}, round ${round}: ${castCount}`);
      const row = await sample(`combat-${classId}`, round);
      assert.equal(row.effects + row.projectiles + row.fields + row.summons, 0, 'expired combat objects must leave their owner collections');
    }
    stable(`combat-${classId}`);
  }
  for (let round = 0; round < 4; round++) {
    await page.evaluate(() => {
      const g = window.memoryGame;
      for (let wave = 0; wave < 5; wave++) {
        for (const [offset, skill] of ['fireNova', 'poisonPool', 'redLightning'].entries()) {
          const enemy = g.spawnEnemy(g.position.x + 2 + offset, g.position.z + 2, 'skeleton'); enemy.summoned = true; enemy.active = true; enemy.cooldown = 999;
          g.monsterCombat.startCast(enemy, skill);
        }
        window.memoryStep(60); g.enemies.forEach(enemy => g.killEnemy(enemy)); window.memoryStep(90);
      }
    });
    const row = await sample('enemy-waves', round); assert.equal(row.enemies, 0);
    assert.equal(await page.evaluate(() => { const g = window.memoryGame; return g.monsterCombat.missiles.length + g.monsterCombat.hazards.length + g.monsterCombat.states.size; }), 0);
  }
  stable('enemy-waves');
  assert.deepEqual(errors, []); await writeFile(`${output}/findings.json`, JSON.stringify(failures, null, 2));
  if (process.env.MEMORY_RECORD_ONLY !== '1') assert.deepEqual(failures, []);
  console.log(failures.length ? `Memory findings: ${failures.join('; ')}` : `Memory lifecycle checks passed in ${((Date.now() - started) / 1000).toFixed(1)} seconds`);
} finally { await browser.close(); }
