// Keep this query in sync with mobile-ui.css. A small desktop window retains its UI.
export const PHONE_UI_QUERY = '(hover: none) and (pointer: coarse) and (max-width: 600px), (hover: none) and (pointer: coarse) and (max-height: 600px) and (max-width: 1100px)';
let phoneMedia: MediaQueryList | undefined;
export const phoneUI = () => (phoneMedia ??= matchMedia(PHONE_UI_QUERY)).matches;

// Cancel Safari's native tap handling locally, then activate each completed tap
// ourselves. CSS touch-action alone is not a sufficient fallback on all iOS versions.
export function bindTouchSkills(group: HTMLElement) {
  const touches = new Map<number, { button: HTMLButtonElement; x: number; y: number; moved: boolean }>();
  group.addEventListener('touchstart', event => {
    if (!phoneUI()) return;
    for (const touch of Array.from(event.changedTouches)) {
      const button = touch.target instanceof Element ? touch.target.closest<HTMLButtonElement>('button[data-skill]') : null;
      if (button && group.contains(button)) touches.set(touch.identifier, { button, x: touch.clientX, y: touch.clientY, moved: false });
    }
  }, { passive: true });
  group.addEventListener('touchmove', event => {
    for (const touch of Array.from(event.changedTouches)) {
      const start = touches.get(touch.identifier);
      if (start && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 12) start.moved = true;
    }
  }, { passive: true });
  group.addEventListener('touchend', event => {
    for (const touch of Array.from(event.changedTouches)) {
      const start = touches.get(touch.identifier);
      touches.delete(touch.identifier);
      if (!start || !event.cancelable) continue;
      event.preventDefault(); // Suppress zoom and the compatibility click together.
      const { button } = start;
      const releasedOver = document.elementFromPoint(touch.clientX, touch.clientY);
      // Primary attack is already handled by pointerdown/up, including held attacks.
      if (!start.moved && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) <= 12
        && button.contains(releasedOver) && !button.matches('.attack-skill')) button.click();
    }
  }, { passive: false });
  group.addEventListener('touchcancel', event => {
    for (const touch of Array.from(event.changedTouches)) touches.delete(touch.identifier);
  }, { passive: true });
  return () => touches.clear();
}

export const TOUCH_SKILL_NAMES = {
  attack: '主攻击 · 下排右（按住连击）',
  cleave: '技能 1 · 上排左',
  ward: '技能 2 · 上排中',
  nova: '技能 3 · 上排右',
  dash: '技能 4 · 下排左',
  bolt: '技能 5 · 下排中',
};
