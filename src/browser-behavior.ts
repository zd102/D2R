import { phoneUI } from './mobile-ui';

const editable = 'input, textarea, select, label, [contenteditable]:not([contenteditable="false"])';
const touches = new Map<number, { target: Element; x: number; y: number; moved: boolean }>();
export const resetBrowserTouches = () => touches.clear();

// Install before the mode selector so delegated protection also covers newly
// rendered dialogs. Native editing and scrolling keep their normal event path.
export function protectBrowserBehavior(root: HTMLElement) {
  root.addEventListener('touchstart', event => {
    for (const touch of Array.from(event.changedTouches)) {
      const target = touch.target instanceof Element ? touch.target : null;
      if (target && !target.closest(editable)) {
        touches.set(touch.identifier, { target, x: touch.clientX, y: touch.clientY, moved: false });
      }
    }
  }, { passive: true });
  root.addEventListener('touchmove', event => {
    for (const touch of Array.from(event.changedTouches)) {
      const start = touches.get(touch.identifier);
      if (start && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 8) start.moved = true;
    }
  }, { passive: true });
  root.addEventListener('scroll', () => {
    for (const start of touches.values()) start.moved = true;
  }, true);
  root.addEventListener('touchend', event => {
    for (const touch of Array.from(event.changedTouches)) {
      const start = touches.get(touch.identifier);
      touches.delete(touch.identifier);
      if (!start || !event.cancelable) continue;
      event.preventDefault(); // Cancel native double-tap zoom and its compatibility click.
      const target = start.target.closest('button, a[href]') ?? start.target;
      if (start.moved || Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 8
        || !target.isConnected || !target.contains(document.elementFromPoint(touch.clientX, touch.clientY))) continue;
      // These controls already act on pointer events, including held attacks.
      if (target.closest('canvas, #joystick, #mobile-attack') || phoneUI() && target.matches('.attack-skill')) continue;
      if (target.matches(':disabled')) continue;
      // detail=1 preserves the inventory drag handler's post-drop click suppression.
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true,
        view: window, detail: 1, clientX: touch.clientX, clientY: touch.clientY }));
    }
  }, { passive: false });
  root.addEventListener('touchcancel', event => {
    for (const touch of Array.from(event.changedTouches)) touches.delete(touch.identifier);
  }, { passive: true });
  // Safari exposes pinch gestures separately from standard touch events.
  for (const type of ['gesturestart', 'gesturechange']) root.addEventListener(type, event => event.preventDefault(), { passive: false });
  root.addEventListener('contextmenu', event => {
    if (matchMedia('(any-pointer: coarse)').matches && event.target instanceof Element && !event.target.closest(editable)) event.preventDefault();
  });
  window.addEventListener('blur', resetBrowserTouches);
  window.addEventListener('resize', resetBrowserTouches);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetBrowserTouches(); });
}
