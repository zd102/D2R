import { onlineId, type OnlineClient } from './online-client.ts';
import { SaveError, type SavedProfile, type SharedStash } from './save-format.ts';
import type { ClassId } from './classes.ts';
import type { HeroState } from './model.ts';
import type { SharedTransfer } from './shared-stash.ts';
import { withResources } from './shared-resources.ts';

export class OnlineSaveStore {
  readonly client: OnlineClient;
  invalidCount = 0;
  lastId: string | null = null;
  private profiles: SavedProfile[] = [];
  private shared: SharedStash = { version: 1, revision: 0, items: [], checkpoints: {} };
  constructor(client: OnlineClient) { this.client = client; }
  async refresh() {
    const [profiles, shared] = await Promise.all([this.client.request<SavedProfile[]>('/characters'), this.client.request<SharedStash>('/stash')]);
    this.profiles = profiles; this.shared = shared;
    try { this.lastId = sessionStorage.getItem(`eclipse-online-last:${this.client.session!.user.id}`); } catch { /* Optional selection preference. */ }
  }
  list() { return this.profiles.map(profile => withResources(profile, this.shared.resources)); }
  read(id: string) { const value = this.profiles.find(p => p.id === id); if (!value) throw new SaveError('该角色不存在。', 'missing'); return withResources(value, this.shared.resources); }
  readShared() { return this.shared; }
  remember(id: string) { this.lastId = id; try { sessionStorage.setItem(`eclipse-online-last:${this.client.session!.user.id}`, id); } catch { /* Optional preference. */ } }
  private accept(profile: SavedProfile) {
    if (this.shared.resources && profile.resourcesRevision !== undefined) this.shared.resources = { ...this.shared.resources, revision: profile.resourcesRevision, gold: profile.hero.gold, runes: [...profile.hero.runes] };
    this.profiles = [profile, ...this.profiles.filter(p => p.id !== profile.id)]; return profile;
  }
  private mutation<T>(path: string, method: string, data: object) { return this.client.reliable<T>(path, method, { ...data, operationId: onlineId() }); }
  async create(name: string, classId: ClassId = 'paladin') { return this.accept(await this.mutation<SavedProfile>('/characters', 'POST', { name, classId })); }
  async rename(id: string, name: string, expectedRevision: number) { return this.accept(await this.mutation<SavedProfile>(`/characters/${id}`, 'PATCH', { name, expectedRevision })); }
  async delete(id: string, expectedRevision: number) {
    await this.mutation(`/characters/${id}`, 'DELETE', { expectedRevision }); this.profiles = this.profiles.filter(p => p.id !== id);
  }
  async importCharacter(content: string, name?: string) { return this.accept(await this.mutation<SavedProfile>('/characters/import', 'POST', { content, name })); }
  exportCharacter(id: string) { return this.client.request<{ filename: string; content: string }>(`/characters/${id}/export`); }
  async save(id: string, hero: HeroState, expectedRevision: number) {
    return this.accept(await this.mutation<SavedProfile>(`/characters/${id}/save`, 'PUT', { hero, expectedRevision, expectedStashRevision: this.shared.revision, expectedResourcesRevision: this.shared.resources?.revision }));
  }
  async transferShared(id: string, _hero: HeroState, expectedRevision: number, expectedStashRevision: number, transfer: SharedTransfer, _resourcesRevision?: number) {
    const result = await this.mutation<{ profile: SavedProfile; shared: SharedStash }>('/stash/transfer', 'POST', { characterId: id, expectedRevision, expectedStashRevision, transfer });
    this.accept(result.profile); this.shared = result.shared; return result;
  }
}

/** Serializes server saves and coalesces only snapshots which have not been sent. */
export class OnlineSaveCoordinator {
  store: Pick<OnlineSaveStore, 'read' | 'save'>;
  private pending?: { id: string; hero: HeroState };
  private running?: Promise<void>;
  private failure?: unknown;
  onSaved?: (profile: SavedProfile) => void;
  onError?: (error: unknown) => void;
  get busy() { return !!this.pending || !!this.running; }
  constructor(store: Pick<OnlineSaveStore, 'read' | 'save'>) { this.store = store; }
  request(id: string, hero: HeroState) {
    if (this.failure) return;
    this.pending = { id, hero: structuredClone(hero) };
    this.start();
  }
  private start() {
    if (!this.running) {
      this.running = this.drain().catch(error => { this.failure = error; this.pending = undefined; this.onError?.(error); })
        .finally(() => { this.running = undefined; if (this.pending && !this.failure) this.start(); });
    }
  }
  private async drain() {
    while (this.pending) {
      const snapshot = this.pending; this.pending = undefined;
      const result = await this.store.save(snapshot.id, snapshot.hero, this.store.read(snapshot.id).revision);
      this.onSaved?.(result);
    }
  }
  async flush() { while (this.running) await this.running; if (this.failure) throw this.failure; }
}
