import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const output = process.env.OUTPUT_DIR || '.verification/monster-batches';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/__batch-test', route => route.fulfill({ contentType: 'text/html', body: '<body style="margin:0"></body>' }));
  await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:5173'}/__batch-test`);
  const results = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { MonsterBatches } = await import('/src/monster-batches.ts');
    const { createMonsterActor } = await import('/src/monster-models.ts');
    const { MONSTERS, BOSSES } = await import('/src/bestiary.ts');
    const { disposeVisual } = await import('/src/visual-effects.ts');
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(800, 600); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; document.body.append(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-6, 6, 4.5, -4.5, .1, 80);
    scene.background = new THREE.Color(0x22252a); scene.add(new THREE.HemisphereLight(0xdfefff, 0x424237, 2));
    const light = new THREE.DirectionalLight(0xffe4ba, 3); light.position.set(-5, 10, 3); light.castShadow = true; light.shadow.mapSize.set(1024, 1024); scene.add(light);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x737b69 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    camera.position.set(8, 7, 10); camera.lookAt(0, 1.5, 0);
    const pixels = () => { renderer.render(scene, camera); const data = new Uint8Array(800 * 600 * 4); renderer.getContext().readPixels(0, 0, 800, 600, renderer.getContext().RGBA, renderer.getContext().UNSIGNED_BYTE, data); return data; };
    const families = new Map([...Object.values(MONSTERS), ...BOSSES].map(def => [def.model, def])), results = [];
    for (const def of families.values()) {
      const a = createMonsterActor(def, true), b = createMonsterActor(def, true); scene.add(a.group, b.group);
      a.group.position.x = -1.7; b.group.position.x = 1.7; b.group.scale.multiplyScalar(.8);
      for (const pose of ['idle', 'attack', 'corpse', 'hidden']) {
        a.group.visible = pose !== 'hidden'; a.group.rotation.z = pose === 'corpse' ? -Math.PI / 2 : 0;
        a.group.userData.hitFlash = pose === 'attack' ? .7 : 0;
        a.animate(1.3, pose === 'attack', pose === 'attack' ? .6 : 0); b.animate(.5, true, .2);
        const before = pixels(), batches = new MonsterBatches(scene); batches.add(a, `${def.id}:boss`); batches.add(b, `${def.id}:boss`);
        const after = pixels(); let error = 0, changed = 0;
        for (let i = 0; i < before.length; i += 4) { let difference = 0; for (let c = 0; c < 3; c++) difference += Math.abs(before[i + c] - after[i + c]); error += difference; if (difference > 30) changed++; }
        results.push({ model: def.model, pose, meanError: error / (800 * 600 * 3), changedFraction: changed / (800 * 600) });
        batches.dispose();
      }
      disposeVisual(a.group); disposeVisual(b.group);
    }
    floor.geometry.dispose(); floor.material.dispose(); light.shadow.dispose(); renderer.dispose();
    return results;
  });
  await writeFile(`${output}/comparison.json`, JSON.stringify(results, null, 2));
  for (const result of results) assert.ok(result.meanError < 1 && result.changedFraction < .01, `batched appearance differs: ${JSON.stringify(result)}`);
  assert.deepEqual(errors, []);
  console.log(`Batched rendering matches the original for ${results.length} model/pose combinations, including shadows, hit flashes, corpses and hidden actors.`);
} finally { await browser.close(); }
