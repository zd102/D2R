import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHero, gainXp, allocateAttribute, learnSkill, respec, parseSave, serializeSave } from '../src/model.ts';
import { CLASS_IDS, CLASSES } from '../src/classes.ts';
import { EXPERIENCE, skillsForClass, type Attribute } from '../src/paladin.ts';

for (const classId of CLASS_IDS) test(`${classId}: unlimited respec preserves points, permanent bonuses and old saves`, () => {
  let hero = newHero(classId); gainXp(hero, EXPERIENCE[29]);
  hero.questRewards = ['0:shrine0', '0:jungle', '1:jungle'];
  hero.respecUsed = [0, 1, 2];
  const attributes = Object.keys(CLASSES[classId].attributes) as Attribute[];
  for (const key of attributes) hero[key] += 10;
  const points = hero.points, skillPoints = hero.skillPoints;
  const skill = skillsForClass(classId).find(skill => skill.level === 1)!;
  for (let i = 0; i < 10; i++) {
    for (const key of attributes) assert.ok(allocateAttribute(hero, key, 5));
    assert.ok(learnSkill(hero, skill.id));
    hero.bindings.bolt = skill.id;
    hero.holyShield = 30; hero.holyShieldLevel = 1;
    hero.buffs = { [skill.id]: { remaining: 30, rank: 1 } };
    assert.ok(respec(hero));
    assert.equal(hero.points, points); assert.equal(hero.skillPoints, skillPoints);
    for (const key of attributes) assert.equal(hero[key], CLASSES[classId].attributes[key] + 10);
    assert.ok(Object.values(hero.skills).every(rank => rank === 0));
    assert.ok(Object.values(hero.bindings).every(binding => binding === 'attack'));
    assert.equal(hero.activeAura, null); assert.equal(hero.holyShield, 0); assert.deepEqual(hero.buffs, {});
    assert.deepEqual(hero.respecUsed, [0, 1, 2]);
    hero = parseSave(serializeSave(hero))!;
    assert.ok(respec(hero));
    assert.equal(hero.points, points); assert.equal(hero.skillPoints, skillPoints);
  }
  hero.difficultyLevel = 1;
  const before = structuredClone(hero);
  assert.equal(respec(hero), false); assert.deepEqual(hero, before);
  hero.questRewards.push('1:shrine0'); assert.ok(respec(hero)); assert.ok(respec(hero));
});
