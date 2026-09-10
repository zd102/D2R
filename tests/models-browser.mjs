import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const output = process.env.OUTPUT_DIR || '.verification/models-20260910/catalogue';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], results = [];
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 680 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/__actor_catalogue', route => route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"></body></html>' }));
  await page.goto(`${base}/__actor_catalogue`);
  const definitions = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { createMonsterActor } = await import('/src/monster-models.ts');
    const { createHeroActor } = await import('/src/hero-models.ts');
    const { MONSTERS, BOSSES } = await import('/src/bestiary.ts');
    const { disposeVisual } = await import('/src/visual-effects.ts');
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(640, 680); renderer.setPixelRatio(1); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    document.body.append(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1e211f);
    scene.add(new THREE.HemisphereLight(0xd1d8dc, 0x44382c, 1.9));
    const key = new THREE.DirectionalLight(0xffdbac, 3.0); key.position.set(-3, 7, 6); scene.add(key);
    const rim = new THREE.DirectionalLight(0x829aaa, 1.4); rim.position.set(4, 3, -4); scene.add(rim);
    const camera = new THREE.OrthographicCamera(-3, 3, 3, -3, .1, 50);
    const definitions = [...Object.values(MONSTERS).map(def => ({ def, boss: false })), ...BOSSES.map(def => ({ def, boss: true }))];
    let actor;
    window.catalogue = { renderer, scene, camera, definitions, createMonsterActor, disposeVisual, THREE,
      render(index, time = .35, moving = false, attack = 0, angle = .45) {
        if (actor) disposeVisual(actor.group);
        const { def, boss } = definitions[index]; actor = createMonsterActor(def, boss); scene.add(actor.group);
        actor.animate(time, moving, attack); scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(actor.group), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
        const aspect = innerWidth / innerHeight, extent = Math.max(size.y * 1.35, Math.hypot(size.x, size.z) * 1.25 / aspect);
        Object.assign(camera, { left: -extent * aspect / 2, right: extent * aspect / 2, top: extent / 2, bottom: -extent / 2 }); camera.updateProjectionMatrix();
        camera.position.copy(center).add(new THREE.Vector3(Math.sin(angle) * 9, 3.7, Math.cos(angle) * 9)); camera.lookAt(center);
        renderer.render(scene, camera);
        const corners = []; for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z).project(camera));
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 100; const ctx = canvas.getContext('2d'); ctx.drawImage(renderer.domElement, 0, 0, 100, 100);
        const pixels = ctx.getImageData(0, 0, 100, 100).data, colors = new Set(); let occupied = 0;
        for (let i = 0; i < pixels.length; i += 4) { colors.add(`${pixels[i] >> 3},${pixels[i + 1] >> 3},${pixels[i + 2] >> 3}`); if (Math.abs(pixels[i] - pixels[0]) + Math.abs(pixels[i+1] - pixels[1]) + Math.abs(pixels[i+2] - pixels[2]) > 20) occupied++; }
        return { id: def.id, model: def.model, boss, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, colors: colors.size, occupied, framed: corners.every(p => Math.abs(p.x) < 1 && Math.abs(p.y) < 1), image: renderer.domElement.toDataURL() };
      },
      clear() { if (actor) disposeVisual(actor.group); actor = undefined; renderer.render(scene, camera); },
      heroes() {
        this.clear(); const actors = ['paladin','amazon','sorceress'].map((id,i) => {
          const a = createHeroActor(id); a.group.position.x = (i-1)*1.4; scene.add(a.group);
          if(i){a.group.getObjectByName('hero-weapon').visible=false;a.group.getObjectByName('hero-shield').visible=false;a.group.getObjectByName(i===1?'hero-bow':'hero-staff').visible=true;}
          a.animate(.35,false,0);return a;
        });
        renderer.setSize(1440,800);Object.assign(camera,{left:-2.8,right:2.8,top:1.56,bottom:-1.56});camera.position.set(2.3,3.1,10);camera.lookAt(0,.92,0);camera.updateProjectionMatrix();renderer.render(scene,camera);
        actors.forEach(a=>disposeVisual(a.group));
      }
    };
    return definitions.map(({ def, boss }) => ({ id: def.id, model: def.model, boss }));
  });
  const images = [];
  for (let i = 0; i < definitions.length; i++) {
    const result = await page.evaluate(i => catalogue.render(i), i);
    assert.ok(result.framed && result.colors > 35 && result.occupied > 250, `${result.id}: visible and framed ${JSON.stringify({ ...result, image: undefined })}`);
    assert.ok(result.calls <= 65 && result.triangles < 75000, `${result.id}: rendering budget ${result.calls} calls, ${result.triangles} triangles`);
    const motion = await page.evaluate(i => catalogue.render(i, 1.17, true, .55), i);
    assert.notEqual(result.image, motion.image, `${result.id}: animated`);
    const rear = await page.evaluate(i => catalogue.render(i, .7, false, 0, 3.7), i);
    assert.ok(rear.framed && rear.occupied > 250, `${result.id}: rear view`);
    images.push(result.image); results.push({ ...result, image: undefined });
    if (['andariel','duriel','mephisto','diablo','baal','hellCow'].includes(result.id)) {
      await page.evaluate(i => catalogue.render(i), i); await page.screenshot({ path: `${output}/${result.id}.png` });
    }
  }
  console.log(`PASS: ${definitions.length} monster definitions / ${new Set(definitions.map(d => d.model)).size} body plans, front, rear and combat poses`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => catalogue.renderer.setSize(390, 844));
  for (let i = 0; i < definitions.length; i++) {
    const result = await page.evaluate(i => catalogue.render(i, .7, true, .4), i);
    assert.ok(result.framed && result.occupied > 100, `${result.id}: mobile framing`);
  }
  const memory = await page.evaluate(() => {
    const c = catalogue, samples = []; c.clear();
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < c.definitions.length; i++) c.render(i);
      c.clear(); samples.push({ ...c.renderer.info.memory });
    }
    return samples;
  });
  assert.deepEqual(memory.at(-1), memory[0], 'catalogue replacement releases all geometry and texture resources');
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.evaluate(() => catalogue.heroes()); await page.screenshot({ path: `${output}/heroes.jpg`, type: 'jpeg', quality: 92 });
  const overview = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  for (const [label, start, end] of [['monsters',0,definitions.filter(d=>!d.boss).length],['bosses',definitions.filter(d=>!d.boss).length,definitions.length]]) {
    await overview.setContent(`<html><style>*{box-sizing:border-box}body{margin:24px;background:#111615;color:#c7b58f;font:14px Georgia,serif}h1{font-size:25px;font-weight:normal;letter-spacing:3px}main{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}figure{margin:0;border:1px solid #4a4334;background:#1e211f}img{width:100%;display:block}figcaption{padding:9px;border-top:1px solid #393a2e}</style><h1>${label==='monsters'?'SANCTUARY · BESTIARY':'SANCTUARY · BOSSES'}</h1><main>${images.slice(start,end).map((image,i)=>`<figure><img src="${image}"><figcaption>${definitions[start+i].id} · ${definitions[start+i].model}</figcaption></figure>`).join('')}</main></html>`);
    await overview.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
    await overview.screenshot({ path: `${output}/${label}.jpg`, type: 'jpeg', quality: 92, fullPage: true });
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify({ results, memory, errors }, null, 2));
  console.log('PASS: mobile catalogue, procedural material shaders and stable GPU resource disposal', memory);
} finally { await browser.close(); }
