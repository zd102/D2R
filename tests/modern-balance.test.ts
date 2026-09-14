import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modernEncounter} from './modern-balance-fixtures.ts';
import {simulateProgression} from './balance-fixtures.ts';

test('modern builds progress through the old bow gap and three difficulties with bounded supplies',t=>{
  let seed=239;t.mock.method(Math,'random',()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;});
  const rows=[];
  rows.push(modernEncounter(29,0,14,'bow'));
  for(const [level,difficulty] of [[41,0],[67,1],[89,2]] as const)for(const build of ['bow','foh','nova','hydra'] as const) {
    rows.push(modernEncounter(level,difficulty,24,build));
    rows.push(modernEncounter(level,difficulty,24,build,1,true));
  }
  console.table(rows);
  for(const row of rows){assert.ok(row.won,JSON.stringify(row));assert.ok(row.hpPotions<=8&&row.manaPotions<=8);}
});

test('bow, FoH, Nova and Hydra can complete 1pp at the recalibrated earned levels',t=>{
  let seed=239;t.mock.method(Math,'random',()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;});
  for(const row of simulateProgression(.65).filter(row=>row.act===4)) for(const build of ['bow','foh','nova','hydra'] as const) for(const pack of [false,true]) {
    seed=239;
    const result=modernEncounter(row.level,row.difficulty as 0|1|2,24,build,1,pack);
    assert.ok(result.won,JSON.stringify(result));assert.ok(result.hpPotions<=8&&result.manaPotions<=8);
  }
});

test('successful 8pp clears take longer than 1pp and all attempts retain bounded supplies',t=>{
  let seed=513;t.mock.method(Math,'random',()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;});
  const rows=[];
  for(const build of ['bow','foh','nova','hydra'] as const) {
    seed=513;const low=modernEncounter(89,2,24,build,1,true);
    seed=513;const high=modernEncounter(89,2,24,build,8,true);rows.push(high);
    assert.ok(low.won,JSON.stringify(low));
    // Moderate gear must clear 1pp; high-PP Hell can kill it before that clear
    // time. Only completed fights have comparable clear times.
    if(high.won)assert.ok(high.seconds>low.seconds,JSON.stringify({low,high}));
    else {assert.equal(high.minLife,0,JSON.stringify(high));assert.ok(high.remaining>0,JSON.stringify(high));}
  }
  console.table(rows);
  for(const row of rows){assert.ok(Number.isFinite(row.seconds)&&row.seconds>0);assert.ok(row.hpPotions<=8&&row.manaPotions<=8);}
});
