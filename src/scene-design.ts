import type { Level } from './campaign.ts';

export type SurfaceStyle = 'earth' | 'flagstone' | 'sand' | 'mosaic' | 'mud' | 'basalt' | 'snow' | 'ice';
export type SceneryProp = 'crag' | 'root' | 'grave' | 'coffin' | 'ruin' | 'pillar' | 'urn' | 'egg' | 'obelisk' | 'tree' | 'web' | 'hut' | 'totem' | 'bones' | 'spike' | 'barricade' | 'crystal';
export type Landmark = 'den' | 'graveyard' | 'tristram' | 'tower' | 'catacombs' | 'sewers' | 'burial-hall' | 'hive' | 'orrery' | 'horadric-tomb' | 'spider-grove' | 'flayer-village' | 'bazaar' | 'travincal' | 'durance' | 'steppes' | 'despair' | 'hellforge' | 'chaos' | 'terror' | 'siege' | 'prison' | 'frozen-river' | 'ancients' | 'worldstone' | 'cow' | 'uberDiablo';
export type ScenePalette = { floor: number; wall: number; trim: number; dark: number; wood: number; foliage: number; sky: number; liquid: number; sun: number; fill: number };
export type SceneDesign = {
  landmark: Landmark; description: string; surface: SurfaceStyle; edge: 'rock' | 'wall' | 'bank' | 'void';
  atmosphere: 'dust' | 'rain' | 'ash' | 'snow' | 'stars'; palette: ScenePalette;
  props: SceneryProp[]; fog: number; ambient: number; sunlight: number; liquid?: 'water' | 'sewage' | 'blood' | 'lava' | 'abyss';
};
const palettes: ScenePalette[] = [
  { floor: 0x666556, wall: 0x777b70, trim: 0x9e8152, dark: 0x22272a, wood: 0x493c2c, foliage: 0x3b4b30, sky: 0x202e30, liquid: 0x283e3e, sun: 0xc5d5d0, fill: 0x729895 },
  { floor: 0xb49563, wall: 0xbb985d, trim: 0x4d9d99, dark: 0x3e3228, wood: 0x5a3825, foliage: 0x777346, sky: 0x453b30, liquid: 0x3a5c4b, sun: 0xffd49c, fill: 0x779eac },
  { floor: 0x687566, wall: 0x7c8b70, trim: 0xbda25a, dark: 0x1d3530, wood: 0x4b3827, foliage: 0x355b35, sky: 0x203c36, liquid: 0x325b49, sun: 0xd4e6b1, fill: 0x4e9e91 },
  { floor: 0x57504a, wall: 0x69564f, trim: 0x9f7048, dark: 0x251d23, wood: 0x3b2621, foliage: 0x533933, sky: 0x2c191b, liquid: 0xed571e, sun: 0xffb387, fill: 0x8b4c55 },
  { floor: 0xb0c4c8, wall: 0x728591, trim: 0xc7a86c, dark: 0x28343f, wood: 0x57473b, foliage: 0x344d49, sky: 0x3a5365, liquid: 0x37637c, sun: 0xe6f2ff, fill: 0x6da3cd },
];
type Draft = Pick<SceneDesign, 'landmark' | 'description' | 'surface' | 'edge' | 'props'> & Partial<Omit<SceneDesign, 'palette'>> & { colors?: Partial<ScenePalette> };
const drafts: Draft[] = [
  { landmark: 'den', description: '潮湿岩洞 · 盘根与兽骨', surface: 'earth', edge: 'rock', props: ['crag','root','bones'], colors: { floor: 0x787766, wall: 0x8b8e80, sky: 0x242d29 }, liquid: 'water', ambient: 1.25 },
  { landmark: 'graveyard', description: '荒凉墓园 · 铁栅与枯树', surface: 'earth', edge: 'bank', props: ['grave','grave','root','crag'], atmosphere: 'rain', colors: { floor: 0x62674e, sky: 0x303b3b }, fog: .013 },
  { landmark: 'tristram', description: '焚毁街巷 · 教堂与水井', surface: 'flagstone', edge: 'bank', props: ['ruin','ruin','root','bones'], atmosphere: 'ash', colors: { floor: 0x756b54, sky: 0x33312c } },
  { landmark: 'tower', description: '伯爵地牢 · 红毯与窖藏', surface: 'flagstone', edge: 'wall', props: ['pillar','coffin','urn'], colors: { floor: 0x736866, wall: 0x79706b, trim: 0x8e3433, sky: 0x272326 } },
  { landmark: 'catacombs', description: '修道院墓穴 · 灵柩与毒火', surface: 'flagstone', edge: 'wall', props: ['coffin','pillar','bones'], colors: { floor: 0x858c7b, trim: 0x78954d, sky: 0x242b28 }, liquid: 'sewage', ambient: 1.25 },
  { landmark: 'sewers', description: '下水道 · 污水渠与砖拱', surface: 'flagstone', edge: 'wall', props: ['urn','pillar','bones'], liquid: 'sewage', colors: { floor: 0x8e8664, wall: 0x9c8667, sky: 0x2c342d } },
  { landmark: 'burial-hall', description: '沙埋墓室 · 彩绘石棺', surface: 'sand', edge: 'wall', props: ['coffin','urn','pillar'], colors: { trim: 0x447e9b } },
  { landmark: 'hive', description: '砂岩虫道 · 卵囊与虫后巢', surface: 'sand', edge: 'rock', props: ['egg','egg','crag','bones'], colors: { floor: 0xb49a62, wall: 0xb8996b, trim: 0x9caa44, sky: 0x3c3325 }, liquid: 'sewage' },
  { landmark: 'orrery', description: '星海十字桥 · 星仪与符文', surface: 'mosaic', edge: 'void', props: ['obelisk','pillar'], atmosphere: 'stars', liquid: 'abyss', colors: { floor: 0x879695, wall: 0x697683, trim: 0xd8b96d, sky: 0x0b1022, liquid: 0x111c36, sun: 0xc1ccff, fill: 0x8672ca }, fog: .005, ambient: 1.15 },
  { landmark: 'horadric-tomb', description: '七墓符印 · 赫拉迪克墓门', surface: 'mosaic', edge: 'wall', props: ['obelisk','coffin','urn'], colors: { floor: 0xb8a175, trim: 0x65b0ab, sky: 0x352f27 } },
  { landmark: 'spider-grove', description: '湿林水岸 · 巨蛛结网', surface: 'mud', edge: 'bank', props: ['tree','tree','web','root'], atmosphere: 'rain', liquid: 'water', fog: .011, colors: { floor: 0x89836c, foliage: 0x5c7447 } },
  { landmark: 'flayer-village', description: '丛林村寨 · 草屋与图腾', surface: 'mud', edge: 'bank', props: ['hut','totem','tree','root'], atmosphere: 'rain', liquid: 'water', colors: { floor: 0x78724d, trim: 0xc4964f } },
  { landmark: 'bazaar', description: '失落商场 · 拱廊与残破神殿', surface: 'mosaic', edge: 'bank', props: ['ruin','pillar','tree','urn'], colors: { floor: 0x8a9271, wall: 0x939775, trim: 0xb09a55 } },
  { landmark: 'travincal', description: '高阶神殿 · 阶台与强制之球', surface: 'mosaic', edge: 'wall', props: ['pillar','obelisk','urn'], colors: { floor: 0x99a086, wall: 0xa1a284, trim: 0xb8a45e, sky: 0x2d4439 }, sunlight: 2.2 },
  { landmark: 'durance', description: '鲜血囚牢 · 血池与祭坛', surface: 'flagstone', edge: 'wall', props: ['coffin','bones','pillar'], liquid: 'blood', colors: { floor: 0x77615d, wall: 0x6b6661, trim: 0x91352e, liquid: 0x791f25, sky: 0x261e25 }, fog: .01 },
  { landmark: 'steppes', description: '堡垒断崖 · 灰烬与焦骨', surface: 'basalt', edge: 'rock', props: ['crag','bones','spike'], atmosphere: 'ash', colors: { floor: 0x807462, wall: 0x766b60, sky: 0x514039 }, fog: .012, sunlight: 1.7 },
  { landmark: 'despair', description: '荒芜平原 · 灵魂尖碑', surface: 'basalt', edge: 'rock', props: ['bones','spike','crag'], atmosphere: 'ash', colors: { floor: 0x716b68, trim: 0x7899b8, sky: 0x383039, fill: 0x6f82b0 }, fog: .015 },
  { landmark: 'hellforge', description: '熔岩长堤 · 铁链与巨砧', surface: 'basalt', edge: 'void', props: ['spike','crag','bones'], liquid: 'lava', atmosphere: 'ash', colors: { floor: 0x61524b, trim: 0xe39448 }, fog: .008 },
  { landmark: 'chaos', description: '混沌教堂 · 十字翼廊与封印', surface: 'flagstone', edge: 'wall', props: ['pillar','spike','bones'], liquid: 'lava', atmosphere: 'ash', colors: { floor: 0x65534f, wall: 0x78615b, trim: 0xa68662 }, fog: .008 },
  { landmark: 'terror', description: '混沌核心 · 五芒星祭场', surface: 'basalt', edge: 'void', props: ['spike','pillar','bones'], liquid: 'lava', atmosphere: 'ash', colors: { floor: 0x664744, trim: 0xe59750, liquid: 0xf66b27 }, fog: .009 },
  { landmark: 'siege', description: '血腥战线 · 城垒与投石机', surface: 'snow', edge: 'bank', props: ['barricade','spike','crag','bones'], atmosphere: 'snow', colors: { floor: 0xafa999, sky: 0x56606b } },
  { landmark: 'prison', description: '风雪高地 · 木寨与囚笼', surface: 'snow', edge: 'bank', props: ['barricade','tree','crag'], atmosphere: 'snow', colors: { floor: 0xc0cbd0, sky: 0x435968 } },
  { landmark: 'frozen-river', description: '地下冰河 · 蓝冰裂隙与冰封安雅', surface: 'ice', edge: 'rock', props: ['crystal','crystal','crag'], liquid: 'water', atmosphere: 'dust', colors: { floor: 0x88b5c6, wall: 0x80b2cc, trim: 0x82dcf4, sky: 0x183c50 }, fog: .01 },
  { landmark: 'ancients', description: '圣山峰顶 · 三先祖与圆形祭坛', surface: 'snow', edge: 'void', props: ['crag','obelisk','bones'], atmosphere: 'snow', liquid: 'abyss', colors: { floor: 0xc3c9c9, trim: 0xc5ae7b, sky: 0x415c73, liquid: 0x354e64 }, sunlight: 2.5, fog: .008 },
  { landmark: 'worldstone', description: '世界之石 · 赤红晶体与王座长廊', surface: 'mosaic', edge: 'void', props: ['pillar','crystal','obelisk'], atmosphere: 'stars', liquid: 'abyss', colors: { floor: 0x8c879a, wall: 0x777b91, trim: 0xb5a17d, sky: 0x222135, liquid: 0x282037, sun: 0xe4c7df }, fog: .006 },
  { landmark: 'cow', description: '血色牧场 · 木栅与猩红月光', surface: 'earth', edge: 'bank', props: ['tree','barricade','bones','crag'], atmosphere: 'ash', colors: { floor: 0x6f7544, wall: 0x5d6339, trim: 0xc8b064, wood: 0x6b4c30, foliage: 0x47592d, sky: 0x43252a, liquid: 0x542a24, sun: 0xdfad72, fill: 0x98704d }, fog: .01 },
  { landmark: 'uberDiablo', description: '末日祭坛 · 恐惧之王的孤绝领域', surface: 'basalt', edge: 'void', props: ['spike','pillar','bones'], atmosphere: 'ash', liquid: 'lava', colors: { floor: 0x4c3b3d, wall: 0x5a4548, trim: 0xcd7256, sky: 0x261820, liquid: 0xb93221, sun: 0xe56f55, fill: 0x87434b }, fog: .014 },
];
export const SCENE_DESIGNS: SceneDesign[] = drafts.map((draft, index) => ({
  fog: .008, ambient: 1.05, sunlight: 1.65, atmosphere: 'dust', ...draft,
  palette: { ...palettes[Math.floor(index / 5)], ...draft.colors },
}));
export const sceneDesign = (level: Pick<Level, 'index'>) => SCENE_DESIGNS[level.index];
