import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { classFixture } from './class-fixture.ts';
import { MercenaryCombat } from '../src/mercenary-combat.ts';
import { hireMercenary, mercenaryStats, equipMercenary, unequipMercenary, mercenaryEquipmentPreview, setMercenaryDistance } from '../src/mercenary.ts';
import { BASES, makeItem, socketItem, specialItem, itemMods, type Item } from '../src/items.ts';
import { stats, hitChance, gainXp } from '../src/model.ts';
import { xpForLevel, skillValues, emptySkills } from '../src/paladin.ts';

function fixture(t: TestContext) {
  const f = classFixture('sorceress', false); f.hero.level = 90; f.hero.gold = 100000; f.hero.campaign.cleared[0] = 5; f.hero.difficultyLevel = 2;
  hireMercenary(f.hero, true); f.hero.mercenary!.aura = 'prayer';
  f.game.world.canWalk = () => true; f.game.mercenary = new MercenaryCombat(f.game); f.game.mercenary.sync();
  const target = f.enemy(1.6); target.level = 90; target.kind = 'demon'; target.definition = { race: 'demon' } as typeof target.definition;
  t.mock.method(Math, 'random', () => .1);
  const equip = (item: Item) => { item.identified = true; f.hero.inventory.push(item); assert.ok(equipMercenary(f.hero, item.id), item.name); return item; };
  const unique = (id: string) => equip(specialItem(id, () => .5));
  const damage = () => { target.hp = target.maxHp; target.dead = false; const hp = target.hp; f.game.mercenary.strike(target); return hp - target.hp; };
  t.after(() => f.game.mercenary.clear());
  return { ...f, target, equip, unique, damage, merc: f.game.mercenary as MercenaryCombat };
}
function runeword(code: string, runes: Parameters<typeof socketItem>[1][]) {
  const item = makeItem(BASES.find(base => base.baseCode === code)!); item.sockets = runes.length;
  for (const rune of runes) assert.ok(socketItem(item, rune, () => .5)); return item;
}

test('real Reaper’s Toll increases damage, steals life and triggers Decrepify only while worn', t => {
  const f = fixture(t), bare = f.damage(), playerHp = f.hero.hp, weapon = f.unique('unique-327');
  f.hero.mercenary!.hp = 100; const armed = f.damage();
  assert.ok(armed > bare * 3); assert.ok(f.hero.mercenary!.hp > 100); assert.equal(f.hero.hp, playerHp);
  assert.equal(f.combat.itemCurses.get(f.target)?.kind, 'decrepify');
  const durability = weapon.durability; for (let i = 0; i < 10; i++) f.damage(); assert.equal(weapon.durability, durability);
  assert.ok(unequipMercenary(f.hero, 'weapon')); f.combat.itemCurses.delete(f.target); f.target.coldTime = 0;
  assert.equal(f.damage(), bare); assert.equal(f.combat.itemCurses.has(f.target), false);
});

test('Duriel’s Shell grants per-level life, armor, elemental resistance and Cannot Be Frozen', t => {
  const f = fixture(t), before = mercenaryStats(f.hero), player = stats(f.hero); f.unique('unique-217');
  const after = mercenaryStats(f.hero);
  assert.equal(after.maxHp - before.maxHp, 90); assert.ok(after.defense > before.defense + 500);
  assert.equal(after.resistances.fire - before.resistances.fire, 20); assert.equal(after.resistances.cold - before.resistances.cold, 50);
  f.hero.mercenary!.hp = after.maxHp; f.merc.hurt(100, 'cold'); const protectedLoss = after.maxHp - f.hero.mercenary!.hp; assert.equal(f.hero.mercenary!.cold, 0);
  assert.equal(stats(f.hero).maxHp, player.maxHp); assert.ok(unequipMercenary(f.hero, 'armor'));
  f.hero.mercenary!.hp = before.maxHp; f.merc.hurt(100, 'cold'); assert.ok(before.maxHp - f.hero.mercenary!.hp > protectedLoss); assert.ok(f.hero.mercenary!.cold > 0);
});

test('crafted Bulwark applies physical reduction, life leech and regeneration without vitality life', t => {
  const f = fixture(t), before = mercenaryStats(f.hero), helm = f.equip(runeword('msk', ['shael', 'io', 'sol']));
  assert.equal(helm.catalogId, 'd2r-Bulwark'); const mods = itemMods(helm), after = mercenaryStats(f.hero);
  assert.equal(after.maxHp, Math.floor(before.maxHp * (1 + mods.maxLifePercent! / 100))); assert.ok(after.mods.lifeSteal! > 0);
  f.hero.mercenary!.hp = 1000; f.merc.hurt(100, 'physical');
  assert.ok(Math.abs(1000 - f.hero.mercenary!.hp - (100 - mods.damageReductionFlat!) * (1 - mods.damageReduction! / 100)) < 1e-8);
  f.game.inCamp = true; f.hero.mercenary!.hp = 100; f.merc.pulseTimer = 100; f.merc.update(1);
  assert.ok(Math.abs(f.hero.mercenary!.hp - 100 - after.lifeRegen) < 1e-8);
});

test('crafted Insight grants actual critical strikes and party mana regeneration, removed with the weapon', t => {
  const f = fixture(t), playerRegen = stats(f.hero).manaRegen, weapon = f.equip(runeword('vou', ['ral', 'tir', 'tal', 'sol']));
  assert.equal(weapon.catalogId, 'Runeword62'); assert.ok(mercenaryStats(f.hero).criticalStrike > 0); assert.ok(stats(f.hero).manaRegen > playerRegen * 3);
  const mod = weapon.mods!.grantedCriticalStrike; weapon.mods!.grantedCriticalStrike = 0; const normal = f.damage(); weapon.mods!.grantedCriticalStrike = mod;
  const critical = f.damage(); assert.ok(critical > normal * 1.6);
  assert.ok(unequipMercenary(f.hero, 'weapon')); assert.equal(stats(f.hero).manaRegen, playerRegen);
});

test('attack rating, Jab and Blessed Aim add percentages and include demon-specific equipment accuracy', t => {
  const f = fixture(t), weapon = f.equip(makeItem(BASES.find(base => base.baseCode === 'spr')!)); f.hero.mercenary!.aura = 'blessedAim';
  f.target.defense = 1800; const s = mercenaryStats(f.hero), jab = skillValues('jab', 1 + Math.floor(f.hero.level / 5), emptySkills());
  const correctChance = hitChance(s.baseAttackRating * (1 + (s.attackRatingBonus + jab.attack) / 100), f.target.defense, 90, 90);
  const oldChance = hitChance(s.attackRating * (1 + jab.attack / 100), f.target.defense, 90, 90);
  assert.ok(oldChance > correctChance); t.mock.method(Math, 'random', () => (correctChance + oldChance) / 200);
  assert.equal(f.damage(), 0); weapon.mods = { attackDemons: 5000 }; assert.ok(f.damage() > 0);
});

test('life-steal strike does not clamp a level-up heal back to the previous maximum', t => {
  const f = fixture(t); f.hero.level = 89; f.hero.xp = xpForLevel(89) - 1; f.unique('unique-327'); f.hero.mercenary!.hp = 10; f.target.hp = 1;
  f.game.killEnemy = (enemy: typeof f.target) => { enemy.dead = true; gainXp(f.hero, 1); };
  f.merc.strike(f.target); assert.equal(f.hero.level, 90); assert.equal(f.hero.mercenary!.hp, mercenaryStats(f.hero).maxHp);
});

test('equipment previews match actual equips, preserve the character and retain aura distance', t => {
  const f = fixture(t), armor = specialItem('unique-217', () => .5); armor.identified = true;
  f.hero.classId = 'paladin'; f.hero.skills.might = 20; f.hero.activeAura = 'might'; setMercenaryDistance(f.hero, 100);
  const before = structuredClone(f.hero), preview = mercenaryEquipmentPreview(f.hero, armor)!; assert.deepEqual(f.hero, before);
  f.equip(armor); const equipped = mercenaryStats(f.hero);
  assert.equal(preview.attack, equipped.attack); assert.equal(preview.maxHp, equipped.maxHp); assert.equal(preview.defense, equipped.defense);
});
