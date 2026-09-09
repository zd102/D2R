import { BASES, RUNE_ORDER, type Item, type Rarity, type RuneId } from './items.ts';
import { CATALOG_BASES } from './item-catalog-data.ts';

type VisualItem = Pick<Item, 'name' | 'slot'> & Partial<Item>;
const byCode = new Map(CATALOG_BASES.map(base => [base.code, base]));
const byName = new Map(BASES.map(base => [base.name, base]));
const groups = new Map<string, string[]>();
for (const base of CATALOG_BASES) {
  const family = base.type === 'h2h2' ? 'h2h' : base.type;
  if (!groups.has(family)) groups.set(family, []);
  groups.get(family)!.push(base.code);
}
const cache = new Map<string, string>();
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const hash = (value: string) => [...value].reduce((seed, char) => (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0, 7);
const accents: Record<Rarity, string> = { common: '#c2cccd', magic: '#70baff', rare: '#f5de66', set: '#77e19b', unique: '#f4b65d', runeword: '#b8fff0', legendary: '#ff877f' };
const qualityIcons: Partial<Record<Rarity, string>> = { magic: 'sparkles', rare: 'sun', set: 'shield-check', unique: 'crown', runeword: 'scroll-text', legendary: 'flame' };

export function itemArtKey(item: VisualItem) { return item.baseCode ?? byName.get(item.base ?? item.name)?.baseCode ?? item.base ?? item.name; }

export function itemArtwork(item: VisualItem): string {
  const code = itemArtKey(item), base = byCode.get(code), rarity = item.rarity ?? 'common';
  const family = base?.type === 'h2h2' ? 'h2h' : base?.type ?? (item.charm ? 'scha' : item.jewel ? 'jewl' : item.misc ? 'misc' : ({ weapon: 'swor', shield: 'shie', armor: 'tors', helm: 'helm', gloves: 'glov', boots: 'boot', belt: 'belt', ring: 'ring', ring2: 'ring', amulet: 'amul' })[item.slot]);
  const key = `${code}:${family}:${rarity}`;
  const cached = cache.get(key); if (cached) return cached;
  const seed = hash(code), ordinal = Math.max(0, groups.get(family)?.indexOf(code) ?? 0);
  const familySize = groups.get(family)?.length ?? 1;
  const tier = familySize >= 6 ? Math.min(2, Math.floor(ordinal / (familySize / 3))) : 0;
  const variant = familySize >= 6 ? ordinal % Math.ceil(familySize / 3) : ordinal;
  const metal = ['#95a3a7', '#b2b9bd', '#c3cfd0'][tier], dark = ['#46565b', '#54616d', '#596c79'][tier];
  const light = '#edf3e9', ink = '#202b2e', trim = rarity === 'common' ? ['#9b9378', '#c0ac78', '#dfc17e'][tier] : accents[rarity];
  const leather = ['#536352', '#756352', '#5b5f75', '#4d6d70', '#735660'][seed % 5];
  const gem = ['#80d5cd', '#bc869e', '#9aa3ec', '#d7bd69', '#94c28b'][seed % 5];
  const path = (d: string, fill = metal, stroke = ink, width = 1.6) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
  const line = (d: string, color = light, width = 1.4) => path(d, 'none', color, width);
  const ellipse = (x: number, y: number, rx: number, ry: number, fill = metal, stroke = ink) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
  const jewel = (x: number, y: number, r = 5) => path(`M${x} ${y-r}L${x+r} ${y} ${x} ${y+r} ${x-r} ${y}Z`, gem) + line(`M${x-r+1} ${y}L${x} ${y-r+1} ${x} ${y+r-1}`, light, .8);
  const rivets = (points: number[][]) => points.map(([x,y]) => ellipse(x,y,1.5,1.5,trim)).join('');
  const grip = (top: number, bottom = 101, x = 40) => path(`M${x-3} ${top}H${x+3}V${bottom}H${x-3}Z`, leather) + Array.from({ length: Math.floor((bottom-top)/5) }, (_,i) => line(`M${x-3} ${top+3+i*5}l6 -2`,trim,1)).join('');
  // Catalog order retains the related normal, exceptional and elite silhouettes.
  const w = 5 + variant % 4 + tier, tip = 9 + seed % 7, guard = 12 + variant % 6;
  let art = '';
  if (['swor', 'knif', 'tkni'].includes(family)) {
    const dagger = family !== 'swor', shoulder = dagger ? 71 : base?.twoHanded ? 74 : 83;
    const bladeTip = dagger ? tip+19 : variant === 0 ? tip+14 : tip;
    const bladeWidth = w + (!dagger && (base?.twoHanded || [5,7].includes(variant)) ? 4 : 0);
    const bladeShoulder = Math.max(bladeTip+12, dagger ? 47 : 30);
    const crossguard = guard + (base?.twoHanded ? 5 : 0);
    const curved = family === 'swor' && [1,2,3].includes(variant);
    const crystal = family === 'swor' && variant === 4;
    art = grip(shoulder, 102) + ellipse(40,103,5+tier,3,trim);
    art += curved ? path(`M34 ${shoulder}Q57 56 56 ${tip}Q75 52 45 ${shoulder}Z`) + path(`M40 ${shoulder-3}Q64 48 56 ${tip}Q69 47 45 ${shoulder}Z`,dark)
      : crystal ? path(`M40 ${tip}L${40+w} 29 47 49 51 63 44 ${shoulder}H35L29 63 33 48 31 29Z`, '#89c8de') + path(`M40 ${tip}L44 ${shoulder}H39Z`, '#d9f4f7') + line('M31 29L40 42 47 49M29 63L40 53 51 63','#527f9e')
      : path(`M40 ${bladeTip}L${40+bladeWidth} ${bladeShoulder} ${40+bladeWidth-2} ${shoulder}H${40-bladeWidth+2}L${40-bladeWidth} ${bladeShoulder}Z`) + path(`M40 ${bladeTip}V${shoulder}H${40+bladeWidth-2}L${40+bladeWidth} ${bladeShoulder}Z`, dark) + line(`M${39-bladeWidth+2} ${shoulder-5}L${39-bladeWidth} ${bladeShoulder+1} 40 ${bladeTip}`,light);
    if (variant === 12 || family === 'knif' && variant === 2) art += line(`M40 ${tip+22}q-9 7 0 14t0 14t0 14`, trim, 3);
    art += path(`M${40-crossguard} ${shoulder-3}L36 ${shoulder-1}H44L${40+crossguard} ${shoulder-3}V${shoulder+3}L44 ${shoulder+4}H36L${40-crossguard} ${shoulder+3}Z`, trim) + jewel(40,shoulder+1,3);
    if (tier) art += line(`M40 48v${12+tier*4}m-3 -8h6`,trim,1.6);
  } else if (['axe','taxe','pole'].includes(family)) {
    const pole = family === 'pole', headY = 23 + variant % 4 * 3, size = 16 + variant % 5 * 2, double = family === 'axe' && [2,4,6,7,8,9].includes(variant);
    art = grip(headY-10,102);
    if (pole && [2,5].includes(variant)) art += path(`M36 26Q61 5 73 42Q52 26 39 39Z`) + line('M42 26Q57 15 67 30',light);
    else {
      const blade = path(`M42 ${headY}Q${49+size} ${headY-16} ${43+size} ${headY-7}L${43+size} ${headY+22}Q${54+size} ${headY+34} 42 ${headY+16}Z`) + path(`M${42+size} ${headY-7}V${headY+22}L${36+size} ${headY+16}V${headY-2}Z`,light) + line(`M45 ${headY+5}L${37+size} ${headY+1}`, trim, 2);
      art += blade + (double ? `<g transform="translate(80 0) scale(-1 1)">${blade}</g>` : path(`M37 ${headY+1}L${19-variant%4} ${headY+7} 37 ${headY+12}Z`,dark));
    }
    if (pole) art += path('M40 6L45 23H35Z',light);
    art += path(`M35 ${headY-2}H45V${headY+19}H35Z`,trim) + rivets([[40,headY+2],[40,headY+14]]);
    if (family === 'taxe') art = `<g transform="translate(7 8) scale(.82)">${art}</g>` + ellipse(40,95,7,7,trim) + ellipse(40,95,3,3,ink);
  } else if (['spea','aspe','jave','ajav'].includes(family)) {
    const spread = 10 + variant*2, prongs = variant === 1 || variant === 2;
    art = grip(36,104) + path(`M40 ${tip-4}L${40+w} 29 43 42H37L${40-w} 29Z`) + path(`M40 ${tip-4}V42H43L${40+w} 29Z`,dark);
    if (prongs) art += path(`M37 36Q${40-spread} 37 ${40-spread} 14L${44-spread} 24V31H36ZM43 36Q${40+spread} 37 ${40+spread} 14L${36+spread} 24V31H44Z`,trim);
    art += line('M36 43h8m-8 4h8',trim,3);
    if (family === 'aspe' || family === 'ajav') art += path('M44 46Q63 49 57 68L47 60Z',leather) + jewel(40,42,3);
  } else if (['club','mace','hamm','scep','wand','staf','orb'].includes(family)) {
    const short = ['wand','orb'].includes(family), top = short ? 47 : 30;
    art = grip(top,short ? 97 : 104);
    if (family === 'mace' && variant === 2) {
      art = grip(54,102) + line('M40 54Q30 36 46 25L58 26',metal,3) + ellipse(58,38,10+tier,11,dark) + path('M58 21L61 29 68 26 67 34 75 38 68 42 70 49 62 47 58 55 54 48 46 49 48 42 41 38 49 34 48 26 55 29Z',metal) + jewel(58,38,4);
    } else if (family === 'hamm') {
      const size = 18 + variant*4;
      art += path(`M${40-size} 15L${44+size} 20V43L${40-size} 38Z`,dark) + path(`M${40-size} 15L${34-size} 21V43L${40-size} 38ZM${40-size} 15V38L${44+size} 43V20Z`) + line(`M${42-size} 18L${42+size} 23`,light,3) + path('M35 17L44 18V41L35 40Z',trim);
    } else if (family === 'club' || family === 'mace') {
      art += path(`M34 51L${25-variant} 23 31 ${tip}H49L${55+variant} 23 46 51Z`,family==='club'?leather:metal) + line(`M38 ${tip+4}L39 46`,light,3);
      if (variant || family==='mace') art += path('M29 19L20 14 24 28 17 35 29 36M50 18L59 12 56 28 63 34 51 36',trim) + rivets([[35,20],[46,28],[36,39]]);
    } else if (family === 'scep') {
      art += path(`M34 42L${23-variant*3} 25 29 17 35 25 40 ${tip-5} 45 25 51 17 ${57+variant*3} 25 46 42Z`,trim) + jewel(40,29,9+tier) + line('M33 47h14',trim,4);
    } else if (family === 'orb') {
      art += ellipse(40,31,16+variant,19,gem) + path('M25 36L29 47 37 53H43L51 47 56 35 52 55 43 63H37L28 55Z',trim) + ellipse(35,23,5,8,light) + line(`M31 39Q49 ${24+variant*2} 49 22`,'#fff9e6',2);
    } else if (family === 'wand' && variant >= 2) {
      art += path('M28 25Q40 12 52 25V44L47 49 46 56H34L33 49 28 44Z','#c6c8b0') + path('M31 34L38 36 36 42 30 40ZM49 34L42 36 44 42 50 40ZM40 42L37 48H43Z',ink) + line('M36 51v5m4 -5v5m4 -5v5',dark);
      if (variant === 3) art += path('M29 29L20 16 20 32 29 38ZM51 29L60 16 60 32 51 38Z',trim) + jewel(40,25,4);
    } else {
      art += path(`M35 ${top+8}Q${17+variant*2} 19 34 ${tip}Q58 5 55 26L48 34 45 26 49 20Q40 9 34 23L43 ${top+8}Z`,leather) + line(`M38 ${top+4}Q26 23 37 ${tip+4}`,trim,2) + jewel(44,24,5+tier);
    }
  } else if (['bow','abow'].includes(family)) {
    const bend = 12 + variant*2, recurve = variant >= 3;
    art = path(`M${30+bend/3} 8Q${65+bend/3} 20 42 53Q${66+bend/3} 90 ${30+bend/3} 104L${28+bend/3} 98Q${54+bend/3} 80 35 56Q${53+bend/3} 25 ${28+bend/3} 14Z`,leather) + line(`M${30+bend/3} 9L${29-bend/3} 56 ${30+bend/3} 103`,'#e6dbbc',1.2) + grip(45,64,39);
    if(recurve) art += line(`M${31+bend/3} 10Q65 24 45 35M${31+bend/3} 102Q65 88 45 77`,metal,3);
    art += line('M12 57H68',metal,2) + path('M70 57L61 53V61Z',light) + line('M16 53l5 4 -5 4',trim,2);
    if (family === 'abow') art += path('M46 26L60 18 55 33 48 36ZM46 83L59 93 54 77 48 73Z',metal) + jewel(42,42,4);
  } else if (family === 'xbow') {
    const span = 24 + variant*2;
    art = path('M36 21H44L47 97 38 104 32 98Z',leather) + path(`M${40-span} 30Q40 ${49+variant*3} ${40+span} 30L${40+span-1} 38Q40 ${60+variant*3} ${41-span} 38Z`,metal) + line(`M${40-span} 31L40 77 ${40+span} 31`,'#e6dbbc') + line('M40 21V87',trim,3) + path('M40 14L36 29H44Z',light) + path('M29 70H48V79H29Z',dark) + rivets([[34,74],[44,74]]);
  } else if (family === 'h2h') {
    const claws = 1 + variant%3;
    for(let i=0;i<claws;i++) { const x=40+(i-(claws-1)/2)*12; art += path(`M${x-3} 66L${x-5} ${20+variant%5*3} ${x+5} ${8+variant%4*2} ${x+2} 66Z`) + line(`M${x-2} 59V${24+variant%5*3}`); }
    art += path('M21 66L28 56H52L59 66 54 90 44 101H32L23 90Z',leather) + path('M23 65H57L53 77H27Z',metal) + jewel(40,70,6) + line('M29 86h22m-18 8h14',trim,3);
  } else if (family === 'tors') {
    const shoulder = 18+variant%5*2, waist = 23+variant%3, hem=87+variant%4*3, cloth=variant<4 || variant===14;
    art = path(`M${40-shoulder} 23L29 17 33 24H47L51 17 ${40+shoulder} 23 74 47 61 53 55 40 54 66 ${40+waist} ${hem} 43 ${hem+6} 40 ${hem-3} 37 ${hem+6} ${40-waist} ${hem} 26 66 25 40 19 53 6 47Z`,cloth?leather:metal);
    art += path(`M40 28H49L55 40 51 66 58 ${hem-2} 44 ${hem+1} 40 ${hem-6}Z`,cloth?dark:'#657781') + path(`M${40-shoulder} 23L29 21 26 37 14 44 10 41ZM${40+shoulder} 23L51 21 54 37 66 44 70 41Z`,trim);
    art += line(`M30 33L39 38 50 32M40 39V64M28 69H53M27 75H54`,trim,2) + path('M26 62H54V69H26Z',leather) + jewel(40,65,4);
    if (variant>=4 && variant<=6) for(let y=39;y<61;y+=7) art += line(`M29 ${y}l3 3 3 -3 3 3 3 -3 3 3 3 -3 3 3`,light,1);
    if (variant>=8) art += path(`M26 75L37 78 36 ${hem} 25 ${hem-4}ZM54 75L43 78 44 ${hem} 55 ${hem-4}Z`,metal) + rivets([[25,28],[55,28],[30,81],[50,81]]);
  } else if (['shie','ashd','head'].includes(family)) {
    const round = family!=='head' && variant < 2, width=23+variant%4*2, tall=family==='ashd'?94:100;
    if (family==='head') art = path(`M20 35L${16+variant} 18 29 25Q40 16 51 25L${66-variant} 18 60 39 58 66 49 83 48 95H32L31 83 22 66Z`,'#a8b0a0') + path('M24 49L36 52 33 65 24 60ZM56 49L44 52 47 65 56 60ZM40 63L34 76H46Z',ink) + line('M29 80l4 8 4 -6 3 8 3 -8 4 6 4 -8',trim,3);
    else {
      art = round ? ellipse(40,57,width,width+6,metal) + ellipse(40,57,width-5,width+1,leather)
        : path(`M40 12L${40+width} 25 ${38+width} 64Q57 90 40 ${tall}Q23 90 ${42-width} 64L${40-width} 25Z`,trim) + path(`M40 19L${35+width} 29 ${33+width} 64Q54 83 40 ${tall-8}Q26 83 ${47-width} 64L${45-width} 29Z`,leather) + path(`M40 19V${tall-8}Q54 83 ${33+width} 64L${35+width} 29Z`,dark);
      art += family==='ashd' ? path('M37 31H43V49H55V55H43V77H37V55H25V49H37Z',trim) : variant%3===0 ? line('M40 31v51M19 57h42',trim,5) : path('M40 31L53 57 40 80 27 57Z',trim);
      art += ellipse(40,57,7+tier,7+tier,metal) + jewel(40,57,4) + rivets([[40,23],[21,42],[59,42],[29,74],[51,74]]);
      if(variant===7) art += path('M15 32L8 21 22 27M65 32L72 21 58 27M21 70L9 73 25 79M59 70L71 73 55 79Z',metal);
    }
  } else if (['helm','circ','phlm','pelt'].includes(family)) {
    const crown=family==='circ'||family==='helm'&&variant===5, hood=family==='helm'&&variant===0, mask=family==='helm'&&variant>=6;
    if(crown) art = path(`M19 73L${12+variant} 36 27 46 31 ${19+tier*2} 40 40 49 ${19+tier*2} 53 46 ${68-variant} 36 61 73Z`,trim) + path('M19 65Q40 58 61 65V77Q40 69 19 77Z',metal) + jewel(40,63,7);
    else {
      art = path(`M15 76L${17+variant%3} 44Q19 ${17+variant} 40 18Q61 ${17+variant} ${63-variant%3} 44L65 76 53 90 48 73H32L27 90Z`,hood||family==='pelt'?leather:metal) + path('M40 21Q59 22 59 45L61 75 54 82 48 68H40Z',dark) + path('M23 48L37 54 36 63 23 59ZM57 48L43 54 44 63 57 59Z',ink);
      art += hood ? line('M27 32Q40 23 53 32M27 69v13M53 69v13',trim,2) : path('M37 25H43L44 65 40 71 36 65Z',trim) + line('M23 43l12 3m10 0 12 -3',light,2);
      if(family==='phlm'||family==='pelt'||variant===4) art += path(`M20 42Q${3+variant%5} 29 12 ${10+tier}L25 28 29 38ZM60 42Q${77-variant%5} 29 68 ${10+tier}L55 28 51 38Z`,family==='pelt'?'#bfc8b4':trim);
      if(mask) art += path('M24 65L32 68 34 82H46L48 68 56 65 53 88 40 96 27 88Z',metal) + line('M34 75v10m6 -9v12m6 -13v10',ink,2);
      art += jewel(40,34,4+tier);
    }
  } else if (family==='glov') {
    const cuff=22+variant*3;
    const glove=path(`M20 ${cuff}H42L41 60 49 53 53 58 42 74 39 89 22 91 17 82 16 58Z`,variant<2?leather:metal) + path(`M20 ${cuff}H42V${cuff+11}H19Z`,trim) + line('M23 63v18m5 -20v23m5 -23v23m5 -24v20',dark,2) + jewel(30,49,4);
    art=`<g transform="translate(22 -8) rotate(12 30 55)">${glove}</g><g transform="translate(-6 7) rotate(-9 30 55)">${glove}</g>`;
  } else if (family==='boot') {
    const cuff=22+variant*2;
    const boot=path(`M25 ${cuff}L47 ${cuff+3} 44 68 52 77 63 81 62 91H21L20 80 27 69Z`,variant<2?leather:metal) + path(`M25 ${cuff}L47 ${cuff+3} 46 ${cuff+14} 25 ${cuff+10}Z`,trim) + path('M21 85H62V94H21Z',dark) + line(`M31 ${cuff+17}L38 70 31 79M29 54h13M28 61h13`,trim,2);
    art=`<g transform="translate(13 -8) scale(.88)">${boot}</g><g transform="translate(-7 10)">${boot}</g>`;
  } else if (family==='belt') {
    const height=14+variant*2;
    art=path(`M8 ${55-height}Q40 ${44-height} 72 ${55-height}V${55+height}Q40 ${44+height} 8 ${55+height}Z`,leather) + line(`M10 ${58-height}Q40 ${47-height} 70 ${58-height}M10 ${52+height}Q40 ${41+height} 70 ${52+height}`,trim,2) + path(`M28 ${42-tier}H52V${68+tier}H28ZM33 47V63H47V47Z`,trim) + line('M33 54h17',light,2) + rivets([[17,53],[62,53],[69,55]]);
  } else if (family==='ring') {
    art=ellipse(40,62,22,27,trim)+ellipse(40,62,14,19,'#192624')+path('M22 40L30 31H50L58 40 52 51H28Z',metal)+jewel(40,39,12)+line('M22 59Q20 78 34 85',light,3);
  } else if (family==='amul') {
    art=line('M19 16Q7 37 22 57L40 78 58 57Q73 37 61 16',trim,4)+line('M19 16Q9 37 24 56M61 16Q71 37 56 56',light,1)+ellipse(40,73,5,7,trim)+path('M40 77L55 89 40 106 25 89Z',trim)+jewel(40,89,9);
  } else if (['scha','mcha','lcha'].includes(family)) {
    const size=family==='scha'?0:family==='mcha'?1:2, top=35-size*10;
    art=line(`M35 ${top}Q25 ${Math.max(4,top-25)} 44 ${Math.max(7,top-18)}T44 ${top}`,leather,3)+path(`M25 ${top}L55 ${top+2} 52 96 28 100Z`,leather)+line(`M29 ${top+5}L32 93 49 90 51 ${top+7}`,trim,2)+jewel(40,54,8)+path('M40 64L46 76 40 88 34 76Z',metal);
    if(size) art+=line(`M28 ${top+13}h25M29 86h22`,trim,3);
  } else if (family==='jewl' || /^(g[cflsz]|sk)/.test(code)) {
    art=path('M25 30L55 27 69 51 43 88 11 54Z',gem)+path('M25 30L32 51 11 54ZM55 27L51 51 69 51ZM32 51L43 88 51 51Z',dark)+path('M25 30L55 27 51 51H32Z',light)+line('M32 51L25 30M51 51L55 27',gem,2);
  } else {
    art=code==='key' ? ellipse(36,36,13,16,trim)+ellipse(36,36,6,9,'#192624')+path('M33 49H39V80H54V88H46V96H33Z',trim)
      : path('M23 28H57L63 87 40 99 17 87Z',leather)+path('M20 26L40 17 60 26 55 39H25Z',metal)+line('M40 39v54M22 80l18 11 18 -11',trim,3)+jewel(40,43,6);
  }
  // Small engravings are part of the object, so close relatives remain distinct in monochrome.
  const engraving = Array.from({length:3},(_,i)=>line(`M${37+i*3} ${72+(seed>>(i*3)&3)}l${(seed>>(i*2)&1)?2:-2} 3`,trim,.8)).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" class="item-art" data-base-icon="${escape(code)}" data-art-kind="${family}" viewBox="0 0 80 112" aria-hidden="true" focusable="false">${art}${['swor','tors','shie','ashd'].includes(family)?engraving:''}</svg>`;
  cache.set(key,svg); return svg;
}

export function itemVisual(item: VisualItem) {
  const rarity=item.rarity??'common', mark=qualityIcons[rarity];
  return `<span class="item-visual ${rarity}">${itemArtwork(item)}${mark?`<span class="item-quality-mark" aria-hidden="true"><i data-lucide="${mark}"></i></span>`:''}</span>`;
}

export function runeArtwork(id: RuneId) {
  const index=RUNE_ORDER.indexOf(id), seed=index+1;
  const branches=Array.from({length:5},(_,i)=>index&(1<<i)?`M40 ${31+i*9}l${i%2?12:-12} -8`: `M40 ${31+i*9}l${i%2?-9:9} 7`).join('') + (index === 32 ? 'M40 23L52 33 40 43 28 33Z' : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="rune-art" data-rune-icon="${id}" viewBox="0 0 80 112" aria-hidden="true" focusable="false"><path d="M23 ${14+seed%4}L56 13 68 36 65 88 50 103 22 98 12 76 15 32Z" fill="#777e7d" stroke="#253132" stroke-width="2"/><path d="M23 19L53 19 61 37 58 83 47 95 26 91 19 74 21 34Z" fill="#afb4a7"/><path d="M53 19L61 37 58 83 47 95 51 69 48 32Z" fill="#91998f"/><path d="M40 27V81${branches}" fill="none" stroke="#293a38" stroke-width="4" stroke-linecap="square"/><path d="M21 37L24 24 36 21M26 92L20 75" fill="none" stroke="#d5d9c6" stroke-width="2"/></svg>`;
}
