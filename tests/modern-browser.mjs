import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {newHero,gainXp,allocateAttribute,serializeSave} from '../src/model.ts';
import {EXPERIENCE} from '../src/paladin.ts';
import {savedProfile,inventoryItems,openSocketEditor} from './browser-helpers.mjs';

const base=process.env.BASE_URL||'http://127.0.0.1:5173';
const output=process.env.OUTPUT_DIR||'.verification/modern-browser';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
try {
  for(const width of [1440,390]) {
    const hero=newHero('amazon');gainXp(hero,EXPERIENCE[38]);hero.gold=20000;hero.campaign.cleared=[20,0,0];
    allocateAttribute(hero,'strength',20);allocateAttribute(hero,'dexterity',60);allocateAttribute(hero,'vitality',hero.points);
    hero.runes=['ral','tir','tal','sol','shael','io','sol'];
    const page=await browser.newPage({viewport:{width,height:width===1440?960:844}});
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(save=>{if(!sessionStorage.getItem('modern-seed')){localStorage.setItem('eclipse-ii-save-v1',save);sessionStorage.setItem('modern-seed','1');}},serializeSave(hero));
    await page.goto(base);await page.getByRole('button',{name:'进入旅程',exact:true}).click();
    await page.waitForFunction(()=>window.eclipseState?.inCamp&&!window.eclipseState.paused);
    const supply=await page.evaluate(()=>window.eclipseState.objectives.find(point=>point.kind==='supply').screen);
    await page.mouse.click(supply.x,supply.y);
    await page.waitForFunction(()=>Math.hypot(window.eclipseState.position.x-6,window.eclipseState.position.z-11)<3.4,{},{timeout:15000});
    await page.keyboard.press('f');await expect(page.locator('.panel-shop')).toBeVisible();
    await expect(page.locator('[data-buy-base="insight-bow"]')).toBeVisible();
    await expect(page.locator('[data-buy-base="elite-bow"]')).toHaveCount(0);
    await page.locator('[data-buy-base="insight-bow"]').click();
    await page.locator('[data-buy-base="utility-helm"]').click();
    const bought=(await savedProfile(page)).hero;
    assert.equal(bought.gold,16000);const bow=bought.inventory.find(item=>item.baseCode==='8hb'),helm=bought.inventory.find(item=>item.baseCode==='msk');
    assert.equal(bow.sockets,4);assert.equal(helm.sockets,3);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`${output}/shop-${width}.png`});
    await page.keyboard.press('Escape');await page.locator('.bottom-nav [data-panel="inventory"]').click();
    for(const [item,runes,id] of [[bow,['ral','tir','tal','sol'],'Runeword62'],[helm,['shael','io','sol'],'d2r-Bulwark']]) {
      await inventoryItems(page);await page.locator(`[data-item="${item.id}"]`).click();
      for(const rune of runes){await openSocketEditor(page);await page.locator(`[data-socket="${rune}"]`).click();}
      const saved=(await savedProfile(page)).hero.inventory.find(entry=>entry.id===item.id);
      assert.equal(saved.catalogId,id);assert.equal(saved.rarity,'runeword');
      if(id==='Runeword62')await expect(page.locator('.item-affixes')).toContainText('双倍打击');
      else await expect(page.locator('.item-affixes')).toContainText('物理伤害减免');
    }
    await page.screenshot({path:`${output}/crafted-${width}.png`});
    const inventory=(await savedProfile(page)).hero.inventory;
    await page.reload();await page.getByRole('button',{name:'进入旅程',exact:true}).click();
    assert.deepEqual((await savedProfile(page)).hero.inventory,inventory);
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'保存并切换角色',exact:true}).click();
    await page.getByRole('button',{name:'打开百科',exact:true}).click();
    await page.getByRole('searchbox').fill('Insight');await page.locator('.encyclopedia-entry').click();
    await expect(page.locator('#encyclopedia-base')).toContainText('剃刀之弓');
    // Small screens show the detail pane; return to the result list first.
    const list=page.locator('[data-encyclopedia-action="list"]');if(await list.isVisible())await list.click();
    await page.getByRole('searchbox').fill('Bulwark');
    await page.locator('.encyclopedia-entry').click();await expect(page.locator('.encyclopedia-detail')).toContainText('壁垒');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`${output}/recipe-${width}.png`});await page.close();
    console.log(`Modern base purchases, real socket crafting, save round trip and recipes passed at ${width}px`);
  }
  assert.deepEqual(errors,[]);
} catch(error) {
  for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:`${output}/failure-${page.viewportSize().width}.png`}).catch(()=>{});
  throw error;
} finally {await browser.close();}
