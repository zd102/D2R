import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {newHero,gainXp,learnSkill,stats} from '../src/model.ts';
import {skillsForClass,EXPERIENCE} from '../src/paladin.ts';
import {CLASSES,CLASS_IDS} from '../src/classes.ts';
import {PROFILE_PREFIX,LAST_PROFILE_KEY} from '../src/saves.ts';

const output=process.env.OUTPUT_DIR||'.verification/classes-check',base=process.env.BASE_URL||'http://127.0.0.1:5177';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
const state=page=>page.evaluate(()=>window.eclipseState);
const watch=page=>{page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});};
async function layout(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'page fits viewport');assert.equal(await page.locator('.class-option,.skill-node,[data-binding]').evaluateAll(elements=>elements.some(e=>e.scrollWidth>e.clientWidth+2)),false,'labels fit their controls');}
async function roster(page){await page.keyboard.press('Escape');await page.locator('[data-action="profiles"]').click();await page.getByRole('dialog',{name:'选择角色',exact:true}).waitFor();}
try {
  const page=await browser.newPage({viewport:{width:1440,height:960}});watch(page);await page.goto(base);
  for(const id of CLASS_IDS){await page.getByRole('button',{name:'新建角色',exact:true}).click();await expect(page.locator('.class-option')).toHaveCount(3);await page.locator(`input[name="class"][value="${id}"]`).check();await page.locator('#profile-name').fill(CLASSES[id].name+'验证');
    if(id==='amazon')await page.screenshot({path:`${output}/create-desktop.png`});await layout(page);
    await page.getByRole('button',{name:'创建并进入',exact:true}).click();await page.waitForFunction(id=>window.eclipseState?.classId===id&&!window.eclipseState.paused,id);assert.equal((await state(page)).classModel,id);
    await page.keyboard.press('c');await expect(page.locator('.character-banner')).toContainText(CLASSES[id].name);await page.keyboard.press('Escape');
    await page.screenshot({path:`${output}/${id}-camp.png`});
    if(id==='sorceress'){await page.mouse.click(900,450,{button:'right'});await page.waitForFunction(()=>window.eclipseState.classCombat.missiles.some(m=>m.skill==='fireBolt'));}
    await roster(page);await expect(page.getByRole('option',{name:CLASSES[id].name+'验证',exact:true})).toContainText(CLASSES[id].name);
  }
  await page.reload();await expect(page.getByRole('option')).toHaveCount(3);await expect(page.getByRole('option',{name:'法师验证',exact:true})).toContainText('法师');
  for(const viewport of [{width:390,height:844},{width:360,height:740},{width:844,height:390}]){await page.setViewportSize(viewport);await page.getByRole('button',{name:'新建角色',exact:true}).click();await page.locator('input[value="sorceress"]').check();await layout(page);await page.screenshot({path:`${output}/create-${viewport.width}.png`});await page.locator('[data-profile-action="back"]').click();}
  await page.close();
  for(const id of ['amazon','sorceress']){
    const context=await browser.newContext({viewport:{width:1440,height:960}}),p=await context.newPage();watch(p);const hero=newHero(id);gainXp(hero,EXPERIENCE[79]);for(const skill of skillsForClass(id).sort((a,b)=>a.level-b.level))assert.ok(learnSkill(hero,skill.id));hero.mana=stats(hero).maxMana;
    const profile={version:2,id:`${id}-fixture`,name:CLASSES[id].name+'技能验证',createdAt:1,updatedAt:1,revision:1,hero};
    await p.addInitScript(({profile,prefix,last})=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem(prefix+profile.id,JSON.stringify(profile));localStorage.setItem(last,profile.id);sessionStorage.setItem('seeded','yes');}},{profile,prefix:PROFILE_PREFIX,last:LAST_PROFILE_KEY});
    await p.goto(base);await p.getByRole('button',{name:'进入旅程',exact:true}).click();await p.keyboard.press('t');await expect(p.locator('[data-tree]')).toHaveCount(3);const seen=new Set();
    for(const tree of CLASSES[id].trees){await p.locator(`[data-tree="${tree}"]`).click();await expect(p.locator('.skill-node')).toHaveCount(10);for(const skill of await p.locator('.skill-node').evaluateAll(nodes=>nodes.map(n=>n.dataset.selectSkill)))seen.add(skill);await layout(p);await p.screenshot({path:`${output}/${id}-${tree}.png`});}
    assert.equal(seen.size,30);
    const bindings=id==='amazon'?{attack:'jab',cleave:'poisonJavelin',ward:'dopplezon',nova:'innerSight',dash:'valkyrie',bolt:'lightningFury'}:{attack:'fireBolt',cleave:'iceBolt',ward:'frozenArmor',nova:'energyShield',dash:'teleport',bolt:'fireBall'};
    for(const [slot,skill] of Object.entries(bindings))await p.locator(`[data-binding="${slot}"]`).selectOption(skill);
    const skill=id==='amazon'?'jab':'iceBolt';await p.locator(`[data-tree="${id==='amazon'?'javelin':'cold'}"]`).click();await p.locator(`[data-select-skill="${skill}"]`).click();const before=(await state(p)).skillPoints;await p.locator(`[data-learn="${skill}"]`).click();assert.equal((await state(p)).skillPoints,before-1);
    for(const width of [390,360]){await p.setViewportSize({width,height:844});await layout(p);await p.screenshot({path:`${output}/${id}-skills-${width}.png`});}
    await p.setViewportSize({width:1440,height:960});await p.keyboard.press('Escape');await p.mouse.move(920,460);
    await p.keyboard.press('q');await p.waitForFunction(skill=>window.eclipseState.classCombat.missiles.some(m=>m.skill===skill),bindings.cleave);const cast=await state(p),m=cast.classCombat.missiles.find(m=>m.skill===bindings.cleave),dx=cast.controls.aim.x-cast.position.x,dz=cast.controls.aim.z-cast.position.z;assert.ok((m.direction[0]*dx+m.direction[2]*dz)/Math.hypot(dx,dz)>.99);
    await p.waitForTimeout(900);await p.keyboard.press('w');await p.waitForFunction(id=>id==='amazon'?window.eclipseState.classCombat.summons.some(s=>s.skill==='dopplezon'):window.eclipseState.buffs.frozenArmor,'amazon'===id?'amazon':'sorceress');
    await p.screenshot({path:`${output}/${id}-cast.png`});await p.waitForTimeout(900);await p.keyboard.press('r');
    if(id==='amazon')await p.waitForFunction(()=>window.eclipseState.classCombat.summons.some(s=>s.skill==='valkyrie'));else await p.waitForFunction(z=>Math.abs(window.eclipseState.position.z-z)>.5,cast.position.z);
    await roster(p);await p.reload();await p.getByRole('button',{name:'进入旅程',exact:true}).click();assert.equal((await state(p)).classId,id);assert.deepEqual((await state(p)).bindings,bindings);assert.equal((await state(p)).skills[skill],2);assert.equal((await state(p)).classCombat.summons.length,0);
    await context.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: class creation, three class models, six trees, learning/binding, mouse aim, buffs, summons, teleport, reload and mobile layouts');
}finally{await browser.close();}
