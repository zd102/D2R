import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const output = '.verification/item-special-effects';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__item_special_effects', route => route.fulfill({ contentType: 'text/html', body: '<body style="margin:0;background:#111;color:#eee"><div id="status" style="position:absolute;padding:16px;font:16px sans-serif"></div></body>' }));
    await page.goto(new URL('/__item_special_effects', process.env.BASE_URL || 'http://127.0.0.1:5173').href);
    const result = await page.evaluate(async () => {
      const THREE = await import('/node_modules/three/build/three.module.js');
      const CANNON = await import('/node_modules/cannon-es/dist/cannon-es.js');
      const { newHero, stats } = await import('/src/model.ts');
      const { PaladinCombat } = await import('/src/combat.ts');
      const { Game } = await import('/src/game.ts');
      const { createHeroActor } = await import('/src/hero-models.ts');
      const { createActor } = await import('/src/world.ts');
      const { disposeVisual } = await import('/src/visual-effects.ts');
      const { heroStatuses } = await import('/src/status-effects.ts');
      const { CATALOG_SPECIALS, CATALOG_RUNEWORDS } = await import('/src/item-catalog-current.ts');
      const { catalogPropertyStatus } = await import('/src/item-catalog.ts');
      const { LEVELS } = await import('/src/campaign.ts');
      const hero = newHero(); hero.level = 90; hero.strength = hero.dexterity = 300; hero.mana = 0; hero.hp = stats(hero).maxHp;
      const scene = new THREE.Scene(), actor = createHeroActor('paladin'); scene.add(actor.group);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x393020, 3));
      const light = new THREE.DirectionalLight(0xffdfb8, 4); light.position.set(3, 6, 4); scene.add(light);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshStandardMaterial({color:0x29251e})); floor.rotation.x=-Math.PI/2; floor.position.y=-.05; scene.add(floor);
      const game = { hero, actor, time: 0, position: new THREE.Vector3(), aim: new THREE.Vector3(0,0,2), enemies: [], effects: [],
        world: { scene, grid: { width: 57, height: 57, isWalkableAt: () => true }, physics: { removeBody() {} }, path: (_a,b) => [b.clone()] },
        body: new CANNON.Body({ mass: 1 }), level: LEVELS[0], paused: false, dead: false, invincible: 0, path: [],
        ui: { floatText() {}, toast() {}, openPanel() {}, flashDamage() {} }, audio: { play() {} },
        monsterCombat: { cancel() {}, onDeath() {}, onHit() {} }, burst() {}, beam() {}, save() {}, begin() {}, releaseInput() {}, dropLoot() {}, disposeObject: disposeVisual,
        killEnemy(...args) { Game.prototype.killEnemy.apply(this,args); },
      };
      const combat = new PaladinCombat(game); game.combat = combat; combat.itemRandom = () => 0;
      const enemy = z => {
        const actor = createActor('demon'); actor.group.position.z = z; scene.add(actor.group);
        const target = { id: game.enemies.length, actor, body: new CANNON.Body({mass:1}), level: 20, kind: 'demon', definition: { race:'demon', hp:30 }, hp:10000,maxHp:10000,damage:10,attackRating:100,defense:1,speed:2,
          resistances:{physical:0,fire:0,cold:0,lightning:0,poison:0,magic:0},converted:0,stunned:0,coldTime:0,bleed:0,dead:false,boss:false,redeemed:false,cooldown:0,path:[],rethink:0 };
        game.enemies.push(target); return target;
      };
      const target = enemy(2);
      const proc = (event,param) => {
        const entry=[...CATALOG_SPECIALS,...CATALOG_RUNEWORDS].find(entry=>entry.properties.some(p=>p[0]===event&&p[1]===param));
        combat.triggerItems(event,target,[{...hero.equipment.weapon,catalogId:entry.id}]);
      };
      proc('gethit-skill','Fade'); proc('gethit-skill','Bone Armor'); proc('gethit-skill','Delerium Change');
      const statuses=heroStatuses(hero), morph=actor.group.getObjectByName('item-delirium-form');
      actor.animate(.15,false,1);
      const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}); renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(1); document.body.append(renderer.domElement);
      const camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.1,100); camera.position.set(4,4,7); camera.lookAt(0,.5,1);
      const render=()=>{renderer.render(scene,camera);document.querySelector('#status').textContent=heroStatuses(hero).map(s=>s.name+'：'+s.description).join(' / ');}; render();
      window.procFixture={game,combat,renderer,render,proc,target};
      return { fade:hero.buffs.fade.rank,bone:hero.buffs.boneArmor.absorb,morph:hero.buffs.delirium.remaining,visible:morph.visible,rig:actor.group.getObjectByName('hero-rig').visible,
        spellBlocked:combat.castAction('holyBolt')===false,mana:hero.mana,statuses:statuses.map(s=>s.id),inactive:[...CATALOG_SPECIALS,...CATALOG_RUNEWORDS].flatMap(i=>i.properties).filter(p=>catalogPropertyStatus(p)==='inactive').length };
    });
    assert.equal(result.fade,8); assert.equal(result.bone,155); assert.equal(result.morph,60);
    assert.equal(result.visible,true); assert.equal(result.rig,false); assert.equal(result.spellBlocked,true); assert.equal(result.mana,0); assert.equal(result.inactive,0);
    assert.ok(['fade','boneArmor','delirium'].every(id=>result.statuses.includes(id)));
    await page.screenshot({path:`${output}/form-${width}.png`});
    const after = await page.evaluate(async () => {
      const {game,combat,render,proc,target}=window.procFixture;
      const {updateItemForm}=await import('/src/item-form.ts');
      delete game.hero.buffs.delirium; updateItemForm(game.actor,game.hero.buffs,1);
      proc('hit-skill','Eruption'); proc('hit-skill','197'); combat.specialItems.update(.4);
      const patches=combat.specialItems.patches.length, hp=target.hp;
      game.hero.equipment.weapon.mods={reanimateReturned:100}; combat.specialItems.armReanimation(target);
      game.killEnemy(target); game.killEnemy(target);
      const count=combat.classes.summons.filter(s=>s.returned).length;
      render(); return { patches,count,consumed:target.redeemed,kills:game.hero.kills,hp };
    });
    assert.ok(after.patches>0); assert.equal(after.count,1); assert.equal(after.consumed,true); assert.equal(after.kills,1);
    await page.screenshot({path:`${output}/ground-returned-${width}.png`});
    await page.evaluate(() => {const f=window.procFixture;f.combat.classes.clear();f.renderer.dispose();});
    await page.close();
    console.log(`Remaining item procs, morph visuals, ground effects and production reanimation passed at ${width}px`);
  }
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
