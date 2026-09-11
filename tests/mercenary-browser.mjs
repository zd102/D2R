import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, stats } from '../src/model.ts';
import { BASES, makeItem, placeItems } from '../src/items.ts';
import { mercenaryCost } from '../src/mercenary.ts';
import { savedProfile } from './browser-helpers.mjs';

const output = process.env.OUTPUT_DIR || '.verification/mercenary-check';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
const gear = (code, id) => makeItem(BASES.find(base => base.baseCode === code), id);
async function open(hero, width) {
  const page = await browser.newPage({ viewport: { width, height: width < 700 ? 844 : 960 }, hasTouch: width < 700 });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => { const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.mercenaryVerification = game;') }); });
  await page.addInitScript(hero => {
    if (sessionStorage.getItem('mercenary-fixture')) return;
    localStorage.setItem('eclipse-ii-profile-v2:mercenary-test', JSON.stringify({ version: 2, id: 'mercenary-test', name: '米山测试', createdAt: 1, updatedAt: 1, revision: 1, hero }));
    sessionStorage.setItem('mercenary-fixture', '1');
  }, hero);
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState?.inCamp && !window.eclipseState.paused);
  return page;
}
try {
  const locked = newHero(); locked.campaign.cleared[0] = 4; locked.gold = 50000;
  const lockedPage = await open(locked, 1440);
  await expect(lockedPage.locator('[data-action="mercenary-merchant"]')).toHaveCount(0);
  await lockedPage.keyboard.press('o'); await expect(lockedPage.locator('.panel-mercenary')).toContainText('通关第一章');
  assert.equal(await lockedPage.evaluate(() => window.mercenaryVerification.hireMercenary()), false);
  await lockedPage.close();

  for (const width of [1440, 390, 360].filter(width => !process.env.MERCENARY_WIDTH || width === Number(process.env.MERCENARY_WIDTH))) {
    const h = newHero('sorceress'); h.level = 30; h.campaign.cleared[0] = 5; h.gold = 50000; h.hp = stats(h).maxHp;
    const spear = gear('spr', 'merc-spear'); spear.mods = { damage: 100, lifeSteal: 30, lifeOnKill: 25, ias: 40, aura_meditation: 15 };
    const armor = gear('lea', 'merc-armor'); armor.mods = { life: 80, allRes: 30 };
    const helm = gear('cap', 'merc-helm'); helm.mods = { defense: 50 };
    h.inventory = [spear, armor, helm]; placeItems(h.inventory);
    const page = await open(h, width);
    await page.screenshot({ path: `${output}/camp-${width}.png` });
    await page.keyboard.press('o'); await page.locator('[data-action="find-mercenary"]').click();
    await expect(page.locator('.panel-mercenary-shop')).toBeVisible();
    await page.locator('[data-action="hire-mercenary"]').click();
    await expect(page.locator('[data-action="hire-mercenary"]')).toBeDisabled();
    let saved = (await savedProfile(page)).hero;
    assert.equal(saved.gold, h.gold - mercenaryCost(h)); assert.equal(saved.mercenary.status, 'alive');
    await page.locator('[data-mercenary-item="merc-armor"]').click();
    await expect(page.locator('.mercenary-comparison')).toContainText('+80');
    for (const item of h.inventory) await page.locator(`[data-mercenary-equip="${item.id}"]`).click();
    await page.locator('[data-mercenary-tab="equipment"]').focus(); await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-mercenary-tab="auras"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-mercenary-tab="auras"]')).toBeFocused();
    await expect(page.locator('.mercenary-extra-auras')).toContainText('冥思');
    for (const aura of ['prayer', 'defiance', 'blessedAim', 'might', 'holyFreeze', 'thorns']) { await page.locator(`[data-mercenary-aura="${aura}"]`).click(); await expect(page.locator(`[data-mercenary-aura="${aura}"]`)).toHaveAttribute('aria-pressed', 'true'); }
    await page.locator('[data-mercenary-aura="holyFreeze"]').click();
    saved = (await savedProfile(page)).hero; assert.equal(saved.inventory.length, 0); assert.equal(saved.mercenary.equipment.weapon.id, spear.id);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('.panel-body').evaluate(node => node.scrollTop = 0);
    await page.screenshot({ path: `${output}/merchant-${width}.png` });
    await page.reload(); await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.eclipseState?.mercenary?.position);
    assert.equal((await savedProfile(page)).hero.mercenary.aura, 'holyFreeze');
    await page.locator('#mercenary-status').click(); await page.locator('[data-mercenary-unequip="helm"]').click();
    assert.ok((await savedProfile(page)).hero.inventory.some(item => item.id === helm.id));
    await page.locator(`[data-mercenary-equip="${helm.id}"]`).click();
    await page.locator('[data-mercenary-item="merc-spear"]').click();
    assert.equal(await page.locator('.panel-body').evaluate(node => node.scrollWidth <= node.clientWidth), true, 'Equipment details fit the panel');
    await page.screenshot({ path: `${output}/equipment-${width}.png` });
    await expect(page.locator('.mercenary-inspector')).toContainText('生命偷取');
    if (width === 390) {
      await page.setViewportSize({ width: 844, height: 390 });
      assert.equal(await page.locator('.panel-body').evaluate(node => node.scrollWidth <= node.clientWidth), true, 'Landscape equipment fits');
      await page.locator('[data-mercenary-tab="auras"]').click();
      assert.equal(await page.locator('.panel-body').evaluate(node => node.scrollWidth <= node.clientWidth), true, 'Landscape auras fit');
      await page.screenshot({ path: `${output}/landscape.png` });
      await page.setViewportSize({ width, height: 844 });
    }
    await page.keyboard.press('Escape');

    const potionCount = await page.evaluate(() => {
      const g = window.mercenaryVerification;
      g.hero.hp = 20; g.hero.mercenary.hp = 100; g.hero.mercenary.aura = 'might'; g.hero.mercenary.potionHealing = 0;
      return g.hero.potions[0];
    });
    await page.keyboard.down('Shift'); await page.keyboard.down('Digit1'); await page.keyboard.down('Digit1');
    await page.keyboard.up('Digit1'); await page.keyboard.up('Shift');
    await page.waitForFunction(() => window.mercenaryVerification.hero.mercenary.hp > 100);
    assert.equal((await savedProfile(page)).hero.potions[0], potionCount - 1, 'Shift+1 and OS key repeat consume one bottle');
    assert.equal(await page.evaluate(() => window.mercenaryVerification.hero.hp), 20, 'Shift+1 does not heal the player');
    await page.keyboard.press('o'); await page.keyboard.press('Shift+Digit1');
    assert.equal(await page.evaluate(() => window.mercenaryVerification.hero.potions[0]), potionCount - 1, 'Paused input cannot feed potions');
    await page.keyboard.press('Escape');
    await page.evaluate(async () => { const g = window.mercenaryVerification; const { mercenaryStats } = await import('/src/mercenary.ts'); g.hero.mercenary.hp = mercenaryStats(g.hero).maxHp; g.hero.mercenary.potionHealing = 0; });
    await page.keyboard.press('Shift+Digit1');
    assert.equal(await page.evaluate(() => window.mercenaryVerification.hero.potions[0]), potionCount - 1, 'Full health does not waste a bottle');
    await page.evaluate(() => { const g = window.mercenaryVerification; g.hero.mercenary.hp = 100; g.hero.potions[0] = 0; });
    await page.keyboard.press('Shift+Digit1');
    assert.equal(await page.evaluate(() => window.mercenaryVerification.hero.mercenary.hp), 100, 'Empty belt cannot heal the mercenary');
    await page.evaluate(count => { const g = window.mercenaryVerification; g.hero.potions[0] = count; g.hero.hp = 20; g.combat.regen[0] = 0; }, potionCount - 1);
    await page.keyboard.press('Digit1'); await page.waitForFunction(() => window.mercenaryVerification.hero.hp > 20);
    assert.equal(await page.evaluate(() => window.mercenaryVerification.hero.mercenary.hp), 100, 'Plain 1 still heals only the player');
    await page.evaluate(() => { const g = window.mercenaryVerification; g.combat.regen[0] = 0; g.hero.mercenary.aura = 'holyFreeze'; });

    const combat = await page.evaluate(async () => {
      const g = window.mercenaryVerification, { stats } = await import('/src/model.ts'), { ATTACKS } = await import('/src/monster-combat.ts');
      g.enterLevel(0, 0); g.paused = true; g.invincible = 0;
      const merc = g.hero.mercenary, target = g.enemies.find(enemy => !enemy.boss), point = g.mercenary.position;
      for (const enemy of g.enemies) if (enemy !== target) { enemy.dead = true; g.world.physics.removeBody(enemy.body); }
      target.actor.group.position.copy(point).add({ x: 1.6, y: 0, z: 0 }); target.body.position.set(target.actor.group.position.x, .5, target.actor.group.position.z);
      target.defense = 0; target.resistances.physical = 0; target.resistances.cold = 0; target.maxHp = target.hp = 100000; target.converted = 0;
      target.attackRating = 100000; target.damage = 20;
      const slow = g.combat.slow(target), oldRandom = Math.random; Math.random = () => .01;
      try {
        g.hero.hp = 20; merc.hp = 100;
        const beforeHp = target.hp, durability = merc.equipment.weapon.durability;
        g.mercenary.timer = 0; for (let i = 0; i < 90; i++) g.mercenary.update(1 / 60);
        const dealt = beforeHp - target.hp, healed = merc.hp > 100, playerHp = g.hero.hp, attacks = g.mercenary.attacks;
        const chosen = g.combat.classes.target(target)?.id;
        const beforeHit = merc.hp;
        g.monsterCombat.startCast(target, 'strike'); const cast = g.monsterCombat.state(target).cast; g.monsterCombat.resolve(target, cast); g.monsterCombat.cancel(target);
        const receivedMelee = merc.hp < beforeHit;
        const playerPosition = g.position.clone(); g.position.z += 5;
        const beforeShot = merc.hp;
        g.monsterCombat.fire(target, ATTACKS.arrow, target.actor.group.position, point.clone().sub(target.actor.group.position).normalize()); g.monsterCombat.update(.2); g.monsterCombat.cancel(target);
        const receivedMissile = merc.hp < beforeShot, beforePool = merc.hp;
        g.monsterCombat.startCast(target, 'fireWall', { ...ATTACKS.fireWall, shape: 'pool', radius: 2 });
        g.monsterCombat.resolve(target, g.monsterCombat.state(target).cast); g.monsterCombat.cancel(target); g.monsterCombat.update(.01); g.monsterCombat.cancel(target);
        const receivedHazard = merc.hp < beforePool; g.position.copy(playerPosition);
        merc.aura = 'prayer'; g.hero.hp = 20; g.hero.mana = 0; g.combat.pulse(); const prayerHealed = g.hero.hp > 20 && g.hero.mana === 0;
        const modRegen = stats(g.hero).manaRegen, equippedWeapon = merc.equipment.weapon;
        merc.equipment.weapon = null; const baseRegen = stats(g.hero).manaRegen; merc.equipment.weapon = equippedWeapon;
        merc.aura = 'thorns'; const beforeReflect = target.hp; g.mercenary.hurt(20, 'physical', target); const reflected = target.hp < beforeReflect;
        // Actual kill dispatch grants player XP/quest progress and mercenary kill healing.
        merc.hp = 50; g.hero.hp = 20; target.hp = 1; const kills = g.hero.kills; g.mercenary.strike(target); const killCredit = g.hero.kills === kills + 1 && g.hero.hp === 20 && merc.hp > 50;
        // Teleport catch-up uses a valid player position.
        point.x += 40; g.mercenary.update(1 / 60); const followed = point.distanceTo(g.position) < 3;
        g.mercenary.hurt(1e9, 'magic'); const dead = merc.status === 'dead' && merc.hp === 0 && !g.mercenary.ally;
        g.returnToCamp(); g.paused = true; const campDead = g.hero.mercenary.status === 'dead' && !g.mercenary.ally;
        const gold = g.hero.gold; g.ui.openPanel('mercenary'); const fieldHireRejected = !g.hireMercenary() && g.hero.gold === gold;
        return { dealt, healed, playerHp, attacks, slow, chosen, receivedMelee, receivedMissile, receivedHazard, prayerHealed, itemAura: modRegen > baseRegen, reflected, killCredit, followed, dead, campDead, fieldHireRejected, durability, finalDurability: merc.equipment.weapon.durability };
      } finally { Math.random = oldRandom; }
    });
    assert.ok(combat.dealt > 0 && combat.attacks >= 2); assert.ok(combat.healed); assert.equal(combat.playerHp, 20); assert.ok(combat.slow < 1);
    assert.equal(combat.chosen, 'mercenary'); for (const key of ['receivedMelee', 'receivedMissile', 'receivedHazard', 'prayerHealed', 'itemAura', 'reflected', 'killCredit', 'followed', 'dead', 'campDead', 'fieldHireRejected']) assert.equal(combat[key], true, key);
    assert.equal(combat.durability, combat.finalDurability);
    await page.keyboard.press('Escape');
    const deadPotions = await page.evaluate(() => window.mercenaryVerification.hero.potions[0]);
    await page.keyboard.press('Shift+Digit1');
    assert.equal(await page.evaluate(() => window.mercenaryVerification.hero.potions[0]), deadPotions, 'Feeding cannot revive a dead mercenary');
    await page.reload(); await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.eclipseState?.mercenary?.status === 'dead');
    assert.equal(await page.evaluate(() => window.eclipseState.mercenary.position), null);
    await page.keyboard.press('o'); await page.locator('[data-action="find-mercenary"]').click(); await expect(page.locator('.panel-mercenary-shop')).toContainText('已阵亡');
    const gold = (await savedProfile(page)).hero.gold; await page.locator('[data-action="hire-mercenary"]').click();
    saved = (await savedProfile(page)).hero; assert.equal(saved.gold, gold - mercenaryCost(saved)); assert.equal(saved.mercenary.status, 'alive'); assert.equal(saved.mercenary.equipment.weapon.id, spear.id);
    await page.screenshot({ path: `${output}/rehired-${width}.png` });
    console.log(`Mercenary merchant, equipment, auras, combat, Shift+1 potions, death and rehire passed at ${width}px`);
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
