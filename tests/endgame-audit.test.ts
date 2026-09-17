import test from 'node:test';
import assert from 'node:assert/strict';
import { ENDGAME_BUILDS, ENDGAME_STAGE, endgameHero } from '../scripts/endgame-audit-builds.mjs';
import { ENDGAME_ENCOUNTERS } from '../scripts/endgame-audit-encounters.mjs';
import { auditEncounter } from '../scripts/class-audit-combat.mjs';
import { parseSave, serializeSave, activeEquipment, skillLevel, swapWeapons } from '../src/model.ts';
import { isHellfireTorch } from '../src/items.ts';

test('endgame loadouts survive actual save validation and CTA weapon switching without granting illegal skills or torches', () => {
  for (const build of ENDGAME_BUILDS) {
    const { hero } = endgameHero(build), restored = parseSave(serializeSave(hero))!;
    assert.ok(restored); assert.equal(restored.level,99);
    assert.equal(restored.inventory.some(isHellfireTorch),false);
    assert.equal(restored.inventory.length,19);
    assert.equal(activeEquipment(restored).length,Object.values(restored.equipment).filter(Boolean).length);
    const before = restored.equipment.weapon!.id;
    swapWeapons(restored); assert.ok(skillLevel(restored,'battleOrders')>0);
    swapWeapons(restored); assert.equal(restored.equipment.weapon!.id,before);
    assert.ok(Object.values(restored.skills).reduce((a,b)=>a+b,0)<=110);
  }
});

test('endgame audit actually engages special-area bosses and uses their live health budgets', () => {
  const build=ENDGAME_BUILDS[0],hero=endgameHero(build).hero;
  const row=auditEncounter(build,ENDGAME_STAGE,{hero,kind:'boss',encounters:[ENDGAME_ENCOUNTERS[1]],seconds:5,cta:true});
  assert.equal(row.rounds[0].hp,1800000);
  assert.ok(row.damage>0);assert.ok(row.casts.smite>0);assert.ok(row.rounds[0].remaining<100);
  assert.equal(row.won,false);assert.equal(row.rounds.length,1);
});

test('continuous audit advances only after a kill and retains health/potion budgets across rounds', () => {
  const build=ENDGAME_BUILDS[0],hero=endgameHero(build).hero;
  const row=auditEncounter(build,ENDGAME_STAGE,{hero,kind:'boss',encounters:ENDGAME_ENCOUNTERS.slice(2,4),seconds:120,cta:true,rejuvs:2,mercPotions:2});
  assert.equal(row.rounds.length,2);assert.ok(row.rounds[0].won);
  assert.ok(row.seconds>=row.rounds[0].seconds);
  assert.ok(row.hpPotions<=8&&row.manaPotions<=8&&row.rejuvsUsed<=2&&row.mercPotionsUsed<=2);
  assert.equal(row.hpPotions,row.rounds.reduce((n,r)=>n+r.hpPotions,0));
});
