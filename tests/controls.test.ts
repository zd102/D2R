import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKILL_SLOTS, SKILL_KEYS, KEYBOARD_SKILLS, emptyCooldowns } from '../src/controls.ts';
import { newHero, parseSave, serializeSave, bindSkill } from '../src/model.ts';

test('six skill slots agree across new characters, default keys and cooldowns', () => {
  const hero = newHero();
  assert.deepEqual(Object.keys(hero.bindings), [...SKILL_SLOTS]);
  assert.deepEqual(Object.keys(emptyCooldowns()), [...SKILL_SLOTS]);
  assert.deepEqual(SKILL_SLOTS.map(slot => SKILL_KEYS[slot]), ['鼠左', 'Q', 'W', 'E', 'R', '鼠右']);
  assert.deepEqual(Object.keys(KEYBOARD_SKILLS), ['q', 'w', 'e', 'r']);
  assert.equal(hero.bindings.ward, 'attack');
});

test('five-slot saves gain an unassigned W slot without changing existing skill choices', () => {
  const hero = newHero(); hero.level = 10; hero.skills.holyBolt = 1; hero.skills.smite = 1; hero.skills.sacrifice = 1;
  hero.bindings.cleave = 'holyBolt'; hero.bindings.nova = 'smite'; hero.bindings.dash = 'sacrifice'; hero.bindings.bolt = 'holyBolt';
  const old = JSON.parse(serializeSave(hero)); delete old.hero.bindings.ward;
  const loaded = parseSave(JSON.stringify(old))!; assert.ok(loaded);
  for (const [slot, value] of Object.entries(old.hero.bindings)) assert.equal(loaded.bindings[slot as keyof typeof loaded.bindings], value);
  assert.equal(loaded.bindings.ward, 'attack');
  assert.ok(bindSkill(loaded, 'ward', 'holyBolt')); assert.equal(parseSave(serializeSave(loaded))!.bindings.ward, 'holyBolt');
  assert.equal(bindSkill(loaded, 'ward', 'holyShield'), false, 'unlearned skills remain unavailable');
});
