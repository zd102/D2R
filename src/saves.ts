import { newHero, parseSave, SAVE_KEY, type HeroState } from './model.ts';
import { isClassId, type ClassId } from './classes.ts';
import { parseSharedItems, moveSharedItem, browserSharedLock, type SharedLock, type SharedTransfer } from './shared-stash.ts';
import type { Item } from './items.ts';
import { sharedRaw, commitSharedRaw } from './shared-storage.ts';

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
type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
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

export class SaveStore {
  storage: SaveStorage;
  invalidCount = 0;
  private sharedLock: SharedLock;
  constructor(storage: SaveStorage, sharedLock: SharedLock = browserSharedLock) { this.storage = storage; this.sharedLock = sharedLock; }
  readShared(): SharedStash {
    const raw = sharedRaw(this.storage);
    if (raw === null) return { version: 1, revision: 0, items: [], checkpoints: {} };
    try {
      const data = JSON.parse(raw);
      if (data.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0 || !data.checkpoints || typeof data.checkpoints !== 'object' || Array.isArray(data.checkpoints)) throw new Error();
      const checkpoints: Record<string, SavedProfile> = {};
      for (const [id, value] of Object.entries(data.checkpoints)) {
        const profile = parseProfile(JSON.stringify(value));
        if (!profile || profile.id !== id) throw new Error();
        checkpoints[id] = profile;
      }
      return { version: 1, revision: data.revision, items: parseSharedItems(data.items), checkpoints };
    } catch { throw new SaveError('共享仓库数据无法读取，原数据已保留。', 'corrupt'); }
  }
  private checkpoint(profile: SavedProfile) {
    const checkpoint = this.readShared().checkpoints[profile.id];
    return checkpoint && checkpoint.createdAt === profile.createdAt && (checkpoint.sharedRevision !== profile.sharedRevision || checkpoint.revision >= profile.revision) ? checkpoint : profile;
  }
  async transferShared(id: string, hero: HeroState, revision: number, sharedRevision: number, request: SharedTransfer) {
    const snapshot = structuredClone(hero);
    return this.sharedLock(() => {
      const current = this.current(id, revision), shared = this.readShared();
      if (shared.revision !== sharedRevision) throw new SaveError('共享仓库已在其他窗口更新，请重新选择物品。', 'shared');
      moveSharedItem(snapshot, shared.items, request);
      const profile = { ...current, hero: snapshot, revision: current.revision + 1, sharedRevision: shared.revision + 1, updatedAt: Date.now() };
      // One atomic write commits both sides. Profile readers prefer this checkpoint;
      // the next ordinary save writes the character key with a newer revision.
      shared.checkpoints[id] = profile; shared.revision++;
      this.backupPreviousSystems(id);
      commitSharedRaw(this.storage, JSON.stringify(shared));
      return { profile, shared };
    });
  }
  list(): SavedProfile[] {
    const profiles: SavedProfile[] = [];
    this.invalidCount = 0;
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key?.startsWith(PROFILE_PREFIX)) continue;
      const profile = parseProfile(this.storage.getItem(key));
      if (profile && key === PROFILE_PREFIX + profile.id) profiles.push(this.checkpoint(profile));
      else this.invalidCount++;
    }
    return profiles.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  }
  read(id: string): SavedProfile {
    const raw = this.storage.getItem(PROFILE_PREFIX + id);
    if (raw === null) throw new SaveError('该角色存档已不存在。', 'missing');
    const profile = parseProfile(raw);
    if (!profile || profile.id !== id) throw new SaveError('该角色存档无法读取，原数据已保留。', 'corrupt');
    return this.checkpoint(profile);
  }
  checkName(name: string, exceptId?: string) {
    const normalized = normalizeName(name);
    if (this.list().some(profile => profile.id !== exceptId && profile.name.toLowerCase() === normalized.toLowerCase())) {
      throw new SaveError('已有同名角色，请使用其他名称。', 'name');
    }
    return normalized;
  }
  create(name: string, classId: ClassId = 'paladin'): SavedProfile {
    if(!isClassId(classId)) throw new SaveError('不支持的职业。', 'file');
    return this.createProfile(name, newHero(classId));
  }
  private createProfile(name: string, hero: HeroState): SavedProfile {
    const normalized = this.checkName(name);
    const id = globalThis.crypto.randomUUID?.() ?? globalThis.crypto.getRandomValues(new Uint32Array(4)).join('-');
    if (this.storage.getItem(PROFILE_PREFIX + id) !== null) throw new SaveError('角色标识已存在，请重试。', 'conflict');
    const now = Date.now();
    const profile: SavedProfile = { version: 2, id, name: normalized, createdAt: now, updatedAt: now, revision: 1, hero };
    this.storage.setItem(PROFILE_PREFIX + id, JSON.stringify(profile));
    return profile;
  }
  exportCharacter(id: string): { filename: string; content: string } {
    const profile = this.read(id), exportedAt = new Date().toISOString();
    const filename = `eclipse-ii-${profile.name.replace(/[<>:"/\\|?*]/g, '_')}-${exportedAt.replace(/[:.]/g, '-')}.json`;
    return { filename, content: JSON.stringify({ format: CHARACTER_FILE_FORMAT, version: 1, exportedAt, profile }, null, 2) };
  }
  importCharacter(raw: string, name?: string): SavedProfile {
    const profile = parseCharacterFile(raw);
    return this.createProfile(name ?? profile.name, profile.hero);
  }
  remember(id: string) { this.storage.setItem(LAST_PROFILE_KEY, id); }
  get lastId() { return this.storage.getItem(LAST_PROFILE_KEY); }
  private current(id: string, revision: number) {
    const profile = this.read(id);
    if (profile.revision !== revision) throw new SaveError('该角色已在其他窗口更新。', 'conflict');
    return profile;
  }
  private backupPreviousSystems(id: string) {
    const raw = this.storage.getItem(PROFILE_PREFIX + id)!;
    const hero = JSON.parse(raw).hero;
    if (hero.rulesVersion !== 2 && !this.storage.getItem(RULES_BACKUP_PREFIX + id)) this.storage.setItem(RULES_BACKUP_PREFIX + id, raw);
    if (!hero.campaign && !this.storage.getItem('eclipse-ii-before-campaign:' + id)) this.storage.setItem('eclipse-ii-before-campaign:' + id, raw);
  }
  save(id: string, hero: HeroState, revision: number): SavedProfile {
    const current = this.current(id, revision);
    this.backupPreviousSystems(id);
    const profile = { ...current, hero: structuredClone(hero), updatedAt: Date.now(), revision: current.revision + 1 };
    // Each character has its own key; saving one never rewrites another character.
    this.storage.setItem(PROFILE_PREFIX + id, JSON.stringify(profile));
    if (this.readShared().checkpoints[id]?.revision >= profile.revision) throw new SaveError('该角色物品已在其他窗口转移。', 'conflict');
    return profile;
  }
  rename(id: string, name: string, revision: number): SavedProfile {
    const current = this.current(id, revision);
    const profile = { ...current, name: this.checkName(name, id), revision: current.revision + 1 };
    this.backupPreviousSystems(id);
    this.storage.setItem(PROFILE_PREFIX + id, JSON.stringify(profile));
    if (this.readShared().checkpoints[id]?.revision >= profile.revision) throw new SaveError('该角色物品已在其他窗口转移。', 'conflict');
    return profile;
  }
  delete(id: string, revision: number) {
    this.current(id, revision);
    this.storage.removeItem(PROFILE_PREFIX + id);
    if (this.lastId === id) this.storage.removeItem(LAST_PROFILE_KEY);
  }
  migrateLegacy(): boolean {
    if (this.storage.getItem(MIGRATION_KEY)) return false;
    const raw = this.storage.getItem(SAVE_KEY);
    if (!raw) return false;
    const hero = parseSave(raw);
    if (!hero) throw new SaveError('旧存档无法读取，原数据已保留。', 'corrupt');
    const id = 'legacy', key = PROFILE_PREFIX + id;
    if (this.storage.getItem(key) === null) {
      const now = Date.now();
      let name = '灰烬行者', suffix = 1;
      const names = this.list().map(profile => profile.name);
      while (names.includes(name)) name = `灰烬行者 ${++suffix}`;
      const profile: SavedProfile = { version: 2, id, name, createdAt: now, updatedAt: now, revision: 1, hero };
      this.storage.setItem(key, JSON.stringify(profile));
    } else this.read(id);
    // Mark only after the new record exists. The original save stays as a backup.
    this.storage.setItem(MIGRATION_KEY, id);
    return true;
  }
}
