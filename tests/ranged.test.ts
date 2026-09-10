import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PaladinCombat } from '../src/combat.ts';
import { newHero, stats, serializeSave, parseSave, repairEquipment, repairCost } from '../src/model.ts';
import { BASES, makeItem, specialItem, itemMods, maxQuantity, quantityLeft } from '../src/items.ts';
import { RANGED_BASES } from '../src/ranged-data.ts';
import { ammunition, clearShot } from '../src/ranged.ts';
import { CATALOG_SPECIALS } from '../src/item-catalog-data.ts';
import { itemModifierLines, itemWeaponDamage } from '../src/item-description.ts';
import type { Enemy, Game } from '../src/game.ts';

function fixture(code = 'sbw') {
  const hero = newHero(); hero.level = 80; hero.strength = hero.dexterity = 200;
  hero.equipment.weapon = makeItem(BASES.find(base => base.baseCode === code)!); hero.equipment.shield = null;
  hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana;
  const messages: string[] = [];
  const game: any = { hero, world: { scene: new THREE.Scene(), grid: { width: 81, height: 81, isWalkableAt: () => true } },
    position: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 12), actor: { group: new THREE.Group() }, body: new CANNON.Body({ mass: 1 }),
    enemies: [], effects: [], paused: false, dead: false, time: 0, invincible: 0, attackTime: 0, path: [], cooldowns: {},
    begin() {}, save() {}, releaseInput() {}, burst() {}, beam() {}, audio: { play() {} },
    ui: { toast(message: string) { messages.push(message); }, floatText() {}, flashDamage() {}, openPanel() {} },
    killEnemy(enemy: Enemy) { enemy.dead = true; }, disposeObject(mesh: THREE.Mesh) { mesh.removeFromParent(); },
  };
  const combat = new PaladinCombat(game as Game); game.combat = combat;
  const enemy = (z = 8, x = 0) => {
    const group = new THREE.Group(); group.position.set(x, 0, z);
    const target = { id: game.enemies.length + 1, name: 'Target', kind: 'demon', level: 1, defense: 0, attackRating: 10,
      hp: 10000, maxHp: 10000, damage: 1, speed: 1, actor: { group }, body: new CANNON.Body({ mass: 1 }),
      resistances: { physical: 0, magic: 0, fire: 0, cold: 0, lightning: 0, poison: 0 }, dead: false, boss: false,
      converted: 0, stunned: 0, coldTime: 0, bleed: 0, redeemed: false, cooldown: 0, attackTime: 0, path: [], rethink: 0 } as unknown as Enemy;
    target.body.position.set(x, .5, z); game.enemies.push(target); return target;
  };
  return { game, hero, combat, enemy, messages };
}

test('all imported ranged weapons have valid original damage, attribute ratios and stack sizes', () => {
  assert.equal(Object.keys(RANGED_BASES).length, 72);
  for (const [code, base] of Object.entries(RANGED_BASES)) {
    assert.ok(BASES.some(item => item.baseCode === code), code);
    assert.ok(base.min > 0 && base.max >= base.min, code);
    assert.equal(base.strength + base.dexterity, base.stack ? code.startsWith('am') ? 130 : 150 : 100, code);
  }
  const { hero } = fixture('jav'), s = stats(hero);
  assert.equal(s.rangedMin, 6); assert.equal(s.rangedMax, 14); assert.equal(maxQuantity(hero.equipment.weapon!), 60);
  assert.equal(s.damageBonus, 300); assert.equal(itemWeaponDamage(hero.equipment.weapon!, 80, {}), '6 - 14');
});

test('bows attack at range and apply damage only when the arrow reaches its target', t => {
  t.mock.method(Math, 'random', () => .5);
  const { combat, hero, enemy } = fixture(), target = enemy();
  assert.ok(combat.canReach(target, 'attack')); assert.equal(combat.reach('attack'), 14);
  combat.castAction('attack', true);
  assert.equal(hero.ammo.arrows, 60); assert.equal(hero.ammo.bolts, 60); assert.equal(target.hp, 10000);
  combat.update(.1); assert.equal(target.hp, 10000);
  combat.update(.5); assert.ok(target.hp < 10000); assert.equal(combat.projectiles.length, 0);
});

test('shield damage remains strength based with a javelin, and flat minimum damage cannot invert a ranged range', t => {
  t.mock.method(Math, 'random', () => .5);
  const run = (code: string) => {
    const { combat, hero, enemy } = fixture(code), target = enemy(1);
    hero.equipment.shield = newHero().equipment.shield; hero.skills.smite = 1;
    combat.castAction('smite', true); return target.hp;
  };
  assert.equal(run('jav'), run('ssd'));
  const { hero } = fixture(); hero.equipment.weapon!.mods = { minDamage: 30 };
  assert.ok(stats(hero).attackMax >= stats(hero).attackMin);
});

test('crossbows use bolts, dexterity scaling and a distinct attack cadence', t => {
  t.mock.method(Math, 'random', () => .5);
  const { combat, hero, enemy } = fixture('lxb'); enemy();
  const before = stats(hero).attack; hero.strength += 100; assert.equal(stats(hero).attack, before);
  hero.dexterity += 100; assert.ok(stats(hero).attack > before);
  combat.castAction('attack', true); assert.equal(hero.ammo.arrows, 60); assert.equal(hero.ammo.bolts, 60);
  assert.equal(combat.lock, stats(hero).rangedFrames / 25);
});

test('all ranged weapons keep firing with zero legacy reserves and never charge refill fees', t => {
  t.mock.method(Math, 'random', () => .5);
  for (const code of ['sbw', 'lxb', 'jav', 'tkf', 'tax']) {
    const { combat, hero, enemy } = fixture(code), weapon = hero.equipment.weapon!; enemy();
    hero.ammo = { arrows: 0, bolts: 0 }; weapon.quantity = 0;
    for (let shot = 0; shot < 20; shot++) {
      assert.equal(combat.castAction('attack', true), true);
      combat.update(Math.max(.6, combat.cooldown('attack')));
    }
    assert.equal(ammunition(hero), Infinity);
    assert.equal(weapon.quantity, 0); assert.deepEqual(hero.ammo, { arrows: 0, bolts: 0 });
    assert.equal(repairCost(hero), 0); hero.gold = 10; assert.ok(repairEquipment(hero)); assert.equal(hero.gold, 10);
    if (weapon.maxDurability) {
      weapon.durability = weapon.maxDurability - 1;
      assert.ok(repairCost(hero) > 0, 'real durability still needs repair');
    }
  }
});

test('unlimited ammo does not bypass incompatible weapon or mana requirements', () => {
  const { combat, hero, enemy } = fixture(); enemy(); hero.ammo.arrows = 0;
  const mana = hero.mana; assert.ok(combat.castAction('attack', true)); assert.equal(hero.mana, mana);
  combat.lock = 0; hero.skills.zeal = 4; assert.equal(combat.castAction('zeal', true), false);
  assert.equal(combat.zeal, null); assert.equal(hero.mana, mana);
  hero.skills.holyBolt = 1; hero.mana = 0; assert.equal(combat.castAction('holyBolt', true), false);
});

test('arrows hit the first body along the path even when enemy array order is reversed', t => {
  t.mock.method(Math, 'random', () => .5);
  const { combat, enemy } = fixture(), farther = enemy(10), nearer = enemy(4);
  combat.castAction('attack', true); combat.update(.8);
  assert.equal(farther.hp, 10000); assert.ok(nearer.hp < 10000);
});

test('piercing arrows hit each crossed target once and do not become repeated damage beams', t => {
  t.mock.method(Math, 'random', () => .5);
  const { combat, hero, enemy } = fixture(), farther = enemy(10), nearer = enemy(4);
  hero.equipment.weapon!.mods = { pierceChance: 100 };
  combat.castAction('attack', true); combat.update(.8);
  assert.ok(nearer.hp < 10000); assert.equal(farther.hp, nearer.hp);
  const hp = nearer.hp; combat.update(.5); assert.equal(nearer.hp, hp); assert.equal(combat.projectiles.length, 0);
});

test('misses and moving out of an arrow trajectory deal no weapon damage', t => {
  t.mock.method(Math, 'random', () => .999);
  const { combat, enemy } = fixture(), target = enemy(); combat.castAction('attack', true); combat.update(1); assert.equal(target.hp, 10000);
  t.mock.method(Math, 'random', () => .5);
  combat.lock = 0; combat.castAction('attack', true); target.actor.group.position.x = 3; combat.update(1); assert.equal(target.hp, 10000);
});

test('thin walls stop fast arrows and large simulation steps do not tunnel through them', t => {
  t.mock.method(Math, 'random', () => .5);
  const { combat, game, enemy } = fixture(), target = enemy();
  game.world.grid.isWalkableAt = (_x: number, z: number) => z !== 44;
  assert.equal(clearShot(game.world.grid, game.position, target.actor.group.position), false);
  assert.equal(combat.canReach(target, 'attack'), false);
  combat.castAction('attack', true); combat.update(1); assert.equal(target.hp, 10000); assert.equal(combat.projectiles.length, 0);
});

test('arrows keep their offensive equipment snapshot after the player swaps weapons', t => {
  t.mock.method(Math, 'random', () => .5);
  const run = (swap: boolean) => {
    const { combat, hero, enemy } = fixture(), target = enemy();
    hero.equipment.weapon!.mods = { damage: 100, fireMinDamage: 10, fireMaxDamage: 10, fireSkillDamage: 20 };
    combat.castAction('attack', true);
    if (swap) { hero.equipment.weapon = makeItem(BASES[0]); hero.equipment.weapon.mods = { damage: 900, fireSkillDamage: 500 }; }
    combat.update(.6); return target.hp;
  };
  assert.equal(run(false), run(true));
});

test('named magic-arrow bows need no arrows and convert part of physical damage to magic', t => {
  t.mock.method(Math, 'random', () => .5);
  const { combat, hero, enemy } = fixture(), target = enemy();
  const bow = specialItem(CATALOG_SPECIALS.find(entry => entry.key === 'Whichwild String')!.id); bow.identified = true;
  hero.equipment.weapon = bow; hero.ammo.arrows = 0; target.resistances.physical = 100;
  assert.equal(itemMods(bow).magicArrowLevel, 20); combat.castAction('attack', true); assert.equal(combat.projectiles.length, 1);
  combat.update(.6); assert.ok(target.hp < 10000); assert.equal(hero.ammo.arrows, 0);
  assert.ok(itemModifierLines(bow).some(line => line.text.includes('魔法箭等级') && !line.text.includes('未生效')));
});

test('in-flight life steal uses the current resource cap without rolling back health after a gear change', t => {
  t.mock.method(Math, 'random', () => .5);
  const { combat, hero, enemy } = fixture(); enemy();
  hero.equipment.weapon!.mods = { lifeSteal: 100 };
  combat.castAction('attack', true);
  hero.equipment.weapon = makeItem(BASES.find(base => base.baseCode === 'ssd')!);
  hero.equipment.weapon.mods = { life: 300, mana: 300 };
  const live = stats(hero); hero.hp = live.maxHp; hero.mana = live.maxMana;
  combat.update(.6); assert.equal(hero.hp, live.maxHp); assert.equal(hero.mana, live.maxMana);
});

test('exploding arrows damage nearby targets but explosions cannot cross walls', t => {
  t.mock.method(Math, 'random', () => .5);
  const { combat, hero, game, enemy } = fixture(), target = enemy(6), neighbor = enemy(6, 1), hidden = enemy(6, -2);
  hero.equipment.weapon!.mods = { explosiveArrowLevel: 7, fireMinDamage: 10, fireMaxDamage: 10 };
  game.world.grid.isWalkableAt = (x: number) => x !== 39;
  combat.castAction('attack', true); assert.equal(target.hp, 10000); assert.equal(neighbor.hp, 10000);
  combat.update(.6); assert.ok(target.hp < neighbor.hp); assert.ok(neighbor.hp < 10000); assert.equal(hidden.hp, 10000);
});

test('ranged crushing blow removes half the melee fraction and physical immunity still applies', t => {
  t.mock.method(Math, 'random', () => .5);
  const { combat, hero, enemy } = fixture(), target = enemy(); hero.equipment.weapon!.mods = { crushingBlow: 100 };
  const physical = Math.floor(stats(hero).attack); combat.castAction('attack', true); combat.update(.6);
  assert.equal(10000 - target.hp, 1250 + physical);
});

test('holy bolt heals a converted ally along the trajectory and never hurts living demons', t => {
  t.mock.method(Math, 'random', () => .5);
  const { combat, hero, enemy } = fixture(), demon = enemy(2), ally = enemy(5); ally.converted = 10; ally.hp = 200;
  hero.skills.holyBolt = 1; combat.castAction('holyBolt', true); combat.update(.6);
  assert.equal(demon.hp, 10000); assert.ok(ally.hp > 200); assert.equal(combat.projectiles.length, 0);
});

test('Fist of Heavens creates traveling holy bolts and rejects blocked direct targets without spending mana', t => {
  t.mock.method(Math, 'random', () => .5);
  const { combat, hero, game, enemy } = fixture(), target = enemy(5), undead = enemy(8); undead.kind = 'skeleton';
  hero.skills.fistOfHeavens = 1; game.aim.set(0, 0, 5); game.target = target;
  combat.castAction('fistOfHeavens', true); assert.ok(target.hp < 10000); assert.equal(undead.hp, 10000); assert.equal(combat.projectiles.length, 1);
  combat.update(.3); assert.ok(undead.hp < 10000);
  combat.lock = combat.fohDelay = 0; game.world.grid.isWalkableAt = (_x: number, z: number) => z !== 42;
  const mana = hero.mana; combat.castAction('fistOfHeavens', true); assert.equal(hero.mana, mana); assert.equal(combat.fohDelay, 0);
});

test('arrow reserves, depleted throwing stacks, new modifiers and old saves survive parsing', () => {
  const { hero } = fixture('jav'); hero.ammo = { arrows: 0, bolts: 7 }; hero.equipment.weapon!.quantity = 0;
  const restored = parseSave(serializeSave(hero))!; assert.deepEqual(restored.ammo, hero.ammo); assert.equal(quantityLeft(restored.equipment.weapon!), 0);
  const old = JSON.parse(serializeSave(hero)); delete old.hero.ammo; delete old.hero.equipment.weapon.quantity;
  const migrated = parseSave(JSON.stringify(old))!; assert.deepEqual(migrated.ammo, { arrows: 60, bolts: 60 }); assert.equal(quantityLeft(migrated.equipment.weapon!), 60);
  old.hero.ammo = { arrows: -5, bolts: 10000 }; assert.deepEqual(parseSave(JSON.stringify(old))!.ammo, { arrows: 0, bolts: 600 });
  const bow = specialItem(CATALOG_SPECIALS.find(entry => entry.key === 'Whichwild String')!.id); bow.catalogVersion = 1; delete bow.mods!.magicArrowLevel;
  old.hero.equipment.weapon = bow; assert.equal(parseSave(JSON.stringify(old))!.equipment.weapon!.mods!.magicArrowLevel, 20);
});

test('Fist of Heavens bolts can leave an undead impact target and hit the surrounding group', t => {
  t.mock.method(Math, 'random', () => .5);
  const { combat, hero, game, enemy } = fixture(), target = enemy(5), left = enemy(5, -3), right = enemy(5, 3);
  for (const monster of [target, left, right]) monster.kind = 'skeleton';
  hero.skills.fistOfHeavens = 1; game.aim.set(0, 0, 5);
  combat.castAction('fistOfHeavens', true); assert.equal(combat.projectiles.length, 3);
  combat.update(.3); assert.ok(left.hp < 10000); assert.equal(right.hp, left.hp);
  combat.lock = combat.fohDelay = 0; game.aim.set(0, 0, 13); enemy(13);
  const mana = hero.mana; combat.castAction('fistOfHeavens', true); assert.equal(hero.mana, mana);
});
