import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';

const output=process.env.OUTPUT_DIR||'.verification/visuals-20260910',base=process.env.BASE_URL||'http://127.0.0.1:5173';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
try {
  const page=await browser.newPage({viewport:{width:1200,height:780}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/__visuals',route=>route.fulfill({contentType:'text/html',body:'<html><style>body{margin:0;background:#141719}canvas{display:block}</style><body></body></html>'}));
  await page.goto(`${base}/__visuals`);
  await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js'),heroes=await import('/src/hero-models.ts'),fx=await import('/src/visual-effects.ts');
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1200,780);renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;document.body.append(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x151a1c);
    scene.add(new THREE.HemisphereLight(0xc7d6dd,0x38302b,1.8));const key=new THREE.DirectionalLight(0xffe3bf,3);key.position.set(-3,7,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.normalBias=.035;scene.add(key);
    const rim=new THREE.DirectionalLight(0x6b9ac4,1.1);rim.position.set(3,4,-4);scene.add(rim);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshStandardMaterial({color:0x292927,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.025;floor.receiveShadow=true;scene.add(floor);
    const camera=new THREE.OrthographicCamera(-4.7,4.7,3.055,-3.055,.1,80);camera.position.set(4,4.2,11);camera.lookAt(0,1,0);
    const actors=['paladin','amazon','sorceress'].map((id,i)=>{const a=heroes.createHeroActor(id);a.group.position.x=(i-1)*2.5;scene.add(a.group);if(id!=='paladin')a.group.getObjectByName('hero-weapon').visible=false;if(id==='amazon'){a.group.getObjectByName('hero-bow').visible=true;a.group.getObjectByName('hero-shield').visible=false;a.group.userData.rangedKind='bow';}if(id==='sorceress'){a.group.getObjectByName('hero-staff').visible=true;a.group.getObjectByName('hero-shield').visible=false;}return a;});
    window.visuals={THREE,renderer,scene,camera,actors,heroes,fx,objects:[],render(){renderer.render(scene,camera);}};
    for(const a of actors)a.animate(1.1,false,0);window.visuals.render();
  });
  await page.screenshot({path:`${output}/heroes.png`});
  const heroStats=await page.evaluate(()=>({calls:visuals.renderer.info.render.calls,triangles:visuals.renderer.info.render.triangles}));
  console.log('Hero showcase:',heroStats);assert.ok(heroStats.calls<250&&heroStats.triangles<180000);
  const snapshots=[];
  for(const [label,actions] of [['walk',['swing','shoot','cast']],['combat',['shield','thrust','cast']]]){
    await page.evaluate(({actions,label})=>{const v=visuals;for(let i=0;i<v.actors.length;i++){const a=v.actors[i];if(i===1){a.group.getObjectByName('hero-bow').visible=label==='walk';a.group.getObjectByName('hero-javelin').visible=label==='combat';}v.heroes.playHeroAction(a,actions[i],1,1);a.group.userData.running=label==='walk';a.animate(1.35,label==='walk',.8);}v.render();},{actions,label});
    await page.screenshot({path:`${output}/${label}.png`});snapshots.push(await page.locator('canvas').screenshot());
  }
  assert.notDeepEqual(snapshots[0],snapshots[1]);
  await page.evaluate(()=>{const v=visuals;for(const actor of v.actors)actor.group.visible=false;v.camera.position.set(6,8,10);v.camera.lookAt(0,.3,0);});
  for(const [name,type,kind] of [['fire-wall','fire','fireWall'],['blizzard','cold','pool'],['poison-cloud','poison','pool'],['lightning','lightning','beam'],['frozen-orb','cold','orb'],['frost-nova','cold','nova'],['meteor','fire','meteor'],['impact','magic','burst'],['throwing-axe','physical','axe'],['throwing-knife','physical','knife']]){
    const stats=await page.evaluate(({name,type,kind})=>{
      const v=visuals,{THREE,fx}=v;for(const o of v.objects)fx.disposeVisual(o);v.objects=[];
      let mesh;
      if(kind==='beam')mesh=fx.createLightning(new THREE.Vector3(-2,.8,0),new THREE.Vector3(2,.8,0));
      else if(kind==='orb'){mesh=fx.createProjectileVisual(type,'orb',.5);mesh.position.y=1;}
      else if(kind==='nova')mesh=fx.createNova(2.5,type);
      else if(kind==='meteor')mesh=fx.createMeteor(new THREE.Vector3());
      else if(kind==='burst')mesh=fx.createImpact(new THREE.Vector3(0,1,0),0xedb968,40).mesh;
      else if(kind==='axe'||kind==='knife'){mesh=fx.createProjectileVisual(type,kind);mesh.position.y=1;}
      else {mesh=new THREE.Mesh(kind==='fireWall'?new THREE.PlaneGeometry(5,1.5):new THREE.CircleGeometry(2.5,48),new THREE.MeshBasicMaterial({color:fx.EFFECT_COLORS[type],transparent:true,opacity:.16,side:THREE.DoubleSide,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.y=.05;fx.decorateGround(mesh,type,kind==='fireWall'?.75:2.5,kind,5);}
      mesh.name=name;v.scene.add(mesh);v.objects.push(mesh);fx.updateVisual(mesh,kind==='meteor'?.78:.3,.9);v.render();
      return {name,calls:v.renderer.info.render.calls,geometries:v.renderer.info.memory.geometries,textures:v.renderer.info.memory.textures};
    },{name,type,kind});
    assert.ok(stats.calls<15,JSON.stringify(stats));
    await page.screenshot({path:`${output}/${name}.png`});
    const before=await page.locator('canvas').screenshot();
    if(['blizzard','poison-cloud','frozen-orb','meteor','impact','throwing-axe','throwing-knife'].includes(name)){
      await page.evaluate(()=>{for(const mesh of visuals.objects)visuals.fx.updateVisual(mesh,.65,.8);visuals.render();});
      assert.notDeepEqual(before,await page.locator('canvas').screenshot(),`${name} animates`);
    }
  }
  const memory=await page.evaluate(()=>{
    const v=visuals,results=[];for(const object of v.objects)v.fx.disposeVisual(object);v.objects=[];
    for(let round=0;round<4;round++){for(let i=0;i<10;i++){const actor=v.heroes.createHeroActor(['paladin','amazon','sorceress'][i%3]);v.scene.add(actor.group);v.render();v.fx.disposeVisual(actor.group);const burst=v.fx.createImpact(new v.THREE.Vector3(),0xffaa44,48).mesh;v.scene.add(burst);v.render();v.fx.disposeVisual(burst);}v.render();results.push({...v.renderer.info.memory});}return results;
  });
  assert.ok(memory.at(-1).geometries<=memory[0].geometries+1&&memory.at(-1).textures<=memory[0].textures,JSON.stringify(memory));
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{const v=visuals;v.renderer.setSize(390,844);Object.assign(v.camera,{left:-1.45,right:1.45,top:3.14,bottom:-3.14});v.camera.updateProjectionMatrix();v.actors[2].group.visible=true;v.camera.position.set(7,3,9);v.camera.lookAt(2.5,1,0);v.fx.updateHeroWards(v.actors[2].group,{energyShield:{},frozenArmor:{}},1);v.render();});
  await page.screenshot({path:`${output}/mobile.png`});assert.deepEqual(errors,[]);
  const overview=await browser.newPage({viewport:{width:1440,height:1200}});
  const names=['heroes','combat','fire-wall','blizzard','poison-cloud','lightning','frozen-orb','frost-nova','meteor','impact'];
  const labels=['三职业 · 体态与装备','职业动作 · 格挡 / 戳刺 / 施法','火墙 · 流动火舌','暴风雪 · 冰晶落雨','毒素 · 翻涌毒雾','闪电 · 电弧与分叉','冰封球 · 冰晶环绕','冰霜新星 · 扩张冰环','陨石 · 坠落与焰尾','命中特效 · 批量火星'];
  const images=await Promise.all(names.map(name=>readFile(`${output}/${name}.png`).then(b=>b.toString('base64'))));
  await overview.setContent(`<html><style>*{box-sizing:border-box}body{background:#11181b;color:#d1c3a7;font-family:'Microsoft YaHei',sans-serif;margin:24px}h1{font-size:24px;letter-spacing:3px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0;background:#1b2326;border:1px solid #3d443f}figure:nth-child(-n+2){grid-column:span 2}img{width:100%;display:block}figcaption{padding:10px;font-size:13px}</style><h1>黯蚀 II · 角色与战斗表现</h1><main>${images.map((image,i)=>`<figure><img src="data:image/png;base64,${image}"><figcaption>${labels[i]}</figcaption></figure>`).join('')}</main></html>`);
  await overview.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await overview.screenshot({path:`${output}/overview.jpg`,type:'jpeg',quality:90,fullPage:true});
  console.log('PASS: three hero rigs, distinct actions, eight effect families, shader rendering, mobile view and stable resource disposal',memory);
}finally{await browser.close();}
