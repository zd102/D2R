import type { MonsterDef } from './bestiary.ts';
import type { DamageType } from './paladin.ts';

export type MonsterTraits = {
  damage: number; defense: number; accuracy: number; cooldown: number; awareness: number;
  chill: readonly [number, number, number]; regen: number; meleeWindup?: number;
  preferredRange?: number; death?: 'burst' | 'poison';
  resistance?: Partial<Record<DamageType, readonly [number, number, number]>>;
  description: string;
};
const trait = (description: string, damage = 1, defense = 1, accuracy = 1, cooldown = 1, extra: Partial<MonsterTraits> = {}): MonsterTraits => ({
  damage, defense, accuracy, cooldown, awareness: 1, chill: [.5, .4, .3], regen: 0, description, ...extra,
});

// Species identities, adapted to this campaign's damage budget. These are not
// original-game frame/stat tables. Resistances remain subject to the 85% cap.
export const SPECIES_TRAITS: Record<string, MonsterTraits> = {
  pindleskin: trait('神殿入口的复生战士首领；冲锋与火焰强化，高稀有度装备掉落。', 1.3, 1.2, 1.15, 1.1),
  nihlathak: trait('冰冷吐息、召唤仆从与尸爆；逼近会传送，远离尸体或先消耗尸体。', 1.1, .9, 1, 1, { preferredRange: 6, resistance: { cold: [35, 55, 70] } }),
  fallen: trait('胆怯的轻型近战；同伴倒下会逃跑。地狱火抗高，适合先击杀巫师。', .8, .65, .8, 1.05, { awareness: .9, resistance: { fire: [0, 25, 80] } }),
  shaman: trait('脆弱的后排支援；优先复活沉沦魔，用火球掩护。', .95, .65, .8, 1.05, { preferredRange: 7, resistance: { fire: [20, 40, 80] } }),
  zombie: trait('行动与挥击缓慢，但一击较重；绕开抬手，比站着换血有效。', 1.35, .85, .9, 1.3, { awareness: .85, meleeWindup: .65, chill: [.5, .4, .25] }),
  rogue: trait('精准的远程箭手；被逼近会短退，利用墙角切断射线。', .95, .8, 1.3, .95, { preferredRange: 6.5 }),
  skeleton: trait('没有吸取收益的稳定近战；骨架抗箭刃，重击可拆散阵线。', .95, 1.2, 1.05, .95, { resistance: { physical: [10, 15, 25] } }),
  boneMage: trait('生命与防御低，远距离施放闪电；近身压制能中断输出。', 1.05, .6, .8, 1.1, { preferredRange: 7.5, resistance: { lightning: [20, 40, 70] } }),
  goat: trait('强壮的羊头近战；比轻型怪更重、更准，但挥击有明显空当。', 1.3, 1.15, 1.15, 1.12, { meleeWindup: .5, regen: .0015 }),
  ghost: trait('近战汲取法力，可穿过短距离障碍追击已发现的目标；高物理和毒抗，优先用元素攻击。', .95, .65, 1.15, 1, { resistance: { physical: [35, 55, 80], poison: [80, 85, 85] } }),
  tainted: trait('中距离吐电、近身重击；逼近后仍需留意近战反击。', 1.15, 1.1, 1, 1.1, { resistance: { lightning: [25, 45, 75] } }),
  burningDead: trait('高火抗的骷髅射手；扇形火箭封路，绕侧面接近。', 1, 1.1, 1.2, 1.05, { preferredRange: 6.5, resistance: { fire: [45, 65, 85] } }),
  mummy: trait('缓慢而沉重的带毒近战；死亡留下毒云，击杀后离开尸体。', 1.2, .9, .95, 1.2, { meleeWindup: .6, death: 'poison', resistance: { poison: [80, 85, 85] } }),
  unraveler: trait('优先复活骷髅的高等木乃伊；远射骸骨弹，近身喷出毒息。', 1.05, 1.05, .9, 1.1, { preferredRange: 7, resistance: { magic: [20, 35, 60], poison: [80, 85, 85] } }),
  huntress: trait('移动敏捷、射击准确；近身也会反击，追击时避免直线吃箭。', .95, .8, 1.25, .9, { preferredRange: 6 }),
  beetle: trait('受击迸发充能弹；噩梦和地狱反击更频繁，避免贴身高频围攻。', .95, 1.25, 1.05, 1.05, { regen: .0025, resistance: { lightning: [50, 65, 85] } }),
  maggot: trait('低速厚壳的繁殖者；喷毒并孵化幼体，尽快清掉母体。', .9, 1.35, .8, 1.15, { preferredRange: 5, resistance: { poison: [60, 75, 85] } }),
  viper: trait('从中距离冲锋并击退，贴身改用爪击；横移躲开冲锋路线。', 1.1, 1.15, 1.2, .95),
  spider: trait('带毒的伏击者；接敌距离较短，受伤后会后撤并缓慢恢复。', 1.05, .85, 1, 1.05, { awareness: .8, regen: .002, resistance: { poison: [60, 75, 85] } }),
  flayer: trait('高速低生命的游击小怪；交替侧移、射击和近战，范围攻击有效。', .8, .65, 1, .85, { preferredRange: 4.5 }),
  flayerShaman: trait('近距离引导火流，优先复活剥皮者；引导时无法移动。', 1.05, .8, .9, 1, { preferredRange: 4, resistance: { fire: [30, 55, 80] } }),
  zealot: trait('积极追击的狂信者；近身命中后加速，先控制再拉开距离。', 1.05, 1, 1.1, .9, { awareness: 1.1 }),
  council: trait('召唤多头火蛇并持续回血；毒伤和禁止治疗可阻止恢复。', 1, 1.05, 1, 1.05, { preferredRange: 6, regen: .01, resistance: { fire: [45, 65, 85] } }),
  doll: trait('高速脆弱的不死娃娃；死亡短暂预警后发生物理爆炸，远杀后别靠近尸体。', .85, .65, 1.1, .85, { death: 'burst', resistance: { poison: [65, 75, 85] } }),
  vampire: trait('火球、火墙和陨火轮换；缓慢回血，逼近可迫使它停止施法退避。', 1.05, .8, .9, 1.1, { preferredRange: 7, regen: .0025, resistance: { cold: [30, 50, 75] } }),
  doomKnight: trait('高防御的重装近战；高难度附带冰伤，适合破防或元素攻击。', 1.2, 1.5, 1.2, 1.1, { meleeWindup: .48, chill: [.4, .3, .2], resistance: { cold: [20, 40, 75] } }),
  oblivion: trait('后排以伤害加深、衰老和骸骨弹支援；优先击杀以解除前排压力。', 1, .8, .9, 1.05, { preferredRange: 8, resistance: { cold: [40, 65, 85] } }),
  soul: trait('远距离直线闪电可贯穿整条阵线；预警时横移，电抗与魔法伤害更有效。', 1.05, .6, .9, 1.1, { preferredRange: 9, awareness: 1.15, chill: [.33, .2, 0], resistance: { lightning: [60, 80, 85], physical: [20, 40, 65] } }),
  mauler: trait('抬手较慢的巨锤重击，可短暂击晕和击退；不要被其他近战堵住退路。', 1.15, 1.2, 1.25, 1.2, { meleeWindup: .7, chill: [.4, .3, .2] }),
  venomLord: trait('高火抗的重型恶魔；贴身爪击、正面喷火，喷火时绕到侧后。', 1.15, 1.2, 1.1, 1.1, { chill: [.4, .25, .15], resistance: { fire: [55, 75, 85] } }),
  spawner: trait('厚实的血肉母体不断繁殖幼兽；低速、射程短，优先切断增援。', .9, 1.1, .8, 1.15, { preferredRange: 5, regen: .0015 }),
  imp: trait('脆弱的火球游击手；被逼近时预警传送，无回血，传送后有输出空当。', .85, .6, .9, 1.05, { preferredRange: 6, resistance: { fire: [20, 40, 70] } }),
  overseer: trait('督战附近恶魔，治疗受伤同伴并给予短暂狂乱；击杀指挥者可立即解除督战。', 1.05, 1.25, 1.15, 1.15, { meleeWindup: .6, preferredRange: 5 }),
  reanimated: trait('坚硬的冲锋骷髅；冲锋后缓慢挥击，冰冷控制效果较弱。', 1.15, 1.35, 1.15, 1.15, { meleeWindup: .55, chill: [.35, .2, .1] }),
  frozen: trait('高冰抗的重型怪；寒冰吐息封住正面，寒冷很难拖慢它。', 1.15, 1.2, 1.05, 1.15, { meleeWindup: .55, chill: [.25, .1, 0], resistance: { cold: [75, 85, 85] } }),
  iceCrawler: trait('寒冰喷吐配合突进；横移躲吐息，避免被减速后遭冲锋。', 1, 1, 1.1, 1, { chill: [.35, .2, .1], resistance: { cold: [50, 70, 85] } }),
  succubus: trait('远处诅咒与投射骸骨弹；高法力角色会受到鲜血法力，施法前留意诅咒。', 1, .75, 1, 1.05, { preferredRange: 8 }),
  bloodLord: trait('强力狂乱近战；命中后加速且高难度附加魔法伤害，避免站着换血。', 1.35, 1.2, 1.25, .92, { awareness: 1.15, chill: [.35, .25, .15] }),
  minion: trait('高命中的重型仆从；击退与重击可把人推入怪群，优先保持侧面退路。', 1.3, 1.35, 1.3, 1.1, { meleeWindup: .55, chill: [.3, .2, .1] }),
  hellCow: trait('厚血持斧近战，靠密集包围形成威胁；挥击慢但重，拉成队列逐个处理。', 1, 1.1, 1.1, 1.2, { meleeWindup: .65, awareness: 1.05 }),
};
const DEFAULT_TRAITS = trait('根据距离选择招式，强招蓄力时可以侧移避开。');
const BOSS_TRAITS: Record<string, MonsterTraits> = {
  corpsefire: trait('厚实而缓慢的僵尸；近战附带幽灵一击，绕开沉重的挥击。', 1, 1, 1, 1.3, { meleeWindup: .7, resistance: { poison: [65, 75, 85] } }),
  bloodRaven: trait('敏捷火箭射手；复活倒下的僵尸，追击时躲开箭路。', 1, 1, 1, .95, { preferredRange: 7 }),
  griswold: trait('高生命与护甲的铁匠；伤害加深配合慢速重击，诅咒期间避免硬扛。', 1, 1, 1, 1.25, { meleeWindup: .75, chill: [.4, .3, .2] }),
  countess: trait('火焰强化与火墙封路；高火抗、较高冰抗，离开火墙后反击。', 1, 1, 1, 1, { preferredRange: 6, resistance: { cold: [0, 35, 65] } }),
  radament: trait('快速移动的高等木乃伊；复活骷髅、喷毒与骸骨弹，高冰毒抗。', 1, 1, 1, 1.1, { preferredRange: 7, resistance: { cold: [50, 65, 80], poison: [75, 85, 85] } }),
  bloodwitch: trait('特别强壮的近战猎手；命中施加诅咒，利用其短射程拉开距离。', 1, 1, 1, .95, { meleeWindup: .45 }),
  coldworm: trait('不能移动的厚壳虫后；毒池、幼体和死亡冰霜，避免站在巢穴附近。', 1, 1, 1, 1.15, { resistance: { poison: [75, 85, 85] } }),
  summoner: trait('低护甲的元素施法者；火焰、冰冷和闪电轮换，接近后尽快击倒。', 1, 1, 1, 1, { preferredRange: 8 }),
  szzark: trait('强壮且带诅咒的毒蜘蛛；毒爪接毒池，持续中毒可阻止其回血。', 1, 1, 1, 1.1, { regen: .002, resistance: { poison: [60, 75, 85] } }),
  endugu: trait('抗元素的火焰巫医；复活剥皮者并喷火，绕到侧面打断火流。', 1, 1, 1, 1, { preferredRange: 4 }),
  sarina: trait('高速近战猎手；狂乱附带幽灵一击，避免被连续追砍。', 1, 1, 1, .9, { meleeWindup: .35 }),
  ismail: trait('快速且带诅咒的议会成员；召唤火蛇、近战与回血，高火抗。', 1, 1, 1, 1.05, { preferredRange: 5, regen: .004, resistance: { fire: [50, 65, 80] } }),
  abyssVanguard: trait('深渊中的重型恶魔；喷火与震地交替，侧移躲开正面攻击。', 1, 1, 1, 1.1, { resistance: { fire: [35, 55, 70] } }),
  izual: trait('极高生命的堕落天使；冰冷近战与新星，挥击缓慢但能承受长时间攻击。', 1, 1, 1, 1.25, { meleeWindup: .7, chill: [.25, .15, .1] }),
  hephasto: trait('审判灵气压低抗性与防御；幽灵一击叠加铁锤重击，先引离怪群。', 1, 1, 1, 1.2, { meleeWindup: .8, chill: [.35, .25, .15] }),
  deSeis: trait('狂热灵气强化身边守卫；远处施放诅咒与骸骨弹，优先切断其支援。', 1, 1, 1, 1.05, { preferredRange: 8, resistance: { cold: [40, 60, 75] } }),
  shenk: trait('厚实的督军；治疗并激励附近恶魔，近身重击，先分离其随从。', 1, 1, 1, 1.15, { meleeWindup: .65, preferredRange: 5 }),
  eldritch: trait('特别快速的近战首领；快速逼近与连续攻击，利用地形避免包围。', 1, 1, 1, .95),
  frozenstein: trait('高冰抗的巨兽；冰冷重击配合法力燃烧，避免贴身消耗法力。', 1, 1, 1, 1.2, { meleeWindup: .65, chill: [.25, .1, 0], resistance: { cold: [60, 75, 85] } }),
  talic: trait('高防御的先祖战士；以旋风斩穿过战场，横移避开预警路线。', 1, 1, 1, 1, { chill: [.3, .2, .1] }),
  andariel: trait('剧毒近战与扇形毒液；三个难度都怕火，毒抗能减轻持续压力。', 1, 1, 1, 1, { chill: [.25, .15, 0], resistance: { fire: [-50, -50, -50] } }),
  duriel: trait('常驻神圣冰冻，偏好连续戳刺，穿插击退重击；近身压力持续。', 1, 1, 1, 1, { chill: [.2, .2, .2] }),
  mephisto: trait('按距离轮换骷髅弹、闪电和冰毒法术；噩梦、地狱无法吸取生命。', 1, 1, 1, 1, { chill: [.25, .15, .1] }),
  diablo: trait('赤红闪电混合物理与电伤；火焰封路，骨牢可击碎，绕侧避开引导。', 1, 1, 1, 1, { chill: [.25, .15, .1] }),
  baal: trait('击退寒冰波、抽蓝与条件诅咒；半血召唤幻象，传送不回血。', 1, 1, 1, 1, { chill: [.15, .15, .15] }),
};

export function monsterTraits(definition?: MonsterDef): MonsterTraits {
  return definition ? SPECIES_TRAITS[definition.id] ?? BOSS_TRAITS[definition.id] ?? DEFAULT_TRAITS : DEFAULT_TRAITS;
}
