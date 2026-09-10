import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';
import { BASES, SPECIAL_ITEMS, RUNE_ORDER, AVAILABLE_RUNEWORDS as RUNEWORDS } from '../src/items.ts';
import { MONSTERS, BOSSES } from '../src/bestiary.ts';
import { ATTACKS } from '../src/monster-combat.ts';
import { enterGame, savedProfile, runeRecipes } from './browser-helpers.mjs';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
await mkdir('.verification', { recursive: true });
try {
  console.log('Expansion counts:', { bases: BASES.length, uniques: SPECIAL_ITEMS.filter(i => i.rarity === 'unique').length, species: Object.keys(MONSTERS).length, models: new Set([...Object.values(MONSTERS), ...BOSSES].map(d => d.model)).size, attacks: Object.keys(ATTACKS).length });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport }); page.on('pageerror', e => errors.push(e.message));
    await page.route('**/__model_verification__', route => route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0;overflow:hidden"></body></html>' }));
    await page.goto(`${base}/__model_verification__`);
    await page.evaluate(async () => {
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const { createMonsterActor } = await import('/src/monster-models.ts'), { MONSTERS, BOSSES } = await import('/src/bestiary.ts');
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(1); document.body.append(renderer.domElement);
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0x222c2a); scene.add(new THREE.HemisphereLight(0xe5f4ff, 0x4c5542, 2.8));
      const light = new THREE.DirectionalLight(0xffdfb6, 3); light.position.set(4, 8, 5); scene.add(light);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x4d5653, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -.08; scene.add(floor);
      const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 100); let actor;
      window.renderMonster = (index, time = .5) => {
        if (actor) { actor.group.removeFromParent(); const geos = new Set(), mats = new Set(); actor.group.traverse(o => { if (o.isMesh) { geos.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m)); } }); geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); }
        const definition = [...Object.values(MONSTERS), ...BOSSES][index]; actor = createMonsterActor(definition, index >= Object.keys(MONSTERS).length); scene.add(actor.group);
        const bound = new THREE.Box3().setFromObject(actor.group), center = bound.getCenter(new THREE.Vector3()), size = bound.getSize(new THREE.Vector3());
        const aspect = innerWidth / innerHeight, height = Math.max(5, size.y * 1.5, Math.max(size.x, size.z) * 1.5 / aspect);
        camera.left = -height * aspect / 2; camera.right = height * aspect / 2; camera.top = height / 2; camera.bottom = -height / 2; camera.updateProjectionMatrix();
        camera.position.copy(center).add(new THREE.Vector3(6, 4, 9)); camera.lookAt(center);
        actor.animate(time, true, .5); renderer.render(scene, camera);
        const c = document.createElement('canvas'); c.width = c.height = 80; const ctx = c.getContext('2d'); ctx.drawImage(renderer.domElement, 0, 0, 80, 80);
        const pixels = ctx.getImageData(0, 0, 80, 80).data, colors = new Set(); let bright = 0;
        for (let i = 0; i < pixels.length; i += 4) { colors.add(`${pixels[i] >> 3},${pixels[i + 1] >> 3},${pixels[i + 2] >> 3}`); if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 250) bright++; }
        const corners = []; for (const x of [bound.min.x, bound.max.x]) for (const y of [bound.min.y, bound.max.y]) for (const z of [bound.min.z, bound.max.z]) corners.push(new THREE.Vector3(x, y, z).project(camera));
        return { colors: colors.size, bright, framed: corners.every(p => Math.abs(p.x) < .99 && Math.abs(p.y) < .99), image: renderer.domElement.toDataURL() };
      };
    });
    const definitions = [...Object.values(MONSTERS), ...BOSSES];
    for (let i = 0; i < definitions.length; i++) {
      const result = await page.evaluate(i => window.renderMonster(i), i);
      assert.ok(result.colors > 25 && result.bright > 10, `${definitions[i].id} nonblank: ${result.colors}`); assert.ok(result.framed, `${definitions[i].id} framing ${viewport.width}`);
      const moved = await page.evaluate(i => window.renderMonster(i, 1.2), i); assert.notEqual(moved.image, result.image, `${definitions[i].id} animated`);
      if (['andariel', 'duriel', 'mephisto', 'diablo', 'baal'].includes(definitions[i].id)) await page.screenshot({ path: `.verification/model-${definitions[i].id}-${viewport.width}.png` });
    }
    await page.close(); console.log('All monster models framed, animated and nonblank:', viewport);
  }
  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
    const hero = newHero(); hero.runes = [...RUNE_ORDER, 'el', 'el', 'pul'];
    const page = await browser.newPage({ viewport, hasTouch: viewport.width < 700 }); page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(save => { if (!sessionStorage.getItem('expansion-fixture')) { localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('expansion-fixture', '1'); } }, serializeSave(hero));
    await page.goto(base); await enterGame(page); await page.keyboard.press('i'); await page.locator('[data-bag-view="runes"]').click();
    await expect(page.locator('.rune-entry')).toHaveCount(33); await expect(page.locator('.runeword-list>div')).toHaveCount(RUNEWORDS.length);
    await page.locator('[data-upgrade-rune="el"]').click();
    let saved = (await savedProfile(page)).hero; assert.equal(saved.runes.filter(r => r === 'el').length, 0); assert.equal(saved.runes.filter(r => r === 'eld').length, 2);
    await expect(page.locator('[data-upgrade-rune="el"]')).toBeDisabled();
    await page.locator('[data-upgrade-rune="pul"]').click(); saved = (await savedProfile(page)).hero; assert.equal(saved.runes.filter(r => r === 'um').length, 2);
    await runeRecipes(page); await page.locator('[data-recipe-filter]').selectOption('ready'); assert.ok(await page.locator('.runeword-list>div').count() < RUNEWORDS.length);
    assert.equal(await page.locator('.panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
    const overlaps = await page.locator('.rune-entry').evaluateAll(elements => elements.some(el => { const strong = el.querySelector('strong').getBoundingClientRect(), b = el.querySelector('b').getBoundingClientRect(); return strong.right > b.left + 1; })); assert.equal(overlaps, false);
    await page.locator('[data-bag-view="runes"]').scrollIntoViewIfNeeded(); await page.screenshot({ path: `.verification/expanded-runes-${viewport.width}.png` });
    await page.reload(); await enterGame(page); assert.deepEqual((await savedProfile(page)).hero.runes, saved.runes); await page.close();
  }
  // The production reward path must ignore summons, not only the AI fixture.
  const page = await browser.newPage(); await page.goto(base);
  assert.equal(await page.evaluate(async () => {
    const { Game } = await import('/src/game.ts'); let drops = 0;
    const game = { hero: { kills: 7, gold: 10 }, monsterCombat: { cancel() {} }, world: { physics: { removeBody() {} } }, dropLoot() { drops++; }, target: undefined, path: [] };
    const enemy = { dead: false, summoned: true, body: {}, actor: { group: { visible: true } } };
    Game.prototype.killEnemy.call(game, enemy); return enemy.dead && enemy.redeemed && drops === 0 && game.hero.kills === 7 && game.hero.gold === 10;
  }), true); await page.close();
  assert.deepEqual(errors, []); console.log('Expanded rune UI, atomic upgrades, filtering, persistence and summon reward exclusion passed');
} finally { await browser.close(); }
