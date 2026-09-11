import { specialPool, specialItem, weightedChoice, slotNames, type Item, type Slot } from './items.ts';
import { CATALOG_SPECIALS } from './item-catalog-current.ts';

export type BossDropProfile = { levelIndex: number; slots: Slot[]; featured: string[]; uniqueChance: number; runeChance: number; runeTC: [number, number, number]; maxTC: [number, number, number] };
const themes: [Slot[], string[]][] = [
  [['weapon', 'helm'], ['The Gnasher', 'War Bonnet', 'Rixots Keen']],
  [['weapon', 'boots'], ['Rimeraven', 'Bloodraven\'s Charge', 'Gorefoot']],
  [['weapon', 'armor'], ['Griswolds Edge', 'Greyform', 'The Centurion']],
  [['weapon', 'belt'], ['Lenyms Cord', 'Goldwrap', 'Hotspur']],
  [['ring', 'amulet'], ['Nagelring', 'Manald Heal', 'The Stone of Jordan', 'Gheed\'s Fortune']],
  [['shield', 'weapon'], ['Wall of the Eyeless', 'Gravenspine']],
  [['gloves', 'belt'], ['Bloodfist', 'Chance Guards', 'String of Ears']],
  [['armor', 'shield'], ['Hawkmail', 'The Ward', 'Duriel\'s Shell']],
  [['weapon', 'amulet'], ['The Oculus', 'Serpent Lord', 'The Eye of Etlich']],
  [['armor', 'boots'], ['Duriel\'s Shell', 'Goblin Toe', 'Raven Frost']],
  [['gloves', 'boots'], ['Venomsward', 'Venom Grip', 'Sandstorm Trek']],
  [['weapon', 'helm'], ['Tarnhelm', 'Peasent Crown', 'Arm of King Leoric']],
  [['weapon', 'gloves'], ['The Atlantian', 'Lavagout', 'Dracul\'s Grasp']],
  [['ring', 'belt'], ['Dwarf Star', 'Goldwrap', 'Gheed\'s Fortune']],
  [['armor', 'shield', 'helm'], ['Skin of the Vipermagi', 'Herald of Zakarum', 'Harlequin Crest', 'Arachnid Mesh']],
  [['weapon', 'shield'], ['Hellplague', 'Steelclash', 'Lidless Wall']],
  [['weapon', 'armor'], ['Guardian Angel', 'The Spirit Shroud', 'Doombringer']],
  [['weapon', 'gloves'], ['Stone Crusher', 'Hellmouth', 'Steelrend']],
  [['weapon', 'shield'], ['Lightsabre', 'Stormshield', 'Herald of Zakarum']],
  [['weapon', 'helm', 'amulet'], ['Harlequin Crest', 'Mara\'s Kaleidoscope', 'The Grandfather']],
  [['weapon', 'belt'], ['Baranar\'s Star', 'Thudergod\'s Vigor', 'Nosferatu\'s Coil']],
  [['weapon', 'boots'], ['Butcher\'s Pupil', 'Wartraveler', 'Gorerider']],
  [['armor', 'gloves'], ['Skin of the Vipermagi', 'Frostburn', 'Ormus\' Robes']],
  [['weapon', 'helm'], ['Crown of Ages', 'Deathcleaver']],
  [['weapon', 'armor', 'helm', 'belt'], ['Tyrael\'s Might', 'Griffon\'s Eye', 'Deaths\'s Web', 'Arachnid Mesh']],
];
export const BOSS_DROP_PROFILES: BossDropProfile[] = themes.map(([slots, featured], levelIndex) => {
  const act = Math.floor(levelIndex / 5), actBoss = levelIndex % 5 === 4;
  return { levelIndex, slots, featured, uniqueChance: actBoss ? .20 + act * .025 : .06 + act * .01,
    runeChance: actBoss ? .12 + act * .02 : levelIndex === 13 ? .25 : .08,
    runeTC: [[4, 7, 8, 8, 9][act], [9, 10, 11, 12, 14][act], [14, 15, 16, 16, 17][act]],
    maxTC: [[15, 24, 33, 36, 45][act], [45, 51, 57, 63, 69][act], [69, 72, 78, 84, 87][act]],
  };
});
export function bossDropProfile(levelIndex: number | undefined) { return Number.isInteger(levelIndex) ? BOSS_DROP_PROFILES[levelIndex!] : undefined; }
export function bossDropLabel(levelIndex: number, difficulty: number) {
  const profile = BOSS_DROP_PROFILES[levelIndex];
  if (levelIndex === 3) return `专属符文：艾尔至${['拉尔', '艾欧', '伊司特'][difficulty]}`;
  if (levelIndex === 17) return `首通熔炉：${['艾尔至安姆', '索尔至乌姆', '海尔至古尔'][difficulty]}`;
  if (difficulty === 2 && levelIndex === 19) return '毁灭护身符 0.5% · 暗金武器与防具';
  if (difficulty === 2 && levelIndex === 24) return '地狱火炬 0.5% · 全阶暗金装备';
  return `暗金偏好：${profile.slots.map(slot => slot === 'weapon' ? '武器' : slotNames[slot]).join(' / ')}`;
}
const specialKeys = new Map(CATALOG_SPECIALS.map(item => [item.id, item.key]));
export function bossSpecialPool(profile: BossDropProfile, level: number, difficulty: number) {
  return specialPool(level, 'unique', profile.maxTC[difficulty]).filter(item => profile.slots.includes(item.slot) || profile.featured.includes(specialKeys.get(item.catalogId!) ?? ''));
}
export function rollBossSpecial(profile: BossDropProfile, level: number, difficulty: number, magicFind: number, random = Math.random): Item | undefined {
  const mf = Math.max(0, magicFind), chance = Math.min(.75, profile.uniqueChance * (1 + mf * 250 / (mf + 250) / 100));
  if (random() >= chance) return undefined;
  const pool = bossSpecialPool(profile, level, difficulty);
  if (!pool.length) return undefined;
  const template = weightedChoice(pool, item => (item.dropWeight ?? 1) * (profile.featured.includes(specialKeys.get(item.catalogId!) ?? '') ? 4 : 1), random);
  const item = specialItem(template.name, random); item.level = level; return item;
}
