import { withCastingSkill, parseSave, serializeSave } from '../src/model.ts';
import { skillValues } from '../src/paladin.ts';
import { curseDuration } from '../src/item-special-effects.ts';
import { createHeroActor } from '../src/hero-models.ts';
import { updateItemForm } from '../src/item-form.ts';
import { MonsterCombat, ATTACKS } from '../src/monster-combat.ts';
import { monsterAffix, CHAMPION_VARIANTS } from '../src/monster-affixes.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PaladinCombat, type Projectile } from '../src/combat.ts';
import { newHero, gainXp, learnSkill, stats, setAura } from '../src/model.ts';
import { SKILLS, EXPERIENCE } from '../src/paladin.ts';
import { makeItem, BASES, specialItem } from '../src/items.ts';
import { CATALOG_SPECIALS, CATALOG_RUNEWORDS } from '../src/item-catalog-current.ts';
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

test('bosses resist all shared knockback and ordinary targets cannot be knocked through walls', () => {
  const f = setup();
  for (const kind of ['demon', 'boss'] as const) {
    const target = f.enemy(kind); target.boss = true;
    assert.equal(f.combat.knockback(target, 1.5), false);
    assert.equal(target.actor.group.position.z, 2);
  }
  const target = f.enemy();
  f.game.world.canWalk = () => false;
  assert.equal(f.combat.knockback(target, 1), false);
  f.game.world.canWalk = () => true;
  assert.equal(f.combat.knockback(target, 1), true);
  assert.equal(target.actor.group.position.z, 3);
  assert.equal(target.body.position.z, 3);
});

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
test('holy bolt pierces undead and demons and hammer damages along its moving trajectory', () => {
  const { combat, enemy } = setup(), demon = enemy('demon', 3), undead = enemy('skeleton', 6);
  combat.castAction('holyBolt', true); for (let i = 0; i < 25; i++) combat.update(.05);
  assert.ok(demon.hp < 10000); assert.ok(undead.hp < 10000); combat.update(1);
  combat.castAction('blessedHammer'); assert.equal(combat.projectiles[0].kind, 'hammer');
  combat.update(.05); const first = combat.projectiles[0].mesh.position.clone(); demon.actor.group.position.copy(first).setY(0);
  combat.update(.03); assert.ok(demon.hp < 10000); assert.ok(combat.projectiles[0].mesh.position.distanceTo(first) > 0);
  for (let i = 0; i < 60; i++) combat.update(.05); assert.equal(combat.projectiles.length, 0);
});

test('hammer follows a fixed clockwise outward spiral regardless of aim, facing or selected target', () => {
  const paths: number[][][] = [];
  for (const aimed of [false, true]) for (const distance of [-4.9, -1.2, 1.2, 4.9]) {
    const { combat, game, enemy } = setup();
    game.target = enemy('demon', distance); game.aim.set(distance, 0, -distance);
    game.actor.group.rotation.y = distance;
    assert.ok(combat.castAction('blessedHammer', aimed));
    const hammer = combat.projectiles[0], path = [hammer.mesh.position.toArray()];
    assert.ok(hammer.mesh.position.x < hammer.origin.x, 'launch is upper-left in the isometric view');
    let radius = hammer.mesh.position.clone().setY(0).distanceTo(hammer.origin);
    for (let i = 0; i < 20; i++) {
      const before = hammer.mesh.position.clone().sub(hammer.origin);
      combat.updateProjectile(hammer, .05);
      const after = hammer.mesh.position.clone().sub(hammer.origin);
      assert.ok(before.x * after.z - before.z * after.x > 0, 'clockwise in screen coordinates');
      const nextRadius = Math.hypot(after.x, after.z);
      assert.ok(nextRadius > radius, 'each step expands the orbit'); radius = nextRadius;
      path.push(hammer.mesh.position.toArray());
      game.position.set(10, 0, 10); game.aim.set(-10, 0, -10);
    }
    paths.push(path);
  }
  for (const path of paths) assert.deepEqual(path, paths[0], 'aim and caster movement cannot rotate or drag the spiral');
});

test('hammer travels at steady path speed and equal cast intervals do not lock a volley into spokes', () => {
  const { combat } = setup(); combat.castAction('blessedHammer');
  const hammer = combat.projectiles[0], speeds: number[] = [];
  for (let i = 0; i < 220; i++) {
    const before = hammer.mesh.position.clone(); combat.updateProjectile(hammer, .01);
    speeds.push(before.distanceTo(hammer.mesh.position) / .01);
  }
  assert.ok(Math.max(...speeds) / Math.min(...speeds) < 1.01, 'outer hammers must not accelerate with radius');
  for (const frames of [15, 14, 13, 12, 11, 10, 9]) {
    const pair = [setup(), setup()];
    for (const fixture of pair) fixture.combat.castAction('blessedHammer');
    const [older, younger] = pair.map(f => f.combat.projectiles[0]);
    pair[0].combat.updateProjectile(older, .5 + frames / 25);
    pair[1].combat.updateProjectile(younger, .5);
    const gap = () => {
      const a = older.mesh.position, b = younger.mesh.position;
      return Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);
    };
    const before = gap();
    pair[0].combat.updateProjectile(older, .2); pair[1].combat.updateProjectile(younger, .2);
    assert.ok(Math.abs(Math.atan2(Math.sin(gap() - before), Math.cos(gap() - before))) > .05,
      `angular separation evolves at the ${frames}-frame cast breakpoint`);
  }
  const paths = [30, 60, 120].map(fps => {
    const fixture = setup(); fixture.combat.castAction('blessedHammer');
    const p = fixture.combat.projectiles[0];
    for (let i = 0; i < fps; i++) fixture.combat.updateProjectile(p, 1 / fps);
    return p.mesh.position;
  });
  for (const position of paths) assert.ok(position.distanceTo(paths[0]) < 1e-9, 'flight is independent of frame rate');
});

test('hammer cannot home or pass through walls, including the launch offset', () => {
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
test('fist of heavens has a 0.4 second delay and holy shield expires in game time', () => {
  const { hero, combat, enemy } = setup(); enemy();
  combat.castAction('fistOfHeavens'); const mana = hero.mana; combat.lock = 0; combat.castAction('fistOfHeavens'); assert.equal(hero.mana, mana); assert.equal(combat.fohDelay, .4);
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


test('enchanted monster damage is resisted per component and mana/curse effects require an accepted hit', t => {
  t.mock.method(Math, 'random', () => .5);
  const { game, hero, combat, enemy } = setup(); game.monsterCombat = new MonsterCombat(game);
  const source = enemy(); source.active = true; source.affixes = [monsterAffix('fireEnchanted'), monsterAffix('manaBurn'), monsterAffix('cursed')];
  hero.equipment.shield = undefined; hero.equipment.weapon!.mods.fireRes = 75;
  const resources = stats(hero), before = hero.hp, mana = hero.mana;
  combat.hurt(10, 'magic', source, false, true);
  const expected = 10 + 3 * (1 - resources.resistances.fire / 100);
  assert.ok(Math.abs((before - hero.hp) - expected) < .0001);
  assert.ok(hero.mana < mana); assert.equal(hero.curse, 5);
  game.invincible = 0; hero.curse = 0; const remaining = hero.mana;
  source.attackRating = 0; t.mock.method(Math, 'random', () => .99);
  assert.equal(combat.hurt(10, 'physical', source), false);
  assert.equal(hero.curse, 0); assert.equal(hero.mana, remaining);
});

test('red lightning has physical and lightning components, and death explosions do not apply offensive affixes', t => {
  t.mock.method(Math, 'random', () => .5);
  const { game, hero, combat, enemy } = setup(); game.monsterCombat = new MonsterCombat(game);
  const source = enemy(); source.damage = 20;
  const parts = game.monsterCombat.damageParts(source, 11, 'lightning', ATTACKS.redLightning);
  assert.deepEqual(parts, [{ type: 'lightning', amount: 11 }, { type: 'physical', amount: 11 }]);
  source.affixes = [monsterAffix('cursed'), monsterAffix('manaBurn'), monsterAffix('fireEnchanted')];
  const mana = hero.mana;
  combat.hurt(10, 'fire', source, false, true, { ...ATTACKS.fireNova, triggered: true });
  assert.equal(hero.mana, mana); assert.equal(hero.curse, 0);
});

test('Baal selects blood mana only for high-mana heroes; curse expires and teleport cannot heal him', t => {
  t.mock.method(Math, 'random', () => .5);
  const { game, hero, combat, enemy } = setup(); const monsters = game.monsterCombat = new MonsterCombat(game), baal = enemy(); baal.definition = BOSSES[24];
  monsters.hit(baal, ATTACKS.baalCurse); assert.equal(monsters.debuffs.defense, 6);
  game.invincible = 0; hero.equipment.weapon!.mods.mana = 10000;
  monsters.hit(baal, ATTACKS.baalCurse); assert.equal(monsters.debuffs.bloodMana, 6);
  const hp = hero.hp; monsters.castCost(20); assert.equal(hero.hp, hp - 10);
  monsters.debuffs.bloodMana = 0; monsters.castCost(20); assert.equal(hero.hp, hp - 10);
  baal.hp = 200; monsters.startCast(baal, 'bossTeleport'); monsters.resolve(baal, monsters.state(baal).cast!); assert.equal(baal.hp, 200);
});

test('possessed champions reject item curses while nearby ordinary enemies receive them', t => {
  t.mock.method(Math, 'random', () => 0);
  const { game, combat, enemy, hero } = setup(), possessed = enemy(), ordinary = enemy();
  possessed.champion = CHAMPION_VARIANTS.find(v => v.id === 'possessed');
  hero.equipment.weapon = specialItem('unique-154');
  combat.triggerItems('hit-skill', possessed, [hero.equipment.weapon!]);
  assert.equal(combat.itemCurses.has(possessed), false); assert.equal(combat.itemCurses.get(ordinary)?.kind, 'amplify');
  // Explicit stale curse data must not lower possessed physical resistance either.
  combat.itemCurses.set(possessed, { kind: 'amplify', remaining: 5 });
  assert.equal(combat.physicalResistance(possessed), possessed.resistances.physical);
});


test('possessed is curse-resistant, never immune to physical, elemental or exploding-arrow damage', () => {
  const { combat, enemy } = setup(), target = enemy(); target.champion = CHAMPION_VARIANTS.find(v => v.id === 'possessed');
  for (const type of ['physical', 'magic', 'fire', 'cold', 'lightning', 'poison'] as const) {
    target.resistances[type] = 85; assert.equal(combat.damage(target, 100, type), 15);
  }
  const before = target.hp;
  combat.explode({ snapshot: combat.snapshot(), explosion: 10 } as Projectile, target.actor.group.position);
  assert.ok(target.hp < before);
});

function procItem(event: string, skill: string) {
  const row = [...CATALOG_SPECIALS, ...CATALOG_RUNEWORDS].find(row => row.properties.some(p => p[0] === event && p[1] === skill))!;
  assert.ok(row, `${event}: ${skill}`);
  const item = CATALOG_SPECIALS.some(entry => entry.id === row.id) ? specialItem(row.id) : makeItem(BASES.find(base => base.slot === 'weapon')!);
  item.catalogId = row.id; item.identified = true; return item;
}

test('equipment spell procs retain printed rank, cost no mana and preserve attack cadence and aim', t => {
  t.mock.method(Math, 'random', () => 0);
  const { hero, game, combat, enemy } = setup(), target = enemy();
  hero.mana = 0; hero.equipment.weapon!.mods.allSkills = 20;
  combat.zeal = { rank: 4, hits: 3, timer: .2, direction: new THREE.Vector3(0,0,1), aimed: true };
  combat.actionCooldowns.frozenOrb = 5; combat.lock = .8;
  const combo = combat.zeal, aim = game.aim.clone();
  const item = procItem('hit-skill', '64');
  const row = CATALOG_SPECIALS.find(row => row.id === item.catalogId)!.properties.find(p => p[0] === 'hit-skill' && p[1] === '64')!;
  combat.triggerItems('hit-skill', target, [item]);
  const orb = combat.classes.missiles.find(m => m.skill === 'frozenOrb')!;
  assert.ok(orb); assert.equal(orb.snapshot.skillRanks!.frozenOrb, row[3]);
  assert.equal(hero.mana, 0); assert.equal(combat.zeal, combo); assert.equal(combat.lock, .8);
  assert.equal(combat.actionCooldowns.frozenOrb, 5); assert.deepEqual(game.aim, aim);
  const hp = target.hp;
  for (let i = 0; i < 25; i++) combat.classes.update(.05);
  assert.ok(target.hp < hp);
});

test('proc events are distinct, identical skill/rank chances combine, and procs do not recurse', t => {
  const { combat, enemy } = setup(), target = enemy();
  const item = procItem('gethit-skill', '48');
  const chance = CATALOG_SPECIALS.find(row => row.id === item.catalogId)!.properties.find(p => p[0] === 'gethit-skill' && p[1] === '48')![2];
  t.mock.method(Math, 'random', () => chance * 1.5 / 100);
  let hp = target.hp;
  combat.triggerItems('hit-skill', target, [item,item]); assert.equal(target.hp,hp);
  combat.triggerItems('gethit-skill', target, [item]); assert.equal(target.hp,hp);
  combat.triggerItems('gethit-skill', target, [item,item]); assert.ok(target.hp<hp);
  const cast = t.mock.method(combat, 'castAction', () => { combat.triggerItems('gethit-skill',target,[item,item]); return true; });
  combat.triggerItems('gethit-skill',target,[item,item]); assert.equal(cast.mock.calls.filter(call => call.arguments[0] === 'nova').length,1);
});

test('unidentified, broken, stashed and alternate equipment cannot trigger spells', t => {
  t.mock.method(Math, 'random', () => 0);
  const { hero, combat, enemy } = setup(), target = enemy(), item = procItem('hit-skill', '64');
  hero.strength = hero.dexterity = 500; hero.level = 99;
  hero.equipment.weapon = item;
  item.identified = false; combat.triggerItems('hit-skill',target); assert.equal(combat.classes.missiles.length,0);
  item.identified = true; item.durability = 0; combat.triggerItems('hit-skill',target); assert.equal(combat.classes.missiles.length,0);
  item.durability = item.maxDurability; hero.equipment.weapon = null; hero.alternate.weapon = item;
  combat.triggerItems('hit-skill',target); assert.equal(combat.classes.missiles.length,0);
  hero.alternate.weapon = null; hero.stash = [item]; combat.triggerItems('hit-skill',target); assert.equal(combat.classes.missiles.length,0);
  hero.stash = []; hero.equipment.weapon = item; combat.triggerItems('hit-skill',target); assert.ok(combat.classes.missiles.length>0);
});

test('lethal hits trigger socketed death facets once and their delayed meteor finishes after death', t => {
  t.mock.method(Math, 'random', () => 0);
  const { hero, game, combat, enemy } = setup(), target = enemy('demon',1);
  const facet = procItem('death-skill','Meteor');
  hero.equipment.weapon!.socketedJewels = [{ mods: facet.mods, catalogId: facet.catalogId, name: facet.name } as any];
  hero.hp = 1; hero.mana = 0;
  combat.hurt(100000, 'magic', target);
  assert.equal(game.dead,true); assert.equal(hero.hp,0); assert.equal(combat.classes.fields.length,1);
  const hp = target.hp;
  for (let i=0;i<30;i++) combat.updateDeathEffects(.1);
  assert.ok(target.hp<hp); assert.equal(hero.hp,0);
});

test('kill and level-up procs work without learned skills or a selected target', t => {
  t.mock.method(Math,'random',()=>0);
  const { hero, combat, enemy } = setup(), target = enemy(); hero.mana=0;
  const poison = procItem('kill-skill','Poison Nova');
  combat.triggerItems('kill-skill',target,[poison]); assert.ok(target.poison);
  const blizzard = procItem('levelup-skill','Blizzard');
  combat.triggerItems('levelup-skill',undefined,[blizzard]); assert.ok(combat.classes.fields.some(f=>f.id==='blizzard'));
  assert.equal(hero.mana,0);
});

function castSpecial(combat: PaladinCombat, id: 'fade'|'boneArmor'|'delirium'|'howl'|'taunt'|'mindBlast'|'fissure'|'diabloFirestorm', rank: number, target?: Enemy) {
  return withCastingSkill(combat.game.hero, { id, rank }, () => combat.castAction(id, false, { point: target?.actor.group.position.clone() ?? combat.game.position.clone(), target }));
}

test('Fade uses printed diminishing returns, physical resistance, new-curse reduction and timed persistence', t => {
  t.mock.method(Math,'random',()=>.9);
  const { hero, combat, enemy, game }=setup(), target=enemy();
  hero.equipment.weapon!.mods={}; hero.mana=0;
  const before=stats(hero); castSpecial(combat,'fade',15);
  assert.equal(hero.buffs.fade!.remaining,288);
  assert.equal(stats(hero).mods.allRes!-(before.mods.allRes??0),60);
  assert.equal(stats(hero).mods.damageReduction!-(before.mods.damageReduction??0),15);
  assert.ok(Math.abs(curseDuration(hero,10)-2.1)<1e-9);
  hero.curse=10; combat.classes.update(1); assert.equal(hero.curse,10,'casting Fade does not rewrite an existing curse');
  const saved=parseSave(serializeSave(hero))!; assert.equal(saved.buffs.fade!.remaining,287);
  hero.equipment.weapon=null; assert.equal(stats(hero).mods.damageReduction,15);
  combat.classes.update(287); assert.equal(hero.buffs.fade,undefined); assert.equal(curseDuration(hero,10),10);
  const monster=new MonsterCombat(game); game.monsterCombat=monster;
  castSpecial(combat,'fade',15); hero.curse=0;
  t.mock.method(combat,'hurt',()=>true); monster.hit(target,ATTACKS.curse);
  assert.ok(Math.abs(hero.curse-1.05)<1e-9); assert.equal(hero.mana,0);
});

test('D2R Bone Armor absorbs physical damage before reduction, persists its remaining pool and recasts without stacking', t => {
  t.mock.method(Math,'random',()=>.5);
  const { hero, combat, enemy, game }=setup(), target=enemy();
  hero.equipment.shield=null; hero.equipment.weapon!.mods={damageReduction:50}; hero.skills.bonePrison=0;
  assert.equal(skillValues('boneArmor',10).percent,155);
  assert.equal(skillValues('boneArmor',10,{bonePrison:2}).percent,185);
  castSpecial(combat,'boneArmor',10); const hp=hero.hp;
  combat.hurt(100,'physical',undefined); assert.equal(hero.hp,hp); assert.equal(hero.buffs.boneArmor!.absorb,55);
  const restored=parseSave(serializeSave(hero))!; assert.equal(restored.buffs.boneArmor!.absorb,55);
  combat.hurt(10,'fire',undefined); assert.equal(hero.buffs.boneArmor!.absorb,55);
  game.invincible=0; const before=hero.hp; combat.hurt(100,'physical',undefined); assert.equal(hero.hp,before-22.5); assert.equal(hero.buffs.boneArmor,undefined);
  castSpecial(combat,'boneArmor',10); combat.classes.update(3601); assert.equal(hero.buffs.boneArmor!.absorb,155);
  castSpecial(combat,'boneArmor',1,target); assert.equal(hero.buffs.boneArmor!.absorb,20);
});

test('Mind Blast converts eligible monsters for six to ten seconds, otherwise damages and stuns with boss restrictions', t => {
  const { hero, game, combat, enemy }=setup(), normal=enemy(), elite=enemy('demon',2.2), boss=enemy('demon',2.4);
  elite.elite=true; boss.boss=true; game.specialArea='cow';
  combat.itemRandom=()=>0;
  const normalHp=normal.hp, bossHp=boss.hp;
  castSpecial(combat,'mindBlast',14,normal);
  assert.equal(normal.converted,6); assert.equal(normal.hp,normalHp); assert.equal(normal.stunned,0);
  assert.equal(elite.converted,0); assert.ok(elite.hp<10000); assert.ok(elite.stunned>0);
  assert.equal(boss.converted,0); assert.equal(boss.stunned,0); assert.ok(boss.hp<bossHp);
  normal.converted=0; combat.itemRandom=()=>.99;
  castSpecial(combat,'mindBlast',14,normal); assert.equal(normal.converted,0); assert.ok(normal.hp<normalHp); assert.ok(normal.stunned>0);
  assert.equal(skillValues('mindBlast',14).percent,34); assert.equal(hero.skills.mindBlast,0);
});

test('Taunt forces a ranged monster into melee and reduces damage and accuracy; Howl replaces it with level-gated flee', t => {
  t.mock.method(Math,'random',()=>.5);
  const { hero, combat, enemy, game }=setup(), target=enemy('demon',6);
  game.started=true; game.world.path=(_from:THREE.Vector3,to:THREE.Vector3)=>[to.clone()];
  target.definition=MONSTERS.boneMage; target.active=true; target.actor.animate=()=>{};
  const monster=new MonsterCombat(game); game.monsterCombat=monster;
  castSpecial(combat,'taunt',1,target);
  assert.equal(combat.specialItems.taunts.get(target),5);
  assert.equal(monster.accuracy(target),target.attackRating*.95);
  assert.deepEqual(monster.damageParts(target,100,'physical'),[{type:'physical',amount:95}]);
  monster.updateEnemy(target,.1); assert.ok(target.body.velocity.z<0); assert.equal(monster.state(target).cast,undefined);
  target.actor.group.position.z=1; target.body.position.z=1;
  monster.updateEnemy(target,.1); assert.equal(monster.state(target).cast?.id,'strike');
  castSpecial(combat,'howl',1); assert.equal(combat.specialItems.taunts.has(target),false); assert.equal(target.flee,3);
  target.level=hero.level+2; target.flee=0; castSpecial(combat,'howl',1); assert.equal(target.flee,0);
  target.level=1; target.elite=true; castSpecial(combat,'taunt',1,target); assert.equal(combat.specialItems.taunts.has(target),false);
});

test('Delirium morph has a sixty-second timer, melee-only skills, retained aura and restores the original hero rig', () => {
  const { hero, combat, game, enemy }=setup(); game.actor=createHeroActor('paladin'); const target=enemy();
  hero.equipment.weapon=makeItem(BASES.find(base=>base.baseCode==='sbw')!); hero.equipment.shield=null;
  const before=stats(hero); assert.ok(before.ranged);
  castSpecial(combat,'delirium',50);
  assert.equal(hero.buffs.delirium!.remaining,60); assert.equal(stats(hero).ranged,undefined);
  assert.ok(Math.abs(stats(hero).runSpeed/before.runSpeed-1.33)<1e-9);
  assert.equal(combat.castAction('holyBolt'),false); assert.equal(combat.castAction('attack'),true);
  assert.equal(game.actor.group.getObjectByName('hero-rig')!.visible,false);
  assert.equal(game.actor.group.getObjectByName('item-delirium-form')!.visible,true);
  const active=hero.activeAura; combat.classes.update(60); updateItemForm(game.actor,hero.buffs,60);
  assert.equal(hero.activeAura,active); assert.equal(hero.buffs.delirium,undefined); assert.ok(stats(hero).ranged);
  assert.equal(game.actor.group.getObjectByName('hero-rig')!.visible,true);
  assert.equal(game.actor.group.getObjectByName('item-delirium-form')!.visible,false);
  castSpecial(combat,'delirium',50,target); assert.equal(game.actor.group.children.filter((child:THREE.Object3D)=>child.name==='item-delirium-form').length,1);
});

test('Fissure and Diablo Firestorm leave bounded ground effects with separate physical/fire damage and wall collision', () => {
  const { combat, enemy, game }=setup(), target=enemy('demon',0);
  combat.itemRandom=()=>0; const hits:{amount:number;type:string}[]=[];
  const original=combat.damage.bind(combat);
  combat.damage=(enemy,amount,type,...args)=>{hits.push({amount,type});return original(enemy,amount,type,...args);};
  castSpecial(combat,'fissure',14,target); assert.equal(hits.length,0);
  combat.specialItems.update(.24); assert.ok(hits.some(hit=>hit.type==='fire')); assert.ok(hits.every(hit=>hit.type!=='physical'));
  const first=hits[0].amount; assert.equal(first,skillValues('fissure',14,game.hero.skills).min);
  combat.specialItems.clear(); hits.length=0;
  castSpecial(combat,'diabloFirestorm',10,target); assert.equal(combat.specialItems.streams.length,10);
  combat.specialItems.update(.24); assert.ok(hits.some(hit=>hit.type==='physical')); assert.ok(hits.some(hit=>hit.type==='fire'));
  assert.ok(combat.specialItems.patches.length<=512);
  combat.specialItems.update(7); assert.equal(combat.specialItems.streams.length,0); assert.equal(combat.specialItems.patches.length,0);
  game.world.grid.isWalkableAt=()=>false; castSpecial(combat,'diabloFirestorm',10,target); combat.specialItems.update(.2); assert.equal(combat.specialItems.patches.length,0);
});

test('Reanimate arms on successful weapon hits, consumes an eligible corpse once and Returned expire without inheriting hero procs', t => {
  t.mock.method(Math,'random',()=>0);
  const { hero, game, combat, enemy }=setup(), target=enemy();
  hero.equipment.weapon!.mods={reanimateReturned:100};
  combat.weaponHit(target,'attack'); target.dead=true; combat.specialItems.reanimate(target);
  assert.equal(target.redeemed,true); assert.equal(combat.classes.summons.length,1);
  const returned=combat.classes.summons[0]; assert.equal(returned.life,60); assert.ok(returned.returned); assert.equal(returned.actor.group.name,'item-returned');
  assert.deepEqual(returned.snapshot.items,[]); assert.deepEqual(returned.snapshot.stats.mods,{});
  combat.specialItems.reanimate(target); assert.equal(combat.classes.summons.length,1);
  const next=enemy('demon',2.5), hp=next.hp; combat.classes.update(1.3); assert.ok(next.hp<hp);
  combat.classes.update(60); assert.equal(combat.classes.summons.length,0);
  for(const mode of ['elite','redeemed','miss'] as const){const e=enemy();if(mode==='elite')e.elite=true;if(mode==='redeemed')e.redeemed=true;if(mode==='miss')t.mock.method(Math,'random',()=>.999);combat.weaponHit(e,'attack');e.dead=true;combat.specialItems.reanimate(e);assert.equal(combat.classes.summons.length,0,mode);}
});


test('Mind Blast allies can be attacked, and temporary level scaling restores without refilling life', () => {
  const { hero, combat, enemy }=setup(), converted=enemy(), hostile=enemy('demon',2.1);
  converted.level=hero.level+20; const oldLevel=converted.level, oldMax=converted.maxHp;
  combat.specialItems.convert(converted,6);
  assert.equal(converted.level,hero.level); assert.ok(converted.maxHp<oldMax);
  const ally=combat.classes.target(hostile)!; assert.equal(ally.actor,converted.actor);
  combat.classes.hurtSummon(ally,converted.maxHp/2);
  converted.converted=0; combat.specialItems.restoreConversions();
  assert.equal(converted.level,oldLevel); assert.equal(converted.maxHp,oldMax); assert.equal(converted.hp,oldMax/2);
  const hp=converted.hp; combat.classes.hurtSummon(ally,100); assert.equal(converted.hp,hp);
});
