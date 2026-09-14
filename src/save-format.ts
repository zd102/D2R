import { parseSave, type HeroState } from './model.ts';
import { isClassId } from './classes.ts';
import type { Item } from './items.ts';

export const PROFILE_PREFIX = 'eclipse-ii-profile-v2:';
export const LAST_PROFILE_KEY = 'eclipse-ii-last-profile';
export const MIGRATION_KEY = 'eclipse-ii-legacy-migrated';
export const NAME_LIMIT = 16;
export const RULES_BACKUP_PREFIX = 'eclipse-ii-before-paladin:';
export const CHARACTER_FILE_FORMAT = 'eclipse-ii-character';
export const CHARACTER_FILE_LIMIT = 2 * 1024 * 1024;
export type SavedProfile = {
  version: 2; id: string; name: string; createdAt: number; updatedAt: number;
  revision: number; hero: HeroState; sharedRevision?: number;
};
export type SharedStash = { version: 1; revision: number; items: Item[]; checkpoints: Record<string, SavedProfile> };
export class SaveError extends Error {
  code: 'name' | 'missing' | 'corrupt' | 'conflict' | 'file' | 'shared';
  constructor(message: string, code: SaveError['code']) { super(message); this.code = code; }
}
export function normalizeName(name: string) {
  const normalized = name.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!normalized || Array.from(normalized).length > NAME_LIMIT || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new SaveError(`角色名称需为 1 至 ${NAME_LIMIT} 个字符。`, 'name');
  }
  return normalized;
}
export function parseProfile(raw: string | null): SavedProfile | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data.version !== 2 || typeof data.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(data.id) || typeof data.name !== 'string') return null;
    if (!Number.isSafeInteger(data.revision) || data.revision < 1) return null;
    if (![data.createdAt, data.updatedAt].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000)) return null;
    const hero = parseSave(JSON.stringify({ version: 1, hero: data.hero }));
    if (!hero) return null;
    return { version: 2, id: data.id, name: normalizeName(data.name), createdAt: data.createdAt, updatedAt: data.updatedAt, revision: data.revision, hero,
      ...(Number.isSafeInteger(data.sharedRevision) && data.sharedRevision > 0 ? { sharedRevision: data.sharedRevision } : {}) };
  } catch { return null; }
}

export function parseCharacterFile(raw: string): SavedProfile {
  if (new TextEncoder().encode(raw).byteLength > CHARACTER_FILE_LIMIT) throw new SaveError('存档文件不能超过 2 MB。', 'file');
  let data;
  try { data = JSON.parse(raw.replace(/^\uFEFF/, '')); }
  catch { throw new SaveError('存档文件不是有效的 JSON。', 'file'); }
  if (!data || data.format !== CHARACTER_FILE_FORMAT) throw new SaveError('请选择本游戏导出的单角色 JSON 存档。', 'file');
  if (data.version !== 1) throw new SaveError('暂不支持此存档文件版本。', 'file');
  const h = data.profile?.hero;
  // File imports must contain a character; the tolerant local reader also accepts incomplete legacy records.
  if (!h || h.rulesVersion !== 2 || !isClassId(h.classId)
    || !['level', 'xp', 'gold', 'kills', 'points', 'strength', 'dexterity', 'vitality', 'energy', 'hp', 'mana', 'stamina', 'skillPoints'].every(key => typeof h[key] === 'number' && Number.isFinite(h[key]))
    || !['inventory', 'stash', 'runes', 'potions', 'shrines', 'questRewards', 'respecUsed'].every(key => Array.isArray(h[key]))
    || !['equipment', 'alternate', 'skills', 'bindings', 'campaign'].every(key => h[key] && typeof h[key] === 'object' && !Array.isArray(h[key]))) {
    throw new SaveError('角色数据不完整或已损坏，无法导入。', 'file');
  }
  const profile = parseProfile(JSON.stringify(data.profile));
  if (!profile) throw new SaveError('角色数据不完整或版本不受支持，无法导入。', 'file');
  return profile;
}
