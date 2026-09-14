import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero, serializeSave, gainXp, totalExperience } from '../src/model.ts';
import { monsterExperience, monsterStats } from '../src/balance.ts';
import { LEVELS, SPECIAL_LEVELS } from '../src/campaign.ts';
import { MONSTERS, BOSSES } from '../src/bestiary.ts';
import { encounterPlan, cowEncounterPlan } from '../src/encounter-plan.ts';
import { enterGame } from './browser-helpers.mjs';

const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch(), body = await response.text();
    assert.ok(body.includes('const game = new Game();'));
    await route.fulfill({ response, body: body.replace('const game = new Game();', 'const game = new Game(); window.progressionGame = game;') });
  });
  const hero = newHero(); hero.campaign.cleared = [25, 25, 25]; hero.unlockedDifficulty = 2;
  await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(hero));
  const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:5173'); base.searchParams.set('mode', 'local');
  await page.goto(base.href); await enterGame(page);
  await page.evaluate(() => cancelAnimationFrame(window.progressionGame.frameId));
  let checked = 0;
  for (const players of [1, 5, 8]) for (const difficulty of [0, 1, 2]) for (const index of [0, 24, 25]) {
    await page.evaluate(({ players, difficulty, index }) => {
      const g = window.progressionGame;
      g.hero.playerCount = players; g.hero.level = [40, 68, 90][difficulty]; g.hero.xp = 0;
      g.hero.difficultyLevel = difficulty; g.hero.bossDefeated = false;
      if (index === 25) { g.specialArea = 'cow'; g.inCamp = false; g.loadArea(false); }
      else if (!g.enterLevel(index, difficulty)) throw new Error(`Cannot enter ${difficulty}/${index}`);
    }, { players, difficulty, index });
    // Area transitions complete only after the asynchronous save commits.
    await page.waitForFunction(() => !window.progressionGame.onlineOperation);
    const snapshot = await page.evaluate(() => {
      const g = window.progressionGame;
      const layout = structuredClone(g.world.layout);
      const enemies = g.enemies.map(e => ({ id: e.definition.id, level: e.level, hp: e.maxHp, players: e.playerCount, boss: !!e.boss, elite: !!e.elite, champion: !!e.champion, scale: e.xpScale ?? 1 }));
      const before = structuredClone(g.hero);
      // Kill rewards are exercised without advancing the animation/combat clock.
      for (const e of [...g.enemies]) g.combat.damage(e, 1e12, 'magic', true);
      return { layout, enemies, before, after: structuredClone(g.hero) };
    });
    const area = index === 25 ? SPECIAL_LEVELS.cow : LEVELS[index];
    if (index === 25) {
      const ranks = cowEncounterPlan(snapshot.layout).flatMap(pack => pack.ranks);
      assert.equal(snapshot.enemies.length, ranks.length + 1);
      assert.equal(snapshot.enemies.filter(e => e.champion).length, ranks.filter(rank => rank === 'champion').length);
    } else {
      const plan = encounterPlan(area, snapshot.layout, difficulty), promoted = new Set(plan.elitePacks);
      assert.equal(snapshot.enemies.length, plan.normalCount + plan.eliteSites.length + 1, JSON.stringify({ players, difficulty, index }));
      assert.equal(snapshot.enemies.filter(e => e.champion).length, plan.packs.reduce((sum, p, id) => sum + (promoted.has(id) ? p.species.length : 0), 0), JSON.stringify({ players, difficulty, index }));
    }
    const expected = structuredClone(snapshot.before);
    for (const e of snapshot.enemies) {
      const definition = e.boss && index !== 25 ? BOSSES[index] : MONSTERS[e.id];
      const tuning = monsterStats(definition, area, difficulty, e.boss, e.elite, players);
      assert.equal(e.players, players);
      assert.equal(e.level, Math.min(99, tuning.level + (e.champion ? 2 : 0)));
      if (!e.elite && !e.champion && (!e.boss || area.actBoss)) assert.equal(e.hp, tuning.maxHp);
      const rank = e.boss ? area.actBoss ? 'actBoss' : 'miniboss' : e.elite ? 'elite' : e.champion ? 'champion' : 'monster';
      gainXp(expected, monsterExperience(expected.level, e.level, rank, { difficulty, act: area.act, baseLife: definition.hp, players }) * e.scale);
    }
    assert.equal(totalExperience(snapshot.after), totalExperience(expected), JSON.stringify({ players, difficulty, index }));
    checked++;
  }
  assert.deepEqual(errors, []);
  console.log(`Verified ${checked} live campaign/cow populations, monster levels, PP health and complete kill XP totals.`);
} finally { await browser.close(); }
