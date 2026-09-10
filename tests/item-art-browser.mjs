import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave, stats } from '../src/model.ts';
import { BASES, RUNE_ORDER, RUNEWORDS, makeItem, placeItems, runeNumber } from '../src/items.ts';
import { itemArtwork } from '../src/item-art.ts';
import { savedProfile, inventoryItems, openSocketEditor, recipeNamed } from './browser-helpers.mjs';

const output = '.verification/item-art-check';
await mkdir(output, { recursive: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const errors = [], rarities = ['common', 'magic', 'rare', 'set', 'unique', 'runeword', 'legendary'];
const bases = [...new Map(BASES.map(base => [base.baseCode, base])).values()];
const item = (code, id, rarity = 'common') => ({ ...makeItem(BASES.find(base => base.baseCode === code), id), rarity });
const hero = newHero(); hero.level = 80; hero.strength = hero.dexterity = 180; hero.gold = 10000;
hero.runes = [...RUNE_ORDER, 'el', 'el', 'tal', 'thul', 'ort', 'amn'];
hero.inventory = [item('crs', 'socket-base'), item('hax', 'axe', 'magic'), item('qui', 'armor', 'rare'), item('buc', 'shield', 'set'), item('cap', 'helm', 'unique'), item('rin', 'unidentified', 'rare')];
hero.inventory[0].sockets = 4; hero.inventory.at(-1).identified = false;
assert.ok(placeItems(hero.inventory));
hero.stash = rarities.map(rarity => item('utp', `quality-${rarity}`, rarity));
assert.ok(placeItems(hero.stash, 10));
hero.equipment.weapon = item('ssd', 'equipped-weapon', 'rare'); hero.equipment.armor = item('chn', 'equipped-armor', 'unique');
hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana;
const browser = await chromium.launch({ channel: 'msedge', headless: true });

async function fit(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const overflow = await page.locator('.panel,.rune-entry,.rune-entry>strong,.rune-entry>small,.runeword-list>div,.rune-sequence,.socket-row,.encyclopedia-recipe,.encyclopedia-entry,.encyclopedia-detail h3').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length && node.scrollWidth > node.clientWidth + 2).map(node => `${node.className}: ${node.textContent.trim()}`));
  assert.deepEqual(overflow, []);
  const clipped = await page.locator('.bag-item>.item-visual,.gear-slot>.item-visual').evaluateAll(nodes => nodes.filter(node => {
    const r = node.getBoundingClientRect(), p = node.parentElement.getBoundingClientRect();
    return r.x < p.x || r.y < p.y || r.right > p.right + 1 || r.bottom > p.bottom + 1;
  }).map(node => node.parentElement.dataset.item));
  assert.deepEqual(clipped, []);
}

try {
  const atlas = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await atlas.goto(base);
  const pixels = await atlas.evaluate(async drawings => {
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 112;
    const ctx = canvas.getContext('2d'), records = [];
    for (const [code, svg] of drawings) {
      const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace('<svg ', '<svg width="80" height="112" '))}`;
      await image.decode(); ctx.clearRect(0,0,80,112); ctx.drawImage(image,0,0);
      const data = ctx.getImageData(0,0,80,112).data; let colored = 0, edge = 0, hash = 2166136261;
      for(let i=0;i<data.length;i+=4) {
        const x=i/4%80, y=Math.floor(i/4/80);
        if(data[i+3]>30) { colored++; if(x===0||x===79||y===0||y===111) edge++; }
        for(let c=0;c<4;c++) hash=Math.imul(hash^data[i+c],16777619)>>>0;
      }
      records.push({ code, colored, edge, hash });
    }
    return records;
  }, bases.map(base => [base.baseCode, itemArtwork(base)]));
  for(const sample of pixels) { assert.ok(sample.colored > 220, `Blank icon: ${JSON.stringify(sample)}`); assert.equal(sample.edge,0,`Clipped icon: ${sample.code}`); }
  const hashes = new Map();
  for(const sample of pixels) { assert.ok(!hashes.has(sample.hash),`${sample.code} duplicates ${hashes.get(sample.hash)}`); hashes.set(sample.hash,sample.code); }
  console.log(`${pixels.length} base icons render with distinct pixels and no clipping`);
  const examples = ['ssd','scm','crs','7cr','lsd','2hs','hax','2ax','bal','fla','whm','scp','bwn','gwn','lst','ob1','spr','tri','jav','scy','lbw','am2','rxb','clw','qui','lea','chn','ful','utp','buc','tow','pa5','ne1','cap','hlm','crn','dr3','ba3','lgl','hgl','lbt','hbt','hbl','rin','amu','cm1','cm3','jew'];
  await atlas.evaluate(async codes => {
    const { BASES } = await import('/src/items.ts'); const { itemVisual } = await import('/src/item-art.ts');
    const review = document.createElement('div'); review.id = 'art-review';
    review.style.cssText = 'position:fixed;inset:0;z-index:1000;background:#121d1c;padding:24px;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px;align-content:start;overflow:auto';
    review.innerHTML = codes.map(code => { const base = BASES.find(base => base.baseCode===code); return `<div style="text-align:center;min-width:0;color:#bbc6bb;font:11px/1.5 sans-serif"><div style="height:154px;background:#1f2b28">${itemVisual(base)}</div><div style="padding:8px 0">${base.name}</div></div>`; }).join('');
    document.body.append(review);
  }, examples);
  await atlas.screenshot({ path: `${output}/base-atlas.png` }); await atlas.close();

  for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:360,height:640},{width:844,height:390}]) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width<900, isMobile: viewport.width<700 });
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(save => { if(!sessionStorage.getItem('art-seed')) { localStorage.setItem('eclipse-ii-save-v1',save); sessionStorage.setItem('art-seed','1'); } }, serializeSave(hero));
    await page.goto(base); await page.getByRole('button',{name:'进入旅程',exact:true}).click();
    await page.waitForFunction(()=>window.eclipseState.inCamp&&!window.eclipseState.paused);
    await page.keyboard.press('i'); await page.locator('.bag-item[data-item="socket-base"]').click();
    await expect(page.locator('.item-showcase [data-base-icon]')).toHaveAttribute('data-base-icon','crs');
    await expect(page.locator('.gear-weapon [data-base-icon]')).toHaveAttribute('data-base-icon','ssd');
    await inventoryItems(page); await fit(page); await page.locator('.diablo-grid').scrollIntoViewIfNeeded(); await page.screenshot({path:`${output}/inventory-${viewport.width}.png`});
    if (viewport.width <= 700) await page.locator('button[data-inventory-pane="details"]').click();
    await openSocketEditor(page);
    for(const rune of ['tal','thul','ort','amn']) {
      const button=page.locator(`[data-socket="${rune}"]`); await expect(button).toContainText(runeNumber(rune)); await button.click();
    }
    await expect(page.locator('.item-details h3')).toHaveText('精神');
    assert.deepEqual(await page.locator('.socket-rune>b').allTextContents(),['#7','#10','#9','#11']);
    assert.equal((await savedProfile(page)).hero.inventory.find(item=>item.id==='socket-base').rarity,'runeword');
    await fit(page); await page.locator('.socket-row').scrollIntoViewIfNeeded(); await page.screenshot({path:`${output}/sockets-${viewport.width}.png`});
    await inventoryItems(page); await page.locator('[data-bag-view="stash"]').click();
    const colors=await page.locator('.bag-item').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).backgroundColor)); assert.equal(new Set(colors).size,rarities.length);
    await fit(page); await page.locator('.diablo-grid').scrollIntoViewIfNeeded(); await page.screenshot({path:`${output}/rarities-${viewport.width}.png`});
    await page.locator('[data-bag-view="runes"]').click();
    for(const id of RUNE_ORDER) await expect(page.locator(`.rune-entry[data-rune="${id}"]>small`)).toContainText(runeNumber(id));
    const steel=page.locator('.runeword-list>div').filter({has:page.locator('strong',{hasText:/^钢铁$/})});
    assert.deepEqual(await steel.locator('.rune-sequence>span>small').allTextContents(),['#3','#1']);
    await fit(page); await page.locator('.rune-pouch').scrollIntoViewIfNeeded(); await page.screenshot({path:`${output}/runes-${viewport.width}.png`});
    await recipeNamed(page, '钢铁'); await steel.scrollIntoViewIfNeeded(); await page.screenshot({path:`${output}/recipes-${viewport.width}.png`});
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.getByRole('button',{name:'保存并切换角色',exact:true}).click();
    await page.getByRole('button',{name:'打开百科',exact:true}).click();
    await page.getByRole('combobox',{name:'物品分类',exact:true}).selectOption('rune'); await page.getByRole('searchbox').fill('#1');
    await expect(page.locator('.encyclopedia-entry')).toHaveCount(1); await page.locator('.encyclopedia-entry').click();
    await expect(page.locator('.encyclopedia-detail h3')).toHaveText('艾尔符文'); await expect(page.locator('.encyclopedia-rune-number')).toHaveText('#1');
    await fit(page); await page.screenshot({path:`${output}/encyclopedia-rune-${viewport.width}.png`});
    if(viewport.width<=700) await page.getByRole('button',{name:'返回列表',exact:true}).click();
    await page.getByRole('searchbox').fill('精神'); await page.getByRole('combobox',{name:'物品分类',exact:true}).selectOption('runeword');
    await page.locator('.encyclopedia-entry').click();
    const beforeIcon=await page.locator('.encyclopedia-art [data-base-icon]').getAttribute('data-base-icon');
    await page.getByRole('combobox',{name:'符文之语底材',exact:true}).selectOption('统治者大盾');
    await expect(page.locator('.encyclopedia-art [data-base-icon]')).toHaveAttribute('data-base-icon','uit'); assert.notEqual(beforeIcon,'uit');
    assert.deepEqual(await page.locator('.encyclopedia-recipe>button>span>b').allTextContents(),['#7','#10','#9','#11']);
    await fit(page); await page.screenshot({path:`${output}/encyclopedia-word-${viewport.width}.png`});
    await page.locator('.encyclopedia-recipe [data-encyclopedia-link="rune-tal"]').click(); await expect(page.locator('.encyclopedia-rune-number')).toHaveText('#7');
    await page.getByRole('button',{name:'返回上一条目',exact:true}).click(); await expect(page.locator('.encyclopedia-art [data-base-icon]')).toHaveAttribute('data-base-icon','uit');
    if(viewport.width<=700) await page.getByRole('button',{name:'返回列表',exact:true}).click();
    const six=RUNEWORDS.find(word=>word.runes.length===6); await page.getByRole('searchbox').fill(six.name); await page.locator('.encyclopedia-entry').first().click();
    await expect(page.locator('.encyclopedia-recipe>button')).toHaveCount(6); await fit(page); await page.screenshot({path:`${output}/six-runes-${viewport.width}.png`});
    await page.close(); console.log(`Inventory, quality styles, rune numbering, socketing and encyclopedia: ${viewport.width}x${viewport.height}`);
  }
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
