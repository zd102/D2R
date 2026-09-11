import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mercenaryAuraValues, mercenaryAuraRank, MERCENARY_AURAS } from '../src/mercenary-auras.ts';
import { hireMercenary, mercenaryStats, mercenaryAuras, setMercenaryDistance } from '../src/mercenary.ts';
import { newHero, stats } from '../src/model.ts';
import { skillValues, emptySkills } from '../src/paladin.ts';
import { makeItem, BASES } from '../src/items.ts';
import { classFixture } from './class-fixture.ts';
import { MercenaryCombat } from '../src/mercenary-combat.ts';

function combatFixture(t: TestContext, level = 90) {
  const f = classFixture('sorceress', false); f.hero.level = level; f.hero.gold = 100000; f.hero.campaign.cleared[0] = 5;
  hireMercenary(f.hero, true); const merc = new MercenaryCombat(f.game); f.game.mercenary = merc; merc.sync();
  t.mock.method(Math, 'random', () => .1); t.after(() => merc.clear()); return { ...f, merc };
}

test('native auras grow throughout levels 1–99 with bounded regeneration, control, retaliation and range', () => {
  for (let level = 1; level <= 99; level++) {
    const prayer = mercenaryAuraValues('prayer', level), life = 100 + 18 * level;
    assert.ok(prayer.healing / life >= .015 && prayer.healing / life <= .032);
    for (const aura of MERCENARY_AURAS) {
      const v = mercenaryAuraValues(aura, level), boosted = mercenaryAuraValues(aura, level, 1000);
      assert.ok(v.rank <= 20 && boosted.rank <= 30); assert.ok(v.radius >= 5 && v.radius <= 20 && boosted.radius <= 20);
      assert.ok(v.cost === 0 && v.percent <= 400 && boosted.percent <= 400);
      if (aura === 'holyFreeze') { assert.ok(v.percent <= 40 && boosted.percent <= 45); assert.ok(v.min > 0 && v.max >= v.min); }
      if (level > 1) { const previous = mercenaryAuraValues(aura, level - 1); for (const key of ['rank', 'healing', 'damage', 'attack', 'percent', 'min', 'max', 'radius'] as const) assert.ok(v[key] >= previous[key]); }
    }
  }
  assert.ok(mercenaryAuraRank(99) > mercenaryAuraRank(90));
});

test('native Might improves the guard’s inherent melee damage without requiring a weapon', () => {
  const h = newHero(); h.level = 90; h.gold = 100000; h.campaign.cleared[0] = 5; hireMercenary(h, true);
  const normal = mercenaryStats(h).attack; h.mercenary!.aura = 'might';
  assert.ok(mercenaryStats(h).attack > normal * 2); assert.ok(mercenaryStats(h).attack < normal * 3);
});

test('same-name auras select actual stronger effects rather than comparing different rank curves', () => {
  const h = newHero(); h.level = 90; h.gold = 100000; h.campaign.cleared[0] = 5; hireMercenary(h, true);
  h.skills.prayer = 20; h.activeAura = 'prayer';
  const nativeHeal = mercenaryAuraValues('prayer', 90).healing;
  assert.ok(nativeHeal > skillValues('prayer', 20, emptySkills()).healing); assert.equal(stats(h).auras.find(aura => aura.id === 'prayer')!.healing, nativeHeal);
  h.mercenary!.aura = 'might'; h.skills.might = 15; h.activeAura = 'might';
  assert.equal(stats(h).auras.filter(aura => aura.id === 'might').length, 1); assert.equal(stats(h).auras.find(aura => aura.id === 'might')!.damage, skillValues('might', 15).damage);
  h.mercenary!.equipment.weapon = makeItem(BASES.find(base => base.baseCode === 'vou')!); h.mercenary!.equipment.weapon!.mods = { aura_might: 20, allSkills: 2 };
  assert.equal(mercenaryAuras(h).find(aura => aura.id === 'might')!.damage, skillValues('might', 20).damage);
  setMercenaryDistance(h, 100); assert.equal(stats(h).auras.find(aura => aura.id === 'might')!.rank, 15);
  h.mercenary!.status = 'dead'; h.mercenary!.hp = 0; assert.deepEqual(mercenaryAuras(h), []);
});

test('Prayer heals the player and guard at the current level, respects range and stops after death', t => {
  const f = combatFixture(t), h = f.hero; h.hp = h.mercenary!.hp = 10; h.mana = 0;
  f.combat.pulse(); f.merc.pulse(); const healing = mercenaryAuraValues('prayer', 90).healing;
  assert.equal(h.hp, 10 + healing); assert.equal(h.mercenary!.hp, 10 + healing); assert.equal(h.mana, 0);
  f.merc.position!.z = 100; f.merc.sync(); f.combat.pulse(); f.merc.pulse();
  assert.equal(h.hp, 10 + healing); assert.equal(h.mercenary!.hp, 10 + 2 * healing);
  f.merc.position!.copy(f.game.position); f.merc.sync(); f.merc.hurt(1e9, 'magic'); f.combat.pulse();
  assert.equal(h.hp, 10 + healing); assert.equal(h.mercenary!.status, 'dead');
});

test('Holy Freeze pulses once, chills bosses at half strength and keeps native melee chill within the aura curve', t => {
  const f = combatFixture(t), h = f.hero, enemy = f.enemy(1.6), boss = f.enemy(2);
  h.mercenary!.aura = 'holyFreeze'; boss.boss = true; const aura = mercenaryAuraValues('holyFreeze', 90);
  assert.equal(f.combat.slow(enemy), 1 - aura.percent / 100); assert.equal(f.combat.slow(boss), 1 - aura.percent / 200);
  const hp = enemy.hp; f.combat.pulse(); assert.equal(enemy.hp, hp, 'The player does not duplicate mercenary aura damage');
  f.merc.pulse(); assert.equal(hp - enemy.hp, (aura.min + aura.max) / 2);
  f.merc.strike(enemy); f.merc.strike(boss); assert.equal(enemy.coldTime, 0); assert.equal(boss.coldTime, 0);
  assert.equal(f.combat.slow(boss), 1 - aura.percent / 200);
  enemy.actor.group.position.z = aura.radius + 1; assert.equal(f.combat.slow(enemy), 1);
  h.mercenary!.status = 'dead'; assert.equal(f.combat.slow(boss), 1);
});

test('Thorns reflects the same level-scaled melee benefit for the player and guard, with no missile reflection', t => {
  const f = combatFixture(t), enemy = f.enemy(1.6), h = f.hero; h.mercenary!.aura = 'thorns';
  const aura = mercenaryAuraValues('thorns', 90), expected = 10 * aura.percent / 100 + aura.secondary;
  let hp = enemy.hp; f.merc.hurt(10, 'physical', enemy); assert.equal(hp - enemy.hp, expected);
  hp = enemy.hp; f.combat.hurt(10, 'physical', enemy); assert.equal(hp - enemy.hp, expected);
  hp = enemy.hp; f.merc.hurt(10, 'physical', enemy, true); f.game.invincible = 0; f.combat.hurt(10, 'physical', enemy, true);
  assert.equal(enemy.hp, hp);
  f.game.position.z = -aura.radius - 1; f.merc.sync(); f.game.invincible = 0; f.combat.hurt(10, 'physical', enemy);
  assert.equal(enemy.hp, hp, 'The player outside the guard aura receives no retaliation buff');
});
