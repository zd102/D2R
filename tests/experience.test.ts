import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lootLabelPriority, parseLootLabelMode, showLootLabel } from '../src/loot-visibility.ts';
import { skillResourceFeedback } from '../src/skill-feedback.ts';
import { newHero, stats, availableCharges, bindChargedSkill } from '../src/model.ts';
import { BASES, makeItem, type Item } from '../src/items.ts';
import { CATALOG_SPECIALS } from '../src/item-catalog-current.ts';
import { catalogSkill } from '../src/item-effects.ts';
import { consumeCharge } from '../src/item-charges.ts';

const base = (): Item => ({ ...makeItem(BASES[0], 'drop'), rarity: 'common', sockets: 0 });

test('loot focus preserves progression materials and revealed base properties', () => {
  const valuable: Partial<Item>[] = [
    ...(['rare', 'set', 'unique', 'runeword', 'legendary'] as const).map(rarity => ({ rarity })),
    { charm: true, rarity: 'magic' }, { jewel: true, rarity: 'magic' }, { sockets: 3 },
    { ethereal: true }, { baseQuality: 'superior' }, { staffMods: [{ skill: 54, level: 1 }] },
    { autoMod: 'paladin-shield' }, { event: 'wirts-leg' }, { event: 'key-terror' },
  ];
  for (const properties of valuable) {
    const item = { ...base(), ...properties, identified: false };
    assert.ok(showLootLabel({ item }, 'focus'), JSON.stringify(properties));
  }
  assert.ok(showLootLabel({ rune: 'el' }, 'focus'), 'even low runes remain visible');
  for (const rarity of ['common', 'magic'] as const) {
    const item = { ...base(), rarity };
    assert.equal(showLootLabel({ item }, 'focus'), false);
    assert.ok(showLootLabel({ item }, 'all'));
    assert.ok(showLootLabel({ item }, 'focus', true), 'temporary reveal restores filtered labels');
  }
});

test('label priority protects rare rewards when ordinary equipment was dropped first', () => {
  const common = { item: base() }, unique = { item: { ...base(), rarity: 'unique' as const } };
  const rune = { rune: 'el' as const }, key = { item: { ...base(), event: 'key-hate' as const } };
  assert.ok(lootLabelPriority(unique) > lootLabelPriority(common));
  assert.ok(lootLabelPriority(rune) > lootLabelPriority(common));
  assert.ok(lootLabelPriority(key) > lootLabelPriority(unique));
  assert.equal(showLootLabel({}, 'all', true), false, 'supplies keep their existing automatic pickup');
  for (const value of [null, undefined, '', 'invalid', '{}', 'all']) assert.equal(parseLootLabelMode(value), 'all');
  assert.equal(parseLootLabelMode('focus'), 'focus');
});

test('skill resource feedback responds to equipment skill ranks and fractional mana', () => {
  const hero = newHero(); hero.skills.holyBolt = 1; hero.bindings.cleave = 'holyBolt';
  hero.mana = 2;
  assert.equal(skillResourceFeedback(hero, 'cleave', {}).reason, '');
  const boosted = skillResourceFeedback(hero, 'cleave', { allSkills: 2 });
  assert.equal(boosted.cost, 2.125);
  assert.equal(boosted.reason, '法力不足');
  assert.equal(boosted.badge, '缺蓝');
  hero.mana = boosted.cost;
  assert.equal(skillResourceFeedback(hero, 'cleave', { allSkills: 2 }).reason, '');
});

test('zero mana does not mark ordinary attacks or aura toggles as unavailable', () => {
  const hero = newHero(); hero.mana = 0; hero.skills.prayer = 1; hero.bindings.ward = 'prayer';
  for (const active of [null, 'prayer'] as const) {
    hero.activeAura = active;
    const feedback = skillResourceFeedback(hero, 'ward', stats(hero).mods);
    assert.equal(feedback.cost, 0); assert.equal(feedback.reason, '');
    assert.match(feedback.resource, /切换灵气/);
  }
  assert.equal(skillResourceFeedback(hero, 'attack', {}).reason, '');
});

test('charged skills report their own rank and charges independently of mana', () => {
  const hero = newHero(); hero.level = 99; hero.mana = 0;
  const entry = CATALOG_SPECIALS.find(entry => entry.properties.some(([code, param]) => code === 'charged' && catalogSkill(param) === 'teleport'))!;
  const item: Item = { ...base(), slot: 'ring', catalogId: entry.id, requiredLevel: 1, requiredStrength: 0, requiredDexterity: 0 };
  hero.equipment.ring = item;
  const group = availableCharges(hero).find(group => group.id === 'teleport')!;
  assert.ok(bindChargedSkill(hero, 'dash', group.id, group.rank));
  assert.equal(skillResourceFeedback(hero, 'dash', {}).reason, '');
  for (let i = 0; i < group.maximum; i++) assert.ok(consumeCharge([item], group));
  const feedback = skillResourceFeedback(hero, 'dash', {});
  assert.equal(feedback.cost, 0); assert.equal(feedback.reason, '聚气耗尽');
  assert.match(feedback.resource, /聚气 0\//);
  assert.equal(skillResourceFeedback(hero, 'dash', {}, []).reason, '聚气耗尽', 'missing charge sources cannot appear ready');
});
