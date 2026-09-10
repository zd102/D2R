/** Sound direction: short, tactile attacks; dark, noisy magic; restrained rewards. */
export type AudioChannel = 'effects' | 'ambience' | 'ui';
export type Texture = 'impact' | 'swing' | 'bow' | 'fire' | 'cold' | 'lightning' | 'poison' | 'holy' | 'portal' | 'potion' | 'growl' | 'bone' | 'level' | 'tick';
export type SoundLayer = { texture: Texture; files?: string[]; gain: number; rate?: number; delay?: number };
export type SoundDefinition = { channel: 'effects' | 'ui'; gain: number; rate: number; wet: number; priority: number; cooldown: number; limit: number; layers: SoundLayer[] };
const rpg = (...names: string[]) => names.map(name => `rpg/${name}.ogg`);
const impact = (name: string) => [0, 1, 2].map(i => `impact/${name}_00${i}.ogg`);
const layer = (texture: Texture, gain = 1, files?: string[], rate = 1, delay = 0): SoundLayer => ({ texture, gain, files, rate, delay });
const cue = (layers: SoundLayer[], options: Partial<Omit<SoundDefinition, 'layers'>> = {}): SoundDefinition => ({ channel: 'effects', gain: .65, rate: 1, wet: .12, priority: 3, cooldown: .065, limit: 4, ...options, layers });
const spell = (texture: Texture, rate = 1) => cue([layer(texture)], { gain: .65, rate, wet: .28, cooldown: .09 });
const ui = (layers: SoundLayer[], gain = .6) => cue(layers, { channel: 'ui', gain, wet: 0, priority: 6, cooldown: .08, limit: 3 });

export const SOUND_BANK = {
  swing: cue([layer('swing', .75, rpg('knifeSlice', 'knifeSlice2')), layer('swing', .3)], { gain: .5 }),
  bluntSwing: cue([layer('swing', 1, rpg('cloth1', 'cloth2', 'cloth3'), .8), layer('swing', .5, undefined, .65)], { gain: .55 }),
  thrust: cue([layer('swing', 1, rpg('drawKnife1', 'drawKnife2', 'drawKnife3'), 1.15)], { gain: .45 }),
  shot: cue([layer('bow'), layer('tick', .2, rpg('clothBelt', 'clothBelt2'), 1.4)], { gain: .5, wet: .08 }),
  crossbow: cue([layer('bow', .7, undefined, .8), layer('tick', .8, rpg('metalLatch'), 1.25)], { gain: .5 }),
  throw: cue([layer('swing', .9), layer('tick', .2, rpg('drawKnife1', 'drawKnife2'), 1.3)], { gain: .45 }),
  hit: cue([layer('impact', .95, impact('impactPunch_heavy'), .85), layer('impact', .35)], { gain: .72 }),
  boneHit: cue([layer('bone', .6), layer('impact', .8, impact('impactWood_light'), 1.2)], { gain: .6 }),
  metalHit: cue([layer('impact', .65, impact('impactMetal_medium'), .78), layer('impact', .6)], { gain: .6 }),
  block: cue([layer('impact', .85, impact('impactPlate_medium'), .85), layer('impact', .4, impact('impactWood_heavy'))], { gain: .7, priority: 7, limit: 2 }),
  hurt: cue([layer('impact', .7, impact('impactPunch_medium'), .8), layer('growl', .18, undefined, 1.7)], { priority: 8, cooldown: .18, limit: 2 }),
  death: cue([layer('growl', .55, undefined, .8), layer('impact', 1, impact('impactSoft_heavy'), .7, .16)], { gain: .8, priority: 10, cooldown: 1, limit: 1, wet: .32 }),
  monsterDeath: cue([layer('growl', .65), layer('impact', .8, impact('impactPunch_heavy'), .7, .12)], { gain: .58, priority: 4, cooldown: .14, limit: 3 }),
  boneDeath: cue([layer('bone', .9), layer('bone', .6, impact('impactWood_medium'), .9, .09), layer('bone', .4, impact('impactWood_light'), 1.1, .23)], { gain: .62, priority: 4, cooldown: .14 }),
  ghostDeath: cue([layer('portal', .6, undefined, .75), layer('swing', .3)], { gain: .5, wet: .45, cooldown: .2 }),
  bossDeath: cue([layer('growl', .9, undefined, .6), layer('fire', .5, undefined, .65, .15)], { gain: .8, priority: 9, cooldown: 1, limit: 1, wet: .4 }),
  fire: spell('fire'), cold: spell('cold'), lightning: spell('lightning'), poison: spell('poison'), spell: spell('holy'),
  holyBolt: spell('holy', 1.25), hammer: cue([layer('holy', .6, undefined, .72), layer('swing', .8)], { gain: .62, wet: .3 }),
  shield: cue([layer('holy', .8), layer('cold', .2, impact('impactMetal_light'), .7)], { wet: .3, cooldown: .2 }),
  aura: cue([layer('holy', .7, undefined, .8)], { gain: .5, wet: .35, cooldown: .25 }),
  fireImpact: cue([layer('fire', .85, undefined, .8), layer('impact', .45)], { gain: .52, cooldown: .13, limit: 3 }),
  coldImpact: cue([layer('cold', .6), layer('bone', .65, impact('impactGlass_heavy'), .85)], { gain: .5, cooldown: .13, limit: 3 }),
  lightningImpact: cue([layer('lightning', .8, undefined, 1.35)], { gain: .45, cooldown: .12, limit: 3 }),
  poisonImpact: cue([layer('poison', .7, undefined, .8)], { gain: .4, cooldown: .2, limit: 2 }),
  magicImpact: cue([layer('holy', .7, undefined, .85), layer('impact', .35)], { gain: .45, cooldown: .13, limit: 3 }),
  portal: cue([layer('portal'), layer('holy', .25, undefined, .7, .14)], { gain: .65, wet: .45, priority: 8, cooldown: .4, limit: 2 }),
  teleport: cue([layer('portal', 1, undefined, 1.65)], { gain: .6, wet: .3, priority: 7, cooldown: .09 }),
  potion: ui([layer('tick', .25, rpg('metalClick'), 1.4), layer('potion', .9, undefined, 1, .055)]),
  gold: ui([layer('tick', .8, rpg('handleCoins', 'handleCoins2'), 1.05)], .55),
  loot: ui([layer('tick', .8, rpg('handleSmallLeather', 'handleSmallLeather2'))], .5),
  itemMetal: ui([layer('tick', .7, rpg('metalLatch', 'metalClick'), .85), layer('tick', .45, rpg('beltHandle1', 'beltHandle2'))], .5),
  itemBottle: ui([layer('tick', .65, impact('impactGlass_light'), .95)], .5),
  rune: ui([layer('bone', .65, impact('impactMining'), 1.15), layer('holy', .15, undefined, 1.5)], .5),
  drop: cue([layer('impact', .8, rpg('dropLeather'), .9)], { gain: .4, priority: 2, cooldown: .12, wet: .05 }),
  dropMetal: cue([layer('impact', .8, impact('impactMetal_light'), .8)], { gain: .42, priority: 2, cooldown: .12 }),
  dropRare: cue([layer('impact', .5, impact('impactMining'), .85), layer('holy', .35, undefined, 1.3)], { gain: .5, priority: 7, cooldown: .25, wet: .2 }),
  equip: ui([layer('tick', .8, rpg('beltHandle1', 'beltHandle2')), layer('tick', .5, rpg('metalLatch'), .9, .06)]),
  chest: cue([layer('swing', .9, rpg('creak1', 'creak2', 'creak3'), .85), layer('impact', .65, rpg('metalLatch'), .8, .12)], { gain: .55, cooldown: .3, priority: 6 }),
  uiOpen: ui([layer('swing', 1, rpg('bookOpen'))], .45),
  uiClose: ui([layer('impact', 1, rpg('bookClose'))], .4),
  uiClick: ui([layer('tick', 1, rpg('bookFlip1', 'bookFlip2', 'bookFlip3'), 1.25)], .3),
  level: cue([layer('level')], { channel: 'ui', gain: .7, priority: 10, cooldown: 1, limit: 1, wet: .4 }),
  quest: cue([layer('holy', .5, undefined, .8), layer('level', .4, undefined, 1.2)], { channel: 'ui', gain: .55, priority: 9, cooldown: .7, limit: 1, wet: .3 }),
  stepStone: cue([layer('impact', 1, impact('footstep_concrete'))], { gain: .27, priority: 1, cooldown: .18, limit: 2, wet: .1 }),
  stepGrass: cue([layer('impact', 1, impact('footstep_grass'))], { gain: .26, priority: 1, cooldown: .18, limit: 2, wet: .02 }),
  stepSnow: cue([layer('impact', 1, impact('footstep_snow'))], { gain: .28, priority: 1, cooldown: .18, limit: 2, wet: .02 }),
} satisfies Record<string, SoundDefinition>;
export type SoundId = keyof typeof SOUND_BANK;
export type SoundPoint = { x: number; z: number };
export type AudioTerrain = 'camp' | 'cave' | 'field' | 'ruins' | 'temple' | 'arcane' | 'lava' | 'snow';
export const AUDIO_FILES = [...new Set(Object.values(SOUND_BANK).flatMap(cue => cue.layers.flatMap(layer => layer.files ?? [])))];

export function weaponSound(weapon?: string): SoundId {
  if (weapon === 'bow') return 'shot';
  if (weapon === 'crossbow') return 'crossbow';
  if (['javelin', 'throwing'].includes(weapon ?? '')) return 'throw';
  if (['mace', 'hammer', 'scepter', 'staff', 'wand', 'orb'].includes(weapon ?? '')) return 'bluntSwing';
  return ['spear', 'polearm', 'dagger', 'claw'].includes(weapon ?? '') ? 'thrust' : 'swing';
}
export function castSound(id: string, type: string, mode?: string): SoundId {
  if (id === 'teleport') return 'teleport';
  if (id === 'blessedHammer') return 'hammer';
  if (id === 'holyBolt') return 'holyBolt';
  if (id === 'holyShield' || mode === 'buff') return type === 'cold' ? 'cold' : 'shield';
  if (mode === 'spear') return 'thrust';
  if (type === 'physical') return mode === 'bow' ? 'shot' : mode === 'javelin' ? 'throw' : 'spell';
  return ['fire', 'cold', 'lightning', 'poison'].includes(type) ? type as SoundId : 'spell';
}
export function impactSound(type: string, model?: string): SoundId {
  if (type !== 'physical') return ({ fire: 'fireImpact', cold: 'coldImpact', lightning: 'lightningImpact', poison: 'poisonImpact' } as Record<string, SoundId>)[type] ?? 'magicImpact';
  if (model === 'skeleton') return 'boneHit';
  if (['knight', 'lord'].includes(model ?? '')) return 'metalHit';
  return model === 'ghost' ? 'magicImpact' : 'hit';
}
export function deathSound(model?: string, boss = false): SoundId {
  return boss ? 'bossDeath' : model === 'skeleton' ? 'boneDeath' : model === 'ghost' ? 'ghostDeath' : 'monsterDeath';
}
export function lootSound(loot: { gold?: number; potion?: number; rune?: string; item?: { slot: string; rarity: string; charm?: boolean; jewel?: boolean } }, dropping = false): SoundId {
  const item = loot.item, metal = item && ['weapon', 'shield', 'helm', 'armor'].includes(item.slot);
  if (dropping) return loot.rune || item && ['legendary', 'set'].includes(item.rarity) ? 'dropRare' : metal ? 'dropMetal' : 'drop';
  return loot.gold ? 'gold' : loot.potion !== undefined ? 'itemBottle' : loot.rune || item?.jewel ? 'rune' : metal ? 'itemMetal' : 'loot';
}
/** Camera is at (+x,+z): world +x projects right, world +z projects left. */
export function spatialMix(listener: SoundPoint, point?: SoundPoint) {
  if (!point) return { gain: 1, pan: 0 };
  const dx = point.x - listener.x, dz = point.z - listener.z, distance = Math.hypot(dx, dz);
  return { gain: distance >= 28 ? 0 : 1 / (1 + Math.max(0, distance - 2) ** 2 / 55) * Math.min(1, (28 - distance) / 6), pan: Math.max(-.9, Math.min(.9, (dx - dz) * Math.SQRT1_2 / 12)) };
}
