// Keep this query in sync with mobile-ui.css. A small desktop window retains its UI.
export const PHONE_UI_QUERY = '(hover: none) and (pointer: coarse) and (max-width: 600px), (hover: none) and (pointer: coarse) and (max-height: 600px) and (max-width: 1100px)';
let phoneMedia: MediaQueryList | undefined;
export const phoneUI = () => (phoneMedia ??= matchMedia(PHONE_UI_QUERY)).matches;

export const TOUCH_SKILL_NAMES = {
  attack: '主攻击 · 下排右（按住连击）',
  cleave: '技能 1 · 上排左',
  ward: '技能 2 · 上排中',
  nova: '技能 3 · 上排右',
  dash: '技能 4 · 下排左',
  bolt: '技能 5 · 下排中',
};
