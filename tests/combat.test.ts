import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PaladinCombat } from '../src/combat.ts';
import { newHero, gainXp, learnSkill, stats, setAura } from '../src/model.ts';
import { SKILLS, EXPERIENCE } from '../src/paladin.ts';
import { makeItem, BASES, specialItem } from '../src/items.ts';
import { CATALOG_SPECIALS } from '../src/item-catalog-data.ts';
import type { Game, Enemy } from '../src/game.ts';
import { MONSTERS, BOSSES } from '../src/bestiary.ts';
import { elementalDamage } from '../src/affixes.ts';

function setup() {
  const hero = newHero(); gainXp(hero, EXPERIENCE[79]); for (const skill of SKILLS) learnSkill(hero, skill.id);
  hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana;
  const world = { scene: new THREE.Scene(), grid: { width: 57, height: 57, isWalkableAt: () => true }, path: () => [] };
  const game: any = { hero, world, position: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 10), actor: { group: new THREE.Group() }, body: new CANNON.Body({ mass: 1 }), enemies: [], effects: [], paused: false, dead: false, time: 0, invincible: 0, attackTime: 0, target: undefined, path: [], cooldowns: { attack: 0, cleave: 0, nova: 0, dash: 0, bolt: 0 },
    begin() {}, save() {}, releaseInput() {}, burst() {}, beam() {}, audio: { play() {} }, ui: { floatText() {}, toast() {}, flashDamage() {}, openPanel() {} }, killEnemy(enemy: Enemy) { enemy.dead = true; }, disposeObject(mesh: THREE.Mesh) { mesh.removeFromParent(); }, nearestEnemy(range: number) { return this.enemies.find((enemy: Enemy) => !enemy.dead && !enemy.converted && enemy.actor.group.position.distanceTo(this.position) < range); } };
  const combat = new PaladinCombat(game as Game); game.combat = combat;
  const enemy = (kind: Enemy['kind'] = 'demon', z = 2) => {
    const group = new THREE.Group(); group.position.z = z;
    const e = { id: game.enemies.length, name: 'Target', kind, level: 10, defense: 1, attackRating: 100, hp: 10000, maxHp: 10000, damage: 10, speed: 2, body: new CANNON.Body({ mass: 1 }), actor: { group }, resistances: { physical: 0, magic: 0, fire: 0, cold: 0, lightning: 0, poison: 0 }, dead: false, boss: false, converted: 0, stunned: 0, coldTime: 0, bleed: 0, redeemed: false, cooldown: 0, attackTime: 0, path: [], rethink: 0 } as unknown as Enemy;
    game.enemies.push(e); return e;
  };
  return { game, hero, combat, enemy };
}

test('crushing blow uses monster spawn pp even after the selected setting changes', t => {
  t.mock.method(Math, 'random', () => 0);
  const { hero, combat, enemy } = setup();
  hero.equipment.weapon!.mods.crushingBlow = 100;
  const amounts: number[] = [];
  t.mock.method(combat, 'damage', (_enemy: Enemy, amount: number) => { amounts.push(amount); return amount; });
  for (const players of [1, 8] as const) {
    const target = enemy(); target.playerCount = players; target.hp = 10000 * (players + 1) / 2;
    hero.playerCount = players === 1 ? 8 : 1;
    amounts.length = 0; combat.weaponHit(target, 'attack');
    assert.equal(amounts[0], 2500);
  }
});

test('mouse-aimed spells and melee face the cursor instead of a previously selected target', t => {
  t.mock.method(Math, 'random', () => .5);
  const { game, combat, enemy } = setup(), stale = enemy('demon', -2), forward = enemy('demon', 2);
  game.target = stale; game.aim.set(0, 0, 8);
  combat.castAction('holyBolt', true);
  assert.deepEqual(combat.projectiles[0].direction.toArray(), [0, 0, 1]); assert.equal(game.actor.group.rotation.y, 0);
  combat.castAction('attack', true);
  assert.equal(stale.hp, 10000); assert.ok(forward.hp < 10000);
  game.aim.copy(game.position); game.actor.group.rotation.y = Math.PI / 2;
  combat.update(combat.cooldown('holyBolt')); combat.castAction('holyBolt', true);
  assert.ok(combat.projectiles.at(-1)!.direction.x > .999, 'aiming at the feet retains the current facing');
});

test('aimed Fist of Heavens selects the pointed enemy and does not consume mana for an empty direction', () => {
  const { game, hero, combat, enemy } = setup(), stale = enemy('demon', 3), pointed = enemy('demon', 8);
  game.target = stale; game.aim.set(0, 0, 8); combat.castAction('fistOfHeavens', true);
  assert.equal(stale.hp, 10000); assert.ok(pointed.hp < 10000);
  combat.lock = combat.fohDelay = 0; game.aim.set(8, 0, 0); const mana = hero.mana;
  combat.castAction('fistOfHeavens', true); assert.equal(hero.mana, mana);
});

test('aimed charge uses the pointer distance and still respects blocked ground', () => {
  const { game, combat, enemy } = setup(); game.target = enemy('demon', 1); game.aim.set(6, 0, 0);
  combat.castAction('charge', true); assert.equal(game.position.x, 6); assert.equal(game.position.z, 0);
  assert.equal(game.actor.group.rotation.y, Math.PI / 2);
  combat.lock = 0; game.aim.set(10, 0, 0); game.world.grid.isWalkableAt = (x: number) => x < 36;
  combat.castAction('charge', true); assert.ok(game.position.x < 7.5, 'charge stops before the blocked cell');
});

test('mouse-aimed zeal tracks the current pointer between hits while auto targeting remains available', t => {
  t.mock.method(Math, 'random', () => .5);
  const { game, hero, combat, enemy } = setup(), front = enemy('demon', 2), back = enemy('demon', -2);
  hero.skills.zeal = 4; game.target = back; game.aim.set(0, 0, 8);
  combat.castAction('zeal', true); combat.update(.01);
  assert.ok(front.hp < 10000); assert.equal(back.hp, 10000);
  const hp = front.hp; game.aim.set(0, 0, -8); combat.update(1);
  assert.equal(front.hp, hp); assert.ok(back.hp < 10000); assert.ok(Math.abs(game.actor.group.rotation.y) > 3);
});

test('affix elemental rolls damage physical immunes, while cold immunes do not get chilled', t => {
  t.mock.method(Math, 'random', () => .5);
  const { hero, combat, enemy } = setup(), target = enemy(); target.resistances.physical = 100; target.resistances.cold = 100;
  hero.equipment.weapon!.mods = { fireMinDamage: 5, fireMaxDamage: 10, coldMinDamage: 5, coldMaxDamage: 10, coldDuration: 6 };
  combat.melee('attack', new THREE.Vector3(0, 0, 1));
  assert.equal(10000 - target.hp, elementalDamage(hero.equipment.weapon!.mods, 'fire', () => .5));
  assert.equal(target.coldTime, 0);
  target.resistances.cold = 0; hero.difficultyLevel = 2; combat.melee('attack', new THREE.Vector3(0, 0, 1)); assert.equal(target.coldTime, 1.5);
});

test('elemental equipment bonuses affect real spell hits, aura pulses and poison snapshots without breaking immunity alone', t => {
  t.mock.method(Math, 'random', () => .5);
  const { hero, combat, enemy } = setup(), target = enemy();
  hero.equipment.weapon!.mods = { lightningSkillDamage: 20, lightningPierce: 25, poisonSkillDamage: 25, poisonPierce: 20, poisonMinRate: 256, poisonMaxRate: 256, poisonFrames: 100 };
  target.resistances.lightning = 50; assert.equal(combat.damage(target, 100, 'lightning'), 90);
  target.resistances.lightning = 110; assert.equal(combat.damage(target, 100, 'lightning'), 0);
  hero.skills.conviction = 20; setAura(hero, 'conviction'); assert.equal(combat.damage(target, 100, 'lightning'), 48);
  target.actor.group.position.z = 20; assert.equal(combat.damage(target, 100, 'lightning'), 0);
  target.actor.group.position.z = 2; setAura(hero, null); target.resistances.poison = 60;
  combat.melee('attack', new THREE.Vector3(0, 0, 1)); assert.equal(target.poison!.dps, 18.75);
  hero.equipment.weapon!.mods = { aura_holyFire: 10, fireSkillDamage: 20, firePierce: 25 };
  target.resistances.fire = 50; const aura = stats(hero).auras.find(aura => aura.id === 'holyFire')!;
  const hp = target.hp; combat.pulse(); assert.equal(hp - target.hp, Math.floor((aura.min + aura.max) / 2 * 1.2 * .75));
});

test('percentage and flat absorb heal before damage and do not convert elemental damage into mana', () => {
  const { hero, combat, game } = setup(); hero.hp = 100; hero.mana = 0;
  hero.equipment.weapon!.mods = { fireAbsorb: 20, fireAbsorbFlat: 5, damageToMana: 50 };
  combat.hurt(100, 'fire'); assert.equal(hero.hp, 50); assert.equal(hero.mana, 0);
  game.invincible = 0; combat.hurt(20, 'physical'); assert.equal(hero.hp, 30); assert.equal(hero.mana, 10);
});

test('slow-target has a boss cap, expires and never permanently modifies monster base speed', t => {
  t.mock.method(Math, 'random', () => .5);
  const { hero, combat, enemy } = setup(), target = enemy(); hero.equipment.weapon!.mods = { slowTarget: 90 };
  combat.melee('attack', new THREE.Vector3(0, 0, 1)); assert.equal(target.slow!.percent, 90); assert.equal(target.speed, 2);
  target.boss = true; target.slow = undefined;
  // This fixture deliberately bypasses the campaign boss gate to exercise the hit effect.
  combat.hostile = enemy => !enemy.dead;
  combat.melee('attack', new THREE.Vector3(0, 0, 1)); assert.equal(target.slow!.percent, 50); assert.equal(combat.slow(target), .5);
  combat.update(30); assert.equal(target.slow, undefined); assert.equal(combat.slow(target), 1);
});

test('item curses proc from actual named equipment and life tap heals smite even against skeletons', t => {
  t.mock.method(Math, 'random', () => 0);
  const { hero, combat, enemy } = setup(), target = enemy('skeleton'); target.definition = MONSTERS.skeleton;
  const draculs = specialItem(CATALOG_SPECIALS.find(entry => entry.key === "Dracul's Grasp")!.id); draculs.identified = true;
  hero.strength = 200; hero.equipment.gloves = draculs; hero.hp = 20;
  combat.melee('smite', new THREE.Vector3(0, 0, 1)); assert.equal(combat.itemCurses.get(target)?.kind, 'lifeTap'); assert.equal(hero.hp, 20);
  target.actor.group.position.z = 2; combat.melee('smite', new THREE.Vector3(0, 0, 1)); assert.ok(hero.hp > 20);
  combat.itemCurses.set(target, { kind: 'amplify', remaining: 1 }); target.resistances.physical = 110;
  assert.equal(combat.damage(target, 100, 'physical'), 10); // Original immunity is reduced by 100 / 5.
  combat.update(1); assert.equal(combat.damage(target, 100, 'physical'), 0);
  combat.itemCurses.set(target, { kind: 'decrepify', remaining: 3 }); assert.equal(combat.slow(target), .5);
});

test('real item auto-repair restores durability over elapsed time without repairing an unrelated item', () => {
  const { hero, combat } = setup(); hero.equipment.weapon!.mods = { repairDurability: .25 }; hero.equipment.weapon!.durability = 0;
  const shieldDurability = hero.equipment.shield!.durability; combat.update(3); assert.equal(hero.equipment.weapon!.durability, 0);
  combat.update(1); assert.equal(hero.equipment.weapon!.durability, 1); assert.equal(hero.equipment.shield!.durability, shieldDurability);
});

test('auto-repair keeps fractional progress while the same item is temporarily unequipped', () => {
  const { hero, combat } = setup(), weapon = hero.equipment.weapon!;
  weapon.mods = { repairDurability: .25 }; weapon.durability = 0;
  combat.update(3); hero.equipment.weapon = null; combat.update(2);
  assert.equal(weapon.durability, 0);
  hero.equipment.weapon = weapon; combat.update(1); assert.equal(weapon.durability, 1);
});

test('light radius changes the live player light and stops increasing after plus five', () => {
  const { hero, combat, game } = setup(), light = new THREE.PointLight(); light.name = 'hero-light'; game.actor.group.add(light);
  hero.equipment.weapon!.mods = { lightRadius: 5 }; combat.update(.1); assert.equal(light.distance, 7 * 18 / 13);
  hero.equipment.weapon!.mods.lightRadius = 20; combat.update(.1); assert.equal(light.distance, 7 * 18 / 13);
  hero.equipment.weapon!.mods = {}; combat.update(.1); assert.equal(light.distance, 7);
});

test('affix poison is damage over time with resistance, snapshots on hit, and does not stack on repeated attacks', t => {
  t.mock.method(Math, 'random', () => .5);
  const { hero, combat, enemy } = setup(), target = enemy(); target.resistances.physical = 100; target.resistances.poison = 50;
  hero.equipment.weapon!.mods = { poisonMinRate: 385, poisonMaxRate: 385, poisonFrames: 300 };
  combat.melee('attack', new THREE.Vector3(0, 0, 1)); assert.equal(target.hp, 10000); assert.equal(target.poison?.remaining, 12);
  const dps = target.poison!.dps; combat.update(1); assert.equal(target.poison!.remaining, 11);
  combat.melee('attack', new THREE.Vector3(0, 0, 1)); assert.equal(target.poison!.dps, dps); assert.equal(target.poison!.remaining, 12);
  hero.equipment.weapon!.mods = { poisonMinRate: 100, poisonMaxRate: 100, poisonFrames: 300 };
  combat.melee('attack', new THREE.Vector3(0, 0, 1)); assert.equal(target.poison!.dps, dps);
  hero.equipment.weapon!.mods = {}; for (let i = 0; i < 12; i++) combat.update(1);
  assert.ok(Math.abs(10000 - target.hp - dps * 13) < .000001); assert.equal(target.poison, undefined);
  const immune = enemy(); immune.resistances.poison = 100; hero.equipment.weapon!.mods = { poisonMinRate: 385, poisonMaxRate: 385, poisonFrames: 300 };
  target.dead = true; combat.melee('attack', new THREE.Vector3(0, 0, 1)); assert.equal(immune.poison, undefined);
  immune.resistances.poison = 0; combat.melee('smite', new THREE.Vector3(0, 0, 1)); assert.equal(immune.poison, undefined);
  immune.actor.group.position.set(0, 0, 2); combat.melee('attack', new THREE.Vector3(0, 0, 1)); immune.hp = 1; combat.update(1); assert.equal(immune.dead, true);
});
test('new undead species use separate leech rules; skeletal targets and nightmare Mephisto cannot be drained', t => {
  t.mock.method(Math, 'random', () => .1);
  for (const definition of [MONSTERS.zombie, MONSTERS.skeleton, MONSTERS.ghost, BOSSES[14]]) {
    const { hero, combat, enemy } = setup(), target = enemy('skeleton'); target.definition = definition;
    hero.equipment.weapon!.mods = { lifeSteal: 50 }; hero.hp = 20;
    if (definition.id === 'mephisto') hero.difficultyLevel = 1;
    combat.castAction('attack'); assert.ok(target.hp < 10000);
    if (definition.id === 'zombie') assert.ok(hero.hp > 20); else assert.equal(hero.hp, 20);
  }
});

test('unlearned skills do not consume mana; smite needs a shield, always hits, stuns and excludes leech and elemental damage', t => {
  t.mock.method(Math, 'random', () => .99);
  const { hero, combat, enemy } = setup(), target = enemy(); target.defense = 100000;
  hero.skills.holyBolt = 0; const mana = hero.mana; combat.castAction('holyBolt'); assert.equal(hero.mana, mana);
  const shield = hero.equipment.shield; hero.equipment.shield = null; combat.castAction('smite'); assert.equal(hero.mana, mana);
  hero.equipment.shield = shield; hero.hp = 20; hero.equipment.weapon!.mods = { lifeSteal: 100, fireDamage: 1000 };
  combat.castAction('smite'); assert.ok(target.hp < 10000 && target.hp > 9950); assert.ok(target.stunned > 0); assert.equal(hero.hp, 20); assert.equal(hero.mana, mana - 2);
});
test('zeal makes exactly five attacks over time and charges mana once', t => {
  t.mock.method(Math, 'random', () => .5);
  const { hero, combat, enemy } = setup(), target = enemy(); hero.skills.zeal = 4;
  let hits = 0; const damage = combat.damage.bind(combat); combat.damage = (...args) => { hits++; return damage(...args); };
  const mana = hero.mana; combat.castAction('zeal'); assert.equal(hero.mana, mana - 2);
  for (let i = 0; i < 40; i++) combat.update(.05);
  assert.equal(hits, 5); assert.ok(target.hp < 10000); assert.equal(combat.zeal, null); assert.ok(hero.mana >= mana - 2);
});
test('classic holy bolt damages undead but not demons and hammer damages along its moving trajectory', () => {
  const { combat, enemy } = setup(), demon = enemy('demon', 3), undead = enemy('skeleton', 6);
  combat.castAction('holyBolt', true); for (let i = 0; i < 25; i++) combat.update(.05);
  assert.equal(demon.hp, 10000); assert.ok(undead.hp < 10000);
  combat.castAction('blessedHammer'); assert.equal(combat.projectiles[0].kind, 'hammer');
  combat.update(.05); const first = combat.projectiles[0].mesh.position.clone(); demon.actor.group.position.copy(first).setY(0);
  combat.update(.03); assert.ok(demon.hp < 10000); assert.ok(combat.projectiles[0].mesh.position.distanceTo(first) > 0);
  for (let i = 0; i < 60; i++) combat.update(.05); assert.equal(combat.projectiles.length, 0);
});

test('hammer spirals intersect the selected cast-time target at close and mid range, without homing or passing through walls', () => {
  for (const distance of [1.2, 2, 3.5, 4.9]) {
    const { combat, game, enemy } = setup(), target = enemy('demon', distance); game.target = target;
    combat.castAction('blessedHammer'); for (let i = 0; i < 60; i++) combat.update(.04);
    assert.ok(target.hp < 10000, `hammer hits at ${distance}`);
  }
  const moved = setup(), movingTarget = moved.enemy('demon', 3); moved.game.target = movingTarget;
  moved.combat.castAction('blessedHammer'); movingTarget.actor.group.position.set(12, 0, 12);
  for (let i = 0; i < 60; i++) moved.combat.update(.04); assert.equal(movingTarget.hp, 10000);
  const wall = setup(), blocked = wall.enemy('demon', 3); wall.game.target = blocked;
  wall.combat.castAction('blessedHammer'); wall.game.world.grid.isWalkableAt = () => false;
  for (let i = 0; i < 60; i++) wall.combat.update(.04); assert.equal(blocked.hp, 10000);
});

test('sacrifice retains a real five-percent recoil and short hit grace prevents overlapping enemy damage', t => {
  t.mock.method(Math, 'random', () => .5);
  const { hero, combat, game, enemy } = setup(), target = enemy(); hero.hp = 100;
  const s = stats(hero), physical = (s.weaponMin + s.weaponMax) / 2 * (1 + (s.damageBonus + 180 + 15 + 5) / 100);
  combat.melee('sacrifice', new THREE.Vector3(0, 0, 1)); assert.ok(Math.abs(hero.hp - (100 - physical * .05)) < .000001);
  game.invincible = 0; combat.hurt(10, 'magic', target); const hp = hero.hp;
  assert.equal(game.invincible, .2); combat.hurt(10, 'magic', target); assert.equal(hero.hp, hp);
  game.invincible = 0; combat.hurt(10, 'magic', target); assert.equal(hero.hp, hp - 10);
});
test('auras pulse, regeneration runs without killing, redemption consumes each corpse once', t => {
  t.mock.method(Math, 'random', () => 0);
  const { hero, combat, enemy } = setup(), target = enemy();
  setAura(hero, 'holyFire'); combat.pulse(); assert.ok(target.hp < 10000);
  setAura(hero, 'prayer'); hero.hp = 10; hero.mana = 10; combat.pulse(); assert.equal(hero.hp, 12); assert.equal(hero.mana, 9);
  setAura(hero, 'cleansing'); hero.hp = 10; hero.mana = 0; combat.pulse(); assert.equal(hero.hp, 12); assert.equal(hero.mana, 0);
  target.dead = true; setAura(hero, 'redemption'); combat.pulse(); assert.equal(target.redeemed, true); const hp = hero.hp; combat.pulse(); assert.equal(hero.hp, hp);
});
test('conversion creates an ally, holy freeze slows immune enemies, vengeance applies each element', t => {
  t.mock.method(Math, 'random', () => 0);
  const { hero, combat, enemy } = setup(), target = enemy();
  combat.castAction('conversion'); assert.equal(target.converted, 16); assert.equal(combat.hostile(target), false);
  const other = enemy(); assert.equal(combat.allyUpdate(target, .1), true); assert.ok(other.hp < 10000);
  target.converted = 0; target.resistances.cold = 110; setAura(hero, 'holyFreeze'); assert.ok(combat.slow(target) < 1);
  setAura(hero, null); combat.lock = 0; const types: string[] = [], original = combat.damage.bind(combat); combat.damage = (...args) => { types.push(args[2]); return original(...args); };
  combat.castAction('vengeance'); assert.deepEqual(types, ['physical', 'fire', 'cold', 'lightning']);
});
test('fist of heavens has a one second delay and holy shield expires in game time', () => {
  const { hero, combat, enemy } = setup(); enemy();
  combat.castAction('fistOfHeavens'); const mana = hero.mana; combat.lock = 0; combat.castAction('fistOfHeavens'); assert.equal(hero.mana, mana); assert.equal(combat.fohDelay, 1);
  combat.fohDelay = 0; combat.castAction('holyShield'); assert.equal(hero.holyShield, 60); combat.update(1); assert.equal(hero.holyShield, 59);
});
test('lethal damage creates a persistent corpse and interrupts a zeal sequence', () => {
  const { hero, combat, game } = setup(); const sword = hero.equipment.weapon;
  combat.zeal = { hits: 4, timer: .2, direction: new THREE.Vector3() }; combat.hurt(100000, 'magic');
  assert.equal(game.dead, true); assert.equal(hero.equipment.weapon, null); assert.equal(hero.corpse?.equipment.weapon, sword); assert.equal(combat.zeal, null);
});
test('holy shield snapshots the cast level when skill equipment is swapped out', () => {
  const { hero, combat } = setup(); hero.equipment.weapon!.mods = { allSkills: 2 }; combat.castAction('holyShield');
  assert.equal(hero.holyShieldLevel, 3); const min = stats(hero).smiteMin; hero.equipment.weapon = null;
  assert.equal(stats(hero).smiteMin, min); assert.equal(hero.holyShield, 110);
});
