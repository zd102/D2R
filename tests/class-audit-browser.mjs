import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { AUDIT_BUILDS, AUDIT_STAGES, auditHero } from '../scripts/class-audit-builds.mjs';
import { skillLevel } from '../src/model.ts';
import { skillValues } from '../src/paladin.ts';
import { PROFILE_PREFIX, LAST_PROFILE_KEY } from '../src/saves.ts';

const output=process.env.OUTPUT_DIR??'.verification/class-audit-browser';await mkdir(output,{recursive:true});
const url=new URL(process.env.BASE_URL??'http://127.0.0.1:5173');url.searchParams.set('mode','local');
const browser=await chromium.launch({channel:'msedge',headless:true}),rows=[],errors=[];
try{
  for(const id of ['hammer','bow','blizzard','summonnec','whirlwind','summondruid','lighttraps'].filter(id=>!process.env.AUDIT_BUILDS||process.env.AUDIT_BUILDS.split(',').includes(id))){
    const build=AUDIT_BUILDS.find(b=>b.id===id),stage=AUDIT_STAGES[3],{hero,primary}=auditHero(build,stage),context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
    page.on('pageerror',error=>errors.push(`${id}: ${error.stack}`));
    await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('const game = new Game();','const game = new Game(); window.auditGame = game;')});});
    const profile={version:2,id:`audit-${id}`,name:`强度审计-${id}`,createdAt:1,updatedAt:1,revision:1,hero};
    await page.addInitScript(({profile,prefix,last})=>{localStorage.setItem(prefix+profile.id,JSON.stringify(profile));localStorage.setItem(last,profile.id);},{profile,prefix:PROFILE_PREFIX,last:LAST_PROFILE_KEY});
    await page.goto(url.href);await page.getByRole('button',{name:'进入旅程',exact:true}).click();await page.waitForFunction(()=>window.auditGame&&!window.auditGame.paused);
    const pets=(build.pets??[]).filter(id=>skillLevel(hero,id)).map(id=>({id,count:Math.min(24,skillValues(id,skillLevel(hero,id),hero.skills).hits)}));
    const result=await page.evaluate(async({id,primary,pets})=>{
      const g=window.auditGame;cancelAnimationFrame(g.frameId);g.loadArea(false);
      for(const enemy of g.enemies){g.world.physics.removeBody(enemy.body);enemy.actor.group.visible=false;}g.enemies=[];
      // Find a real traversable clearing. Keep static map/terrain collision.
      const offsets=[[-3,-3],[-3,3],[3,-3],[3,3],[0,5]];let center;
      for(const p of [g.world.layout.spawn,...g.world.layout.route]){const point=g.position.clone().set(p.x,0,p.z);if(offsets.every(([x,z])=>g.world.canWalk(point,point.clone().add({x,y:0,z})))){center=point;break;}}
      if(!center)center=g.position.clone();g.position.copy(center);g.body.position.set(center.x,.5,center.z);g.target=undefined;
      for(const pet of pets)for(let i=0;i<pet.count;i++){
        const p=center.clone();p.z+=2;g.aim.copy(p);g.hero.mana=5000;g.combat.actionCooldowns={};g.combat.lock=0;
        if(['raiseSkeleton','raiseSkeletalMage'].includes(pet.id)){const corpse=g.spawnEnemy(p.x,p.z,'skeleton');corpse.dead=true;corpse.hp=0;g.world.physics.removeBody(corpse.body);}
        assertCast(g.combat.castAction(pet.id),pet.id);
        for(let j=0;j<15;j++)g.combat.update(.04);
      }
      for(const e of g.enemies){g.world.physics.removeBody(e.body);e.actor.group.visible=false;}g.enemies=[];
      const {stats}=await import('/src/model.ts');const ready=stats(g.hero);g.hero.hp=ready.maxHp;g.hero.mana=ready.maxMana;g.combat.actionCooldowns={};g.combat.lock=0;
      g.hero.campaign.kills=g.level.quest.count;g.hero.campaign.objects=Array.from({length:g.level.quest.count},(_,i)=>i);
      const pos=center.clone();pos.z+=4;const boss=g.spawnEnemy(pos.x,pos.z,'boss');boss.active=true;g.target=boss;g.aim.copy(pos);
      const total=boss.maxHp;let minHp=g.hero.hp,casts=0,time=0;
      for(let i=0;i<200&&!g.dead&&!boss.dead;i++){
        g.target=boss;g.aim.copy(boss.actor.group.position);g.releaseInput();g.target=undefined;
        const c=g.combat;if(c.lock<=0&&!c.expansion.locked&&!c.zeal&&!c.classes.sequence){
          if(id==='whirlwind'){g.aim.copy(boss.actor.group.position).add({x:0,y:0,z:2});casts+=Number(c.castAction(primary,true));}
          else {g.target=boss;if(id==='summonnec'&&!c.itemCurses.has(boss))casts+=Number(c.castAction('amplifyDamage'));else if(id!=='lighttraps'||c.expansion.traps.length<5)casts+=Number(c.castAction(primary));g.target=undefined;}
        }
        g.update(.04);time+=.04;minHp=Math.min(minHp,g.hero.hp);
      }
      g.paused=true;g.updateCamera(1);g.composer.render();g.ui.update(0);
      return {id,seconds:Math.round(time*10)/10,bossHp:total,remaining:Math.round(Math.max(0,boss.hp)/total*1000)/10,won:boss.dead,dead:g.dead,minHp:Math.round(minHp),casts,pets:g.combat.expansion.pets.pets.length};
      function assertCast(ok,id){if(!ok)throw Error(`Cannot prepare ${id}`);}
    },{id,primary,pets});
    assert.ok(result.casts>0,`${id}: real casts`);assert.ok(result.remaining<100,`${id}: real damage`);rows.push(result);await page.screenshot({path:`${output}/${id}.png`});await context.close();
  }
  assert.deepEqual(errors,[]);await writeFile(`${output}/results.json`,JSON.stringify(rows,null,2));console.table(rows);
}finally{await browser.close();}
