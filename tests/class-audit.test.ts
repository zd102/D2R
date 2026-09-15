import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIT_BUILDS, AUDIT_STAGES, auditHero } from '../scripts/class-audit-builds.mjs';
import { auditEncounter } from '../scripts/class-audit-combat.mjs';
import { simulateProgression } from './balance-fixtures.ts';
import { activeEquipment } from '../src/model.ts';
import { CLASS_IDS } from '../src/classes.ts';
import { skillById } from '../src/paladin.ts';

test('audit stages follow earned mainline XP and every build uses legal skills and equipped gear',()=>{
  assert.deepEqual(new Set(AUDIT_BUILDS.map(b=>b.classId)),new Set(CLASS_IDS));
  const progression=simulateProgression(.65);
  for(const stage of AUDIT_STAGES){
    if(stage.index%5===4)assert.equal(stage.level,progression.find(r=>r.difficulty===stage.difficulty&&r.act===Math.floor(stage.index/5))?.level);
    for(const build of AUDIT_BUILDS){
      const {hero,skillBudget}=auditHero(build,stage);
      assert.ok(Object.values(hero.skills).reduce((a,n)=>a+n,0)<=skillBudget);
      for(const [id,rank] of Object.entries(hero.skills))if(rank){assert.ok(rank<=20);assert.ok(rank<=hero.level-skillById[id].level+1);for(const req of skillById[id].requires)assert.ok(hero.skills[req]);}
      if(build.id==='summonnec'&&stage.level>=24)assert.ok(hero.skills.summonResist,'Normal summon builds include summon resistance');
      const items=Object.values(hero.equipment).filter(Boolean);assert.equal(activeEquipment(hero).length,items.length);assert.equal(new Set(items.map(i=>i.id)).size,items.length);
    }
  }
});
test('the audit retains failures and does not turn a timeout into a fast kill',()=>{
  const result=auditEncounter(AUDIT_BUILDS.find(b=>b.id==='zeal'),AUDIT_STAGES.at(-1),{kind:'boss',seconds:.2});
  assert.equal(result.won,false);assert.equal(result.dead,false);assert.ok(result.remaining>0);assert.ok(result.seconds>=.2);
});
test('prepared summons and a cold start have different first-corpse costs',()=>{
  const build=AUDIT_BUILDS.find(b=>b.id==='summonnec'),stage=AUDIT_STAGES[3];
  const prepared=auditEncounter(build,stage,{seconds:5}),cold=auditEncounter(build,stage,{seconds:5,coldStart:true});
  assert.ok(prepared.preparationMana>0);assert.equal(cold.preparationMana,0);assert.ok(prepared.damage>cold.damage);assert.ok(cold.hpPotions<=8&&cold.manaPotions<=8);
});
test('Lightning Fury starts at throwing range rather than approaching a pack for Charged Strike',()=>{
  const r=auditEncounter(AUDIT_BUILDS.find(b=>b.id==='javazon'),AUDIT_STAGES.at(-1),{kind:'pack',seconds:.3});
  assert.ok(r.casts.lightningFury>=1);assert.equal(r.casts.chargedStrike,undefined);
});
