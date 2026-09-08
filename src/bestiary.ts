import type { DamageType } from './paladin.ts';

export type BodyPlan = 'fallen' | 'shaman' | 'zombie' | 'skeleton' | 'archer' | 'mage' | 'goat' | 'ghost' | 'mummy' | 'beetle' | 'maggot' | 'viper' | 'spider' | 'flayer' | 'council' | 'knight' | 'mauler' | 'venom' | 'imp' | 'succubus' | 'frozen' | 'lord' | 'andariel' | 'duriel' | 'mephisto' | 'diablo' | 'baal';
export type AttackId = 'strike' | 'frenzy' | 'arrow' | 'fireArrow' | 'fireball' | 'poisonSpit' | 'lightning' | 'revive' | 'charge' | 'stomp' | 'inferno' | 'curse' | 'hydra' | 'poisonFan' | 'poisonPool' | 'coldNova' | 'jab' | 'skull' | 'blizzard' | 'firestorm' | 'redLightning' | 'fireNova' | 'coldWave' | 'manaRift' | 'tentacles' | 'clone' | 'whirlwind';
export type MonsterDef = { id: string; name: string; model: BodyPlan; race: 'undead' | 'demon' | 'beast'; color: number; hp: number; hpByDifficulty?: readonly [number, number, number]; damage: number; speed: number; scale: number; attacks: AttackId[]; resist?: Partial<Record<DamageType, number>>; revive?: string; retaliation?: boolean };
function monster(id: string, name: string, model: BodyPlan, race: MonsterDef['race'], color: number, attacks: AttackId[], hp = 20, speed = 2.1, extra: Partial<MonsterDef> = {}): MonsterDef {
  return { id, name, model, race, color, hp, damage: 3, speed, scale: 1, attacks, ...extra };
}
export const MONSTERS: Record<string, MonsterDef> = Object.fromEntries([
  monster('fallen', '沉沦魔', 'fallen', 'demon', 0xa64532, ['strike'], 15, 2.7, { scale: .8 }),
  monster('shaman', '沉沦巫师', 'shaman', 'demon', 0xbb653c, ['fireball', 'revive'], 19, 1.7, { revive: 'fallen' }),
  monster('zombie', '饥饿死者', 'zombie', 'undead', 0x728364, ['strike'], 29, 1.35),
  monster('rogue', '腐化罗格', 'archer', 'demon', 0x875667, ['arrow'], 17, 2.35),
  monster('skeleton', '骷髅战士', 'skeleton', 'undead', 0xc6c0a3, ['strike'], 18, 2),
  monster('boneMage', '骷髅法师', 'mage', 'undead', 0x95aaa9, ['lightning'], 16, 1.7),
  monster('goat', '黑暗一族', 'goat', 'demon', 0x907c61, ['strike'], 26, 2.2),
  monster('ghost', '幽灵', 'ghost', 'undead', 0x8cccc4, ['skull'], 17, 2, { resist: { physical: 35, poison: 80 } }),
  monster('tainted', '污染怪', 'venom', 'demon', 0x697752, ['lightning', 'strike'], 27, 1.8, { scale: .8 }),
  monster('burningDead', '燃烧死者', 'skeleton', 'undead', 0xc89967, ['fireArrow'], 20, 1.9, { resist: { fire: 45 } }),
  monster('mummy', '腐尸', 'mummy', 'undead', 0xb6a675, ['poisonSpit', 'strike'], 30, 1.3),
  monster('unraveler', '解开者', 'mummy', 'undead', 0x959972, ['skull', 'revive'], 30, 1.4, { scale: 1.25, revive: 'skeleton' }),
  monster('huntress', '女猎人', 'archer', 'beast', 0xcaa36d, ['arrow', 'strike'], 20, 2.7),
  monster('beetle', '死亡甲虫', 'beetle', 'beast', 0x577e89, ['strike'], 25, 2, { retaliation: true, resist: { lightning: 50 } }),
  monster('maggot', '沙虫', 'maggot', 'beast', 0xbda16b, ['poisonSpit'], 30, 1.2),
  monster('viper', '利爪蝮蛇', 'viper', 'beast', 0x799b8a, ['charge', 'strike'], 25, 2.5),
  monster('spider', '巨型蜘蛛', 'spider', 'beast', 0x755079, ['poisonSpit', 'strike'], 23, 2.4),
  monster('flayer', '剥皮者', 'flayer', 'demon', 0x869551, ['arrow', 'strike'], 14, 3, { scale: .72 }),
  monster('flayerShaman', '剥皮巫师', 'shaman', 'demon', 0xab754f, ['inferno', 'revive'], 25, 1.7, { revive: 'flayer' }),
  monster('zealot', '狂信者', 'knight', 'beast', 0x947954, ['frenzy'], 25, 2.5),
  monster('council', '议会成员', 'council', 'demon', 0x9f493f, ['hydra', 'fireball'], 31, 1.8, { resist: { fire: 45 } }),
  monster('doll', '冥河娃娃', 'flayer', 'undead', 0xc8b891, ['frenzy'], 14, 3.1, { scale: .7 }),
  monster('vampire', '鲜血之王', 'mage', 'undead', 0x64576c, ['fireball', 'blizzard'], 25, 1.8),
  monster('doomKnight', '厄运骑士', 'knight', 'undead', 0x76818b, ['strike'], 32, 2.2),
  monster('oblivion', '遗忘骑士', 'mage', 'undead', 0x886c90, ['curse', 'skull'], 24, 1.7),
  monster('soul', '燃烧灵魂', 'ghost', 'undead', 0x87cfe5, ['lightning'], 19, 2.4, { resist: { lightning: 60 } }),
  monster('mauler', '乌达尔', 'mauler', 'beast', 0x928277, ['stomp', 'strike'], 42, 1.6, { scale: 1.3, damage: 4 }),
  monster('venomLord', '邪魔之王', 'venom', 'demon', 0xae6953, ['inferno', 'strike'], 36, 2, { scale: 1.25, resist: { fire: 55 } }),
  monster('spawner', '血肉复生者', 'maggot', 'demon', 0xac6576, ['poisonSpit', 'tentacles'], 38, 1.2),
  monster('imp', '恶魔小妖', 'imp', 'demon', 0xb88855, ['fireball'], 17, 2.6, { scale: .72 }),
  monster('overseer', '奴役者', 'mauler', 'demon', 0xa38475, ['stomp', 'strike'], 38, 1.7),
  monster('reanimated', '复生战士', 'skeleton', 'undead', 0xabc0b8, ['charge', 'strike'], 27, 2.2),
  monster('frozen', '冰川恶兽', 'frozen', 'beast', 0xa3c6cf, ['coldNova', 'strike'], 40, 1.7, { scale: 1.25, resist: { cold: 60 } }),
  monster('iceCrawler', '冰封爬行者', 'viper', 'beast', 0x76b9ca, ['poisonSpit', 'charge'], 27, 2),
  monster('succubus', '女妖', 'succubus', 'demon', 0xa87c98, ['curse', 'skull'], 23, 2.4),
  monster('bloodLord', '死亡之王', 'lord', 'demon', 0x965b63, ['frenzy'], 36, 2.8, { scale: 1.15 }),
  monster('minion', '毁灭仆从', 'venom', 'demon', 0xa1849c, ['stomp', 'strike'], 42, 2.2, { scale: 1.25 }),
].map(def => [def.id, def]));

// Each encounter includes a frontline and a smaller ranged/support contingent.
export const ENCOUNTERS: string[][] = [
  ['fallen', 'zombie', 'shaman'], ['zombie', 'rogue', 'skeleton'], ['skeleton', 'fallen', 'shaman', 'goat'], ['ghost', 'rogue', 'goat'], ['skeleton', 'tainted', 'boneMage'],
  ['burningDead', 'zombie', 'mummy'], ['mummy', 'huntress', 'unraveler'], ['maggot', 'beetle', 'viper'], ['ghost', 'goat', 'boneMage'], ['skeleton', 'unraveler', 'viper', 'mummy'],
  ['spider', 'flayer', 'vampire'], ['flayer', 'spider', 'flayerShaman'], ['zealot', 'vampire', 'huntress'], ['zealot', 'council', 'vampire'], ['doll', 'vampire', 'council'],
  ['doomKnight', 'spawner', 'venomLord'], ['mauler', 'doomKnight', 'soul'], ['mauler', 'venomLord', 'doomKnight'], ['doomKnight', 'venomLord', 'oblivion'], ['doomKnight', 'venomLord', 'oblivion'],
  ['overseer', 'imp', 'bloodLord'], ['reanimated', 'overseer', 'imp'], ['frozen', 'iceCrawler', 'succubus'], ['bloodLord', 'frozen', 'succubus'], ['minion', 'bloodLord', 'soul', 'succubus'],
];
const boss = (id: string, model: BodyPlan, color: number, attacks: AttackId[], extra: Partial<MonsterDef> = {}): MonsterDef =>
  monster(id, id, model, 'demon', color, attacks, 95, 1.9, { scale: 1.45, damage: 6, ...extra });
export const BOSSES: MonsterDef[] = [
  boss('corpsefire', 'zombie', 0x658d91, ['strike', 'coldNova'], { race: 'undead' }),
  boss('bloodRaven', 'archer', 0xba5763, ['fireArrow', 'revive'], { revive: 'zombie' }),
  boss('griswold', 'mauler', 0xa49475, ['stomp', 'curse'], { race: 'undead' }),
  boss('countess', 'council', 0xac4b64, ['fireball', 'firestorm']),
  boss('andariel', 'andariel', 0xb67f83, ['poisonFan', 'strike', 'poisonPool'], { hp: 260, hpByDifficulty: [800, 14000, 42000], damage: 10, scale: 1.8, resist: { fire: -30, poison: 65 } }),
  boss('radament', 'mummy', 0xb6a07a, ['poisonSpit', 'revive', 'skull'], { race: 'undead', revive: 'skeleton' }),
  boss('bloodwitch', 'archer', 0xb66b71, ['charge', 'strike']),
  boss('coldworm', 'maggot', 0x84b6b1, ['poisonPool', 'coldNova'], { scale: 2 }),
  boss('summoner', 'mage', 0x826bba, ['fireball', 'blizzard', 'lightning']),
  boss('duriel', 'duriel', 0xa49c7a, ['jab', 'coldNova', 'stomp'], { hp: 290, hpByDifficulty: [2500, 24000, 62000], damage: 10, scale: 1.7, speed: 2.6, resist: { cold: 65 } }),
  boss('szzark', 'spider', 0xb76851, ['poisonPool', 'inferno'], { scale: 1.6 }),
  boss('endugu', 'shaman', 0xb9885f, ['inferno', 'revive', 'fireball'], { revive: 'flayer' }),
  boss('sarina', 'archer', 0xb979a0, ['frenzy', 'charge']),
  boss('ismail', 'council', 0xc09a65, ['hydra', 'lightning', 'curse']),
  boss('mephisto', 'mephisto', 0x9fb8a6, ['skull', 'lightning', 'blizzard', 'coldNova'], { hp: 260, hpByDifficulty: [5000, 38000, 85000], damage: 10, scale: 1.9, resist: { lightning: 50, cold: 45 } }),
  boss('abyssVanguard', 'venom', 0xad6c55, ['inferno', 'stomp']),
  boss('izual', 'knight', 0x7bb8d0, ['coldNova', 'strike', 'blizzard'], { hp: 140 }),
  boss('hephasto', 'mauler', 0xbe785e, ['stomp', 'firestorm']),
  boss('deSeis', 'knight', 0xbaa786, ['curse', 'skull', 'strike'], { race: 'undead' }),
  boss('diablo', 'diablo', 0xc46b61, ['firestorm', 'redLightning', 'fireNova', 'charge'], { hp: 280, hpByDifficulty: [9000, 60000, 115000], damage: 11, scale: 1.9, resist: { fire: 55, lightning: 45 } }),
  boss('shenk', 'mauler', 0xb68d7b, ['stomp', 'fireball']),
  boss('eldritch', 'lord', 0x9db69d, ['frenzy', 'lightning']),
  boss('frozenstein', 'frozen', 0x8fcae1, ['coldNova', 'stomp']),
  boss('talic', 'knight', 0xd0b789, ['whirlwind', 'strike', 'charge']),
  boss('baal', 'baal', 0xbfa98b, ['coldWave', 'manaRift', 'tentacles', 'clone'], { hp: 300, hpByDifficulty: [15000, 85000, 185000], damage: 10, scale: 1.85, resist: { cold: 50, magic: 30 } }),
];

export function isUndead(enemy: { definition?: MonsterDef; kind: string }) { return enemy.definition ? enemy.definition.race === 'undead' : enemy.kind === 'skeleton'; }
export function leechEffectiveness(enemy: { definition?: MonsterDef; kind: string }, difficulty: number) {
  if (!enemy.definition) return enemy.kind === 'skeleton' ? 0 : 1 / [1, 2, 3][difficulty];
  const id = enemy.definition.id;
  if (['skeleton', 'boneMage', 'burningDead', 'ghost', 'soul', 'doll'].includes(id) || id === 'mephisto' && difficulty > 0) return 0;
  return 1 / [1, 2, 3][difficulty];
}
