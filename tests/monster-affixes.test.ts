import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMonsterAffixes, monsterAffixCount, rollMonsterAffixes, MONSTER_AFFIXES, CHAMPION_VARIANTS, SUPER_UNIQUE_AFFIXES, SUPER_UNIQUE_AURAS, monsterAffix, monsterDamageParts, rollChampionVariant } from '../src/monster-affixes.ts';
import { MONSTERS, BOSSES } from '../src/bestiary.ts';
import { LEVELS } from '../src/campaign.ts';
import { monsterStats } from '../src/balance.ts';

function rng(seed: number) { return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; }; }
test('13 D2 affixes roll without duplicates, respect attack/movement eligibility and allow elemental combinations', () => {
  assert.equal(MONSTER_AFFIXES.length, 13);
  assert.deepEqual([0, 1, 2].map(monsterAffixCount), [1, 2, 3]);
  const seen = new Set<string>();
  for (const difficulty of [0, 1, 2]) for (let seed = 1; seed < 300; seed++) {
    const affixes = rollMonsterAffixes(difficulty, rng(seed * 9137), true, MONSTERS.rogue);
    assert.equal(affixes.length, difficulty + 1); assert.equal(new Set(affixes.map(a => a.id)).size, affixes.length);
    affixes.forEach(a => seen.add(a.id));
    if (!difficulty) assert.ok(!affixes.some(a => a.id === 'magicResistant'));
    assert.ok(!rollMonsterAffixes(difficulty, rng(seed), false, MONSTERS.zombie).some(a => ['extraFast', 'teleportation', 'multishot'].includes(a.id)));
  }
  assert.equal(seen.size, 13);
  const combined = rollMonsterAffixes(0, rng(1), true, MONSTERS.rogue, ['fireEnchanted', 'coldEnchanted', 'lightningEnchanted']);
  assert.equal(combined.length, 3);
});
test('every non-chapter boss has fixed identity plus zero/one/two distinct random bonuses', () => {
  for (const [i, boss] of BOSSES.entries()) {
    if (LEVELS[i].actBoss) continue;
    const fixed = SUPER_UNIQUE_AFFIXES[boss.id]; assert.ok(fixed?.length, boss.id);
    for (const diff of [0, 1, 2]) for (let seed = 0; seed < 20; seed++) {
      const affixes = rollMonsterAffixes(diff, rng(seed), boss.speed > 0, boss, fixed, SUPER_UNIQUE_AURAS[boss.id]);
      assert.equal(affixes.length, fixed.length + diff);
      assert.deepEqual(affixes.slice(0, fixed.length).map(a => a.id), fixed);
      assert.equal(new Set(affixes.map(a => a.id)).size, affixes.length);
      if (SUPER_UNIQUE_AURAS[boss.id]) assert.equal(affixes.find(a => a.id === 'auraEnchanted')?.aura, SUPER_UNIQUE_AURAS[boss.id]);
    }
  }
});
test('all species, bosses, difficulties and stacked affixes cap every resistance at 85, retaining weaknesses', () => {
  for (const diff of [0, 1, 2]) for (const definition of [...Object.values(MONSTERS), ...BOSSES]) {
    const base = { ...monsterStats(definition, LEVELS[24], diff, true), speed: definition.speed };
    const before = structuredClone(base);
    const tuned = applyMonsterAffixes(base, MONSTER_AFFIXES);
    assert.ok(Object.values(tuned.resistances).every(value => value <= 85)); assert.deepEqual(base, before);
  }
  const base = { ...monsterStats(BOSSES[4], LEVELS[4], 0, true), speed: 2 };
  assert.ok(applyMonsterAffixes(base, []).resistances.fire < 0);
  assert.equal(applyMonsterAffixes(base, [monsterAffix('stoneSkin')]).resistances.physical, 50);
});
test('champions have five distinct variants; ghostly resists physical, berserker sacrifices life, possessed doubles champion life', () => {
  const base = { ...monsterStats(MONSTERS.fallen, LEVELS[0], 0), speed: 2 };
  const variants = CHAMPION_VARIANTS.map(v => applyMonsterAffixes(base, [], v));
  assert.equal(CHAMPION_VARIANTS.length, 5);
  assert.ok(variants[1].maxHp < variants[0].maxHp && variants[1].damage > variants[0].damage);
  assert.equal(variants[2].defense, Math.round(base.defense * .3));
  assert.equal(variants[3].resistances.physical, 80);
  assert.ok(Math.abs(variants[4].maxHp - variants[0].maxHp * 2) <= 1);
  assert.equal(rollChampionVariant(() => 1).id, 'possessed');
});
test('enchanted attacks deal mixed damage and extra strong scales only physical; spectral hit covers five elements', () => {
  const enemy = { affixes: ['extraStrong', 'fireEnchanted', 'coldEnchanted', 'lightningEnchanted'].map(id => monsterAffix(id as 'extraStrong')) };
  assert.deepEqual(monsterDamageParts(enemy, 100, 'physical'), [{ type: 'physical', amount: 135 }, { type: 'fire', amount: 30 }, { type: 'cold', amount: 30 }, { type: 'lightning', amount: 30 }]);
  assert.equal(monsterDamageParts(enemy, 100, 'magic')[0].amount, 100);
  const types = [0, .2, .4, .6, .8].map(n => monsterDamageParts({ affixes: [monsterAffix('spectralHit')] }, 10, 'physical', () => n)[1].type);
  assert.deepEqual(types, ['fire', 'cold', 'lightning', 'poison', 'magic']);
});
