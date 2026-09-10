import { itemMovePlan, moveItem, packItems, footprint, stashRows, SLOTS, slotNames, type Item, type ItemPosition, type Slot } from './items';
import { equipFromItems, equipReason, canUnequipToItems, unequipToItems, swapRingSlots } from './model';
import { equipmentPanel } from './equipment-ui';
import type { UI } from './ui';

type Container = 'inventory' | 'stash' | 'shared';
const containerNames: Record<Container, string> = { inventory: '背包', stash: '私人仓库', shared: '共享仓库' };
const isContainer = (value?: string): value is Container => value === 'inventory' || value === 'stash' || value === 'shared';
type Drag = {
  source: HTMLButtonElement; grid?: HTMLElement; items: Item[]; item: Item; rows: number; sourceSlot?: Slot;
  container: Container; panel: 'inventory' | 'shared-stash';
  origin: ItemPosition; x: number; y: number; active: boolean; inside: boolean; valid: boolean;
  pointerId: number | null; startX: number; startY: number; clientX: number; clientY: number;
  grabX: number; grabY: number; offsetX: number; offsetY: number;
  ghost?: HTMLElement; hintBox?: HTMLElement; preview?: HTMLElement; swapPreview?: HTMLElement; dock?: HTMLElement;
  slotTarget?: HTMLButtonElement; equipCheck?: { slot: Slot; valid: boolean; reason: string };
  storageTarget?: HTMLElement; autoPlace: boolean; swapped: number; hint: string;
};

export class InventoryDrag {
  private ui: UI;
  private drag?: Drag;
  private frame = 0;
  private lastFrame = 0;
  private suppressClick = false;

  constructor(ui: UI) {
    this.ui = ui;
    window.addEventListener('pointerdown', event => {
      this.suppressClick = false;
      if (this.drag && this.drag.pointerId !== event.pointerId) this.cancel();
    }, true);
    ui.overlay.addEventListener('pointerdown', event => this.pointerDown(event));
    window.addEventListener('pointermove', event => this.pointerMove(event), { capture: true, passive: false });
    window.addEventListener('pointerup', event => {
      if (event.pointerId !== this.drag?.pointerId) return;
      if (this.drag.active) { event.preventDefault(); this.updatePointer(event.clientX, event.clientY); this.finish(); }
      else this.cancel();
    }, true);
    window.addEventListener('pointercancel', event => { if (event.pointerId === this.drag?.pointerId) this.cancel(); }, true);
    // Touch starts with implicit capture on the item; handing it to the overlay is not a cancellation.
    ui.overlay.addEventListener('lostpointercapture', event => { if (event.target === ui.overlay && event.pointerId === this.drag?.pointerId) this.cancel(); });
    ui.overlay.addEventListener('dragstart', event => { if ((event.target as Element).closest('.bag-item,[data-equipment-slot]')) event.preventDefault(); });
    ui.overlay.addEventListener('contextmenu', event => { if (this.drag) event.preventDefault(); });
    ui.overlay.addEventListener('scroll', () => { if (this.drag?.active && this.drag.pointerId !== null) this.updatePointer(this.drag.clientX, this.drag.clientY); }, true);
    ui.overlay.addEventListener('focusout', event => { if (this.drag?.pointerId === null && event.target === this.drag.source) this.cancel(); });
    document.addEventListener('click', event => {
      if (this.suppressClick && event.detail > 0) { event.preventDefault(); event.stopImmediatePropagation(); this.suppressClick = false; }
    }, true);
    document.addEventListener('keydown', event => this.keyDown(event), true);
    window.addEventListener('blur', () => this.cancel());
    window.addEventListener('resize', () => this.cancel());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancel(); });
  }

  private prepare(source: HTMLButtonElement): Drag | undefined {
    if (source.disabled || this.ui.panel !== 'inventory' && this.ui.panel !== 'shared-stash' || this.ui.game.saveConflict || this.ui.sharedStashScreen.busy) return;
    const sourceSlot = source.dataset.equipmentSlot as Slot | undefined;
    const grid = (sourceSlot ? this.ui.overlay.querySelector<HTMLElement>('.diablo-grid') : source.closest<HTMLElement>('.diablo-grid')) ?? undefined;
    const container = grid?.dataset.container ?? (sourceSlot ? 'inventory' : undefined); if (!isContainer(container)) return;
    const items = container === 'shared' ? this.ui.sharedStashScreen.state?.items : this.ui.game.hero[container];
    if (!items) return;
    const rows = grid ? Number(grid.dataset.rows) : 4, item = sourceSlot ? this.ui.game.hero.equipment[sourceSlot] : items.find(item => item.id === (source.dataset.item ?? source.dataset.sharedItem));
    if (!item || !Number.isInteger(rows) || rows < 1) return;
    const [width, height] = footprint(item), origin = sourceSlot ? { x: 0, y: 0, width, height } : packItems(items, rows)?.get(item.id); if (!origin) return;
    return { source, grid, items, item, rows, container, sourceSlot, panel: this.ui.panel, origin, x: origin.x, y: origin.y, active: false, inside: !sourceSlot, valid: !sourceSlot, pointerId: null, startX: 0, startY: 0, clientX: 0, clientY: 0, grabX: 0, grabY: 0, offsetX: 0, offsetY: 0, autoPlace: false, swapped: 0, hint: '' };
  }

  private pointerDown(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary || this.drag) return;
    const source = (event.target as Element).closest<HTMLButtonElement>('.bag-item,[data-equipment-slot]'); if (!source) return;
    const drag = this.prepare(source); if (!drag) return;
    const rect = source.getBoundingClientRect();
    drag.pointerId = event.pointerId; drag.startX = drag.clientX = event.clientX; drag.startY = drag.clientY = event.clientY;
    drag.offsetX = event.clientX - rect.left; drag.offsetY = event.clientY - rect.top;
    drag.grabX = Math.min(drag.origin.width - 1, Math.floor(drag.offsetX / (rect.width / drag.origin.width)));
    drag.grabY = Math.min(drag.origin.height - 1, Math.floor(drag.offsetY / (rect.height / drag.origin.height)));
    this.drag = drag;
  }

  private pointerMove(event: PointerEvent) {
    const drag = this.drag; if (!drag || event.pointerId !== drag.pointerId) return;
    if (event.pointerType === 'mouse' && !(event.buttons & 1)) { this.cancel(); return; }
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
    event.preventDefault();
    if (!drag.active) {
      this.activate(); this.ui.overlay.setPointerCapture(event.pointerId);
      this.lastFrame = performance.now(); this.frame = requestAnimationFrame(now => this.autoScroll(now));
    }
    this.updatePointer(event.clientX, event.clientY);
  }

  private activate() {
    const drag = this.drag!;
    drag.active = true; drag.source.classList.add('is-dragging');
    drag.preview = document.createElement('div'); drag.preview.className = 'item-drop-preview'; drag.preview.setAttribute('aria-hidden', 'true'); drag.grid?.append(drag.preview);
    drag.swapPreview = document.createElement('div'); drag.swapPreview.className = 'item-swap-preview'; drag.swapPreview.setAttribute('aria-hidden', 'true'); drag.grid?.append(drag.swapPreview);
    document.documentElement.classList.add('is-dragging-item');
    if (drag.pointerId !== null) {
      const rect = drag.source.getBoundingClientRect();
      drag.ghost = drag.source.cloneNode(true) as HTMLElement;
      for (const name of drag.ghost.getAttributeNames()) if (name.startsWith('data-') || name.startsWith('aria-') || name === 'id' || name === 'style') drag.ghost.removeAttribute(name);
      drag.ghost.classList.remove('is-dragging', 'selected', 'gear-slot'); drag.ghost.classList.add('bag-item', 'item-drag-ghost');
      drag.ghost.setAttribute('aria-hidden', 'true'); drag.ghost.tabIndex = -1;
      drag.ghost.style.width = `${rect.width}px`; drag.ghost.style.height = `${rect.height}px`;
      document.body.append(drag.ghost);
      drag.hintBox = document.createElement('div'); drag.hintBox.className = 'item-drag-hint'; drag.hintBox.setAttribute('aria-hidden', 'true'); document.body.append(drag.hintBox);
      if (drag.sourceSlot) {
        drag.dock = document.createElement('aside'); drag.dock.className = 'drag-storage-dock'; drag.dock.setAttribute('aria-label', '卸下装备到物品容器');
        const containers: Container[] = drag.panel === 'shared-stash' ? ['inventory', 'stash', 'shared'] : ['inventory', 'stash'];
        drag.dock.innerHTML = `<div class="drag-dock-title">拖到这里卸下 · 自动放入空位</div><div>${containers.map(container => `<button data-drop-container="${container}">${containerNames[container]}</button>`).join('')}</div>`;
        document.body.append(drag.dock);
      } else if (innerWidth <= 700 || innerHeight <= 580) {
        drag.dock = document.createElement('aside'); drag.dock.className = 'drag-equipment-dock';
        drag.dock.setAttribute('aria-label', '拖拽到装备部位以装备');
        drag.dock.innerHTML = `<div class="drag-dock-title">拖到对应部位即可装备</div>${equipmentPanel(this.ui.game.hero)}`;
        document.body.append(drag.dock); this.ui.refreshIcons();
      }
    }
    this.preview();
  }

  private updatePointer(clientX: number, clientY: number) {
    const drag = this.drag; if (!drag?.active) return;
    if (!drag.source.isConnected || this.ui.panel !== drag.panel) { this.cancel(); return; }
    drag.clientX = clientX; drag.clientY = clientY;
    drag.slotTarget?.removeAttribute('data-drop-valid');
    drag.storageTarget?.removeAttribute('data-drop-valid'); drag.storageTarget = undefined; drag.autoPlace = false;
    const hovered = document.elementFromPoint(clientX, clientY);
    drag.slotTarget = hovered?.closest<HTMLButtonElement>('[data-equipment-slot]') ?? undefined;
    const grid = drag.sourceSlot ? hovered?.closest<HTMLElement>('.diablo-grid') : drag.grid;
    drag.inside = false;
    if (grid) {
      if (drag.sourceSlot) this.destination(grid.dataset.container, grid);
      const rect = grid.getBoundingClientRect(), panel = grid.closest<HTMLElement>('.panel')!, panelRect = (grid.closest<HTMLElement>('.inventory-grid-scroll,.shared-grid-scroll') ?? panel).getBoundingClientRect();
      const headerBottom = panel.querySelector('.panel-header')!.getBoundingClientRect().bottom;
      drag.inside = clientX >= rect.left && clientX < rect.left + grid.clientWidth && clientY >= Math.max(rect.top, headerBottom, panelRect.top) && clientY < Math.min(rect.top + grid.clientHeight, panelRect.bottom);
      drag.x = Math.floor((clientX - rect.left) / (grid.clientWidth / 10)) - drag.grabX;
      drag.y = Math.floor((clientY - rect.top) / (grid.clientHeight / drag.rows)) - drag.grabY;
    }
    if (drag.sourceSlot) {
      const target = hovered?.closest<HTMLElement>('[data-drop-container],[data-bag-view],[data-shared-view],[data-shared-pane]');
      const container = target?.dataset.dropContainer ?? target?.dataset.bagView ?? target?.dataset.sharedView ?? (target?.dataset.sharedPane === 'personal' ? this.ui.sharedStashScreen.view : target?.dataset.sharedPane);
      if (target && this.destination(container)) { drag.storageTarget = target; drag.inside = true; drag.autoPlace = true; }
    }
    if (drag.slotTarget) drag.inside = true;
    if (drag.ghost) { drag.ghost.style.left = `${clientX - drag.offsetX}px`; drag.ghost.style.top = `${clientY - drag.offsetY}px`; }
    this.preview();
  }

  private destination(container?: string, grid?: HTMLElement) {
    const drag = this.drag!;
    if (!isContainer(container) || container === 'shared' && drag.panel !== 'shared-stash') return false;
    const items = container === 'shared' ? this.ui.sharedStashScreen.state?.items : this.ui.game.hero[container]; if (!items) return false;
    drag.container = container; drag.items = items;
    drag.rows = grid ? Number(grid.dataset.rows) : container === 'inventory' ? 4 : container === 'shared' ? 10 : stashRows([...items, drag.item]);
    if (grid && grid !== drag.grid) { drag.grid = grid; grid.append(drag.preview!, drag.swapPreview!); }
    return true;
  }

  private preview() {
    const drag = this.drag!;
    const slot = drag.slotTarget?.dataset.equipmentSlot as Slot | undefined;
    drag.swapped = 0;
    if (drag.sourceSlot) {
      if (slot) {
        const rings = [drag.sourceSlot, slot].every(slot => slot === 'ring' || slot === 'ring2');
        drag.valid = slot === drag.sourceSlot || rings;
        drag.hint = slot === drag.sourceSlot ? '保留原位' : rings ? this.ui.game.hero.equipment[slot] ? '交换左右戒指' : `移至${slotNames[slot]}` : '此装备无法移至该部位';
        drag.slotTarget!.dataset.dropValid = String(drag.valid);
      } else {
        drag.valid = drag.inside && canUnequipToItems(this.ui.game.hero, drag.items, drag.sourceSlot, drag.rows, drag.autoPlace ? undefined : { x: drag.x, y: drag.y });
        drag.hint = drag.valid ? `卸下至${containerNames[drag.container]}${drag.autoPlace ? ' · 自动放入空位' : ''}` : drag.inside ? `${containerNames[drag.container]}需要完整空位` : '拖到背包、仓库空格或下方接收区';
        if (drag.storageTarget) drag.storageTarget.dataset.dropValid = String(drag.valid);
      }
    } else if (slot && SLOTS.includes(slot)) {
      if (drag.equipCheck?.slot !== slot) {
        const hero = structuredClone(this.ui.game.hero), items = drag.container === 'shared' ? structuredClone(drag.items) : hero[drag.container];
        const reason = equipReason(hero, drag.item, slot);
        const valid = !reason && equipFromItems(hero, items, drag.item.id, slot, drag.rows);
        drag.equipCheck = { slot, valid, reason: reason || (valid ? '' : '来源容器放不下替换装备') };
      }
      drag.valid = drag.equipCheck.valid; drag.hint = drag.valid ? `装备至${slotNames[slot]}` : drag.equipCheck.reason;
      drag.slotTarget!.dataset.dropValid = String(drag.valid);
    } else {
      const plan = drag.inside ? itemMovePlan(drag.items, drag.item.id, drag.x, drag.y, drag.rows) : null;
      drag.valid = !!plan; drag.swapped = plan?.swapped.length ?? 0;
      drag.hint = drag.valid ? drag.swapped ? `交换 ${drag.swapped} 件物品` : '移动到此处' : '目标需完整覆盖物品，且交换后不能重叠';
    }
    const preview = drag.preview!;
    preview.hidden = !drag.inside || !!slot || drag.autoPlace; preview.dataset.valid = String(drag.valid); preview.dataset.mode = drag.swapped ? 'swap' : 'move';
    preview.style.left = `${drag.x * 10}%`; preview.style.top = `${drag.y / drag.rows * 100}%`;
    preview.style.width = `${drag.origin.width * 10}%`; preview.style.height = `${drag.origin.height / drag.rows * 100}%`;
    const swap = drag.swapPreview!; swap.hidden = !drag.valid || !drag.swapped || !!slot;
    swap.style.left = `${drag.origin.x * 10}%`; swap.style.top = `${drag.origin.y / drag.rows * 100}%`;
    swap.style.width = `${drag.origin.width * 10}%`; swap.style.height = `${drag.origin.height / drag.rows * 100}%`;
    if (drag.ghost) { drag.ghost.dataset.valid = String(drag.valid); drag.ghost.dataset.hint = drag.hint; }
    if (drag.hintBox) {
      drag.hintBox.textContent = drag.hint; drag.hintBox.dataset.valid = String(drag.valid);
      drag.hintBox.style.left = `${Math.max(8, Math.min(innerWidth - drag.hintBox.offsetWidth - 8, drag.clientX + 14))}px`;
      drag.hintBox.style.top = `${Math.max(8, Math.min(innerHeight - drag.hintBox.offsetHeight - 8, drag.clientY - drag.hintBox.offsetHeight - 16))}px`;
    }
    const status = drag.grid?.closest('.bag-column')?.querySelector<HTMLElement>('.inventory-move-status');
    if (status) status.textContent = `${drag.item.name}：${drag.hint}`;
  }

  private autoScroll(now: number) {
    const drag = this.drag; if (!drag?.active || drag.pointerId === null) return;
    if (!drag.source.isConnected) { this.cancel(); return; }
    const panel = drag.grid?.closest<HTMLElement>('.inventory-grid-scroll,.shared-grid-scroll');
    if (!panel || drag.autoPlace || drag.sourceSlot && drag.slotTarget) { this.lastFrame = now; this.frame = requestAnimationFrame(time => this.autoScroll(time)); return; }
    const rect = panel.getBoundingClientRect();
    const top = rect.top, dt = Math.min(50, now - this.lastFrame) / 1000; this.lastFrame = now;
    if (drag.clientX >= rect.left && drag.clientX <= rect.right && drag.clientY >= rect.top && drag.clientY <= rect.bottom) {
      const velocity = drag.clientY < top + 36 ? -Math.min(1, (top + 36 - drag.clientY) / 36) : drag.clientY > rect.bottom - 36 ? Math.min(1, (drag.clientY - rect.bottom + 36) / 36) : 0;
      if (velocity) { panel.scrollTop += velocity * 420 * dt; this.updatePointer(drag.clientX, drag.clientY); }
    }
    this.frame = requestAnimationFrame(time => this.autoScroll(time));
  }

  private keyDown(event: KeyboardEvent) {
    if (this.drag) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.cancel(); return; }
      if (event.key === 'Tab') { this.cancel(); return; }
      if (this.drag.pointerId !== null) return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Enter' || event.key === ' ') { if (!event.repeat) this.finish(); return; }
      if (event.key === 'ArrowLeft') this.drag.x--;
      if (event.key === 'ArrowRight') this.drag.x++;
      if (event.key === 'ArrowUp') this.drag.y--;
      if (event.key === 'ArrowDown') this.drag.y++;
      this.preview(); this.drag.preview?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
      const source = (event.target as Element).closest<HTMLButtonElement>('.bag-item'); if (!source) return;
      const drag = this.prepare(source); if (!drag) return;
      event.preventDefault(); event.stopPropagation(); this.drag = drag; this.activate();
    }
  }

  private finish() {
    const drag = this.drag; if (!drag?.active) return;
    const valid = drag.valid && !this.ui.game.saveConflict && !this.ui.sharedStashScreen.busy && drag.source.isConnected && this.ui.panel === drag.panel && (!drag.sourceSlot || this.ui.game.hero.equipment[drag.sourceSlot]?.id === drag.item.id);
    const slot = drag.slotTarget?.dataset.equipmentSlot as Slot | undefined;
    const scrollTop = drag.grid?.closest('.inventory-grid-scroll,.shared-grid-scroll')?.scrollTop ?? 0;
    this.cancel();
    if (!valid) { if (drag.inside) this.ui.toast(drag.hint); return; }
    if (drag.sourceSlot && slot === drag.sourceSlot || !drag.sourceSlot && !slot && drag.x === drag.origin.x && drag.y === drag.origin.y) return;
    if (drag.sourceSlot && !slot && drag.container === 'shared') {
      this.ui.sharedStashScreen.pane = 'shared';
      void this.ui.sharedStashScreen.transfer({ direction: 'unequip', slot: drag.sourceSlot, position: drag.autoPlace ? undefined : { x: drag.x, y: drag.y } }); return;
    }
    if (!drag.sourceSlot && drag.container === 'shared') {
      void this.ui.sharedStashScreen.transfer(slot ? { direction: 'equip', itemId: drag.item.id, target: slot } : { direction: 'move', itemId: drag.item.id, x: drag.x, y: drag.y });
      return;
    }
    const changed = drag.sourceSlot ? slot ? swapRingSlots(this.ui.game.hero, drag.sourceSlot, slot) : unequipToItems(this.ui.game.hero, drag.items, drag.sourceSlot, drag.rows, drag.autoPlace ? undefined : { x: drag.x, y: drag.y })
      : slot ? equipFromItems(this.ui.game.hero, drag.items, drag.item.id, slot, drag.rows) : moveItem(drag.items, drag.item.id, drag.x, drag.y, drag.rows);
    if (!changed) return;
    this.ui.selectedItem = drag.item.id;
    if (drag.panel === 'shared-stash') this.ui.sharedStashScreen.selected = { side: slot ? 'equipment' : 'personal', id: drag.item.id };
    if (drag.sourceSlot && !slot && drag.container !== 'shared') {
      if (drag.panel === 'inventory') { this.ui.characterScreen.view = drag.container; this.ui.characterScreen.inventoryPane = 'items'; }
      else { this.ui.sharedStashScreen.view = drag.container; this.ui.sharedStashScreen.pane = 'personal'; }
    }
    if (slot || drag.sourceSlot) { this.ui.game.audio.play('equip'); this.ui.toast(drag.sourceSlot ? slot ? '已调整戒指位置' : `已卸下至${containerNames[drag.container]}` : '已装备', drag.item.name); }
    this.ui.game.save(false); this.ui.renderPanel();
    const panel = this.ui.overlay.querySelector(`[data-container="${drag.container}"]`)?.closest('.inventory-grid-scroll,.shared-grid-scroll'); if (panel) panel.scrollTop = scrollTop;
    const source = [...this.ui.overlay.querySelectorAll<HTMLButtonElement>('.bag-item')].find(button => (button.dataset.item ?? button.dataset.sharedItem) === drag.item.id);
    source?.focus({ preventScroll: true });
  }

  cancel() {
    const drag = this.drag; if (!drag) return;
    this.drag = undefined; cancelAnimationFrame(this.frame);
    if (drag.active && drag.pointerId !== null) this.suppressClick = true;
    drag.ghost?.remove(); drag.hintBox?.remove(); drag.preview?.remove(); drag.swapPreview?.remove(); drag.dock?.remove(); drag.slotTarget?.removeAttribute('data-drop-valid'); drag.storageTarget?.removeAttribute('data-drop-valid'); drag.source.classList.remove('is-dragging');
    document.documentElement.classList.remove('is-dragging-item');
    const status = drag.grid?.closest('.bag-column')?.querySelector<HTMLElement>('.inventory-move-status'); if (status) status.textContent = '';
    if (drag.pointerId !== null && this.ui.overlay.hasPointerCapture(drag.pointerId)) this.ui.overlay.releasePointerCapture(drag.pointerId);
  }
}
