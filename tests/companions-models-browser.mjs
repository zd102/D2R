import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const output=process.env.OUTPUT_DIR || '.verification/companions-models';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:400,height:460}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/__companions',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0"></body>'}));
  await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:5173'}/__companions`);
  const results=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createHeroActor}=await import('/src/hero-models.ts');
    const {createVillagerModel}=await import('/src/villager-model.ts');
    const {createCompanionActor,createBeastActor,trapModel}=await import('/src/expansion-models.ts');
    const {disposeVisual}=await import('/src/visual-effects.ts');
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setSize(400,460);renderer.toneMapping=THREE.ACESFilmicToneMapping;
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x202522);
    scene.add(new THREE.HemisphereLight(0xe4e9f2,0x39362d,1.8));
    const light=new THREE.DirectionalLight(0xffe7c7,3);light.position.set(-3,5,6);scene.add(light);
    const camera=new THREE.PerspectiveCamera(34,400/460,.01,100),results=[];
    const fixtures=[
      ...['paladin','amazon','sorceress','necromancer','barbarian','druid','assassin'].map(id=>({id,create:()=>createHeroActor(id)})),
      ...['raiseSkeleton','raiseSkeletalMage','shadowWarrior','shadowMaster','summonSpiritWolf','summonFenris','summonGrizzly','clayGolem','bloodGolem','ironGolem','fireGolem','raven','oakSage','heartOfWolverine','spiritOfBarbs','plaguePoppy','carrionVine','solarCreeper'].map(id=>({id,create:()=>createCompanionActor(id)})),
      {id:'werewolf',create:()=>createBeastActor(false,true)},{id:'werebear',create:()=>createBeastActor(true,true)},
      ...['wakeOfFire','wakeOfInferno','lightningSentry','deathSentry'].map(id=>({id,create:()=>({group:trapModel(id)})})),
      {id:'camp-vendor',create:()=>({group:createVillagerModel()})},
    ];
    for(const fixture of fixtures) {
      const actor=fixture.create();scene.add(actor.group);
      const id=fixture.id;
      if(['amazon','sorceress','necromancer','druid','assassin','barbarian','shadowWarrior','shadowMaster'].includes(id)) {
        actor.group.getObjectByName('hero-shield').visible=false;
        if(['amazon','sorceress','necromancer','druid'].includes(id)) {
          actor.group.getObjectByName('hero-weapon').visible=false;
          actor.group.getObjectByName(id==='amazon'?'hero-bow':'hero-staff').visible=true;
        } else {
          const weapon=actor.group.getObjectByName('hero-weapon');weapon.children.forEach(child=>child.visible=child.name===(id==='barbarian'?'melee-axe':'melee-claw'));
        }
      }
      for(const yaw of [0,Math.PI]) {
        actor.group.rotation.y=yaw;actor.animate?.(.7,!!yaw,yaw?.5:0);actor.group.updateMatrixWorld(true);
        const box=new THREE.Box3();actor.group.traverseVisible(node=>{if(node.isMesh){node.geometry.computeBoundingBox();box.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));}});
        const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),distance=Math.max(size.y,size.x*460/400,size.z)*2.15;
        camera.position.copy(center).add(new THREE.Vector3(.25,.13,1).normalize().multiplyScalar(distance));camera.lookAt(center);
        renderer.render(scene,camera);
        results.push({id:fixture.id,yaw,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,image:renderer.domElement.toDataURL()});
      }
      disposeVisual(actor.group);renderer.render(scene,camera);
      if(renderer.info.memory.geometries!==0||renderer.info.memory.textures!==0)throw new Error(`${fixture.id}: retained GPU resources`);
    }
    renderer.dispose();return results;
  });
  for(const row of results){assert.ok(row.triangles>100&&row.triangles<75000,row.id);assert.ok(row.calls<80,row.id);}
  for(const [label,rows] of [['heroes',results.filter(row=>row.yaw===0).slice(0,7)],['companions',results.filter(row=>row.yaw===0).slice(7)]]) {
    await page.setViewportSize({width:1500,height:800});
    await page.setContent(`<body style="background:#171d1b;color:#c7b58f;font:18px Georgia"><main style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px">${rows.map(row=>`<figure style="margin:0"><img style="width:100%" src="${row.image}"><figcaption>${row.id}</figcaption></figure>`).join('')}</main></body>`);
    await page.evaluate(()=>Promise.all([...document.images].map(image=>image.decode())));
    await page.screenshot({path:`${output}/${label}.jpg`,type:'jpeg',quality:90,fullPage:true});
  }
  assert.deepEqual(errors,[]);
  await writeFile(`${output}/report.json`,JSON.stringify(results.map(({image,...row})=>row),null,2));
  console.log(`PASS: ${results.length/2} hero, companion, transformation and trap models, front/rear rendering and GPU disposal`);
} finally {await browser.close();}
