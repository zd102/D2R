import type { UI } from './ui';
import { SaveError, type SharedStash } from './saves';
import { CAMP } from './camp';
import { SHARED_STASH_ROWS, type PersonalContainer, type SharedTransfer } from './shared-stash';
import { packItems, footprint, stashRows, rarityNames, type Item } from './items';
import { itemVisual } from './item-art';
import { itemModifierLines } from './item-description';

const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export class SharedStashScreen {
  view: PersonalContainer = 'inventory';
  selected?: { side: 'personal' | 'shared'; id: string };
  state?: SharedStash;
  error = '';
  busy = false;
  private ui: UI;
  constructor(ui: UI) {
    this.ui = ui;
    ui.overlay.addEventListener('click', event => {
      if (ui.panel !== 'shared-stash' || this.busy) return;
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button || button.disabled) return;
      if (button.dataset.sharedView) { this.view = button.dataset.sharedView as PersonalContainer; this.selected = undefined; ui.renderPanel(); }
      if (button.dataset.sharedItem) { this.selected = { side: button.dataset.sharedSide as 'personal' | 'shared', id: button.dataset.sharedItem }; ui.renderPanel(); ui.overlay.querySelector('.shared-item-details')?.scrollIntoView({ block: 'nearest' }); }
      if (button.dataset.sharedTransfer && this.selected) void this.transfer({ itemId: this.selected.id, direction: this.selected.side === 'shared' ? 'withdraw' : 'deposit', container: button.dataset.sharedTransfer as PersonalContainer });
    });
  }
  refresh() { this.selected = undefined; if (this.ui.panel === 'shared-stash' && !this.busy) this.ui.renderPanel(); }
  async transfer(request: SharedTransfer) {
    const game = this.ui.game;
    if (this.busy || !this.state || !game.profile || !game.saves || game.saveConflict || game.dead || !game.inCamp || this.ui.panel !== 'shared-stash'
      || Math.hypot(game.position.x - CAMP.stash.x, game.position.z - CAMP.stash.z) >= 3.5) return;
    const revision = this.state.revision; this.busy = true; this.error = ''; this.ui.renderPanel();
    try {
      const result = await game.saves.transferShared(game.profile.id, game.hero, game.profile.revision, revision, request);
      game.profile = result.profile; game.hero = structuredClone(result.profile.hero); game.storageAvailable = true; this.state = result.shared;
      this.selected = undefined; game.audio.play('loot'); this.ui.toast(request.direction === 'deposit' ? '已存入共享仓库' : request.container === 'inventory' ? '已取回背包' : '已取回个人仓库');
    } catch (error) {
      this.error = error instanceof Error ? error.message : '存取失败，请重试';
      if (error instanceof SaveError && ['conflict', 'missing'].includes(error.code)) game.saveConflict = true;
    } finally {
      this.busy = false;
      if (game.saveConflict) this.ui.openPanel('save-conflict'); else this.ui.renderPanel();
    }
  }
  grid(items: Item[], rows: number, side: 'personal' | 'shared') {
    const positions = packItems(items, rows);
    return `<div class="shared-grid-scroll"><div class="diablo-grid" style="--rows:${rows}" aria-label="${side === 'shared' ? '共享仓库' : this.view === 'inventory' ? '背包' : '个人仓库'}物品">${items.map(item => {
      const p = positions?.get(item.id); if (!p) return '';
      const name = item.identified === false ? `未鉴定 ${item.base ?? item.name}` : item.name;
      return `<button class="bag-item ${item.rarity} ${this.selected?.id === item.id && this.selected.side === side ? 'selected' : ''}" data-shared-item="${escape(item.id)}" data-shared-side="${side}" aria-label="${escape(name)}" aria-pressed="${this.selected?.id === item.id && this.selected.side === side}" style="grid-column:${p.x + 1}/span ${p.width};grid-row:${p.y + 1}/span ${p.height}" ${this.busy ? 'disabled' : ''}>${itemVisual(item)}${item.identified === false ? '<b class="unidentified-mark">?</b>' : ''}</button>`;
    }).join('')}</div></div>`;
  }
  render() {
    let readable = true;
    try { this.state = this.ui.game.saves!.readShared(); } catch (error) { readable = false; this.error = error instanceof Error ? error.message : '共享仓库无法读取'; }
    const personal = this.ui.game.hero[this.view], shared = readable ? this.state?.items ?? [] : [], selected = this.selected && (this.selected.side === 'shared' ? shared : personal).find(item => item.id === this.selected!.id);
    const occupied = shared.reduce((sum, item) => sum + footprint(item)[0] * footprint(item)[1], 0), disabled = this.busy || !readable;
    return `<div class="shared-intro"><i data-lucide="archive"></i><p>本地角色共用 · 选择物品后存入或取出<small>同一浏览器、同一访问地址共享，容量 ${SHARED_STASH_ROWS * 10} 格。</small></p></div>
      ${this.error ? `<p class="shared-error" role="alert">${escape(this.error)}</p>` : ''}<div class="shared-columns"><section><div class="shared-tabs" role="tablist" aria-label="个人物品来源">${(['inventory', 'stash'] as const).map(view => `<button role="tab" aria-selected="${view === this.view}" data-shared-view="${view}" ${disabled ? 'disabled' : ''}>${view === 'inventory' ? '背包' : '个人仓库'} <small>${this.ui.game.hero[view].length}</small></button>`).join('')}</div>${this.grid(personal, this.view === 'inventory' ? 4 : stashRows(personal), 'personal')}<p class="shared-caption">${this.view === 'inventory' ? '背包' : '个人仓库'} → 共享仓库</p></section>
      <section><div class="shared-heading"><h3>共享仓库</h3><span>${occupied} / ${SHARED_STASH_ROWS * 10} 格</span></div>${this.grid(shared, SHARED_STASH_ROWS, 'shared')}<p class="shared-caption">共享仓库 → 背包 / 个人仓库</p></section></div>
      <section class="shared-item-details" aria-live="polite">${selected ? `<div class="shared-selected"><div class="shared-art">${itemVisual(selected)}</div><div><small class="${selected.rarity}">${rarityNames[selected.rarity]} · ${this.selected?.side === 'shared' ? '共享仓库' : this.view === 'inventory' ? '背包' : '个人仓库'}</small><h3 class="${selected.rarity}">${escape(selected.identified === false ? `未鉴定 ${selected.base ?? selected.name}` : selected.name)}</h3><small>${footprint(selected).join(' × ')} 格${selected.sockets ? ` · ${selected.sockets} 孔` : ''}</small></div><div class="shared-actions">${this.selected?.side === 'shared' ? `<button class="primary-button" data-shared-transfer="inventory" ${disabled ? 'disabled' : ''}>取回背包</button><button class="secondary-button" data-shared-transfer="stash" ${disabled ? 'disabled' : ''}>取回个人仓库</button>` : `<button class="primary-button" data-shared-transfer="${this.view}" ${disabled ? 'disabled' : ''}>存入共享仓库</button>`}</div></div>${selected.identified === false ? '<p class="shared-caption">未鉴定物品可直接转移，取出后在行囊中鉴定。</p>' : `<ul class="item-affixes">${itemModifierLines(selected).map(line => `<li>${escape(line.text)}${line.range ? `<small>变量 ${escape(line.range)}</small>` : ''}</li>`).join('')}</ul>`}` : '<p class="shared-caption">选择背包、个人仓库或共享仓库中的一件物品。</p>'}${this.busy ? '<p role="status">正在保存存取结果…</p>' : ''}</section>`;
  }
}
