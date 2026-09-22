import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';

const output=process.env.OUTPUT_DIR||'.verification/hud-rendering';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('const game = new Game();','const game = new Game(); window.hudGame = game;')});});
  await page.addInitScript(save=>localStorage.setItem('eclipse-ii-save-v1',save),serializeSave(newHero()));
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:5173/?mode=local');
  await page.getByRole('button',{name:'进入旅程',exact:true}).click();
  await page.waitForFunction(()=>window.hudGame?.profile&&!window.hudGame.paused);
  const result=await page.evaluate(async()=>{
    const g=window.hudGame,{stats}=await import('/src/model.ts');cancelAnimationFrame(g.frameId);
    const s=stats(g.hero);g.hero.hp=s.maxHp/4;g.hero.mana=s.maxMana/2;g.ui.update(0);
    const nodes=['health-fill','mana-fill','xp-fill','stamina-fill'].map(id=>document.getElementById(id));
    const observer=new MutationObserver(()=>{});nodes.forEach(node=>observer.observe(node,{attributes:true,attributeFilter:['style']}));
    for(let frame=0;frame<60;frame++)g.ui.update(0);
    const writes=observer.takeRecords().length;observer.disconnect();
    const health=nodes[0].parentElement,mana=nodes[1].parentElement;
    return{writes,health:health.getAttribute('aria-valuenow'),mana:mana.getAttribute('aria-valuenow'),maxHealth:health.getAttribute('aria-valuemax'),expectedHealth:Math.ceil(s.maxHp/4),expectedMana:Math.floor(s.maxMana/2),low:health.classList.contains('resource-low'),levels:nodes.slice(0,2).map(node=>node.style.getPropertyValue('--resource-level'))};
  });
  assert.equal(result.writes,0,'unchanged resources must not dirty style each frame');
  assert.equal(+result.health,result.expectedHealth);assert.equal(+result.mana,result.expectedMana);
  assert.equal(result.low,true);assert.deepEqual(result.levels,['0.25','0.5']);
  await page.screenshot({path:`${output}/hud-desktop.png`});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.hudGame.ui.update(0));
  await page.screenshot({path:`${output}/hud-mobile.png`});
  assert.deepEqual(errors,[]);console.log('PASS: resource accessibility, low-life state and zero unchanged HUD style writes',result);
} finally {await browser.close();}
