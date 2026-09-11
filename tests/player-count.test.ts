import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_COUNTS, parsePlayerCount, playerLifeFactor, playerDamageFactor, playerDropExponent, playerNoDrop } from '../src/player-count.ts';
import { newHero, parseSave, serializeSave } from '../src/model.ts';
import { monsterStats, monsterExperience } from '../src/balance.ts';
import { LEVELS, SPECIAL_LEVELS } from '../src/campaign.ts';
import { MONSTERS, BOSSES } from '../src/bestiary.ts';
import { rollDropKinds } from '../src/items.ts';
import { rollLoot } from '../src/loot.ts';
import { chestContext, rollChestCodes } from '../src/chests.ts';

function rng(seed: number) { return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; }; }

test('old saves default to 1pp; every valid setting survives serialization and invalid values are rejected', () => {
  for (const value of [undefined, null, '8', 0, 9, -1, 1.5, NaN, Infinity]) assert.equal(parsePlayerCount(value), 1);
  const hero = newHero(); assert.equal(hero.playerCount, 1);
  const old = JSON.parse(serializeSave(hero)); delete old.hero.playerCount;
  assert.equal(parseSave(JSON.stringify(old))!.playerCount, 1);
  for (const players of PLAYER_COUNTS) { hero.playerCount = players; assert.deepEqual(parseSave(serializeSave(hero)), hero); }
});

test('all pp tiers scale ordinary monsters, elites, bosses and secret areas without changing level, defense or resistances', () => {
  assert.deepEqual(PLAYER_COUNTS.map(playerLifeFactor), [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5]);
  for (const diff of [0, 1, 2]) for (const players of PLAYER_COUNTS) {
    const factor = 1 + (players - 1) / 2, damage = diff ? 1 + (players - 1) / 16 : 1;
    assert.equal(playerDamageFactor(players, diff), damage);
    for (const [definition, area, boss, elite] of [
      [MONSTERS.skeleton, LEVELS[0], false, false], [MONSTERS.skeleton, LEVELS[6], false, true],
      [BOSSES[24], LEVELS[24], true, false], [MONSTERS.hellCow, SPECIAL_LEVELS.cow, false, false],
      [BOSSES[19], SPECIAL_LEVELS.uberDiablo, true, false],
    ] as const) {
      const base = monsterStats(definition, area, diff, boss, elite), scaled = monsterStats(definition, area, diff, boss, elite, players);
      assert.equal(scaled.maxHp, Math.floor(base.maxHp * factor));
      assert.ok(Math.abs(scaled.damage - base.damage * damage) < 1e-8);
      assert.ok(Math.abs(scaled.attackRating - base.attackRating * damage) <= 1);
      assert.equal(scaled.level, base.level); assert.equal(scaled.defense, base.defense); assert.deepEqual(scaled.resistances, base.resistances);
    }
    for (const rank of ['monster', 'elite', 'miniboss', 'actBoss'] as const) {
      const context = { difficulty: diff, act: 2 }, base = monsterExperience(50, 50, rank, context);
      const xp = monsterExperience(50, 50, rank, { ...context, players });
      assert.ok(Math.abs(xp - base * factor) < factor);
      assert.equal(monsterExperience(50, 50, rank, { ...context, players, summoned: true }), 0);
    }
  }
});

test('solo NoDrop tiers pair 1/2, 3/4, 5/6 and 7/8 and retain guaranteed picks', () => {
  assert.deepEqual(PLAYER_COUNTS.map(playerDropExponent), [1, 1, 2, 2, 3, 3, 4, 4]);
  assert.deepEqual(PLAYER_COUNTS.map(players => playerNoDrop(100, 60, players)), [100, 100, 38, 38, 19, 19, 10, 10]);
  for (const players of PLAYER_COUNTS) assert.equal(playerNoDrop(0, 60, players), 0);
  const counts = PLAYER_COUNTS.map(players => {
    const random = rng(151), sums = { equipment: 0, rune: 0, charm: 0 };
    for (let i = 0; i < 20000; i++) { const drop = rollDropKinds('monster', random, players); for (const key of Object.keys(sums) as (keyof typeof sums)[]) sums[key] += Number(drop[key]); }
    return sums;
  });
  for (const index of [0, 2, 4, 6]) assert.deepEqual(counts[index], counts[index + 1]);
  for (const index of [2, 4, 6]) for (const key of ['equipment', 'rune', 'charm'] as const) assert.ok(counts[index][key] > counts[index - 2][key]);
  for (const rank of ['elite', 'miniboss'] as const) for (let seed = 0; seed < 100; seed++) assert.deepEqual(rollDropKinds(rank, rng(seed), 1), rollDropKinds(rank, rng(seed), 8));
});

test('chest NoDrop scales existing tables, preserving tier pairs and fixed pick limits', () => {
  const counts = PLAYER_COUNTS.map(players => {
    const random = rng(911), context = { ...chestContext(LEVELS[0], 0), players }; let count = 0;
    for (let i = 0; i < 5000; i++) { const codes = rollChestCodes(context, random); assert.ok(codes.length <= 4); count += codes.length; }
    return count;
  });
  for (const index of [0, 2, 4, 6]) assert.equal(counts[index], counts[index + 1]);
  for (const index of [2, 4, 6]) assert.ok(counts[index] > counts[index - 2]);
});

test('pp does not multiply fixed gold, guaranteed boss equipment or item quality', () => {
  const context = { level: 30, act: 2, difficulty: 0, rank: 'actBoss' as const };
  const one = rollLoot({ ...context, players: 1 }, () => .2), eight = rollLoot({ ...context, players: 8 }, () => .2);
  assert.equal(one.gold, eight.gold); assert.equal(one.items.length, eight.items.length);
  assert.deepEqual(one.items.map(item => [item.name, item.rarity, item.mods]), eight.items.map(item => [item.name, item.rarity, item.mods]));
});
