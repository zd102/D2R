import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKILL_SLOTS, SKILL_KEYS, KEYBOARD_SKILLS, emptyCooldowns, keyboardSkills, skillKeys, skillSlotNames, movementInput, parseMovementMode } from '../src/controls.ts';
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

test('WASD reserves movement keys and maps all six existing skill slots to Q/E/R/Space and mouse', () => {
  const keys = keyboardSkills('wasd');
  assert.deepEqual(keys, { q: 'cleave', e: 'ward', r: 'nova', ' ': 'dash' });
  for (const key of ['w', 'a', 's', 'd']) assert.equal(keys[key], undefined);
  assert.deepEqual(SKILL_SLOTS.map(slot => skillKeys('wasd')[slot]), ['鼠左', 'Q', 'E', 'R', '空格', '鼠右']);
  for (const slot of SKILL_SLOTS) assert.ok(skillSlotNames('wasd')[slot].endsWith(skillKeys('wasd')[slot]));
  assert.deepEqual(keyboardSkills('mouse'), KEYBOARD_SKILLS);
  assert.deepEqual(skillKeys('mouse'), SKILL_KEYS);
});

test('WASD supports eight screen directions, opposing keys cancel, and arrow aliases do not add speed', () => {
  for (const [keys, x, y] of [['w', 0, -1], ['d', 1, 0], ['s', 0, 1], ['a', -1, 0], ['wd', 1, -1], ['sd', 1, 1], ['sa', -1, 1], ['wa', -1, -1], ['ws', 0, 0], ['ad', 0, 0]] as const) {
    assert.deepEqual(movementInput(new Set(keys), 'wasd'), { x, y }, keys);
    assert.deepEqual(movementInput(new Set(keys), 'mouse'), { x: 0, y: 0 });
  }
  assert.deepEqual(movementInput(new Set(['arrowup', 'w', 'arrowright', 'd']), 'wasd'), { x: 1, y: -1 });
  assert.deepEqual(movementInput(new Set(['arrowup', 'arrowleft']), 'mouse'), { x: -1, y: -1 });
});

test('missing or invalid local control settings preserve the existing mouse mode', () => {
  for (const value of [null, undefined, '', 'invalid', '{}', 'mouse']) assert.equal(parseMovementMode(value), 'mouse');
  assert.equal(parseMovementMode('wasd'), 'wasd');
});
