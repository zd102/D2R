import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Intentional, retained art deliverable. OUTPUT_DIR can isolate draft exports.
const output=process.env.OUTPUT_DIR || 'docs/model-previews';
const base=(process.env.BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/,'');
await mkdir(`${output}/images`,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],records=[];
const categories={hero:'人物',npc:'营地 NPC',monster:'怪物',boss:'首领',companion:'召唤物与变形',trap:'陷阱',equipment:'武器与盾牌',prop:'场景道具',interactive:'交互建筑',scene:'关卡与营地'};
try {
  const page=await browser.newPage({viewport:{width:420,height:560}});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/__model_previews',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>模型拍摄</title><body style="margin:0;background:#171b1c"></body></html>'}));
  await page.goto(`${base}/__model_previews`);
  const catalogue=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createHeroActor,createMercenaryActor}=await import('/src/hero-models.ts');
    const {createMonsterActor}=await import('/src/monster-models.ts');
    const {createVillagerModel,NPC_MODELS}=await import('/src/villager-model.ts');
    const {createCompanionActor,createBeastActor,trapModel}=await import('/src/expansion-models.ts');
    const {createSceneryLibrary,SCENERY_MODELS}=await import('/src/scenery-props.ts');
    const {actorMaterial}=await import('/src/actor-modeling.ts');
    const {sceneryTexture,sceneryDecal}=await import('/src/scenery-textures.ts');
    const {disposeVisual}=await import('/src/visual-effects.ts');
    const {MONSTERS,BOSSES}=await import('/src/bestiary.ts');
    const {CLASS_IDS,CLASSES}=await import('/src/classes.ts');
    const {skillById}=await import('/src/paladin.ts');
    const {GameWorld}=await import('/src/world.ts');
    const {LEVELS,SPECIAL_LEVELS}=await import('/src/campaign.ts');
    const {SCENE_DESIGNS}=await import('/src/scene-design.ts');
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setPixelRatio(1);renderer.setSize(420,560);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x202627);
    scene.add(new THREE.HemisphereLight(0xc1cbd0,0x433b31,1.1));
    const key=new THREE.DirectionalLight(0xffe0b3,3.2);key.position.set(-3,5,4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.normalBias=.012;key.shadow.bias=-.00008;scene.add(key,key.target);
    const fill=new THREE.DirectionalLight(0x8cadbc,.85);fill.position.set(3,2,3);scene.add(fill);
    const rim=new THREE.DirectionalLight(0xa5bdc7,2);rim.position.set(2,4,-4);scene.add(rim);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x151b1c,roughness:1}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
    const camera=new THREE.OrthographicCamera(-2,2,2.67,-2.67,.01,200);
    const configureHero=(actor,id)=>{
      if(id==='paladin')return actor;
      actor.group.getObjectByName('hero-shield').visible=false;
      if(['amazon','sorceress','necromancer','druid'].includes(id)){
        actor.group.getObjectByName('hero-weapon').visible=false;
        actor.group.getObjectByName(id==='amazon'?'hero-bow':'hero-staff').visible=true;
      }else actor.group.getObjectByName('hero-weapon').children.forEach(child=>child.visible=child.name===(id==='barbarian'?'melee-axe':'melee-claw'));
      actor.animate(.35,false,0);return actor;
    };
    const createProp=id=>{
      const stone=actorMaterial(0x7c8175,'stone'),wall=actorMaterial(0x6c7168,'stone'),wood=new THREE.MeshStandardMaterial({color:0x68543a,roughness:.94});
      const bark=sceneryTexture('bark',780);wood.map=wood.bumpMap=bark;wood.bumpScale=.05;
      const rock=sceneryTexture('earth',411);stone.map=stone.bumpMap=rock;stone.bumpScale=.09;
      const cloth=actorMaterial(0x655346,'cloth');cloth.side=THREE.DoubleSide;
      const leaves=new THREE.MeshStandardMaterial({color:0x536548,map:sceneryDecal('leaves'),alphaTest:.25,side:THREE.DoubleSide,roughness:.95});
      const silk=new THREE.MeshBasicMaterial({color:0xd8dfcc,map:sceneryDecal('web'),transparent:true,opacity:.5,depthWrite:false,side:THREE.DoubleSide});
      const materials={stone,wall,wood,cloth,leaves,silk,dark:actorMaterial(0x282c29,'stone'),trim:actorMaterial(0x9c8357,'bronze'),bone:actorMaterial(0xb4ae95,'bone'),iron:actorMaterial(0x6b716b,'steel'),foliage:actorMaterial(0x586147,'fur'),ice:actorMaterial(0x729aa6,'chitin')};
      const group=createSceneryLibrary(materials)(id);
      return {group,extras:Object.values(materials)};
    };
    const host=Object.assign(Object.create(GameWorld.prototype),{scene:new THREE.Scene(),level:LEVELS[0],staticGroup:new THREE.Group(),addCollider(){}});
    const fixtures=[
      ...CLASS_IDS.map(id=>({id:`hero-${id}`,name:CLASSES[id].name,category:'hero',create:()=>configureHero(createHeroActor(id),id)})),
      {id:'mercenary-mishan',name:'沙漠佣兵',category:'hero',create:createMercenaryActor},
      ...NPC_MODELS.map(({id,name})=>({id:`npc-${id}`,name,category:'npc',create:()=>({group:createVillagerModel(id)})})),
      ...Object.values(MONSTERS).map(def=>({id:`monster-${def.id}`,name:def.name,category:'monster',family:def.model,create:()=>createMonsterActor(def)})),
      ...BOSSES.map((def,index)=>({id:`boss-${def.id}`,name:LEVELS[index].boss,category:'boss',family:def.model,create:()=>createMonsterActor(def,true)})),
      ...['raiseSkeleton','raiseSkeletalMage','shadowWarrior','shadowMaster','summonSpiritWolf','summonFenris','summonGrizzly','clayGolem','bloodGolem','ironGolem','fireGolem','raven','oakSage','heartOfWolverine','spiritOfBarbs','plaguePoppy','carrionVine','solarCreeper'].map(id=>({id:`companion-${id}`,name:skillById[id].name,category:'companion',create:()=>{const actor=createCompanionActor(id);return id.startsWith('shadow')?configureHero(actor,'assassin'):actor;}})),
      {id:'form-werewolf',name:'狼人变形',category:'companion',create:()=>createBeastActor(false,true)},
      {id:'form-werebear',name:'熊人变形',category:'companion',create:()=>createBeastActor(true,true)},
      ...['wakeOfFire','wakeOfInferno','lightningSentry','deathSentry'].map(id=>({id:`trap-${id}`,name:skillById[id].name,category:'trap',create:()=>({group:trapModel(id)})})),
      ...SCENERY_MODELS.map(({id,name})=>({id:`prop-${id}`,name,category:'prop',create:()=>createProp(id)})),
      ...[['melee-sword','长剑'],['melee-axe','战斧'],['melee-mace','钉锤'],['melee-spear','长矛'],['melee-claw','拳刃'],['hero-shield','盾牌'],['hero-staff','法杖'],['hero-bow','弓'],['hero-crossbow','弩'],['hero-javelin','标枪'],['hero-knife','飞刀'],['hero-axe','飞斧']].map(([id,name])=>({id:`equipment-${id}`,name,category:'equipment',create:()=>{
        const actor=createHeroActor('paladin'),object=actor.group.getObjectByName(id);object.removeFromParent();object.visible=true;
        // Preserve shared gear resources until both the isolated object and owner are disposed.
        const group=new THREE.Group();group.add(object);return {group,owner:actor.group};
      }})),
      ...[['grave','任务墓碑'],['cage','囚笼与被囚者'],['chest','任务遗物箱'],['altar','古书祭坛'],['forge','地狱铁砧'],['ice','冰封囚牢'],['seal','封印祭坛'],['siege','攻城投石机']].map(([id,name])=>({id:`objective-${id}`,name,category:'interactive',create:()=>({group:host.makeObjective(0,0,0,id)})})),
      {id:'interactive-loot-chest',name:'战利品宝箱 · 闭合与开启',category:'interactive',create:()=>host.makeChest(0,0,0)},
      {id:'interactive-waypoint',name:'营地传送点',category:'interactive',create:()=>({group:host.makeWaypoint()})},
      {id:'interactive-mystery-portal',name:'神秘传送门',category:'interactive',create:()=>({group:host.makeMysteryPortal()})},
      {id:'interactive-portal',name:'关卡与回城传送门',category:'interactive',create:()=>({group:host.makePortal(0,0)})},
      {id:'interactive-shrine',name:'净化祭坛',category:'interactive',create:()=>({group:host.makeShrine(0,0,0)})},
      {id:'interactive-corpse',name:'神秘旅者遗骸',category:'interactive',create:()=>host.makeMysteriousCorpse(0,0)},
    ];
    window.preview={THREE,renderer,scene,camera,key,floor,fixtures,disposeVisual,GameWorld,levels:[...LEVELS,...Object.values(SPECIAL_LEVELS)],SCENE_DESIGNS};
    return fixtures.map(({create,...entry})=>entry);
  });
  assert.equal(new Set(catalogue.map(entry=>entry.id)).size,catalogue.length,'unique preview paths');
  for(let index=0;index<catalogue.length;index++) {
    const result=await page.evaluate(index=>{
      const {THREE,renderer,scene,camera,key,floor,fixtures,disposeVisual}=window.preview,fixture=fixtures[index],actor=fixture.create(),group=actor.group;
      group.position.set(0,0,0);group.rotation.y=0;actor.animate?.(.35,false,0);scene.add(group);group.updateMatrixWorld(true);
      const bounds=new THREE.Box3();let triangles=0;
      group.traverseVisible(node=>{if(node.isMesh){node.geometry.computeBoundingBox();bounds.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;}});
      const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
      if(![...center,...size].every(Number.isFinite)||size.length()===0)throw new Error(`${fixture.id}: invalid bounds`);
      const extent=Math.max(size.y*1.28,Math.hypot(size.x,size.z)*560/420*1.16),distance=Math.max(8,extent*2);
      Object.assign(camera,{left:-extent*420/560/2,right:extent*420/560/2,top:extent/2,bottom:-extent/2});camera.updateProjectionMatrix();
      floor.position.y=bounds.min.y-.016;
      key.position.copy(center).add(new THREE.Vector3(-distance*.5,distance*.7,distance*.6));key.target.position.copy(center);
      Object.assign(key.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:.1,far:distance*3});key.shadow.camera.updateProjectionMatrix();
      const sheet=document.createElement('canvas');sheet.width=1260;sheet.height=590;const ctx=sheet.getContext('2d');ctx.fillStyle='#202627';ctx.fillRect(0,0,sheet.width,sheet.height);
      let calls=0;
      for(const [view,angle] of [.35,Math.PI/2,Math.PI+.35].entries()) {
        if(actor.lid)actor.lid.rotation.x=view===2?-1.7:0;
        const elevation=['prop','interactive','trap','equipment'].includes(fixture.category)?.45:.19;
        camera.position.copy(center).add(new THREE.Vector3(Math.sin(angle)*distance,distance*elevation,Math.cos(angle)*distance));camera.lookAt(center);
        renderer.render(scene,camera);calls=Math.max(calls,renderer.info.render.calls);ctx.drawImage(renderer.domElement,view*420,0);
        ctx.fillStyle='#cfc4a9';ctx.font='15px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.fillText(['正面 3/4','侧面',actor.lid?'开启状态':'背面 3/4'][view],view*420+210,581);
      }
      const image=sheet.toDataURL('image/webp',.88),textures=new Set();
      const materials=new Set(actor.extras??[]);
      for(const root of [group,actor.owner].filter(Boolean))root.traverse(node=>{if(node.isMesh)for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);});
      for(const material of materials)for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
      disposeVisual(group);if(actor.owner)disposeVisual(actor.owner);textures.forEach(texture=>texture.dispose());materials.forEach(material=>material.dispose());
      renderer.render(scene,camera);
      if(renderer.info.memory.geometries!==1)throw new Error(`${fixture.id}: retained geometries ${renderer.info.memory.geometries}`);
      return {image,triangles,calls,size:size.toArray(),views:3};
    },index);
    assert.ok(result.triangles>0&&result.triangles<75000,`${catalogue[index].id}: model triangle budget`);
    const {image,...metrics}=result,entry={...catalogue[index],...metrics,file:`images/${catalogue[index].id}.webp`};
    await writeFile(`${output}/${entry.file}`,Buffer.from(image.split(',')[1],'base64'));records.push(entry);
    if((index+1)%20===0)console.log(`Rendered ${index+1}/${catalogue.length} individual models`);
  }
  const scenes=await page.evaluate(()=>window.preview.levels.map(level=>({index:level.index,name:level.name})));
  assert.equal(scenes.length,29);
  for(const area of [{index:-1,name:'罗格营地'},...scenes]) {
    const result=await page.evaluate(area=>{
      const {THREE,renderer,GameWorld,levels,SCENE_DESIGNS}=window.preview;
      const level=area.index<0?levels[0]:levels.find(level=>level.index===area.index),seed=20260929+Math.max(0,area.index),world=new GameWorld(level,area.index<0,seed);
      renderer.setSize(1000,700);
      const camera=new THREE.OrthographicCamera(-16,16,11.2,-11.2,.1,220),sheet=document.createElement('canvas');sheet.width=2000;sheet.height=740;
      const ctx=sheet.getContext('2d');ctx.fillStyle='#202627';ctx.fillRect(0,0,2000,740);
      const points=area.index<0?[{x:0,z:7},{x:8,z:13}]:[world.layout.boss,world.layout.route[1]??world.layout.spawn];
      let triangles=0,calls=0;
      for(const [index,focus] of points.entries()) {
        camera.position.set(focus.x+20,27,focus.z+20);camera.lookAt(focus.x,1,focus.z);world.update(2,.016);renderer.render(world.scene,camera);
        triangles=Math.max(triangles,renderer.info.render.triangles);calls=Math.max(calls,renderer.info.render.calls);ctx.drawImage(renderer.domElement,index*1000,0);
        ctx.fillStyle='#cfc4a9';ctx.font='18px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.fillText(area.index<0?(index?'工匠与补给区':'营地广场'):(index?'入口与路径':'地标与首领区域'),index*1000+500,726);
      }
      const image=sheet.toDataURL('image/webp',.88),description=area.index<0?'营地服务、帐篷与石铺小径':SCENE_DESIGNS[area.index].description;
      world.dispose();renderer.render(new THREE.Scene(),camera);
      return {image,triangles,calls,seed,description,views:2};
    },area);
    const {image,...metrics}=result,id=area.index<0?'scene-camp':`scene-${String(area.index+1).padStart(2,'0')}`;
    const entry={id,name:area.name,category:'scene',...metrics,file:`images/${id}.webp`};
    await writeFile(`${output}/${entry.file}`,Buffer.from(image.split(',')[1],'base64'));records.push(entry);
    console.log(`Rendered scene: ${area.name}`);
  }
  await page.evaluate(()=>{const p=window.preview;p.disposeVisual(p.floor);p.key.shadow.dispose();p.renderer.dispose();});
  assert.deepEqual(errors,[],'preview rendering errors');
  const sourceFiles=['src/actor-modeling.ts','src/sculpted-surfaces.ts','src/model-detailing.ts','src/model-geometry-cache.ts','src/geometry-batching.ts','src/hero-models.ts','src/monster-models.ts','src/villager-model.ts','src/expansion-models.ts','src/scenery-props.ts','src/world.ts','src/level-scenery.ts','src/scenery-textures.ts','src/scene-design.ts','src/bestiary.ts','src/actor-size.ts','src/campaign.ts','src/camp.ts','scripts/export-model-previews.mjs'];
  const sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update((await readFile(file,'utf8')).replace(/\r\n/g,'\n')).digest('hex')])));
  const counts=Object.fromEntries(Object.keys(categories).map(category=>[category,records.filter(entry=>entry.category===category).length]));
  await writeFile(`${output}/manifest.json`,JSON.stringify({generatedAt:new Date().toISOString(),hashFormat:'SHA-256, UTF-8 source with LF line endings',sourceHashes,counts,records},null,2)+'\n');
  const escape=text=>String(text).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>黯蚀 II · 全模型预览</title>
<style>*{box-sizing:border-box}body{margin:0;background:#13191a;color:#ded8c7;font:16px/1.55 "Microsoft YaHei",sans-serif}header,main,footer{max-width:1560px;margin:auto;padding:28px}h1{font-size:32px;font-weight:500;margin:0 0 12px;color:#d7be87}p{max-width:72ch;color:#b0b7ae}nav{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0 18px}button,input{font:inherit;color:inherit;background:#242d2d;border:1px solid #5e685d;border-radius:3px;padding:10px 14px;min-height:44px}button{cursor:pointer}button[aria-pressed=true]{color:#171b1b;background:#d0b67c;border-color:#d0b67c}:focus-visible{outline:3px solid #edce87;outline-offset:3px}input{width:min(100%,440px);margin-top:6px}label{display:block}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:20px}article{border:1px solid #394441;background:#1c2323;min-width:0}article[hidden]{display:none}article a{display:block}article img{display:block;width:100%;height:auto;aspect-ratio:1260/590;object-fit:contain;background:#202627}article[data-category=scene] img{aspect-ratio:2000/740}.caption{padding:14px 18px}h2{font-size:20px;font-weight:500;margin:0 0 5px}.caption p{font-size:14px;margin:0;overflow-wrap:anywhere}a{color:#d8c38f}#empty{padding:32px 0}footer{border-top:1px solid #394441;font-size:14px}@media(max-width:600px){header,main,footer{padding:18px}h1{font-size:26px}.grid{gap:16px}}</style>
<header><h1>黯蚀 II · 全模型预览</h1><p>人物、怪物、营地居民和场景模型。每件模型保留正面、侧面与背面视图；场景保留地标与路径视图。点击图片可打开原图。</p><nav aria-label="模型分类"><button type="button" data-filter="all" aria-pressed="true">全部 ${records.length}</button>${Object.entries(categories).map(([id,name])=>`<button type="button" data-filter="${id}" aria-pressed="false">${name} ${counts[id]}</button>`).join('')}</nav><label for="search">查找模型名称或编号</label><input id="search" type="search" placeholder="例如：圣骑士、石棺、Diablo" autocomplete="off"><p id="count" role="status" aria-live="polite">共 ${records.length} 项</p></header>
<main><div class="grid">${records.map(entry=>`<article data-category="${entry.category}" data-search="${escape(`${entry.name} ${entry.id} ${entry.family??''}`.toLowerCase())}"><a href="${entry.file}" aria-label="打开${escape(entry.name)}的完整预览图"><img src="${entry.file}" width="${entry.category==='scene'?2000:1260}" height="${entry.category==='scene'?740:590}" loading="lazy" alt="${escape(entry.name)}，${entry.category==='scene'?'地标和路径':'正面、侧面、背面'}预览"></a><div class="caption"><h2>${escape(entry.name)}</h2><p>${categories[entry.category]} · ${escape(entry.id)}${entry.description?`<br>${escape(entry.description)}`:''}</p></div></article>`).join('')}</div><p id="empty" hidden>没有匹配的模型，请更换名称或分类。</p></main>
<footer><a href="manifest.json">查看完整清单与模型数据</a> · 固定灯光下的程序化模型预览；关卡图使用游戏内灯光。此目录可以离线打开。</footer>
<script>const buttons=[...document.querySelectorAll('button[data-filter]')],cards=[...document.querySelectorAll('article')],search=document.querySelector('#search');let category='all';function update(){const query=search.value.trim().toLowerCase();let count=0;for(const card of cards){card.hidden=!(category==='all'||card.dataset.category===category)||!card.dataset.search.includes(query);if(!card.hidden)count++;}document.querySelector('#count').textContent='显示 '+count+' / '+cards.length+' 项';document.querySelector('#empty').hidden=count>0;}for(const button of buttons)button.addEventListener('click',()=>{category=button.dataset.filter;for(const item of buttons)item.setAttribute('aria-pressed',String(item===button));update();});search.addEventListener('input',update);</script></html>`;
  await writeFile(`${output}/index.html`,html);
  await writeFile(`${output}/README.md`,`# 全模型预览\n\n打开 [预览目录](index.html)，可按类别和名称筛选；点击图片查看原始分辨率。\n\n${Object.entries(categories).map(([id,name])=>`- ${name}：${counts[id]} 项`).join('\n')}\n\n共 ${records.length} 项、${records.reduce((sum,entry)=>sum+entry.views,0)} 个视角，图片均保存在 images/。模型使用三视图；30 个场景包含 25 个主线区域、4 个特殊区域和营地，每个保留两处实景。武器图展示现有装备几何体，物品属性和随机词缀不重复出图。\n\n运行本地 Vite 后执行 \`npm run models:previews\` 可重新导出；\`OUTPUT_DIR\` 可指定草稿目录。\n\n[完整清单](manifest.json) 包含编号、名称、几何量、预览绘制调用、源码 SHA-256 与场景种子。几何量按可见模型统计，场景数值包含阴影绘制，不能用作运行帧率结论。\n`);
  await page.goto(pathToFileURL(resolve(output,'index.html')).href);
  assert.equal(await page.locator('article').count(),records.length);
  await page.getByRole('button',{name:`营地 NPC ${counts.npc}`,exact:true}).click();assert.equal(await page.locator('article:visible').count(),counts.npc);
  await page.getByLabel('查找模型名称或编号').fill('不存在的模型');assert.equal(await page.locator('article:visible').count(),0);await page.locator('#empty').waitFor({state:'visible'});
  await page.getByLabel('查找模型名称或编号').fill('');await page.getByRole('button',{name:`全部 ${records.length}`,exact:true}).click();
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile catalogue fits');
  for(const entry of records)assert.ok((await readFile(`${output}/${entry.file}`)).byteLength>500,entry.file);
  console.log(`PASS: ${records.length} retained previews, ${records.reduce((sum,entry)=>sum+entry.views,0)} views; catalogue filters, mobile width and image paths checked.`);
} finally {await browser.close();}
