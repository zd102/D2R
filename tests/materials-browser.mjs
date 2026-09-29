import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const output=process.env.OUTPUT_DIR||'.verification/materials',base=process.env.BASE_URL||'http://127.0.0.1:5173';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
try {
  const page=await browser.newPage({viewport:{width:1400,height:720}});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/__materials',route=>route.fulfill({contentType:'text/html',body:'<html><style>body{margin:0;background:#141714;color:#d0c4a5;font:14px Georgia,serif}canvas{display:block}.labels{position:absolute;inset:0;display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:repeat(2,1fr);pointer-events:none}.labels span{align-self:end;text-align:center;padding:20px}</style><body></body></html>'}));
  await page.goto(`${base}/__materials`);
  await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {actorMaterial}=await import('/src/actor-modeling.ts');
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setSize(1400,720);renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x141714);
    scene.add(new THREE.HemisphereLight(0xbccbd3,0x343024,2));
    const key=new THREE.DirectionalLight(0xffdfac,3.3);key.position.set(-3,4,6);scene.add(key);
    const rim=new THREE.DirectionalLight(0x7195b1,2);rim.position.set(4,1,-2);scene.add(rim);
    const camera=new THREE.OrthographicCamera(-5,5,2.571,-2.571,.1,30);camera.position.set(0,0,12);
    const root=new THREE.Group();scene.add(root);
    const samples=[['skin',0xb28d71],['hide',0x776048],['bone',0xb9ad8b],['steel',0x8a9292],['bronze',0xa88a4d],['cloth',0x405451],['leather',0x6b4932],['fur',0x8b7963],['chitin',0x625344],['stone',0x888574]];
    for(const [i,[surface,color]] of samples.entries()) {
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(.69,40,28),actorMaterial(color,surface));mesh.position.set((i%5-2)*2,i<5?1.15:-1.42,0);root.add(mesh);
    }
    const labels=document.createElement('div');labels.className='labels';labels.innerHTML=samples.map(([surface])=>`<span>${surface.toUpperCase()}</span>`).join('');document.body.append(labels);
    window.materials={THREE,renderer,scene,camera,root};renderer.render(scene,camera);
  });
  await page.screenshot({path:`${output}/surfaces.png`});
  const stats=await page.evaluate(()=>{
    const v=materials,stats={calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles,textures:v.renderer.info.memory.textures};
    v.renderer.setPixelRatio(.55);v.root.scale.setScalar(.45);v.renderer.render(v.scene,v.camera);return stats;
  });
  await page.screenshot({path:`${output}/minified.png`});
  assert.equal(stats.calls,10);assert.equal(stats.textures,0);
  const disposed=await page.evaluate(()=>{
    const v=materials;
    // Fixture meshes use the raw Three module; app factories use Vite's module.
    // Release fixture ownership directly, without cross-module instanceof checks.
    for(const mesh of v.root.children){mesh.geometry.dispose();mesh.material.dispose();}
    v.root.removeFromParent();v.renderer.render(v.scene,v.camera);return {...v.renderer.info.memory};
  });
  assert.equal(disposed.geometries,0);assert.equal(disposed.textures,0);assert.deepEqual(errors,[]);
  await writeFile(`${output}/results.json`,JSON.stringify({stats,disposed,errors},null,2));
  console.log('PASS: ten material families compile at native and reduced resolution; zero texture allocations and complete disposal',stats);
} finally {await browser.close();}
