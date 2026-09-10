export const SKILL_SLOTS = ['attack', 'cleave', 'ward', 'nova', 'dash', 'bolt'] as const;
export type SkillSlot = typeof SKILL_SLOTS[number];
export type MovementMode = 'mouse' | 'wasd';
export const MOVEMENT_MODE_KEY = 'eclipse-ii-movement-mode-v1';
export const parseMovementMode = (value: unknown): MovementMode => value === 'wasd' ? 'wasd' : 'mouse';
export const SKILL_KEYS: Record<SkillSlot, string> = { attack: '鼠左', cleave: 'Q', ward: 'W', nova: 'E', dash: 'R', bolt: '鼠右' };
export const SKILL_SLOT_NAMES: Record<SkillSlot, string> = { attack: '主攻击 · 鼠左', cleave: '快捷技能 · Q', ward: '快捷技能 · W', nova: '快捷技能 · E', dash: '快捷技能 · R', bolt: '副攻击 · 鼠右' };
export const KEYBOARD_SKILLS: Partial<Record<string, SkillSlot>> = { q: 'cleave', w: 'ward', e: 'nova', r: 'dash' };
const WASD_SKILL_KEYS: Record<SkillSlot, string> = { attack: '鼠左', cleave: 'Q', ward: 'E', nova: 'R', dash: '空格', bolt: '鼠右' };
const WASD_KEYBOARD_SKILLS: Partial<Record<string, SkillSlot>> = { q: 'cleave', e: 'ward', r: 'nova', ' ': 'dash' };
const WASD_SLOT_NAMES: Record<SkillSlot, string> = { attack: '主攻击 · 鼠左', cleave: '快捷技能 · Q', ward: '快捷技能 · E', nova: '快捷技能 · R', dash: '快捷技能 · 空格', bolt: '副攻击 · 鼠右' };
export const skillKeys = (mode: MovementMode) => mode === 'wasd' ? WASD_SKILL_KEYS : SKILL_KEYS;
export const skillSlotNames = (mode: MovementMode) => mode === 'wasd' ? WASD_SLOT_NAMES : SKILL_SLOT_NAMES;
export const keyboardSkills = (mode: MovementMode) => mode === 'wasd' ? WASD_KEYBOARD_SKILLS : KEYBOARD_SKILLS;
export const MOVEMENT_HINTS: Record<MovementMode, string> = {
  mouse: '点击地面或按住左右键拖动移动；技能：Q / W / E / R / 鼠标左右键。',
  wasd: 'WASD 八方向移动；技能：Q / E / R / 空格 / 鼠标左右键。鼠标不再寻路，交互需先走近目标。',
};
export function movementInput(keys: ReadonlySet<string>, mode: MovementMode) {
  const pressed = (arrow: string, letter: string) => keys.has(arrow) || mode === 'wasd' && keys.has(letter);
  return {
    x: Number(pressed('arrowright', 'd')) - Number(pressed('arrowleft', 'a')),
    y: Number(pressed('arrowdown', 's')) - Number(pressed('arrowup', 'w')),
  };
}
export const emptyCooldowns = (): Record<SkillSlot, number> => ({ attack: 0, cleave: 0, ward: 0, nova: 0, dash: 0, bolt: 0 });
