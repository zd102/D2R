import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage(), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/__loading',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));
  await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:5173'}/__loading`);
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {GameWorld}=await import('/src/world.ts'), {LEVELS}=await import('/src/campaign.ts');
    const {createHeroActor}=await import('/src/hero-models.ts'),{createMonsterActor}=await import('/src/monster-models.ts');
    const {MONSTERS}=await import('/src/bestiary.ts'),{MonsterBatches}=await import('/src/monster-batches.ts');
    const {disposeVisual}=await import('/src/visual-effects.ts');
    const renderer=new THREE.WebGLRenderer();renderer.setSize(640,480);
    const camera=new THREE.PerspectiveCamera(45,640/480,.1,300), rounds=[], heroes=[];
    for(let round=0;round<3;round++) {
      const start=performance.now(),world=new GameWorld(LEVELS[17],false,20260922), buildMs=performance.now()-start;
      const batches=new MonsterBatches(world.scene),actors=[];
      const spawn=world.layout.spawn;
      for(let i=0;i<40;i++) {
        const actor=createMonsterActor(MONSTERS.hellCow);actor.group.position.set(spawn.x+i%8,0,spawn.z+Math.floor(i/8));
        world.scene.add(actor.group);batches.add(actor,'cow');actors.push(actor);
      }
      camera.position.set(spawn.x+10,18,spawn.z+20);camera.lookAt(spawn.x,0,spawn.z);renderer.render(world.scene,camera);
      let bytes=0;const geometries=new Set();world.scene.traverse(node=>{
        if(node.isMesh&&!geometries.has(node.geometry)) {
          geometries.add(node.geometry);for(const attribute of Object.values(node.geometry.attributes))bytes+=attribute.array.byteLength;
          bytes+=node.geometry.index?.array.byteLength??0;
        }
      });
      batches.dispose();actors.forEach(actor=>disposeVisual(actor.group));world.dispose();renderer.render(new THREE.Scene(),camera);
      rounds.push({buildMs,geometryBytes:bytes,memory:{...renderer.info.memory}});
    }
    const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x555555,3));
    camera.position.set(0,1.5,6);camera.lookAt(0,1,0);
    for(const id of ['paladin','amazon','sorceress','necromancer','barbarian','druid','assassin']) {
      const actor=createHeroActor(id);scene.add(actor.group);
      for(const attack of [0,.5,1]){actor.animate(.7,true,attack);renderer.render(scene,camera);}
      heroes.push({id,triangles:renderer.info.render.triangles});disposeVisual(actor.group);
    }
    renderer.dispose();return{rounds,heroes};
  });
  for(const round of result.rounds)assert.deepEqual(round.memory,{geometries:0,textures:0});
  assert.equal(new Set(result.rounds.map(round=>round.geometryBytes)).size,1,'repeated loads retain no additional model storage');
  for(const hero of result.heroes)assert.ok(hero.triangles>100,`${hero.id} renders`);
  assert.deepEqual(errors,[]);console.log(JSON.stringify(result,null,2));
} finally {await browser.close();}
