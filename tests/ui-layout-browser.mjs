import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { newHero, gainXp, learnSkill, stats, serializeSave } from '../src/model.ts';
import { BASES, makeItem, SPECIAL_ITEMS, specialItem, placeItems, RUNE_ORDER } from '../src/items.ts';
import { SKILLS, EXPERIENCE } from '../src/paladin.ts';

const output = process.env.OUTPUT_DIR || '.verification/ui-overhaul';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [], report = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch(), body = await response.text();
    await route.fulfill({ response, body: body.replace('const game = new Game();', 'const game = new Game(); window.layoutGame = game;') });
  });
  const hero = newHero(); gainXp(hero, EXPERIENCE[98]);
  for (const skill of SKILLS) learnSkill(hero, skill.id);
  hero.strength = hero.dexterity = 999; hero.gold = 999999; hero.runes = [...RUNE_ORDER];
  const detailed = [...SPECIAL_ITEMS].sort((a, b) => Object.keys(b.mods).length - Object.keys(a.mods).length)[0];
  hero.inventory = [{ ...specialItem(detailed.name, () => .8), id: 'layout-detailed', identified: true }, makeItem(BASES.find(b => b.baseCode === 'rin'), 'layout-ring')];
  hero.stash = Array.from({ length: 18 }, (_, i) => makeItem(BASES.find(b => b.baseCode === (i % 2 ? 'qui' : 'crs')), `layout-stash-${i}`));
  assert.ok(placeItems(hero.inventory)); assert.ok(placeItems(hero.stash, 14));
  hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana;
  await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(hero));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.layoutGame && !window.layoutGame.paused);
  await page.evaluate(() => cancelAnimationFrame(window.layoutGame.frameId));
  for (const [width, height] of [[1440, 900], [1366, 768], [1280, 720], [1024, 768], [390, 844], [360, 740], [844, 390]]) {
    await page.setViewportSize({ width, height });
    for (const panel of ['inventory', 'inventory-detail', 'stash', 'runes', 'rune-recipes', 'character', 'character-combat', 'skills', 'skill-detail', 'bindings', 'quest', 'map', 'shop', 'pause', 'campaign', 'mystery-portal', 'shared-stash', 'shared-detail']) {
      await page.evaluate(panel => {
        const g = window.layoutGame; g.ui.closePanel();
        g.ui.selectedItem = 'layout-detailed';
        const screen = g.ui.characterScreen;
        screen.inventoryPane = panel === 'inventory-detail' ? 'details' : 'items';
        screen.sheetTab = panel === 'character-combat' ? 'combat' : 'attributes';
        screen.skillPane = panel === 'bindings' ? 'bindings' : panel === 'skill-detail' ? 'detail' : 'tree';
        screen.runePane = panel === 'rune-recipes' ? 'recipes' : 'materials';
        screen.view = panel === 'stash' ? 'stash' : ['runes', 'rune-recipes'].includes(panel) ? 'runes' : 'inventory';
        if (panel.startsWith('shared-')) {
          const stash = g.world.sharedStash.position; g.position.set(stash.x, 0, stash.z); g.body.position.set(stash.x, .5, stash.z);
          g.ui.sharedStashScreen.selected = panel === 'shared-detail' ? { side: 'personal', id: 'layout-detailed' } : undefined;
        }
        g.ui.openPanel(['stash', 'runes', 'rune-recipes', 'inventory-detail'].includes(panel) ? 'inventory' : panel === 'character-combat' ? 'character' : ['bindings', 'skill-detail'].includes(panel) ? 'skills' : panel === 'shared-detail' ? 'shared-stash' : panel);
      }, panel);
      const metrics = await page.evaluate(() => {
        const dialog = document.querySelector('#overlay .panel'), body = dialog.querySelector('.panel-body'), rect = dialog.getBoundingClientRect();
        const parts = ['.character-banner', '.sheet-columns', '.advanced-stats', '.character-xp', '.sheet-actions', '.skill-toolbar', '.skill-layout', '.binding-grid', '.item-detail-scroll'].map(selector => { const el = dialog.querySelector(selector); if (!el) return null; const css = getComputedStyle(el); return { selector, height: el.getBoundingClientRect().height, margins: [css.marginTop, css.marginBottom], overflow: el.scrollHeight - el.clientHeight }; }).filter(Boolean);
        return { panelOverflow: dialog.scrollHeight - dialog.clientHeight, bodyOverflow: body.scrollHeight - body.clientHeight, horizontal: dialog.scrollWidth - dialog.clientWidth, inViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1, parts };
      });
      report.push({ width, height, panel, ...metrics });
      assert.ok(metrics.inViewport && metrics.horizontal <= 1 && metrics.panelOverflow <= 1, `${panel} fits ${width}x${height}: ${JSON.stringify(metrics)}`);
      if (height >= 640 && ['inventory', 'inventory-detail', 'stash', 'runes', 'rune-recipes', 'shared-stash', 'shared-detail'].includes(panel)) assert.ok(metrics.bodyOverflow <= 1, `${panel} main workspace needs no scrolling at ${width}x${height}`);
      const blocked = await page.locator('.panel-header > button,.item-actions button,.shared-actions button,.recipe-pagination button').evaluateAll(nodes => nodes.filter(node => !node.disabled && node.getClientRects().length).filter(node => { const r = node.getBoundingClientRect(); return !node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }).map(node => node.textContent.trim()));
      assert.deepEqual(blocked, [], `actions remain visible at ${width}x${height}: ${panel}`);
      await page.screenshot({ path: `${output}/${panel}-${width}x${height}.png` });
    }
  }
  for (const [width, height] of [[1440, 900], [1280, 720], [390, 844], [360, 740], [844, 390]]) {
    await page.setViewportSize({ width, height });
    for (const panel of ['profiles', 'new-profile', 'rename-profile', 'delete-profile', 'import-profile', 'encyclopedia', 'save-conflict', 'death']) {
      await page.evaluate(panel => {
        const g = window.layoutGame; g.dead = false; g.saveConflict = false; g.ui.closePanel();
        g.ui.profileScreen.editing = g.profile;
        if (panel === 'save-conflict') g.saveConflict = true;
        if (panel === 'death') g.dead = true;
        g.ui.openPanel(panel);
      }, panel);
      const bounds = await page.getByRole('dialog').evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, horizontal: el.scrollWidth - el.clientWidth }; });
      assert.ok(bounds.x >= -1 && bounds.y >= -1 && bounds.right <= width + 1 && bounds.bottom <= height + 1 && bounds.horizontal <= 1, `${panel} ${width}: ${JSON.stringify(bounds)}`);
      await page.screenshot({ path: `${output}/${panel}-${width}x${height}.png` });
    }
  }
  await writeFile(`${output}/layout.json`, JSON.stringify(report, null, 2));
  assert.deepEqual(errors, []);
  console.log(`PASS: ${report.length} main panel layouts and 40 character management, encyclopedia and death layouts; viewport fit and unobstructed primary actions`);
} finally { await browser.close(); }
