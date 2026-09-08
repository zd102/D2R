import { canMoveItem, moveItem, packItems, type Item, type ItemPosition } from './items';
import type { UI } from './ui';

type Drag = {
  source: HTMLButtonElement; grid: HTMLElement; items: Item[]; item: Item; rows: number;
  origin: ItemPosition; x: number; y: number; active: boolean; inside: boolean; valid: boolean;
  pointerId: number | null; startX: number; startY: number; clientX: number; clientY: number;
  grabX: number; grabY: number; offsetX: number; offsetY: number;
  ghost?: HTMLElement; preview?: HTMLElement;
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
    ui.overlay.addEventListener('dragstart', event => { if ((event.target as Element).closest('.bag-item')) event.preventDefault(); });
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
    const grid = source.closest<HTMLElement>('.diablo-grid'), container = grid?.dataset.container;
    if (!grid || this.ui.panel !== 'inventory' || this.ui.game.saveConflict || container !== 'inventory' && container !== 'stash') return;
    const items = this.ui.game.hero[container], rows = Number(grid.dataset.rows), item = items.find(item => item.id === source.dataset.item);
    if (!item || !Number.isInteger(rows) || rows < 1) return;
    const origin = packItems(items, rows)?.get(item.id); if (!origin) return;
    return { source, grid, items, item, rows, origin, x: origin.x, y: origin.y, active: false, inside: true, valid: true, pointerId: null, startX: 0, startY: 0, clientX: 0, clientY: 0, grabX: 0, grabY: 0, offsetX: 0, offsetY: 0 };
  }

  private pointerDown(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary || this.drag) return;
    const source = (event.target as Element).closest<HTMLButtonElement>('.bag-item'); if (!source) return;
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
    drag.preview = document.createElement('div'); drag.preview.className = 'item-drop-preview'; drag.preview.setAttribute('aria-hidden', 'true'); drag.grid.append(drag.preview);
    document.documentElement.classList.add('is-dragging-item');
    if (drag.pointerId !== null) {
      const rect = drag.source.getBoundingClientRect();
      drag.ghost = drag.source.cloneNode(true) as HTMLElement;
      for (const name of drag.ghost.getAttributeNames()) if (name.startsWith('data-') || name.startsWith('aria-') || name === 'id' || name === 'style') drag.ghost.removeAttribute(name);
      drag.ghost.classList.remove('is-dragging', 'selected'); drag.ghost.classList.add('item-drag-ghost');
      drag.ghost.setAttribute('aria-hidden', 'true'); drag.ghost.tabIndex = -1;
      drag.ghost.style.width = `${rect.width}px`; drag.ghost.style.height = `${rect.height}px`;
      document.body.append(drag.ghost);
    }
    this.preview();
  }

  private updatePointer(clientX: number, clientY: number) {
    const drag = this.drag; if (!drag?.active) return;
    if (!drag.grid.isConnected || this.ui.panel !== 'inventory') { this.cancel(); return; }
    drag.clientX = clientX; drag.clientY = clientY;
    const rect = drag.grid.getBoundingClientRect(), panel = drag.grid.closest<HTMLElement>('.panel')!, panelRect = panel.getBoundingClientRect();
    const headerBottom = panel.querySelector('.panel-header')!.getBoundingClientRect().bottom;
    drag.inside = clientX >= rect.left && clientX < rect.left + drag.grid.clientWidth && clientY >= Math.max(rect.top, headerBottom) && clientY < Math.min(rect.top + drag.grid.clientHeight, panelRect.bottom);
    drag.x = Math.floor((clientX - rect.left) / (drag.grid.clientWidth / 10)) - drag.grabX;
    drag.y = Math.floor((clientY - rect.top) / (drag.grid.clientHeight / drag.rows)) - drag.grabY;
    if (drag.ghost) { drag.ghost.style.left = `${clientX - drag.offsetX}px`; drag.ghost.style.top = `${clientY - drag.offsetY}px`; }
    this.preview();
  }

  private preview() {
    const drag = this.drag!;
    drag.valid = drag.inside && canMoveItem(drag.items, drag.item.id, drag.x, drag.y, drag.rows);
    const preview = drag.preview!;
    preview.hidden = !drag.inside; preview.dataset.valid = String(drag.valid);
    preview.style.left = `${drag.x * 10}%`; preview.style.top = `${drag.y / drag.rows * 100}%`;
    preview.style.width = `${drag.origin.width * 10}%`; preview.style.height = `${drag.origin.height / drag.rows * 100}%`;
    if (drag.ghost) drag.ghost.dataset.valid = String(drag.valid);
    const status = drag.grid.parentElement?.querySelector<HTMLElement>('.inventory-move-status');
    if (status) status.textContent = drag.valid ? `${drag.item.name}：第 ${drag.y + 1} 行，第 ${drag.x + 1} 列` : '该位置无法放置装备';
  }

  private autoScroll(now: number) {
    const drag = this.drag; if (!drag?.active || drag.pointerId === null) return;
    if (!drag.grid.isConnected) { this.cancel(); return; }
    const panel = drag.grid.closest<HTMLElement>('.panel')!, rect = panel.getBoundingClientRect();
    const top = panel.querySelector('.panel-header')!.getBoundingClientRect().bottom, dt = Math.min(50, now - this.lastFrame) / 1000; this.lastFrame = now;
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
    const valid = drag.valid && !this.ui.game.saveConflict && drag.grid.isConnected && this.ui.panel === 'inventory';
    const changed = valid && (drag.x !== drag.origin.x || drag.y !== drag.origin.y) && moveItem(drag.items, drag.item.id, drag.x, drag.y, drag.rows);
    const scrollTop = drag.grid.closest('.panel')!.scrollTop;
    this.cancel();
    if (!valid && drag.inside) this.ui.toast('该位置无法放置装备');
    if (!changed) return;
    this.ui.selectedItem = drag.item.id;
    this.ui.game.save(false); this.ui.renderPanel();
    const panel = this.ui.overlay.querySelector('.panel'); if (panel) panel.scrollTop = scrollTop;
    const source = [...this.ui.overlay.querySelectorAll<HTMLButtonElement>('.bag-item')].find(button => button.dataset.item === drag.item.id);
    source?.focus({ preventScroll: true });
  }

  cancel() {
    const drag = this.drag; if (!drag) return;
    this.drag = undefined; cancelAnimationFrame(this.frame);
    if (drag.active && drag.pointerId !== null) this.suppressClick = true;
    drag.ghost?.remove(); drag.preview?.remove(); drag.source.classList.remove('is-dragging');
    document.documentElement.classList.remove('is-dragging-item');
    const status = drag.grid.parentElement?.querySelector<HTMLElement>('.inventory-move-status'); if (status) status.textContent = '';
    if (drag.pointerId !== null && this.ui.overlay.hasPointerCapture(drag.pointerId)) this.ui.overlay.releasePointerCapture(drag.pointerId);
  }
}
