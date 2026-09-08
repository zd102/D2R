export type Slot = 'weapon' | 'armor' | 'ring';
export type Rarity = 'common' | 'magic' | 'rare' | 'legendary';
export type Item = { id: string; name: string; slot: Slot; rarity: Rarity; power: number; level: number; value: number };
export type HeroState = {
  level: number; xp: number; gold: number; kills: number; points: number;
  strength: number; vitality: number; spirit: number;
  hp: number; mana: number; potions: [number, number];
  equipment: Record<Slot, Item | null>; inventory: Item[];
  stage: number; shrines: number[]; bossDefeated: boolean;
};
export const SAVE_KEY = 'eclipse-ii-save-v1';
export const rarityNames: Record<Rarity, string> = { common: '普通', magic: '魔法', rare: '稀有', legendary: '传奇' };
export const slotNames: Record<Slot, string> = { weapon: '武器', armor: '护甲', ring: '戒指' };
export const newHero = (): HeroState => ({
  level: 1, xp: 0, gold: 0, kills: 0, points: 0, strength: 10, vitality: 10, spirit: 10,
  hp: 150, mana: 100, potions: [6, 4], stage: 1, shrines: [], bossDefeated: false,
  equipment: {
    weapon: { id: 'starter-sword', name: '守誓者长剑', slot: 'weapon', rarity: 'common', power: 8, level: 1, value: 12 },
    armor: { id: 'starter-armor', name: '旧旅者胸甲', slot: 'armor', rarity: 'common', power: 3, level: 1, value: 8 },
    ring: null,
  }, inventory: [],
});
export function stats(hero: HeroState) {
  return {
    maxHp: 100 + hero.vitality * 5 + (hero.level - 1) * 12,
    maxMana: 70 + hero.spirit * 3,
    attack: 10 + hero.strength * 1.2 + (hero.equipment.weapon?.power ?? 0),
    armor: 2 + (hero.equipment.armor?.power ?? 0),
    magic: 20 + hero.spirit * 2 + (hero.equipment.ring?.power ?? 0),
    xpNeeded: 80 + (hero.level - 1) * 65,
  };
}
export function gainXp(hero: HeroState, amount: number): boolean {
  hero.xp += amount;
  let leveled = false;
  while (hero.xp >= stats(hero).xpNeeded && hero.level < 99) {
    hero.xp -= stats(hero).xpNeeded;
    hero.level++; hero.points += 3;
    hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana;
    leveled = true;
  }
  return leveled;
}
export function equipItem(hero: HeroState, id: string): boolean {
  const index = hero.inventory.findIndex(item => item.id === id);
  if (index < 0) return false;
  const item = hero.inventory[index];
  const previous = hero.equipment[item.slot];
  hero.inventory.splice(index, 1);
  hero.equipment[item.slot] = item;
  if (previous) hero.inventory.push(previous);
  return true;
}
export function rollItem(level: number, roll = Math.random(), forceLegendary = false): Item {
  const slot: Slot = (['weapon', 'armor', 'ring'] as const)[Math.floor(Math.random() * 3)];
  const rarity: Rarity = forceLegendary ? 'legendary' : roll > 0.94 ? 'legendary' : roll > 0.7 ? 'rare' : roll > 0.33 ? 'magic' : 'common';
  const tier = ['common', 'magic', 'rare', 'legendary'].indexOf(rarity);
  const names = {
    weapon: ['铁铸长剑', '霜痕之刃', '暮光裁决', '灰烬誓约'],
    armor: ['铁鳞胸甲', '守夜人铠甲', '不朽壁垒', '陨星之拥'],
    ring: ['铜制指环', '幽火指环', '亡者之瞳', '永夜之心'],
  };
  // LAN HTTP does not expose randomUUID, but still supports getRandomValues.
  const id = globalThis.crypto.randomUUID?.() ?? globalThis.crypto.getRandomValues(new Uint32Array(4)).join('-');
  return { id, name: names[slot][tier], slot, rarity,
    level, power: (slot === 'armor' ? 2 : 6) + level * 2 + tier * (slot === 'armor' ? 2 : 5), value: 15 + level * 8 + tier * 22 };
}

// Reconstruct the save from validated values so malformed storage cannot poison gameplay.
export function parseSave(raw: string | null): HeroState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data.version !== 1 || !data.hero || typeof data.hero !== 'object') return null;
    const h = data.hero;
    const hero = newHero();
    const number = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
    const validItem = (item: any): item is Item => item && typeof item.id === 'string' && item.id.length < 80 && typeof item.name === 'string' && item.name.length < 40 && ['weapon', 'armor', 'ring'].includes(item.slot) && ['common', 'magic', 'rare', 'legendary'].includes(item.rarity) && ['power', 'level', 'value'].every(key => typeof item[key] === 'number' && Number.isFinite(item[key]) && item[key] >= 0 && item[key] <= 10000);
    hero.level = number(h.level, 1, 1, 99);
    for (const key of ['xp', 'gold', 'kills', 'points'] as const) hero[key] = number(h[key], 0, 0, 10000000);
    for (const key of ['strength', 'vitality', 'spirit'] as const) hero[key] = number(h[key], 10, 10, 1000);
    hero.stage = number(h.stage, 1, 1, 100);
    hero.shrines = Array.isArray(h.shrines) ? [...new Set<number>(h.shrines.filter((id: unknown) => typeof id === 'number' && [0, 1, 2].includes(id)))] : [];
    hero.bossDefeated = h.bossDefeated === true;
    if (Array.isArray(h.potions)) hero.potions = [number(h.potions[0], 6, 0, 99), number(h.potions[1], 4, 0, 99)];
    if (h.equipment && typeof h.equipment === 'object') {
      for (const slot of ['weapon', 'armor', 'ring'] as const) {
        if (h.equipment[slot] === null) hero.equipment[slot] = null;
        else if (validItem(h.equipment[slot]) && h.equipment[slot].slot === slot) hero.equipment[slot] = h.equipment[slot];
      }
    }
    hero.inventory = Array.isArray(h.inventory) ? h.inventory.filter(validItem).slice(0, 24) : [];
    const s = stats(hero);
    hero.hp = number(h.hp, s.maxHp, 1, s.maxHp);
    hero.mana = number(h.mana, s.maxMana, 0, s.maxMana);
    return hero;
  } catch { return null; }
}
export function serializeSave(hero: HeroState) { return JSON.stringify({ version: 1, hero }); }
