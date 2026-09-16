import test from 'node:test';
import assert from 'node:assert/strict';
import { newHero, bindSkill, swapWeapons, parseSave, serializeSave, skillLevel, respec } from '../src/model.ts';
import { classFixture } from './class-fixture.ts';

test('weapon layouts are independent and survive saving from either set', () => {
  const hero = newHero('sorceress');
  assert.ok(bindSkill(hero, 'dash', 'fireBolt'));
  swapWeapons(hero);
  assert.ok(bindSkill(hero, 'dash', 'attack'));
  for (let i = 0; i < 4; i++) {
    const loaded = parseSave(serializeSave(hero))!;
    assert.equal(loaded.bindings.dash, hero.weaponSet ? 'attack' : 'fireBolt');
    swapWeapons(loaded);
    assert.equal(loaded.bindings.dash, loaded.weaponSet ? 'attack' : 'fireBolt');
    Object.assign(hero, loaded);
  }
  hero.questRewards.push('0:shrine0');
  assert.ok(respec(hero));
  swapWeapons(hero);
  assert.ok(Object.values(hero.bindings).every(id => id === 'attack'));
});

test('legacy layouts migrate without sharing objects; inactive equipment skills load correctly', () => {
  const hero = newHero();
  hero.equipment.weapon!.mods = { oskill_teleport: 4 };
  assert.ok(bindSkill(hero, 'dash', 'teleport'));
  const legacy = parseSave(serializeSave(hero))!;
  assert.notEqual(legacy.bindings, legacy.alternateBindings);
  swapWeapons(legacy);
  assert.equal(legacy.bindings.dash, 'attack');
  const loaded = parseSave(serializeSave(legacy))!;
  swapWeapons(loaded);
  assert.equal(loaded.bindings.dash, 'teleport');
  assert.equal(skillLevel(loaded, 'teleport'), 4);
  const data = JSON.parse(serializeSave(loaded));
  data.hero.alternateBindings = { dash: 'invalid', attack: 'might', bolt: 'teleport' };
  const sanitized = parseSave(JSON.stringify(data))!;
  swapWeapons(sanitized);
  assert.ok(Object.values(sanitized.bindings).every(id => id === 'attack'));
});

test('cast buffs, summons and damaging fields survive losing their weapon-granted skills', () => {
  const { hero, combat, game, enemy, tick } = classFixture('paladin', false);
  hero.equipment.weapon!.mods = { oskill_enchant: 5, oskill_hydra: 5, oskill_fireWall: 5, oskill_clayGolem: 5 };
  const target = enemy(6); game.aim.copy(target.actor.group.position);
  for (const id of ['enchant', 'hydra', 'fireWall', 'clayGolem'] as const) {
    combat.lock = 0; hero.mana = 1000;
    assert.ok(combat.castAction(id, true), id);
  }
  const buff = hero.buffs.enchant!, summon = combat.classes.summons[0], pet = combat.expansion.pets.pets[0], field = combat.classes.fields[0];
  assert.ok(buff && summon && pet && field);
  const duration = buff.remaining, life = field.life;
  swapWeapons(hero);
  assert.equal(skillLevel(hero, 'enchant'), 0);
  tick(.4);
  assert.equal(hero.buffs.enchant, buff);
  assert.equal(buff.rank, 5);
  assert.ok(buff.remaining < duration && buff.remaining > 0);
  assert.ok(combat.classes.summons.includes(summon));
  assert.ok(combat.expansion.pets.pets.includes(pet));
  assert.ok(combat.classes.fields.includes(field) && field.life < life);
  assert.ok(target.hp < target.maxHp);
});
