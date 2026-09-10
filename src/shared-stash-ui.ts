import type { UI } from './ui';
import { SaveError, type SharedStash } from './saves';
import { CAMP } from './camp';
import { SHARED_STASH_ROWS, type PersonalContainer, type SharedTransfer } from './shared-stash';
import { SLOTS, packItems, footprint, stashRows, type Item, type Slot } from './items';
import { equipReason, unequipItem } from './model';
import { itemVisual } from './item-art';
import { equipmentPanel } from './equipment-ui';
import { itemDetails } from './item-details-ui';

const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
type SharedSide = 'personal' | 'shared' | 'equipment';
export class SharedStashScreen {
  view: PersonalContainer = 'inventory';
  pane: SharedSide = 'personal';
  selected?: { side: SharedSide; id: string };
  state?: SharedStash;
  error = '';
  busy = false;
  showRanges = false;
  private ui: UI;
  constructor(ui: UI) {
    this.ui = ui;
    ui.overlay.addEventListener('click', event => {
      if (ui.panel !== 'shared-stash' || this.busy) return;
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button || button.disabled) return;
      const data = button.dataset;
      if (data.sharedView) { this.view = data.sharedView as PersonalContainer; this.selected = undefined; ui.renderPanel(); }
      if (data.sharedPane) { this.pane = data.sharedPane as SharedSide; this.selected = undefined; ui.renderPanel(); }
      if (data.sharedItem) { this.selected = { side: data.sharedSide as SharedSide, id: data.sharedItem }; ui.renderPanel(); }
      if (data.sharedTransfer && this.selected && this.selected.side !== 'equipment') void this.transfer({ itemId: this.selected.id, direction: this.selected.side === 'shared' ? 'withdraw' : 'deposit', container: data.sharedTransfer as PersonalContainer });
      if (data.sharedEquip) void this.transfer({ direction: 'equip', itemId: data.sharedEquip, target: data.equipTarget as Slot | undefined });
      if (data.sharedUnequip) void this.transfer({ direction: 'unequip', slot: data.sharedUnequip as Slot });
      if (data.personalEquip) { ui.game.equip(data.personalEquip, data.equipTarget as Slot | undefined); if (SLOTS.some(slot => ui.game.hero.equipment[slot]?.id === data.personalEquip)) { this.selected = { side: 'equipment', id: data.personalEquip }; ui.renderPanel(); } }
      if (data.personalUnequip) { if (unequipItem(ui.game.hero, data.personalUnequip as Slot, 'stash')) { this.selected = undefined; ui.game.save(false); ui.renderPanel(); } else ui.toast('个人仓库空间不足'); }
      if (data.action === 'swap-weapons') { this.selected = undefined; ui.game.swapWeapons(); }
    });
    ui.overlay.addEventListener('change', event => {
      if (ui.panel !== 'shared-stash' || this.busy) return;
      const input = event.target as HTMLInputElement;
      if (input.dataset.affixRanges !== undefined) { this.showRanges = input.checked; ui.renderPanel(); }
    });
  }
  refresh() { this.selected = undefined; if (this.ui.panel === 'shared-stash' && !this.busy) this.ui.renderPanel(); }
  async transfer(request: SharedTransfer) {
    const game = this.ui.game;
    if (this.busy || !this.state || !game.profile || !game.saves || game.saveConflict || game.dead || !game.inCamp || this.ui.panel !== 'shared-stash'
      || Math.hypot(game.position.x - CAMP.stash.x, game.position.z - CAMP.stash.z) >= 3.5) return;
    const revision = this.state.revision, unequippedId = request.direction === 'unequip' ? game.hero.equipment[request.slot]?.id : undefined;
    this.busy = true; this.error = ''; this.ui.renderPanel();
    try {
      const result = await game.saves.transferShared(game.profile.id, game.hero, game.profile.revision, revision, request);
      game.profile = result.profile; game.hero = structuredClone(result.profile.hero); game.storageAvailable = true; this.state = result.shared;
      this.selected = request.direction === 'equip' ? { side: 'equipment', id: request.itemId } : request.direction === 'move' ? { side: 'shared', id: request.itemId } : unequippedId ? { side: 'shared', id: unequippedId } : undefined;
      game.audio.play('equip'); this.ui.toast(request.direction === 'move' ? '已调整共享仓库' : request.direction === 'equip' ? '已装备，替换装备已放回共享仓库' : request.direction === 'unequip' ? '已卸下至共享仓库' : request.direction === 'deposit' ? '已存入共享仓库' : request.container === 'inventory' ? '已取回背包' : '已取回个人仓库');
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
    return `<div class="shared-grid-scroll"><div class="diablo-grid" data-container="${side === 'shared' ? 'shared' : this.view}" data-rows="${rows}" style="--rows:${rows}" aria-label="${side === 'shared' ? '共享仓库' : this.view === 'inventory' ? '背包' : '个人仓库'}物品">${items.map(item => {
      const p = positions?.get(item.id); if (!p) return '';
      const name = item.identified === false ? `未鉴定 ${item.base ?? item.name}` : item.name;
      return `<button class="bag-item ${item.rarity} ${this.selected?.id === item.id && this.selected.side === side ? 'selected' : ''}" data-shared-item="${escape(item.id)}" data-shared-side="${side}" aria-label="${escape(name)}" aria-pressed="${this.selected?.id === item.id && this.selected.side === side}" style="grid-column:${p.x + 1}/span ${p.width};grid-row:${p.y + 1}/span ${p.height}" ${this.busy ? 'disabled' : ''}>${itemVisual(item)}${item.identified === false ? '<b class="unidentified-mark">?</b>' : ''}${item.sockets ? `<small>${item.sockets} 孔</small>` : ''}</button>`;
    }).join('')}</div></div>`;
  }
  private details(item: Item, disabled: boolean) {
    const hero = this.ui.game.hero, slot = SLOTS.find(slot => hero.equipment[slot]?.id === item.id), reason = equipReason(hero, item);
    const equipAttribute = this.selected?.side === 'shared' ? 'data-shared-equip' : 'data-personal-equip';
    const equip = `<button class="primary-button" ${equipAttribute}="${escape(item.id)}" ${disabled || reason ? 'disabled' : ''}>装备</button>${item.slot === 'ring' ? `<button class="secondary-button" ${equipAttribute}="${escape(item.id)}" data-equip-target="ring2" ${disabled || reason ? 'disabled' : ''}>装备到右戒指</button>` : ''}`;
    const actions = slot ? `<button class="primary-button" data-shared-unequip="${slot}" ${disabled ? 'disabled' : ''}>卸下至共享仓库</button><button class="secondary-button" data-personal-unequip="${slot}" ${disabled ? 'disabled' : ''}>卸下至个人仓库</button>`
      : this.selected?.side === 'shared' ? `${equip}<button class="secondary-button" data-shared-transfer="inventory" ${disabled ? 'disabled' : ''}>取回背包</button><button class="secondary-button" data-shared-transfer="stash" ${disabled ? 'disabled' : ''}>取回个人仓库</button>`
        : `${equip}<button class="secondary-button" data-shared-transfer="${this.view}" ${disabled ? 'disabled' : ''}>存入共享仓库</button>`;
    return `<div class="shared-selected">${itemDetails(hero, item, { equipped: !!slot, showRanges: this.showRanges })}<div class="shared-actions">${!slot && reason ? `<small class="learn-reason">${reason}</small>` : ''}${actions}</div></div>`;
  }
  render() {
    let readable = true;
    try { this.state = this.ui.game.saves!.readShared(); } catch (error) { readable = false; this.error = error instanceof Error ? error.message : '共享仓库无法读取'; }
    const hero = this.ui.game.hero, personal = hero[this.view], shared = readable ? this.state?.items ?? [] : [];
    const selected = this.selected && (this.selected.side === 'equipment' ? Object.values(hero.equipment) : this.selected.side === 'shared' ? shared : personal).find(item => item?.id === this.selected!.id);
    const occupied = shared.reduce((sum, item) => sum + footprint(item)[0] * footprint(item)[1], 0), disabled = this.busy || !readable;
    return `<div class="shared-intro"><i data-lucide="archive"></i><p>直接穿脱装备 · 替换装备放回来源仓库<small>本地角色共用 ${SHARED_STASH_ROWS * 10} 格，可从装备栏直接卸下。</small></p></div>
      ${this.error ? `<p class="shared-error" role="alert">${escape(this.error)}</p>` : ''}<div class="shared-workspace" data-pane="${this.pane}"><nav class="shared-mobile-tabs" aria-label="仓库视图">${(['personal', 'shared', 'equipment'] as const).map(side => `<button data-shared-pane="${side}" aria-pressed="${this.pane === side}">${({ personal: '个人物品', shared: '共享仓库', equipment: '装备栏' })[side]}</button>`).join('')}</nav>
      <aside class="shared-loadout">${equipmentPanel(hero, this.selected?.side === 'equipment' ? this.selected.id : undefined, true, disabled)}</aside>
      <div class="shared-columns"><section><div class="shared-tabs" role="tablist" aria-label="个人物品来源">${(['inventory', 'stash'] as const).map(view => `<button role="tab" aria-selected="${view === this.view}" data-shared-view="${view}" ${disabled ? 'disabled' : ''}>${view === 'inventory' ? '背包' : '个人仓库'} <small>${hero[view].length}</small></button>`).join('')}</div>${this.grid(personal, this.view === 'inventory' ? 4 : stashRows(personal), 'personal')}<p class="shared-caption">个人物品 → 穿戴 / 共享仓库</p></section>
      <section><div class="shared-heading"><h3>共享仓库</h3><span>${occupied} / ${SHARED_STASH_ROWS * 10} 格</span></div>${this.grid(shared, SHARED_STASH_ROWS, 'shared')}<p class="shared-caption">共享仓库 → 穿戴 / 个人物品</p></section></div>
      <section class="shared-item-details ${this.showRanges ? 'show-ranges' : ''}" aria-live="polite">${selected ? this.details(selected, disabled) : '<p class="shared-caption">选择一件物品或已穿戴的装备，查看完整属性并直接穿脱。</p>'}${this.busy ? '<p role="status">正在保存存取结果…</p>' : ''}</section></div>`;
  }
}
