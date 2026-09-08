import { newHero, parseSave, SAVE_KEY, type HeroState } from './model.ts';

export const PROFILE_PREFIX = 'eclipse-ii-profile-v2:';
export const LAST_PROFILE_KEY = 'eclipse-ii-last-profile';
export const MIGRATION_KEY = 'eclipse-ii-legacy-migrated';
export const NAME_LIMIT = 16;
export type SavedProfile = {
  version: 2; id: string; name: string; createdAt: number; updatedAt: number;
  revision: number; hero: HeroState;
};
type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
export class SaveError extends Error {
  code: 'name' | 'missing' | 'corrupt' | 'conflict';
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
    return { version: 2, id: data.id, name: normalizeName(data.name), createdAt: data.createdAt, updatedAt: data.updatedAt, revision: data.revision, hero };
  } catch { return null; }
}

export class SaveStore {
  storage: SaveStorage;
  invalidCount = 0;
  constructor(storage: SaveStorage) { this.storage = storage; }
  list(): SavedProfile[] {
    const profiles: SavedProfile[] = [];
    this.invalidCount = 0;
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key?.startsWith(PROFILE_PREFIX)) continue;
      const profile = parseProfile(this.storage.getItem(key));
      if (profile && key === PROFILE_PREFIX + profile.id) profiles.push(profile);
      else this.invalidCount++;
    }
    return profiles.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  }
  read(id: string): SavedProfile {
    const raw = this.storage.getItem(PROFILE_PREFIX + id);
    if (raw === null) throw new SaveError('该角色存档已不存在。', 'missing');
    const profile = parseProfile(raw);
    if (!profile || profile.id !== id) throw new SaveError('该角色存档无法读取，原数据已保留。', 'corrupt');
    return profile;
  }
  checkName(name: string, exceptId?: string) {
    const normalized = normalizeName(name);
    if (this.list().some(profile => profile.id !== exceptId && profile.name.toLowerCase() === normalized.toLowerCase())) {
      throw new SaveError('已有同名角色，请使用其他名称。', 'name');
    }
    return normalized;
  }
  create(name: string): SavedProfile {
    const normalized = this.checkName(name);
    const id = globalThis.crypto.randomUUID?.() ?? globalThis.crypto.getRandomValues(new Uint32Array(4)).join('-');
    const now = Date.now();
    const profile: SavedProfile = { version: 2, id, name: normalized, createdAt: now, updatedAt: now, revision: 1, hero: newHero() };
    this.storage.setItem(PROFILE_PREFIX + id, JSON.stringify(profile));
    return profile;
  }
  remember(id: string) { this.storage.setItem(LAST_PROFILE_KEY, id); }
  get lastId() { return this.storage.getItem(LAST_PROFILE_KEY); }
  private current(id: string, revision: number) {
    const profile = this.read(id);
    if (profile.revision !== revision) throw new SaveError('该角色已在其他窗口更新。', 'conflict');
    return profile;
  }
  save(id: string, hero: HeroState, revision: number): SavedProfile {
    const current = this.current(id, revision);
    const profile = { ...current, hero: structuredClone(hero), updatedAt: Date.now(), revision: current.revision + 1 };
    // Each character has its own key; saving one never rewrites another character.
    this.storage.setItem(PROFILE_PREFIX + id, JSON.stringify(profile));
    return profile;
  }
  rename(id: string, name: string, revision: number): SavedProfile {
    const current = this.current(id, revision);
    const profile = { ...current, name: this.checkName(name, id), revision: current.revision + 1 };
    this.storage.setItem(PROFILE_PREFIX + id, JSON.stringify(profile));
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
