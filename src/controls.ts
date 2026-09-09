export const SKILL_SLOTS = ['attack', 'cleave', 'ward', 'nova', 'dash', 'bolt'] as const;
export type SkillSlot = typeof SKILL_SLOTS[number];
export const SKILL_KEYS: Record<SkillSlot, string> = { attack: '鼠左', cleave: 'Q', ward: 'W', nova: 'E', dash: 'R', bolt: '鼠右' };
export const SKILL_SLOT_NAMES: Record<SkillSlot, string> = { attack: '主攻击 · 鼠左', cleave: '快捷技能 · Q', ward: '快捷技能 · W', nova: '快捷技能 · E', dash: '快捷技能 · R', bolt: '副攻击 · 鼠右' };
export const KEYBOARD_SKILLS: Partial<Record<string, SkillSlot>> = { q: 'cleave', w: 'ward', e: 'nova', r: 'dash' };
export const emptyCooldowns = (): Record<SkillSlot, number> => ({ attack: 0, cleave: 0, ward: 0, nova: 0, dash: 0, bolt: 0 });
