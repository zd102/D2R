import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { ENDGAME_BUILDS, endgameHero } from '../scripts/endgame-audit-builds.mjs';
import { PROFILE_PREFIX, LAST_PROFILE_KEY } from '../src/saves.ts';

const output=process.env.OUTPUT_DIR??'.verification/endgame-audit-browser';await mkdir(output,{recursive:true});
const url=new URL(process.env.BASE_URL??'http://127.0.0.1:5173');url.searchParams.set('mode','local');
const browser=await chromium.launch({channel:'msedge',headless:true}),rows=[],errors=[];
const ids=(process.env.AUDIT_BUILDS??'smite,javazon,blizzard,summonnec,frenzy,summondruid,martial').split(',');
try {
  for(const id of ids)for(const encounter of (process.env.AUDIT_ENCOUNTERS??'uberDiablo,gauntlet').split(',')){
    const build=ENDGAME_BUILDS.find(b=>b.id===id),fixture=endgameHero(build),context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('const game = new Game();','const game = new Game(); window.endgameTest = game;')});});
    const profile={version:2,id:`endgame-${id}`,name:`成型审计-${id}`,createdAt:1,updatedAt:1,revision:1,hero:fixture.hero};
    await page.addInitScript(({profile,prefix,last})=>{localStorage.setItem(prefix+profile.id,JSON.stringify(profile));localStorage.setItem(last,profile.id);},{profile,prefix:PROFILE_PREFIX,last:LAST_PROFILE_KEY});
    await page.goto(url.href);await page.getByRole('button',{name:'进入旅程',exact:true}).click();await page.waitForFunction(()=>window.endgameTest&&!window.endgameTest.paused);
    const result=await page.evaluate(async({build,primary,encounter})=>{
      const {stats,skillLevel,swapWeapons}=await import('/src/model.ts'),{skillValues}=await import('/src/paladin.ts'),{BOSSES,MONSTERS}=await import('/src/bestiary.ts');
      const {POTIONS,potionIndex,useRecoveryPotion}=await import('/src/potions.ts'),{mercenaryStats,feedMercenaryPotion}=await import('/src/mercenary.ts');
      const g=window.endgameTest;cancelAnimationFrame(g.frameId);g.specialArea=encounter==='uberDiablo'?'uberDiablo':'pandemonium';g.challengeStage=0;g.hero.bossDefeated=false;g.loadArea(false);g.releaseInput();g.hero.running=false;
      // Seed combat and record the generated map seed; retain real map collision.
      const originalRandom=Math.random;let seed=239;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
      const removeEnemies=()=>{for(const e of g.enemies){g.world.physics.removeBody(e.body);e.actor.group.visible=false;}g.enemies=[];};removeEnemies();
      const bossPoint=g.world.layout.boss,origin=g.position.clone().set(bossPoint.x,0,bossPoint.z);
      const point=Array.from({length:8},(_,i)=>origin.clone().add({x:Math.sin(i*Math.PI/4)*5,y:0,z:Math.cos(i*Math.PI/4)*5})).find(p=>g.world.canWalk(origin,p));
      if(!point)throw Error('No legal starting position');g.position.copy(point);g.body.position.set(point.x,.5,point.z);
      const h=g.hero,c=g.combat,m=g.monsterCombat,dt=.04;
      const buffs=[...(build.form?[build.form]:[]),...(h.classId==='paladin'?['holyShield']:h.classId==='barbarian'?['battleCommand','battleOrders','shout']:h.classId==='sorceress'?['frozenArmor','thunderStorm']:h.classId==='necromancer'?['boneArmor']:h.classId==='assassin'?['fade','venom']:['cycloneArmor','hurricane'])].filter(id=>skillLevel(h,id));
      const prep=id=>{h.mana=Math.max(h.mana,skillValues(id,skillLevel(h,id),h.skills).cost);c.lock=0;c.actionCooldowns={};if(!c.castAction(id))throw Error(`Cannot prepare ${id}`);for(let i=0;i<25;i++){g.mercenary.update(dt);c.update(dt);}};
      if(h.classId!=='barbarian'){swapWeapons(h);prep('battleCommand');prep('battleOrders');swapWeapons(h);}
      for(const id of buffs)prep(id);
      for(const id of build.pets??[])if(skillLevel(h,id))for(let n=0;n<Math.min(24,skillValues(id,skillLevel(h,id),h.skills).hits);n++){
        const p=g.position.clone().add({x:0,y:0,z:1});g.aim.copy(p);
        if(['raiseSkeleton','raiseSkeletalMage'].includes(id)){const corpse=g.spawnEnemy(p.x,p.z,'skeleton',MONSTERS.skeleton);corpse.dead=true;corpse.hp=0;g.world.physics.removeBody(corpse.body);}
        prep(id);
      }
      if(build.id==='martial'){
        const p=g.position.clone().add({x:0,y:0,z:1}),dummy=g.spawnEnemy(p.x,p.z,'skeleton',MONSTERS.skeleton);dummy.maxHp=dummy.hp=1e8;g.target=dummy;g.aim.copy(p);
        for(const id of ['clawsOfThunder','bladesOfIce','cobraStrike','tigerStrike',primary])if(skillLevel(h,id)){
          const target=id==='phoenixStrike'?2:3;let attempts=0;
          while((c.expansion.charges[id]?.stacks??0)<target&&attempts++<40)prep(id);
          if(c.expansion.charges[id]?.stacks!==target)throw Error(`Cannot charge ${id}`);
        }
      }
      removeEnemies();g.target=undefined;g.aim.copy(origin);c.lock=0;c.actionCooldowns={};const ready=stats(h);h.hp=ready.maxHp;h.mana=ready.maxMana;h.potionRecovery=[];g.invincible=0;
      if(h.mercenary){h.mercenary.hp=mercenaryStats(h).maxHp;g.mercenary.sync();}
      if(encounter==='uberDiablo')g.spawnEnemy(bossPoint.x,bossPoint.z,'boss',BOSSES[19]);else g.spawnChallengeBoss();
      for(const e of g.enemies)e.active=true;
      const first=g.enemies.find(e=>e.boss),rounds=[],pots=[0,0,0,0];let time=0,minLife=100,casts=0,previous=first,start=0;
      const record=()=>rounds.push({name:previous.name,won:previous.dead,seconds:Math.round((time-start)*10)/10,remaining:Math.round(Math.max(0,previous.hp)/previous.maxHp*1000)/10});
      try {
        for(let tick=0;time-start<300&&!g.dead&&!h.bossDefeated;tick++){
          const living=g.enemies.filter(e=>c.hostile(e)),target=living.sort((a,b)=>a.actor.group.position.distanceToSquared(g.position)-b.actor.group.position.distanceToSquared(g.position))[0];
          const current=living.find(e=>e.boss);if(current&&current!==previous){record();previous=current;start=time;current.active=true;}
          if(target){
            g.target=target;g.aim.copy(target.actor.group.position).setY(0);const delta=target.actor.group.position.clone().sub(g.position).setY(0),distance=delta.length();
            const melee=['smite','javazon','frenzy','fury','martial'].includes(build.id),reach=melee?2:build.range??8;
            if(!c.movementLocked&&(distance>reach+.2||!melee&&time%3>=2)){
              if(tick%5===0){const goal=distance>reach?target.actor.group.position:distance<reach*.5?g.position.clone().addScaledVector(delta.normalize(),-3):g.position.clone().add(delta.clone().set(delta.z,0,-delta.x).normalize().multiplyScalar(3));g.path=g.world.path(g.position,goal);}
            } else {
              g.path=[];
              if(c.lock<=0&&!c.expansion.locked&&!c.zeal&&!c.classes.sequence&&time%3<2){
                const cast=id=>{const ok=c.castAction(id);casts+=Number(ok);return ok;};let acted=false;
                for(const id of buffs){const expired=id==='holyShield'?h.holyShield<=0:!h.buffs[id]||(h.buffs[id].remaining<1&&!['boneArmor','cycloneArmor'].includes(id));if(expired&&cast(id)){acted=true;break;}}
                if(!acted&&build.curse&&!c.itemCurses.has(target))acted=cast(build.curse);
                if(!acted)for(const id of build.pets??[]){if(!skillLevel(h,id)||c.expansion.pets.pets.filter(p=>p.expansionId===id).length>=Math.min(24,skillValues(id,skillLevel(h,id),h.skills).hits))continue;
                  const corpse=['raiseSkeleton','raiseSkeletalMage'].includes(id)?c.expansion.pets.corpse(g.position,14):undefined;
                  if(['raiseSkeleton','raiseSkeletalMage'].includes(id)&&!corpse)continue;
                  g.target=undefined;g.aim.copy(corpse?.actor.group.position??g.position.clone().add({x:0,y:0,z:1}));acted=cast(id);g.target=target;g.aim.copy(target.actor.group.position);if(acted)break;
                }
                if(!acted&&h.classId==='sorceress'&&skillLevel(h,'staticField')&&target.hp/target.maxHp>.55&&distance<=skillValues('staticField',skillLevel(h,'staticField'),h.skills).radius)acted=cast('staticField');
                if(!acted&&build.id==='martial'){const charges=['clawsOfThunder','bladesOfIce','cobraStrike','tigerStrike',primary].filter(id=>skillLevel(h,id));const missing=charges.find(id=>(c.expansion.charges[id]?.stacks??0)<(id==='phoenixStrike'?2:3));acted=cast(missing??'dragonTalon');}
                if(!acted&&build.id==='blizzard'&&c.readyIn(primary)>0)acted=cast('iceBlast');
                if(!acted&&build.traps)acted=cast(c.expansion.traps.length<5?primary:'fireBlast');
                if(!acted)cast(primary);
              }
            }
          }
          const s=stats(h);
          for(let i=0;i<2;i++){const index=potionIndex(i?'mp5':'hp5');if(h[i?'mana':'hp']<s[i?'maxMana':'maxHp']*.55&&pots[i]<8&&!h.potionRecovery.some(e=>POTIONS[e.index].kind===(i?'mana':'health'))){h.potions[index]=1;if(!useRecoveryPotion(h,index,s.maxHp,s.maxMana))pots[i]++;}}
          if(h.hp<s.maxHp*.35&&pots[2]<8){const index=potionIndex('rvl');h.potions[index]=1;if(!useRecoveryPotion(h,index,s.maxHp,s.maxMana))pots[2]++;}
          if(h.mercenary?.status==='alive'&&h.mercenary.hp<mercenaryStats(h).maxHp*.5&&!h.mercenary.potionHealing&&pots[3]<8){h.potions[potionIndex('hp5')]=1;if(feedMercenaryPotion(h))pots[3]++;}
          g.target=undefined;g.update(dt);time+=dt;minLife=Math.min(minLife,h.hp/stats(h).maxHp*100);
        }
        record();g.paused=true;g.updateCamera(1);g.composer.render();g.ui.update(0);
        return {build:build.id,encounter,won:h.bossDefeated&&!g.dead,dead:g.dead,seconds:Math.round(time*10)/10,minLife:Math.round(minLife*10)/10,pots,casts,rounds,mercenaryAlive:h.mercenary?.status==='alive',seed:239,mapSeed:g.world.layout.seed};
      } finally {Math.random=originalRandom;}
    },{build,primary:fixture.primary,encounter});
    assert.ok(result.casts>0||result.rounds.some(r=>r.remaining<100));rows.push(result);await writeFile(`${output}/results.json`,JSON.stringify(rows,null,2));
    await page.screenshot({path:`${output}/${id}-${encounter}.png`});await context.close();console.log(JSON.stringify(result));
  }
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
