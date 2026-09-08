import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monsterExperience, experienceFactor, monsterStats } from '../src/balance.ts';
import { LEVELS, AREA_LEVELS, levelTuning } from '../src/campaign.ts';
import { BOSSES, ENCOUNTERS, MONSTERS } from '../src/bestiary.ts';
import { PALADIN_BALANCE, skillValues, xpForLevel } from '../src/paladin.ts';
import { newHero, gainXp, stats, learnSkill, setAura, serializeSave, parseSave, totalExperience } from '../src/model.ts';
import { simulateProgression, referenceHero, referenceMetrics } from './balance-fixtures.ts';

test('experience rewards distinguish monsters and bosses, and first-clear bonus never applies to ordinary or summoned enemies', () => {
  const context = { difficulty: 0, act: 2 }, normal = monsterExperience(30, 30, 'monster', context), minor = monsterExperience(30, 30, 'miniboss', context), boss = monsterExperience(30, 30, 'actBoss', context);
  assert.ok(Math.abs(minor / normal - 4) < .001); assert.ok(Math.abs(boss / normal - 10) < .001);
  assert.ok(Math.abs(monsterExperience(30, 30, 'actBoss', { ...context, firstClear: true }) / boss - 1.35) < .001);
  assert.equal(monsterExperience(30, 30, 'monster', { ...context, firstClear: true }), normal);
  for (const rank of ['monster', 'miniboss', 'actBoss'] as const) assert.equal(monsterExperience(30, 30, rank, { ...context, summoned: true, firstClear: true }), 0);
  assert.ok(monsterExperience(30, 30, 'monster', { ...context, baseLife: 42 }) > monsterExperience(30, 30, 'monster', { ...context, baseLife: 15 }));
});

test('level gaps discourage low-area farming and high-level XP slows smoothly without the level-99 monster zero-XP bug', () => {
  assert.equal(experienceFactor(10, 10), 1); assert.equal(experienceFactor(10, 16), .88);
  assert.equal(experienceFactor(10, 30), .1); assert.equal(experienceFactor(30, 36), 30 / 36);
  assert.equal(experienceFactor(30, 24), .81); assert.equal(experienceFactor(30, 20), .05);
  let previous = 1;
  for (let level = 70; level <= 98; level++) { const current = experienceFactor(level, level); assert.ok(current < previous && current > 0); previous = current; }
  assert.ok(experienceFactor(98, 98) > .0059 * 10);
  const context = { difficulty: 2, act: 4 };
  assert.ok(monsterExperience(98, 99, 'actBoss', context) > 0);
  assert.ok(monsterExperience(98, 98, 'actBoss', context) < xpForLevel(98) * .03);
  assert.equal(monsterExperience(99, 99, 'actBoss', context), 0);
  assert.equal(monsterExperience(NaN, 30, 'monster', context), 0);
  assert.equal(monsterExperience(30, Infinity, 'monster', context), 0);
});

test('the 75-level campaign has a measured progression curve for thorough and partial clearing, with no difficulty-entry XP dead zone', () => {
  for (const fraction of [.65, 1]) {
    const rows = simulateProgression(fraction), thresholds = [[37, 43], [62, 70], [85, 91]];
    let previous = 1;
    for (const row of rows) { assert.ok(row.level > previous && row.level < 99); previous = row.level; }
    for (let diff = 0; diff < 3; diff++) {
      const end = rows[diff * 5 + 4]; assert.ok(end.level >= thresholds[diff][0] && end.level <= thresholds[diff][1], `${fraction}: difficulty ${diff}, level ${end.level}`);
      assert.equal(end.hero.campaign.cleared[diff], 25);
    }
    assert.ok(rows[0].level >= 11 && rows[0].level <= 13);
    assert.ok(rows[5].level - rows[4].level >= 2); assert.ok(rows[10].level - rows[9].level >= 2);
  }
});

test('all encounters use finite increasing chapter values, species retain their identity and bosses have explicit difficulty health', () => {
  assert.equal(AREA_LEVELS.length, 3);
  for (let diff = 0; diff < 3; diff++) for (const area of LEVELS) {
    const boss = monsterStats(BOSSES[area.index], area, diff, true);
    for (const definition of [...ENCOUNTERS[area.index].map(id => MONSTERS[id]), BOSSES[area.index]]) {
      const enemy = monsterStats(definition, area, diff, definition === BOSSES[area.index]);
      for (const key of ['level', 'maxHp', 'damage', 'defense', 'attackRating'] as const) assert.ok(Number.isFinite(enemy[key]) && enemy[key] > 0);
      assert.ok(enemy.level <= 99); assert.ok(Object.values(enemy.resistances).every(v => v <= 85));
    }
    if (area.actBoss) assert.equal(boss.maxHp, BOSSES[area.index].hpByDifficulty![diff]);
    if (diff) assert.ok(boss.maxHp > monsterStats(BOSSES[area.index], area, diff - 1, true).maxHp);
    if (area.index) assert.ok(levelTuning(area, diff).hp > levelTuning(LEVELS[area.index - 1], diff).hp);
  }
  assert.ok(monsterStats(MONSTERS.zombie, LEVELS[0], 0).maxHp > monsterStats(MONSTERS.fallen, LEVELS[0], 0).maxHp);
  assert.equal(monsterStats(BOSSES[4], LEVELS[4], 0, true).resistances.fire, -30);
});

test('moderate melee and hammer builds stay within monster, boss and incoming-damage budgets in every act', () => {
  for (const row of simulateProgression()) for (const build of ['zeal', 'hammer'] as const) {
    const index = row.act * 5 + 4, hero = referenceHero(row.level, row.difficulty as 0 | 1 | 2, build), boss = referenceMetrics(hero, BOSSES[index], index, true);
    assert.ok(boss.seconds >= 6 && boss.seconds < 65, `${build} ${row.difficulty}/${row.act}: ${boss.seconds}s`);
    assert.ok(boss.maxHitPercent < 30, `${build} ${row.difficulty}/${row.act}: ${boss.maxHitPercent}%`);
    assert.ok(boss.hitChance >= 55);
    for (const id of ENCOUNTERS[index]) assert.ok(referenceMetrics(hero, MONSTERS[id], index).seconds < 5, `${build}: ${id}`);
  }
});

test('sustain improves without changing Paladin growth, damage synergies, breakpoint math or spent-point budgets', () => {
  const hero = newHero(); assert.equal(stats(hero).maxHp, 55); assert.equal(stats(hero).maxMana, 15);
  assert.equal(stats(hero).manaRegen, 15 / 90);
  assert.equal(PALADIN_BALANCE.sacrificeRecoil, .05); assert.equal(PALADIN_BALANCE.hitGraceSeconds, .2);
  assert.equal(skillValues('charge', 1).cost, 7); assert.equal(skillValues('vengeance', 20).cost, 6.5625);
  assert.equal(skillValues('blessedHammer', 20).cost, 8.3); assert.equal(skillValues('blessedHammer', 20).min, 196);
  assert.equal(skillValues('holyShield', 1).cost, 25); assert.equal(skillValues('holyShield', 1).duration, 60);
  assert.equal(skillValues('fistOfHeavens', 20).cost, 18); assert.equal(skillValues('fistOfHeavens', 20).min, 675);
  gainXp(hero, 600000); learnSkill(hero, 'might'); learnSkill(hero, 'blessedAim');
  const passive = stats(hero).attackRatingBonus; assert.equal(passive, 5);
  setAura(hero, 'blessedAim'); assert.equal(stats(hero).attackRatingBonus, 75);
  setAura(hero, null); assert.equal(stats(hero).attackRatingBonus, 5);
});

test('existing levels, XP and items round-trip unchanged after the balance update', () => {
  for (const level of [41, 67, 89, 98, 99]) {
    const hero = referenceHero(level, 2, 'hammer'); if (level < 99) hero.xp = Math.floor(xpForLevel(level) * .43);
    const before = totalExperience(hero), saved = parseSave(serializeSave(hero))!;
    assert.deepEqual(saved, hero); assert.equal(totalExperience(saved), before);
  }
});
