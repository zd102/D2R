import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MONSTERS, BOSSES, encounterPool, ENCOUNTERS } from '../src/bestiary.ts';
import { SPECIES_TRAITS, monsterTraits } from '../src/monster-traits.ts';
import { monsterStats } from '../src/balance.ts';
import { LEVELS, levelLayout } from '../src/campaign.ts';
import { encounterPlan } from '../src/encounter-plan.ts';
import { monsterAttackSpec } from '../src/monster-combat.ts';
import { canMultishot } from '../src/monster-affixes.ts';

test('every species has a distinct documented role and valid stats through all difficulties', () => {
  for (const definition of Object.values(MONSTERS)) {
    assert.ok(SPECIES_TRAITS[definition.id], definition.id);
    for (const difficulty of [0, 1, 2]) {
      const values = monsterStats(definition, LEVELS[24], difficulty), traits = monsterTraits(definition);
      assert.ok(values.damage > 0 && values.defense > 0 && values.attackRating > 0);
      assert.ok(Object.values(values.resistances).every(r => Number.isFinite(r) && r <= 85));
      assert.ok(traits.chill[difficulty] >= 0 && traits.chill[difficulty] <= .5);
      for (const id of definition.attacks) {
        const spec = monsterAttackSpec(definition, id, difficulty);
        assert.ok(spec.windup > 0 && spec.cooldown > 0 && spec.range > 0, `${definition.id}/${id}`);
      }
    }
  }
  const fallen = monsterStats(MONSTERS.fallen, LEVELS[0], 0), zombie = monsterStats(MONSTERS.zombie, LEVELS[0], 0);
  assert.ok(zombie.damage > fallen.damage * 1.5);
  const knight = monsterStats(MONSTERS.doomKnight, LEVELS[19], 2), mage = monsterStats(MONSTERS.oblivion, LEVELS[19], 2);
  assert.ok(knight.defense > mage.defense * 1.5); assert.ok(knight.attackRating > mage.attackRating);
  assert.equal(monsterStats(BOSSES[4], LEVELS[4], 2, true).resistances.fire, -50);
  assert.equal(canMultishot(MONSTERS.soul), false, 'a beam must not roll a projectile-only affix');
  assert.equal(canMultishot(MONSTERS.boneMage), true);
});

test('Act V guests vary by difficulty; normal pools and encounter population budgets remain bounded', () => {
  for (const area of LEVELS) {
    assert.deepEqual(encounterPool(area.index, 0), ENCOUNTERS[area.index]);
    if (area.act < 4) assert.deepEqual(encounterPool(area.index, 2), ENCOUNTERS[area.index]);
    else {
      assert.ok(encounterPool(area.index, 1).length > ENCOUNTERS[area.index].length);
      assert.ok(encounterPool(area.index, 2).length > encounterPool(area.index, 1).length);
    }
    for (const difficulty of [0, 1, 2]) {
      const layout = levelLayout(area, 20260915), first = encounterPlan(area, layout, difficulty);
      assert.deepEqual(first, encounterPlan(area, layout, difficulty), 'same seed and difficulty reproduce the formation');
      for (const pack of first.packs) {
        assert.ok(pack.species.length >= 2 && pack.species.length <= 3);
        assert.ok(pack.species.every(id => encounterPool(area.index, difficulty).includes(id)));
        for (const id of pack.species) {
          const revive = MONSTERS[id].revive;
          if (revive && encounterPool(area.index, difficulty).includes(revive)) assert.ok(pack.species.includes(revive));
        }
      }
    }
  }
});
