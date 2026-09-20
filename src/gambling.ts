import { BASES, makeItem, packItems, placeItems, specialItem, specialPool, weightedChoice, type Item, type ItemBase } from './items.ts';
import { applyAffixes } from './affixes.ts';
import { rollBaseProperties } from './base-properties.ts';
import { LEVELS } from './campaign.ts';
import { vendorPrice, type HeroState } from './model.ts';

// Normal / exceptional / elite families available from D2 gambling vendors.
// Wands, staves, scepters, charms, jewels and class gear other than claws are excluded.
const families = `
hax/9ha/7ha axe/9ax/7ax 2ax/92a/72a mpi/9mp/7mp wax/9wa/7wa lax/9la/7la bax/9ba/7ba btx/9bt/7bt gax/9ga/7ga gix/9gi/7gi
clb/9cl/7cl spc/9sp/7sp mac/9ma/7ma mst/9mt/7mt fla/9fl/7fl whm/9wh/7wh mau/9m9/7m7 gma/9gm/7gm
ssd/9ss/7ss scm/9sm/7sm sbr/9sb/7sb flc/9fc/7fc crs/9cr/7cr bsd/9bs/7bs lsd/9ls/7ls wsd/9wd/7wd 2hs/92h/72h clm/9cm/7cm gis/9gs/7gs bsw/9b9/7b7 flb/9fb/7fb gsd/9gd/7gd
dgr/9dg/7dg dir/9di/7di kri/9kr/7kr bld/9bl/7bl tkf/9tk/7tk bkf/9bk/7bk tax/9ta/7ta bal/9b8/7b8
jav/9ja/7ja pil/9pi/7pi ssp/9s9/7s7 glv/9gl/7gl tsp/9ts/7ts spr/9sr/7sr tri/9tr/7tr brn/9br/7br spt/9st/7st pik/9p9/7p7
bar/9b7/7o7 vou/9vo/7vo scy/9s8/7s8 pax/9pa/7pa hal/9h9/7h7 wsc/9wc/7wc
sbw/8sb/6sb hbw/8hb/6hb lbw/8lb/6lb cbw/8cb/6cb sbb/8s8/6s7 lbb/8l8/6l7 swb/8sw/6sw lwb/8lw/6lw lxb/8lx/6lx mxb/8mx/6mx hxb/8hx/6hx rxb/8rx/6rx
cap/xap/uap skp/xkp/ukp hlm/xlm/ulm fhl/xhl/uhl ghm/xhm/uhm crn/xrn/urn msk/xsk/usk bhm/xh9/uh9
qui/xui/uui lea/xea/uea hla/xla/ula stu/xtu/utu rng/xng/ung scl/xcl/ucl chn/xhn/uhn brs/xrs/urs spl/xpl/upl plt/xlt/ult fld/xld/uld gth/xth/uth ful/xul/uul aar/xar/uar ltp/xtp/utp
buc/xuc/uuc sml/xml/uml lrg/xrg/urg kit/xit/uit tow/xow/uow gts/xts/uts bsh/xsh/ush spk/xpk/upk
lgl/xlg/ulg vgl/xvg/uvg mgl/xmg/umg tgl/xtg/utg hgl/xhg/uhg lbt/xlb/ulb vbt/xvb/uvb mbt/xmb/umb tbt/xtb/utb hbt/xhb/uhb
lbl/zlb/ulc vbl/zvb/uvc mbl/zmb/umc tbl/ztb/utc hbl/zhb/uhc
ktr/9ar/7ar wrb/9wb/7wb axf/9xf/7xf ces/9cs/7cs clw/9lw/7lw btl/9tw/7tw skr/9qr/7qr
ci0/ci2/ci3 ci1/ci2/ci3 rin amu
`.trim().split(/\s+/).map(family => family.split('/'));
const bases = new Map(BASES.map(base => [base.baseCode, base]));
export const GAMBLING_FAMILIES = families.map(codes => codes.map(code => bases.get(code)!));
const normalBases = GAMBLING_FAMILIES.map(family => family[0]);
const draw = (random: () => number) => Math.max(0, Math.min(1 - Number.EPSILON, random()));
export const gamblingUnlocked = (hero: HeroState) => hero.campaign.cleared[0] >= LEVELS.length;
export const gamblingPool = (hero: HeroState) => normalBases.filter(base => base.level <= hero.level + 4);

export function gamblingStock(hero: HeroState, random = Math.random): string[] {
  if (!gamblingUnlocked(hero)) return [];
  const pool = gamblingPool(hero).filter(base => !['rin', 'amu'].includes(base.baseCode!));
  const stock = ['rin', 'amu'];
  while (pool.length && stock.length < 14) stock.push(pool.splice(Math.floor(draw(random) * pool.length), 1)[0].baseCode!);
  return stock;
}

// Jewelry retains the familiar D2 prices; equipment prices suit this game's economy.
export const gamblingPrice = (hero: HeroState, base: ItemBase) => vendorPrice(hero,
  base.baseCode === 'rin' ? 50000 : base.baseCode === 'amu' ? 63000 : 1000 + hero.level * 300 + base.level * 100);

// https://classic.battle.net/diablo2exp/basics/gambling.shtml
export function gamblingRarity(roll: number): 'unique' | 'set' | 'rare' | 'magic' {
  return roll < .0005 ? 'unique' : roll < .0015 ? 'set' : roll < .1015 ? 'rare' : 'magic';
}
export function gamblingBase(base: ItemBase, level: number, random = Math.random): ItemBase {
  const family = GAMBLING_FAMILIES.find(family => family[0] === base)!;
  const [, exceptional, elite] = family;
  if (elite && draw(random) < Math.max(0, (level - elite.level) * .0033 + .01)) return elite;
  if (exceptional && draw(random) < Math.max(0, (level - exceptional.level) * .009 + .01)) return exceptional;
  return base;
}

export function buyGamble(hero: HeroState, code: string, random = Math.random): Item | undefined {
  if (!gamblingUnlocked(hero)) return;
  const base = gamblingPool(hero).find(base => base.baseCode === code);
  if (!base || hero.gold < gamblingPrice(hero, base) || !packItems([...hero.inventory, makeItem(base)])) return;
  const price = gamblingPrice(hero, base), level = Math.max(5, Math.min(99, hero.level - 5 + Math.floor(draw(random) * 10)));
  const upgraded = gamblingBase(base, level, random);
  let item = makeItem(upgraded); item.level = level; item.rarity = gamblingRarity(draw(random));
  if (item.rarity === 'unique' || item.rarity === 'set') {
    const pool = specialPool(level, item.rarity).filter(entry => entry.baseCode === upgraded.baseCode);
    if (pool.length) item = specialItem(weightedChoice(pool, entry => entry.dropWeight ?? 1, random).name, random);
    else {
      if (item.maxDurability) item.durability = item.maxDurability *= item.rarity === 'unique' ? 3 : 2;
      item.rarity = item.rarity === 'unique' ? 'rare' : 'magic';
    }
  }
  item.level = level;
  rollBaseProperties(applyAffixes(item, random), random, { ethereal: false });
  item.identified = true;
  if (!packItems([...hero.inventory, item])) return;
  hero.inventory.push(item); placeItems(hero.inventory); hero.gold -= price;
  return item;
}
