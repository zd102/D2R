import type { Level } from './campaign.ts';

export const MAP_SIZE_LIMIT = 300;
export type AreaMapProfile = {
  width: number; height: number; roomScale: number; branches: readonly [number, number]; packs: number; character: string;
};
// Deliberate relative scales for the compressed D2 campaign, not original game tile counts.
export const AREA_MAP_PROFILES: readonly AreaMapProfile[] = [
  { width:125, height:145, roomScale:1, branches:[2,4], packs:12, character:'分岔洞窟' },
  { width:109, height:99, roomScale:.95, branches:[1,2], packs:9, character:'紧凑墓园' },
  { width:119, height:109, roomScale:1, branches:[1,2], packs:10, character:'废墟街区' },
  { width:95, height:155, roomScale:.9, branches:[2,3], packs:11, character:'纵深地牢' },
  { width:165, height:185, roomScale:1.1, branches:[3,5], packs:17, character:'回廊墓穴' },
  { width:115, height:225, roomScale:1, branches:[3,4], packs:18, character:'狭长水渠' },
  { width:155, height:165, roomScale:1.05, branches:[2,4], packs:15, character:'分支墓室' },
  { width:105, height:245, roomScale:.95, branches:[3,5], packs:20, character:'蜿蜒虫道' },
  { width:225, height:225, roomScale:1, branches:[0,0], packs:20, character:'四臂浮桥' },
  { width:145, height:175, roomScale:1, branches:[2,3], packs:15, character:'深墓与密室' },
  { width:255, height:235, roomScale:1.6, branches:[4,6], packs:25, character:'开阔湿林' },
  { width:195, height:285, roomScale:1.45, branches:[4,6], packs:26, character:'沿河丛林' },
  { width:205, height:165, roomScale:1.25, branches:[3,5], packs:19, character:'横向商场' },
  { width:135, height:115, roomScale:1, branches:[1,2], packs:11, character:'神殿庭院' },
  { width:185, height:205, roomScale:1.1, branches:[3,5], packs:20, character:'血池双翼' },
  { width:275, height:235, roomScale:1.65, branches:[4,6], packs:26, character:'断崖荒原' },
  { width:299, height:259, roomScale:1.7, branches:[4,6], packs:28, character:'辽阔平原' },
  { width:155, height:265, roomScale:1.05, branches:[3,5], packs:23, character:'熔岩长堤' },
  { width:215, height:195, roomScale:1.15, branches:[2,4], packs:21, character:'十字大殿' },
  { width:155, height:145, roomScale:1.05, branches:[1,3], packs:15, character:'封印祭场' },
  { width:145, height:299, roomScale:1.15, branches:[3,5], packs:25, character:'纵向攻城线' },
  { width:235, height:255, roomScale:1.4, branches:[4,6], packs:26, character:'雪原侧寨' },
  { width:135, height:235, roomScale:1.05, branches:[3,4], packs:20, character:'曲折冰河' },
  { width:85, height:85, roomScale:.85, branches:[0,1], packs:8, character:'峰顶试炼' },
  { width:105, height:255, roomScale:1, branches:[2,3], packs:18, character:'王座长廊' },
];
export const areaMapProfile = (level: Level) => AREA_MAP_PROFILES[level.index];
