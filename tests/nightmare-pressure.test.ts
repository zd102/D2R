import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightmareMeleeHero } from './nightmare-pressure-fixture.ts';
import { classFixture } from './class-fixture.ts';
import { mercenaryStats } from '../src/mercenary.ts';
import { MercenaryCombat } from '../src/mercenary-combat.ts';
import { monsterStats } from '../src/balance.ts';
import { BOSSES, MONSTERS } from '../src/bestiary.ts';
import { LEVELS } from '../src/campaign.ts';
import { stats } from '../src/model.ts';

test('equipped Nightmare melee fixture preserves real defensive and sustain budgets', () => {
  const hero = nightmareMeleeHero(), s = stats(hero), merc = mercenaryStats(hero);
  assert.equal(hero.level, 73); assert.equal(hero.playerCount, 5);
  assert.equal(s.maxHp, 862); assert.equal(s.defense, 3090); assert.equal(s.block, 62);
  assert.equal(s.mods.lifeSteal, 10); assert.equal(merc.mods.lifeSteal, 6);
  assert.equal(merc.maxHp, 1316); assert.equal(merc.defense, 817);
  assert.deepEqual(merc.resistances, { fire: 75, cold: 75, lightning: 75, poison: 75 });
});

test('Nightmare 5pp packs can hurt both equipped melee allies without single-hit kills', t => {
  let seed = 967;
  t.mock.method(Math, 'random', () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; });
  const f = classFixture('paladin', false);
  Object.assign(f.hero, nightmareMeleeHero());
  f.game.world.canWalk = () => true;
  f.game.mercenary = new MercenaryCombat(f.game); f.game.mercenary.sync();
  const s = stats(f.hero), merc = mercenaryStats(f.hero);
  try {
    for (const [species, attack] of [['bloodLord', 'frenzy'], ['soul', 'lightning']] as const) {
      const enemy = f.enemy(1.5), def = MONSTERS[species];
      Object.assign(enemy, monsterStats(def, LEVELS[22], 1, false, false, 5), { definition: def });
      const spec = f.game.monsterCombat.attackSpec(enemy, attack);
      let heroTotal = 0, mercTotal = 0;
      for (let i = 0; i < 1024; i++) {
        f.hero.hp = s.maxHp; f.hero.mercenary!.hp = merc.maxHp; f.game.invincible = 0;
        f.combat.hurt(enemy.damage * spec.damage, spec.type, enemy, false, attack === 'lightning', spec);
        f.game.mercenary.hurt(enemy.damage * spec.damage, spec.type, enemy, attack === 'lightning', spec);
        const loss = s.maxHp - f.hero.hp, mercLoss = merc.maxHp - f.hero.mercenary!.hp;
        assert.ok(loss < s.maxHp * .25 && mercLoss < merc.maxHp * .2, 'Individual ordinary hits remain survivable');
        heroTotal += loss; mercTotal += mercLoss;
      }
      assert.ok(heroTotal / 1024 > (species === 'soul' ? 60 : 10), `${species}: hero incoming damage ${heroTotal / 1024}`);
      assert.ok(mercTotal / 1024 > (species === 'soul' ? 25 : 45), `${species}: mercenary incoming damage ${mercTotal / 1024}`);
    }
  } finally { f.game.mercenary.clear(); }
});

test('boss summons retain their own accuracy budget while field summons inherit pack accuracy', () => {
  const f = classFixture('paladin', false);
  Object.assign(f.hero, nightmareMeleeHero());
  const spawn = (definition: typeof MONSTERS[string], boss = false) => {
    const enemy = f.enemy(1.5);
    Object.assign(enemy, monsterStats(definition, LEVELS[22], 1, boss, false, 5), { definition, boss, playerCount: 5 });
    enemy.hp = enemy.maxHp * .4;
    return enemy;
  };
  f.game.spawnEnemy = (_x: number, _z: number, _kind: string, definition: typeof MONSTERS[string]) => spawn(definition);
  const boss = spawn(BOSSES[24], true);
  f.game.monsterCombat.summon(boss, 'tentacles', f.game.position);
  const tentacle = f.game.enemies.at(-1)!;
  assert.equal(tentacle.owner, boss.id); assert.equal(tentacle.damage, boss.damage * .4);
  const fieldAccuracy = monsterStats(MONSTERS.viper, LEVELS[22], 1, false, false, 5).attackRating;
  assert.ok(tentacle.attackRating > 0 && tentacle.attackRating < fieldAccuracy * .8, 'Boss summons do not gain field-pack accuracy');
  const parent = spawn(MONSTERS.maggot);
  f.game.monsterCombat.summon(parent, 'brood', f.game.position);
  const young = f.game.enemies.at(-1)!;
  assert.equal(young.owner, parent.id);
  assert.equal(young.attackRating, monsterStats(MONSTERS.maggot, LEVELS[22], 1, false, false, 5).attackRating);
  assert.equal(young.damage, parent.damage * .4);
});
