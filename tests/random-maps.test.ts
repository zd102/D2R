import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, levelLayout, eliteCount, levelTuning } from '../src/campaign.ts';
import { AREA_MAP_PROFILES, areaMapProfile, MAP_SIZE_LIMIT } from '../src/area-map-profiles.ts';
import { layoutWalkable } from '../src/level-layouts.ts';
import { nextMapSeed } from '../src/map-random.ts';
import { encounterPlan } from '../src/encounter-plan.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { monsterExperience } from '../src/balance.ts';
import { simulateProgression } from './balance-fixtures.ts';

const seeds = [0, 1, 17, 20260910, 0x7fffffff, 0xffffffff, 811, 91919];
test('200 generated maps connect every objective, room, boss, chest and encounter to a safe entrance', () => {
  for (const level of LEVELS) for (const seed of seeds) {
    const layout = levelLayout(level,seed), label = `${level.name}, seed ${seed}`;
    const {width,height}=layout, offsetX=layout.bounds.x+1,offsetZ=layout.bounds.z+1;
    const reachable = new Uint8Array(width*height);
    for (let z=1;z<height-1;z++) for(let x=1;x<width-1;x++) reachable[z*width+x] = Number(layoutWalkable(layout,x-offsetX,z-offsetZ));
    const queue = [offsetX+(offsetZ+11)*width]; reachable[queue[0]] = 2;
    for (let i=0;i<queue.length;i++) for(const neighbor of [queue[i]-1,queue[i]+1,queue[i]-width,queue[i]+width]) {
      if(reachable[neighbor]===1){reachable[neighbor]=2;queue.push(neighbor);}
    }
    assert.ok(queue.length>1000 && queue.length<25000, `${label}: floor area ${queue.length}`);
    assert.deepEqual(layout.spawn,{x:0,z:11});
    assert.equal(layout.objects.length,level.quest.kind==='interact'?level.quest.count:0,label);
    assert.equal(layout.chests.length,4+Math.floor(level.act/2),label);
    const plan = encounterPlan(level,layout,2);
    for(const point of [layout.boss,layout.exit,layout.supply,...layout.objects,...layout.chests,...layout.rooms,...plan.packs,...plan.eliteSites]) {
      const cell = Math.round(point.x)+offsetX+(Math.round(point.z)+offsetZ)*width;
      assert.equal(reachable[cell],2,`${label}: reachable ${point.x},${point.z}`);
    }
    for(const pack of plan.packs) {
      assert.ok(Math.hypot(pack.x,pack.z-11)>=15,label);
      assert.ok(Math.hypot(pack.x-layout.boss.x,pack.z-layout.boss.z)>=10,label);
    }
    assert.equal(plan.eliteSites.length,eliteCount(level,2),label);
    assert.ok(plan.normalCount>=12&&plan.normalCount<=areaMapProfile(level).packs*3,`${label}: population ${plan.normalCount}`);
  }
});

test('25 distinct regional footprints stay below 300 and produce measurably different exploration areas', () => {
  assert.equal(new Set(AREA_MAP_PROFILES.map(p=>`${p.width}x${p.height}`)).size,25);
  for(const profile of AREA_MAP_PROFILES) {
    assert.ok(profile.width<=MAP_SIZE_LIMIT&&profile.height<=MAP_SIZE_LIMIT);
    assert.equal(profile.width%2,1);assert.equal(profile.height%2,1);
  }
  const area=(index:number,seed:number)=>{
    const layout=levelLayout(LEVELS[index],seed);let cells=0;
    for(let x=-layout.bounds.x;x<=layout.bounds.x;x++)for(let z=-layout.bounds.z;z<=layout.bounds.z;z++)cells+=Number(layoutWalkable(layout,x,z));
    return cells;
  };
  for(const seed of seeds) {
    assert.ok(area(16,seed)>area(23,seed)*4,'despair plains remain much larger than the summit');
    assert.ok(area(10,seed)>area(1,seed)*2,'spider forest remains much larger than the cemetery');
    for(const index of [5,7,17,20,24]) {
      const layout=levelLayout(LEVELS[index],seed);
      const xSpan=Math.max(...layout.rooms.map(p=>p.x))-Math.min(...layout.rooms.map(p=>p.x));
      const zSpan=Math.max(...layout.rooms.map(p=>p.z))-Math.min(...layout.rooms.map(p=>p.z));
      assert.ok(zSpan>xSpan*1.5,`${LEVELS[index].name}: actual traversable layout is elongated`);
    }
  }
});

test('seeds reproduce layouts without sharing mutable state, and each area changes geometry and exploration branches', () => {
  assert.notEqual(nextMapSeed(),nextMapSeed());
  for(const level of LEVELS) {
    const a=levelLayout(level,7),b=levelLayout(level,7);
    assert.deepEqual(a,b); a.objects.push({x:999,z:999}); assert.notDeepEqual(a,b);
    const maps=seeds.map(seed=>levelLayout(level,seed));
    assert.equal(new Set(maps.map(map=>JSON.stringify([map.rooms,map.connections]))).size,seeds.length,level.name);
    assert.ok(new Set(maps.map(map=>JSON.stringify(map.chests))).size>4,level.name);
    if(level.index!==8)assert.ok(new Set(maps.map(map=>map.branches.length)).size>1,level.name);
  }
  const directions = Array.from({length:40},(_,seed)=>levelLayout(LEVELS[8],seed).boss).map(p=>`${Math.sign(p.x)},${Math.sign(p.z)}`);
  assert.equal(new Set(directions).size,4,'the journal and summoner can occupy any of four arms');
});

test('all 75 area/difficulty combinations keep XP and loot budgets independent of random population', () => {
  for(const level of LEVELS)for(const difficulty of [0,1,2]) {
    const rewards:number[]=[];
    for(const seed of seeds) {
      const plan=encounterPlan(level,levelLayout(level,seed),difficulty),tuning=levelTuning(level,difficulty);
      const xp=plan.packs.flatMap(pack=>pack.species).reduce((sum,id)=>sum+monsterExperience(Math.min(98,tuning.level),tuning.level,'monster',{difficulty,act:level.act,baseLife:MONSTERS[id].hp})*plan.xpScale,0);
      rewards.push(xp);
      assert.equal(plan.eliteSites.length,eliteCount(level,difficulty));
      assert.ok(plan.normalCount*plan.lootScale<=tuning.packs*3*1.15+1e-8);
      const weight=plan.packs.flatMap(pack=>pack.species).reduce((sum,id)=>sum+Math.max(.7,Math.min(1.4,Math.sqrt(MONSTERS[id].hp/24))),0);
      assert.ok(Math.abs(weight*plan.xpScale/plan.referenceWeight-1.2)<1e-8);
    }
    // Flooring individual legacy XP awards causes small variation at level 1.
    assert.ok(Math.max(...rewards)/Math.min(...rewards)<1.06,`${level.name}/${difficulty}: ${rewards}`);
  }
});

test('partial and full exploration retain consistent campaign progression across seeds', () => {
  for(const fraction of [.65,1]) {
    const curves=[0,1,17,20260910,91919].map(seed=>simulateProgression(fraction,seed));
    for(let act=0;act<15;act++) {
      const levels=curves.map(curve=>curve[act].level);
      assert.ok(Math.max(...levels)-Math.min(...levels)<=1,`fraction ${fraction}, act ${act}: ${levels}`);
    }
    const final=curves[0].filter((_,index)=>index%5===4).map(row=>row.level);
    assert.deepEqual(final,fraction===1?[44,71,91]:[40,67,89]);
  }
});
