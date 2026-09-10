import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const output = process.env.OUTPUT_DIR || '.verification/scenery-check';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__scenery', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><style>body{margin:0;background:#101214}canvas{display:block}</style></head><body></body></html>' }));
  await page.goto(`${base}/__scenery`);
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { GameWorld } = await import('/src/world.ts'), { LEVELS, levelLayout } = await import('/src/campaign.ts');
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1000,700); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; document.body.append(renderer.domElement);
    const camera = new THREE.OrthographicCamera(-16,16,11.2,-11.2,.1,180);
    window.scenery = { THREE, GameWorld, LEVELS, levelLayout, renderer, camera };
  });
  for (let index = 0; index < 25; index++) {
    const result = await page.evaluate(index => {
      const state = window.scenery, { GameWorld, LEVELS, levelLayout, renderer, camera } = state;
      state.world?.dispose(); const start = performance.now(), world = state.world = new GameWorld(LEVELS[index], false, 20260910 + index);
      const layout = world.layout, failures = [];
      for (const target of [layout.boss,layout.exit,layout.supply,...layout.objects,...layout.chests,...layout.rooms]) {
        const route = world.path(layout.spawn,target); let from = layout.spawn;
        for (const to of route) { if(!world.canWalk(from,to))failures.push({target,reason:'blocked segment'}); from=to; }
        if(Math.hypot(from.x-target.x,from.z-target.z)>3)failures.push({target,end:{x:from.x,z:from.z},reason:'unreachable'});
      }
      const focus = layout.boss; camera.position.set(focus.x+20,27,focus.z+20); camera.lookAt(focus.x,1.2,focus.z);
      world.update(2,.016); renderer.render(world.scene,camera);
      const canvas = document.createElement('canvas');canvas.width=canvas.height=64;
      const ctx=canvas.getContext('2d');ctx.drawImage(renderer.domElement,0,0,64,64);
      const pixels=ctx.getImageData(0,0,64,64).data,colors=new Set();let lit=0;
      for(let i=0;i<pixels.length;i+=4){colors.add(`${pixels[i]>>3},${pixels[i+1]>>3},${pixels[i+2]>>3}`);lit+=Number(pixels[i]+pixels[i+1]+pixels[i+2]>65);}
      return { index,name:LEVELS[index].name,...world.scene.userData.scenery,width:world.grid.width,height:world.grid.height,cells:world.floorCells.length,failures,colors:colors.size,lit,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,ms:Math.round(performance.now()-start) };
    },index);
    results.push(result);
    await page.screenshot({ path: `${output}/area-${String(index+1).padStart(2,'0')}.png` });
    console.log(JSON.stringify(result));
    if ([0,5,8,10,17,22,24].includes(index)) {
      await page.evaluate(()=>{const {world,renderer,camera,levelLayout}=window.scenery;const p=world.layout.route[1];camera.position.set(p.x+20,27,p.z+20);camera.lookAt(p.x,.6,p.z);renderer.render(world.scene,camera);});
      await page.screenshot({path:`${output}/approach-${index+1}.png`});
    }
  }
  // Validate additional seeds with real scenery colliders, beyond the pure floor-grid tests.
  for (const seed of [17, 91919]) {
    const failures = await page.evaluate(seed => {
      const s=window.scenery,failures=[];
      for(const level of s.LEVELS) {
        s.world.dispose();const world=s.world=new s.GameWorld(level,false,seed),layout=world.layout;
        for(const target of [layout.boss,layout.exit,...layout.rooms,...layout.objects,...layout.chests]) {
          let from=layout.spawn;
          for(const to of world.path(from,target)){if(!world.canWalk(from,to))failures.push({index:level.index,seed,target,reason:'blocked'});from=to;}
          if(Math.hypot(from.x-target.x,from.z-target.z)>3)failures.push({index:level.index,seed,target,reason:'unreachable'});
        }
      }
      return failures;
    },seed);
    assert.deepEqual(failures,[],`scenery collision sweep, seed ${seed}`);
  }
  await page.setViewportSize({width:390,height:844});
  for(const index of [0,8,14,17,22,24]) {
    await page.evaluate(index=>{const s=window.scenery;s.world.dispose();s.world=new s.GameWorld(s.LEVELS[index]);s.renderer.setSize(390,844);Object.assign(s.camera,{left:-7,right:7,top:15.15,bottom:-15.15});s.camera.updateProjectionMatrix();const p=s.world.layout.boss;s.camera.position.set(p.x+20,27,p.z+20);s.camera.lookAt(p.x,1,p.z);s.renderer.render(s.world.scene,s.camera);},index);
    await page.screenshot({path:`${output}/mobile-${index+1}.png`});
  }
  await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));
  assert.deepEqual(results.flatMap(result=>result.failures.map(failure=>({area:result.name,...failure}))),[]);
  // Muted caves and ash fields intentionally use a narrower palette than ice and lava.
  for(const result of results){assert.ok(result.colors>50&&result.lit>1000,`${result.name}: visible scene`);assert.ok(result.drawCalls<170,`${result.name}: draw budget ${result.drawCalls}`);assert.ok(result.textures<20&&result.geometries<140,`${result.name}: retained resources`);}
  assert.deepEqual(errors,[]);
  const previews=await Promise.all(results.map(async result=>({...result,image:(await readFile(`${output}/area-${String(result.index+1).padStart(2,'0')}.png`)).toString('base64')})));
  const overview=await browser.newPage({viewport:{width:1800,height:1540}});
  await overview.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:26px;background:#101719;color:#dfd8c3;font-family:'Microsoft YaHei',sans-serif}header{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:20px}h1{font-size:25px;letter-spacing:3px;margin:0}header span{font-size:13px;color:#839c9b}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.card{background:#192326;border:1px solid #354444}.card img{width:100%;display:block}.label{padding:10px 12px}b{font-size:13px;font-weight:500}p{font-size:10px;color:#9eaaa2;margin:5px 0 0;white-space:nowrap}.act{color:#ad9263;font-size:10px;float:right}</style></head><body><header><h1>黯蚀 II · 五幕场景</h1><span>25 个首领区域 · 隐藏角色与界面</span></header><div class="grid">${previews.map(result=>`<div class="card"><img src="data:image/png;base64,${result.image}"><div class="label"><b>${result.name}</b><span class="act">${Math.floor(result.index/5)+1} — ${result.index%5+1}</span><p>${result.description}</p></div></div>`).join('')}</div></body></html>`);
  await overview.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));
  await overview.screenshot({path:`${output}/overview.jpg`,type:'jpeg',quality:88,fullPage:true});await overview.close();
  await page.evaluate(()=>{window.scenery.world.dispose();window.scenery.renderer.dispose();});
  console.log('All 25 scenes rendered, navigation targets reached, mobile views captured and resource budgets checked.');
} finally { await browser.close(); }
