import { newHero, parseSave, SAVE_KEY, type HeroState } from './model.ts';
import { isClassId, type ClassId } from './classes.ts';
import { parseSharedItems, moveSharedItem, type SharedLock, type SharedTransfer } from './shared-stash.ts';
import { sharedRaw, commitSharedRaw, sharedTransaction } from './shared-storage.ts';
import { collectResources, parseResources, withResources, updateResources } from './shared-resources.ts';
import { PROFILE_PREFIX, LAST_PROFILE_KEY, MIGRATION_KEY, RULES_BACKUP_PREFIX, CHARACTER_FILE_FORMAT, SaveError, normalizeName, parseProfile, parseCharacterFile, type SavedProfile, type SharedStash } from './save-format.ts';
export * from './save-format.ts';
type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export class SaveStore {
  storage: SaveStorage;
  invalidCount = 0;
  private sharedLock: SharedLock;
  constructor(storage: SaveStorage, sharedLock: SharedLock = sharedTransaction) { this.storage = storage; this.sharedLock = sharedLock; }
  readShared(): SharedStash {
    const raw = sharedRaw(this.storage);
    if (raw === null) return { version: 1, revision: 0, items: [], checkpoints: {} };
    try {
      const data = JSON.parse(raw);
      if (![1, 2, 3].includes(data.version) || data.version >= 2 && data.resources === undefined || !Number.isSafeInteger(data.revision) || data.revision < 0 || !data.checkpoints || typeof data.checkpoints !== 'object' || Array.isArray(data.checkpoints)) throw new Error();
      if (data.version === 3 && (!data.resources?.potions || !data.resources?.potionMembers)) throw new Error();
      const checkpoints: Record<string, SavedProfile> = {};
      for (const [id, value] of Object.entries(data.checkpoints)) {
        const profile = parseProfile(JSON.stringify(value));
        if (!profile || profile.id !== id) throw new Error();
        checkpoints[id] = profile;
      }
      return { version: data.version, revision: data.revision, items: parseSharedItems(data.items), checkpoints,
        ...(data.resources === undefined ? {} : { resources: parseResources(data.resources) }),
        ...(Array.isArray(data.migrationSources) && data.migrationSources.every((value: unknown) => typeof value === 'string') ? { migrationSources: data.migrationSources } : {}) };
    } catch { throw new SaveError('共享仓库数据无法读取，原数据已保留。', 'corrupt'); }
  }
  private checkpoint(profile: SavedProfile) {
    const checkpoint = this.readShared().checkpoints[profile.id];
    return checkpoint && checkpoint.createdAt === profile.createdAt && (checkpoint.sharedRevision !== profile.sharedRevision || checkpoint.revision >= profile.revision) ? checkpoint : profile;
  }
  async initializeResources() {
    return this.sharedLock(() => {
      const shared = this.readShared(), profiles = this.list(false);
      if (this.invalidCount) throw new SaveError('部分角色存档损坏，无法合并金币、符文和药水，原数据已保留。', 'corrupt');
      const resources = collectResources(shared.resources, profiles);
      if (shared.version !== 3 || JSON.stringify(resources) !== JSON.stringify(shared.resources)) {
        // Older pages reject version 3 instead of dropping the new shared balances.
        shared.version = 3; shared.resources = resources; commitSharedRaw(this.storage, JSON.stringify(shared));
      }
    });
  }
  async saveAtomic(id: string, hero: HeroState, revision: number, resourcesRevision?: number) {
    const snapshot = structuredClone(hero);
    const profile = await this.sharedLock(() => this.save(id, snapshot, revision, resourcesRevision));
    // The atomic checkpoint remains authoritative if the compatibility mirror fails.
    try { this.storage.setItem(PROFILE_PREFIX + id, JSON.stringify(profile)); } catch { /* Already committed. */ }
    return profile;
  }
  async transferShared(id: string, hero: HeroState, revision: number, sharedRevision: number, request: SharedTransfer, resourcesRevision?: number) {
    const snapshot = structuredClone(hero);
    return this.sharedLock(() => {
      const current = this.current(id, revision), shared = this.readShared();
      if (shared.revision !== sharedRevision) throw new SaveError('共享仓库已在其他窗口更新，请重新选择物品。', 'shared');
      if (shared.resources) shared.resources = updateResources(shared.resources, snapshot, resourcesRevision);
      moveSharedItem(snapshot, shared.items, request);
      const profile = withResources({ ...current, hero: snapshot, revision: current.revision + 1, sharedRevision: shared.revision + 1, updatedAt: Date.now() }, shared.resources);
      // One atomic write commits both sides. Profile readers prefer this checkpoint;
      // the next ordinary save writes the character key with a newer revision.
      shared.checkpoints[id] = profile; shared.revision++;
      this.backupPreviousSystems(id);
      commitSharedRaw(this.storage, JSON.stringify(shared));
      return { profile, shared };
    });
  }
  list(resources = true): SavedProfile[] {
    const profiles: SavedProfile[] = [];
    this.invalidCount = 0;
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key?.startsWith(PROFILE_PREFIX)) continue;
      const profile = parseProfile(this.storage.getItem(key));
      if (profile && key === PROFILE_PREFIX + profile.id) profiles.push(this.checkpoint(profile));
      else this.invalidCount++;
    }
    const shared = resources ? this.readShared().resources : undefined;
    return profiles.map(profile => withResources(profile, shared)).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  }
  read(id: string): SavedProfile {
    const raw = this.storage.getItem(PROFILE_PREFIX + id);
    if (raw === null) throw new SaveError('该角色存档已不存在。', 'missing');
    const profile = parseProfile(raw);
    if (!profile || profile.id !== id) throw new SaveError('该角色存档无法读取，原数据已保留。', 'corrupt');
    return withResources(this.checkpoint(profile), this.readShared().resources);
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
    const hero = newHero(classId);
    if (this.readShared().resources?.potionMembers?.length) hero.potions.fill(0);
    return this.createProfile(name, hero);
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
  save(id: string, hero: HeroState, revision: number, resourcesRevision?: number): SavedProfile {
    const current = this.current(id, revision);
    this.backupPreviousSystems(id);
    const profile = { ...current, hero: structuredClone(hero), updatedAt: Date.now(), revision: current.revision + 1 };
    const shared = this.readShared();
    if (shared.resources) {
      shared.resources = updateResources(shared.resources, hero, resourcesRevision);
      const result = withResources(profile, shared.resources);
      shared.checkpoints[id] = result;
      commitSharedRaw(this.storage, JSON.stringify(shared));
      return result;
    }
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
