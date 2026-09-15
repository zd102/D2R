import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, gainXp, learnSkill, stats } from '../src/model.ts';
import { skillsForClass, EXPERIENCE } from '../src/paladin.ts';
import { CLASSES } from '../src/classes.ts';
import { BASES, makeItem } from '../src/items.ts';
import { PROFILE_PREFIX, LAST_PROFILE_KEY } from '../src/saves.ts';

const output=process.env.OUTPUT_DIR||'.verification/expansion-classes',url=new URL(process.env.BASE_URL||'http://127.0.0.1:5173');url.searchParams.set('mode','local');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
const bindings={necromancer:{cleave:'boneSpear',ward:'clayGolem',nova:'corpseExplosion',dash:'boneArmor'},barbarian:{cleave:'whirlwind',ward:'battleOrders',nova:'findItem',dash:'leap'},druid:{cleave:'wearwolf',ward:'summonSpiritWolf',nova:'cycloneArmor',dash:'summonGrizzly'},assassin:{cleave:'lightningSentry',ward:'burstOfSpeed',nova:'tigerStrike',dash:'dragonTail'}};
try{
  for(const id of Object.keys(bindings).filter(id=>!process.env.CLASS_FILTER||process.env.CLASS_FILTER===id)){
    const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage();
    page.on('pageerror',error=>errors.push(`${id}: ${error.stack}`));
    await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('const game = new Game();','const game = new Game(); window.professionGame = game;')});});
    const hero=newHero(id);gainXp(hero,EXPERIENCE[79]);for(const skill of skillsForClass(id))assert.ok(learnSkill(hero,skill.id));hero.mana=stats(hero).maxMana;
    if(id==='barbarian'||id==='assassin')hero.equipment.shield=makeItem(BASES.find(b=>b.baseCode===(id==='barbarian'?'hax':'ktr')));
    const profile={version:2,id:`${id}-regression`,name:`${CLASSES[id].name}回归`,createdAt:1,updatedAt:1,revision:1,hero};
    await page.addInitScript(({profile,prefix,last})=>{if(!sessionStorage.getItem('profession-seeded')){localStorage.setItem(prefix+profile.id,JSON.stringify(profile));localStorage.setItem(last,profile.id);sessionStorage.setItem('profession-seeded','1');}},{profile,prefix:PROFILE_PREFIX,last:LAST_PROFILE_KEY});
    await page.goto(url.href);await page.getByRole('button',{name:'进入旅程',exact:true}).click();await page.waitForFunction(()=>window.professionGame&&!window.eclipseState.paused);
    await page.keyboard.press('t');for(const tree of CLASSES[id].trees){await page.locator(`[data-tree="${tree}"]`).click();await expect(page.locator('.skill-node')).toHaveCount(10);await page.screenshot({path:`${output}/${id}-${tree}.png`});}
    for(const [slot,skill] of Object.entries(bindings[id]))await page.locator(`[data-binding="${slot}"]`).selectOption(skill);
    for(const width of [360,390]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:`${output}/${id}-${width}.png`});}
    await page.setViewportSize({width:1440,height:960});await page.keyboard.press('Escape');
    const aim=async(distance=3)=>{
      const point=await page.evaluate(distance=>{const g=window.professionGame;for(let i=0;i<24;i++){const angle=i*Math.PI/12,p=g.position.clone();p.x+=Math.cos(angle)*distance;p.z+=Math.sin(angle)*distance;if(g.world.canWalk(g.position,p)){g.aim.copy(p);return {world:{x:p.x,z:p.z},screen:g.project(p)};}}throw Error('No test landing');},distance);
      await page.mouse.move(point.screen.x,point.screen.y);await page.waitForTimeout(80);return point;
    };
    await aim();await page.keyboard.press('q');
    if(id==='barbarian')await page.waitForFunction(()=>window.eclipseState.expansionCombat.motion==='whirlwind');
    if(id==='druid')await page.waitForFunction(()=>window.eclipseState.expansionCombat.form==='wolf');
    if(id==='necromancer')await page.waitForFunction(()=>window.eclipseState.expansionCombat.missiles.some(m=>m.skill==='boneSpear'));
    if(id==='assassin')await page.waitForFunction(()=>window.eclipseState.expansionCombat.traps.length===1);
    await page.waitForTimeout(800);await aim();await page.keyboard.press('w');
    if(id==='necromancer'||id==='druid')await page.waitForFunction(()=>window.eclipseState.expansionCombat.summons.length===1);
    else await page.waitForFunction(id=>!!window.eclipseState.buffs[id],id==='barbarian'?'battleOrders':'burstOfSpeed');
    await page.waitForTimeout(800);await aim();await page.keyboard.press('r');
    if(id==='barbarian')await page.waitForFunction(()=>window.professionGame.combat.expansion.motion?.id==='leap'&&window.professionGame.actor.group.position.y>.1);
    if(id==='druid')await page.waitForFunction(()=>window.eclipseState.expansionCombat.summons.length===2);
    if(id==='necromancer')await page.waitForFunction(()=>!!window.eclipseState.buffs.boneArmor);
    await page.waitForTimeout(700);await page.screenshot({path:`${output}/${id}-playing.png`});
    // A controlled encounter uses the real spawned actor and combat code, in an isolated browser save.
    const result=await page.evaluate(async id=>{
      const g=window.professionGame;g.loadArea(false);g.paused=true;
      const p=g.position.clone();p.z+=2;const enemy=g.spawnEnemy(p.x,p.z,'skeleton');enemy.hp=enemy.maxHp=10000;enemy.active=false;enemy.defense=0;g.target=enemy;g.aim.copy(p);g.paused=false;
      g.combat.actionCooldowns={};g.hero.mana=Math.max(500,g.hero.mana);
      if(id==='assassin'){for(let i=0;i<3;i++){g.combat.actionCooldowns={};g.combat.castAction('tigerStrike');}g.combat.actionCooldowns={};g.combat.castAction('dragonTail');}
      if(id==='necromancer')g.combat.castAction('boneSpear');
      if(id==='barbarian')g.combat.castAction('frenzy');
      if(id==='druid')g.combat.castAction('feralRage');
      for(let i=0;i<25;i++)g.combat.update(.04);
      g.paused=true;return {hp:enemy.hp,pets:g.combat.expansion.pets.pets.length,charges:g.combat.expansion.charges.tigerStrike?.stacks};
    },id);
    assert.ok(result.hp<10000,`${id} damages a real monster`);if(id==='druid')assert.equal(result.pets,2);if(id==='necromancer')assert.equal(result.pets,1);
    const saveCheck=await page.evaluate(async()=>{const g=window.professionGame,result=g.save(false);await g.onlineSaves?.flush();return {result,live:g.hero.companions,stored:g.saves.read(g.profile.id).hero.companions};});assert.equal(saveCheck.result,true,`${id}: save accepted`);assert.equal(saveCheck.stored?.length??0,result.pets,`${id}: companions serialized ${JSON.stringify(saveCheck)}`);await page.reload();await page.getByRole('button',{name:'进入旅程',exact:true}).click();await page.waitForFunction(()=>!window.eclipseState.paused);
    const saved=await page.evaluate(()=>({id:window.eclipseState.classId,pets:window.eclipseState.expansionCombat.summons.length,bindings:window.eclipseState.bindings}));assert.equal(saved.id,id);for(const [slot,skill] of Object.entries(bindings[id]))assert.equal(saved.bindings[slot],skill);if(result.pets)assert.equal(saved.pets,result.pets,`${id}: companions restored ${JSON.stringify({saved,saveCheck})}`);
    await page.screenshot({path:`${output}/${id}-reloaded.png`});await context.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: four classes, twelve trees, mobile layouts, keyboard casting, combat, dual wield, summons across areas and save reload');
}finally{await browser.close();}
