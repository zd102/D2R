import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classFixture } from './class-fixture.ts';
import { skillValues } from '../src/paladin.ts';
import { BASES, RUNEWORDS, makeItem, socketItem, specialItem, itemMods, type Item } from '../src/items.ts';
import { newHero, stats, skillLevel, swapWeapons, serializeSave, parseSave, activeEquipment } from '../src/model.ts';
import { CATALOG_SPECIALS as OLD_SPECIALS } from '../src/item-catalog-data.ts';
import { ADDED_RUNEWORDS } from '../src/item-catalog-current.ts';
import { catalogMods, unappliedItemEffects } from '../src/item-catalog.ts';
import { BASE_OFFERS, buyProgressionBase, unlockedBaseOffers } from '../src/progression-equipment.ts';
import { runePool } from '../src/loot.ts';
import { MONSTERS } from '../src/bestiary.ts';

function craft(code: string, id: string) {
  const word = RUNEWORDS.find(word => word.catalogId === id)!;
  const item = makeItem(BASES.find(base => base.baseCode === code)!); item.sockets = word.runes.length;
  for (const rune of word.runes) assert.ok(socketItem(item, rune, () => .25));
  assert.equal(item.catalogId, id); return item;
}

test('physical bow synergies use hard points and Strafe uses full weapon damage and accuracy', t => {
  const hard = { multipleShot: 20, guidedArrow: 20 };
  assert.equal(skillValues('strafe', 20, hard).damage, 400);
  assert.equal(skillValues('strafe', 20, hard).attack, 201);
  assert.equal(skillValues('multipleShot', 1, hard).damage, 240);
  assert.equal(skillValues('guidedArrow', 20, hard).damage, 373);
  const f = classFixture('amazon', false); swapWeapons(f.hero); const enemy = f.enemy(2);
  f.hero.skills.strafe = 1; f.hero.skills.multipleShot = 1;
  t.mock.method(Math, 'random', () => .1);
  const hp = enemy.hp; f.combat.weaponHit(enemy, 'attack'); const basic = hp - enemy.hp;
  enemy.hp = hp; f.combat.weaponHit(enemy, 'strafe'); const strafe = hp - enemy.hp;
  enemy.hp = hp; f.combat.weaponHit(enemy, 'multipleShot'); const multi = hp - enemy.hp;
  assert.ok(strafe >= basic, `${strafe} vs ${basic}`);
  assert.ok(Math.abs(multi - basic * .75) <= 1);
});

test('holy bolts pierce demons, undead and allies but not beasts; walls still block', () => {
  const f = classFixture('paladin', false); f.hero.skills.holyBolt = 20; f.hero.mana = 100;
  const demon = f.enemy(2), ally = f.enemy(4), beast = f.enemy(6), undead = f.enemy(8);
  demon.definition = MONSTERS.fallen; ally.converted = 20; ally.hp = 100;
  beast.definition = MONSTERS.spider; beast.kind = 'demon'; undead.definition = MONSTERS.zombie;
  f.game.aim.set(0, 0, 10); assert.ok(f.combat.castAction('holyBolt', true)); f.tick(1);
  assert.ok(demon.hp < demon.maxHp); assert.ok(ally.hp > 100); assert.equal(beast.hp, beast.maxHp); assert.ok(undead.hp < undead.maxHp);
  const before = undead.hp; f.tick(1); assert.equal(undead.hp, before);
  f.game.world.grid.isWalkableAt = () => false;
  f.hero.mana = 100; f.combat.castAction('holyBolt', true); const hp = demon.hp; f.tick(1); assert.equal(demon.hp, hp);
  assert.equal(skillValues('holyBolt', 20, { blessedHammer: 20 }).max, skillValues('holyBolt', 20).max);
  assert.ok(skillValues('holyBolt', 20, { fistOfHeavens: 20 }).max > skillValues('holyBolt', 20).max);
});

test('Fist of Heavens has independent 0.4s delay and one holy hit per secondary body per cast', () => {
  const f = classFixture('paladin', false); f.hero.skills.fistOfHeavens = 20; f.hero.skills.holyBolt = 20; f.hero.mana = 500;
  const primary = f.enemy(3), a = f.enemy(5), b = f.enemy(7);
  for (const enemy of [primary,a,b]) enemy.definition = MONSTERS.fallen;
  f.game.target = primary; assert.ok(f.combat.castAction('fistOfHeavens'));
  assert.equal(f.combat.fohDelay, .4);
  const primaryHp = primary.hp, amount = Math.floor(skillValues('fistOfHeavens', 20, f.hero.skills).secondary);
  f.tick(1); assert.equal(primary.hp, primaryHp); assert.equal(a.maxHp-a.hp, amount); assert.equal(b.maxHp-b.hp, amount);
});

test('Nova and Thunder Storm gain static hard-point synergies, Hydra is bounded and expires', () => {
  assert.equal(skillValues('nova', 1).cost, 13);
  assert.equal(skillValues('nova', 20, { staticField: 20 }).max, skillValues('nova', 20).max * 2);
  assert.ok(Math.abs(skillValues('thunderStorm', 20, { staticField: 20 }).max / skillValues('thunderStorm', 20).max - 2.4) < .001);
  assert.equal(skillValues('thunderStorm', 20).duration, 600);
  const f = classFixture('sorceress', false); f.hero.skills.hydra = 1;
  for (let i=0;i<8;i++) { f.hero.mana=100; assert.ok(f.combat.castAction('hydra', true)); assert.equal(f.combat.classes.delays.hydra, 0); f.tick(f.combat.cooldown('hydra')); }
  assert.equal(f.combat.classes.summons.length, 6); f.tick(11); assert.equal(f.combat.classes.summons.length, 0);
});

test('new runewords have complete effects, legal bases, rune bonuses once and persistent rolls', () => {
  for (const word of ADDED_RUNEWORDS) {
    const item = craft(word.include.includes('tors') ? 'brs' : 'msk', word.id);
    assert.deepEqual(unappliedItemEffects(item), [], word.key);
    const hero = newHero(); hero.stash = [item]; assert.deepEqual(parseSave(serializeSave(hero))!.stash, [item]);
  }
  assert.equal(itemMods(craft('msk','d2r-Hearth')).coldRes, 45);
  assert.equal(itemMods(craft('brs','d2r-Hustle-armor')).staminaDrain, 50);
  const hero = newHero('sorceress'); hero.level=80; hero.strength=150; hero.dexterity=150;
  hero.equipment.weapon=craft('8hb','Runeword62'); hero.equipment.armor=craft('brs','d2r-Hustle-armor');
  assert.equal(activeEquipment(hero).length, 2); assert.ok(stats(hero).criticalStrike>0); assert.ok(stats(hero).evade>0);
  const amazon = newHero('amazon'); amazon.equipment=hero.equipment; amazon.strength=150; amazon.dexterity=150; amazon.level=80;
  assert.equal(skillLevel(amazon,'evade'),3); assert.equal(skillLevel(hero,'evade'),6);
  hero.equipment.weapon=null; hero.equipment.armor=null; assert.equal(stats(hero).evade,0); assert.equal(stats(hero).criticalStrike,0);
});

test('curated uniques improve new drops while old numerical rolls remain untouched', () => {
  for (const key of ['Pluckeye','Bane Ash','Manald Heal','Gravenspine','Blinkbats Form']) {
    const old = OLD_SPECIALS.find(entry=>entry.key===key)!;
    const current = specialItem(old.id,()=>.2);
    const legacy: Item = {...current,mods:catalogMods(old.properties,()=>.2),catalogRolls:old.properties.map(()=>.2)};
    const hero = newHero(); hero.stash=[legacy]; const restored=parseSave(serializeSave(hero))!;
    assert.deepEqual(restored.stash[0],legacy,key); assert.deepEqual(parseSave(serializeSave(restored))!.stash,[legacy]);
    assert.notDeepEqual(current.mods,legacy.mods,key);
    for (const version of [undefined,1]) {
      const ancient={...legacy,catalogVersion:version};hero.stash=[ancient];
      const loaded=parseSave(serializeSave(hero))!;
      assert.deepEqual(loaded.stash[0].mods,legacy.mods,key);
      assert.deepEqual(loaded.stash[0].catalogRolls,legacy.catalogRolls,key);
    }
  }
});

test('progression bases require both campaign and level, support actual recipes, and never charge on failure', () => {
  const hero=newHero('amazon'); hero.gold=100000; hero.level=99;
  assert.deepEqual(unlockedBaseOffers(hero),[]); assert.equal(buyProgressionBase(hero,'insight-bow'),undefined);
  hero.campaign.cleared=[10,0,0]; hero.level=26; assert.equal(buyProgressionBase(hero,'insight-bow'),undefined);
  hero.level=27; const bow=buyProgressionBase(hero,'insight-bow')!; assert.ok(bow); assert.equal(hero.gold,97600);
  const word=RUNEWORDS.find(word=>word.catalogId==='Runeword62')!;
  const available=runePool(28,0,2); assert.ok(word.runes.every(rune=>available.includes(rune)));
  for(const rune of word.runes)assert.ok(socketItem(bow,rune,()=>.5)); assert.equal(bow.name,word.name);
  const gold=hero.gold; assert.equal(buyProgressionBase(hero,'unknown'),undefined); assert.equal(hero.gold,gold);
  hero.inventory=Array.from({length:40},(_,i)=>({...makeItem(BASES.find(base=>base.baseCode==='rin')!,String(i)),width:1,height:1}));
  assert.equal(buyProgressionBase(hero,'insight-bow'),undefined); assert.equal(hero.gold,gold);
  for(const offer of BASE_OFFERS)assert.ok(BASES.find(base=>base.baseCode===offer.code)!.sockets!>=offer.sockets);
});
