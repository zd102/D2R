import type { DamageType } from './paladin.ts';
import { campaignLayout } from './level-layouts.ts';

export type CampaignState = { version: 1; current: number; cleared: [number, number, number]; kills: number; objects: number[] };
export type QuestProp = 'grave' | 'cage' | 'chest' | 'altar' | 'forge' | 'ice' | 'seal' | 'siege';
export type Level = {
  id: string; index: number; act: number; step: number; name: string; english: string;
  terrain: 'cave' | 'field' | 'ruins' | 'temple' | 'arcane' | 'lava' | 'snow';
  quest: { name: string; description: string; action: string; kind: 'kill' | 'interact'; count: number; prop: QuestProp };
  enemies: [string, string]; boss: string; bossType: DamageType; actBoss: boolean; level: number;
};
export const ACTS = [
  { name: '修道院的阴影', region: '坎杜拉斯', english: 'THE SIGHTLESS EYE', icon: 'church', color: '#9fc99c', ground: 0x64745a, stone: 0x92998a, sky: 0x4c6260, accent: 0x8fd69a },
  { name: '沙漠的秘密', region: '鲁高因', english: 'THE SECRET OF THE VIZJEREI', icon: 'sun', color: '#e3c58a', ground: 0xb7a577, stone: 0xcbb78a, sky: 0x829995, accent: 0x64c9d1 },
  { name: '憎恨的丛林', region: '库拉斯特', english: 'THE INFERNAL GATE', icon: 'droplets', color: '#85c6b0', ground: 0x4e7966, stone: 0x839e87, sky: 0x355d60, accent: 0x53cdb7 },
  { name: '地狱的熔炉', region: '群魔堡垒', english: 'THE HARROWING', icon: 'flame', color: '#edaaa0', ground: 0x615d61, stone: 0x9a8689, sky: 0x593b46, accent: 0xff7752 },
  { name: '毁灭的王座', region: '哈洛加斯', english: 'LORD OF DESTRUCTION', icon: 'snowflake', color: '#abd7e8', ground: 0xc2d8d9, stone: 0x839ca6, sky: 0x7d9ba8, accent: 0x8cdef4 },
] as const;
type Draft = [string, string, Level['terrain'], string, string, string, Level['quest']['kind'], number, QuestProp, string, DamageType, string, string];
const drafts: Draft[] = [
  ['邪恶洞窟', 'DEN OF EVIL', 'cave', '邪恶的巢穴', '清除洞窟中聚集的魔物，阻止它们袭击罗格营地。', '消灭洞窟魔物', 'kill', 8, 'altar', '尸体发火', 'cold', '僵尸', '沉沦魔'],
  ['埋骨之地', 'BURIAL GROUNDS', 'field', '姐妹的安息', '驱散两座墓碑上的污秽，让逝去的罗格重归安宁。', '净化被亵渎的墓碑', 'interact', 2, 'grave', '血鸟', 'fire', '饥饿死者', '腐化罗格'],
  ['崔斯特瑞姆', 'TRISTRAM', 'ruins', '搜寻凯恩', '打开废墟中的囚笼，救出迪卡·凯恩。', '解救凯恩', 'interact', 1, 'cage', '格里斯瓦尔德', 'physical', '骷髅战士', '利刃魔'],
  ['遗忘之塔', 'FORGOTTEN TOWER', 'temple', '高塔的遗产', '寻回女伯爵地牢中的古旧典籍。', '取回高塔典籍', 'interact', 1, 'chest', '女伯爵', 'fire', '幽灵', '黑暗猎人'],
  ['地下墓穴', 'CATACOMBS', 'temple', '姐妹的屠戮', '熄灭两座剧毒火盆，逼出腐化修道院的恶魔女王。', '熄灭剧毒火盆', 'interact', 2, 'altar', '安达利尔', 'poison', '骷髅法师', '污染怪'],
  ['鲁高因下水道', 'LUT GHOLEIN SEWERS', 'temple', '罗达门特的巢穴', '找到死者之书，终止下水道中的复生仪式。', '取回死者之书', 'interact', 1, 'chest', '罗达门特', 'poison', '燃烧死者', '腐尸'],
  ['死亡之殿', 'HALLS OF THE DEAD', 'temple', '赫拉迪克方块', '从古墓的石匣中取出赫拉迪克方块。', '取回赫拉迪克方块', 'interact', 1, 'chest', '疯狂血腥女巫', 'physical', '空洞之尸', '女猎人'],
  ['蛆虫巢穴', 'MAGGOT LAIR', 'cave', '遗失的杖身', '深入遥远绿洲下方的巢穴，寻找国王之杖。', '取回国王之杖', 'interact', 1, 'chest', '钻地冰虫', 'cold', '沙虫', '死亡甲虫'],
  ['神秘避难所', 'ARCANE SANCTUARY', 'arcane', '赫拉森的日记', '阅读赫拉森的日记，辨认真正古墓的符号。', '阅读赫拉森日记', 'interact', 1, 'altar', '召唤者', 'lightning', '幽魂', '地狱一族'],
  ['塔拉夏古墓', 'TOMB OF TAL RASHA', 'temple', '七座古墓', '把复原的赫拉迪克法杖放入祭台，打开墓室。', '开启赫拉迪克祭台', 'interact', 1, 'altar', '都瑞尔', 'cold', '解开者', '鲜血之王'],
  ['蜘蛛森林', 'SPIDER FOREST', 'field', '黄金鸟', '从林中的遗物箱找回玉质小雕像。', '取回玉质小雕像', 'interact', 1, 'chest', '燃烧者韦布', 'fire', '巨型蜘蛛', '丛林猎手'],
  ['剥皮丛林', 'FLAYER JUNGLE', 'field', '古代宗教之刃', '在剥皮村落点燃祭台，取回吉德宾圣刃。', '取回吉德宾', 'interact', 1, 'altar', '巫医恩都古', 'fire', '剥皮者', '剥皮巫师'],
  ['库拉斯特商场', 'KURAST BAZAAR', 'ruins', '蓝·依森的古书', '进入残破神殿，找回记载古老知识的黑皮书。', '取回蓝·依森的古书', 'interact', 1, 'chest', '战场处子沙利娜', 'physical', '狂战士', '黑夜之王'],
  ['崔凡克', 'TRAVINCAL', 'temple', '黑暗神殿', '以克林姆的意志击碎强制之球，解除神殿禁制。', '摧毁强制之球', 'interact', 1, 'altar', '邪恶之手伊斯梅尔', 'lightning', '狂信者', '议会成员'],
  ['憎恨囚牢', 'DURANCE OF HATE', 'temple', '守护者', '关闭囚牢中的两座鲜血祭台，切断憎恨之王的供奉。', '关闭鲜血祭台', 'interact', 2, 'altar', '墨菲斯托', 'lightning', '血腥骷髅', '鲜血之王'],
  ['外侧草原', 'OUTER STEPPES', 'lava', '堡垒之外', '清理通往绝望平原的恶魔先锋。', '消灭恶魔先锋', 'kill', 10, 'seal', '深渊先锋', 'fire', '厄运骑士', '血肉复生者'],
  ['绝望平原', 'PLAINS OF DESPAIR', 'lava', '堕落天使', '解除两道灵魂枷锁，释放衣卒尔被囚禁的灵魂。', '解除灵魂枷锁', 'interact', 2, 'seal', '衣卒尔', 'cold', '燃烧灵魂', '巨锤死神'],
  ['火焰之河', 'RIVER OF FLAME', 'lava', '地狱熔炉', '在地狱熔炉上击碎墨菲斯托的灵魂之石。', '摧毁灵魂之石', 'interact', 1, 'forge', '海法斯特盔甲制造者', 'fire', '深渊骑士', '乌达尔'],
  ['混沌避难所', 'CHAOS SANCTUARY', 'temple', '混沌封印', '开启两座外环封印，清除通向核心的障碍。', '开启外环封印', 'interact', 2, 'seal', '西希之王', 'physical', '遗忘骑士', '邪魔之王'],
  ['恐惧之心', 'TERRORS END', 'lava', '恐惧的终结', '解除最后三道封印，直面恐惧之王。', '解除混沌核心封印', 'interact', 3, 'seal', '迪亚波罗', 'fire', '厄运骑士', '邪魔之王'],
  ['血腥丘陵', 'BLOODY FOOTHILLS', 'snow', '哈洛加斯之围', '摧毁两座攻城器械，为哈洛加斯解除围困。', '摧毁攻城器械', 'interact', 2, 'siege', '督军山克', 'physical', '奴役者', '恶魔小妖'],
  ['冰冻高地', 'FRIGID HIGHLANDS', 'snow', '高地救援', '打开两处囚笼，让被俘的野蛮人返回城镇。', '解救野蛮人', 'interact', 2, 'cage', '矫正者艾德利奇', 'lightning', '复生战士', '奴役者'],
  ['冰河', 'FROZEN RIVER', 'cave', '冰之囚', '打破寒冰牢笼，救出失踪的安雅。', '解救安雅', 'interact', 1, 'ice', '冰冻魔怪', 'cold', '冰封爬行者', '冰川恶兽'],
  ['亚瑞特之巅', 'ARREAT SUMMIT', 'snow', '古代人的试炼', '唤醒峰顶三座先祖雕像，接受守门者的试炼。', '唤醒先祖雕像', 'interact', 3, 'seal', '塔力克·先祖守卫', 'physical', '死亡之王', '月之王'],
  ['世界之石大殿', 'WORLDSTONE CHAMBER', 'temple', '毁灭前夕', '消灭王座守军，切断巴尔的最后一道防线。', '消灭王座守军', 'kill', 12, 'seal', '巴尔', 'magic', '毁灭仆从', '死亡之王'],
];
export const AREA_LEVELS = [
  [1,4,7,10,12, 14,16,18,20,22, 24,25,26,27,28, 30,31,32,33,34, 36,38,40,42,44],
  [38,39,40,41,43, 44,45,46,47,49, 50,51,52,53,55, 56,57,58,59,61, 62,64,66,68,70],
  [68,69,70,71,73, 74,75,76,77,79, 80,81,82,83,85, 86,87,88,89,91, 92,93,94,95,96],
] as const;
export const LEVELS: Level[] = drafts.map(([name, english, terrain, questName, description, action, kind, count, prop, boss, bossType, first, second], index) => ({
  id: `act${Math.floor(index / 5) + 1}-${index % 5 + 1}`, index, act: Math.floor(index / 5), step: index % 5, name, english, terrain,
  quest: { name: questName, description, action, kind, count, prop }, enemies: [first, second], boss, bossType, actBoss: index % 5 === 4,
  level: AREA_LEVELS[0][index],
}));
export const newCampaign = (): CampaignState => ({ version: 1, current: 0, cleared: [0, 0, 0], kills: 0, objects: [] });
export const unlockedCampaignDifficulty = (campaign: CampaignState) => campaign.cleared[0] < 25 ? 0 : campaign.cleared[1] < 25 ? 1 : 2;
export function canEnterLevel(campaign: CampaignState, index: number, difficulty: number) {
  return Number.isInteger(index) && index >= 0 && index < 25 && Number.isInteger(difficulty) && difficulty >= 0 && difficulty <= unlockedCampaignDifficulty(campaign) && index <= campaign.cleared[difficulty];
}
export function questProgress(campaign: CampaignState) {
  const quest = LEVELS[campaign.current].quest;
  return Math.min(quest.count, quest.kind === 'kill' ? campaign.kills : campaign.objects.length);
}
export const questComplete = (campaign: CampaignState) => questProgress(campaign) >= LEVELS[campaign.current].quest.count;
export function parseCampaign(value: unknown): CampaignState {
  const campaign = newCampaign();
  if (!value || typeof value !== 'object') return campaign;
  const data = value as Record<string, unknown>;
  const integer = (n: unknown, max: number) => typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0;
  if (Array.isArray(data.cleared)) for (const diff of [0, 1, 2]) campaign.cleared[diff] = diff && campaign.cleared[diff - 1] < 25 ? 0 : integer(data.cleared[diff], 25);
  campaign.current = integer(data.current, 24);
  const quest = LEVELS[campaign.current].quest;
  campaign.kills = integer(data.kills, quest.kind === 'kill' ? quest.count : 0);
  campaign.objects = quest.kind === 'interact' && Array.isArray(data.objects) ? [...new Set(data.objects.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < quest.count))] : [];
  return campaign;
}
export function levelTuning(level: Level, difficulty: number) {
  const areaLevel = AREA_LEVELS[difficulty][level.index];
  // Small steps within an act, a larger jump at the act boundary, independent of hero level.
  const power = Math.pow(1.85, level.act) * (1 + level.step * .06) * [1, 6, 22][difficulty];
  return { level: areaLevel, hp: power, damage: Math.pow(1.38, level.act) * (1 + level.step * .05) * [1, 2.5, 5][difficulty], defense: 6 + areaLevel * 3.5, packs: 5 + level.act + Math.floor(level.step / 2) };
}
export type MapPoint = { x: number; z: number };
export const eliteCount = (level: Level, difficulty: number) => 1 + Math.max(0, Math.min(2, Math.floor(difficulty))) * 2 + Number(level.step >= 3);
export const FIELD_BOUND = 39;
function makeLevelLayout(level: Level) {
  return campaignLayout(level);
}
const layoutCache = new Map<number, ReturnType<typeof makeLevelLayout>>();
export function levelLayout(level: Level) {
  let layout = layoutCache.get(level.index);
  if (!layout) { layout = makeLevelLayout(level); layoutCache.set(level.index, layout); }
  return layout;
}
