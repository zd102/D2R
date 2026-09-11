const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

const panelInfo: Record<string, [string, string]> = {
  inventory: ['backpack', '整理装备，准备下一场远征'],
  'shared-stash': ['archive', '在本地角色之间共享你的收藏'],
  character: ['user-round', '查看成长、抗性与战斗能力'],
  skills: ['book-open', '学习技能，配置你的战斗方式'],
  campaign: ['compass', '选择目的地，开启下一段旅程'],
  quest: ['scroll-text', '追踪目标，领取远征奖励'],
  map: ['map', '查看区域、目标与传送阵'],
  pause: ['settings', '调整设置，随时继续冒险'],
  'base-shop': ['hammer', '通关刷新货单，每件限购一次'],
  shop: ['heart-pulse', '恢复状态，补充旅途所需'],
  death: ['skull', '重整旗鼓，取回你的装备'],
  'mystery-portal': ['sparkles', '献上秘藏之物，开启未知之门'],
};

/** Include disclosures and links, but skip hidden controls and unchecked radio siblings. */
export function dialogControls(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, a[href], [tabindex]')]
    .filter(element => element.tabIndex >= 0 && !element.matches(':disabled, [type=hidden]') &&
      !element.closest('[inert]') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
    .filter(element => !element.matches('[role=tab][aria-selected=false]'))
    .filter(element => !(element instanceof HTMLInputElement) || element.type !== 'radio' || !element.name ||
      !root.querySelector<HTMLInputElement>(`input[type=radio][name="${CSS.escape(element.name)}"]:checked`) || element.checked);
}

export function cycleDialogFocus(root: HTMLElement, backwards: boolean) {
  const controls = dialogControls(root);
  if (!controls.length) return;
  const current = controls.indexOf(document.activeElement as HTMLElement);
  const next = current < 0 ? (backwards ? controls.length - 1 : 0) : (current + (backwards ? -1 : 1) + controls.length) % controls.length;
  controls[next].focus();
}

export function navigateDialogTabs(root: HTMLElement, event: KeyboardEvent) {
  if (event.defaultPrevented || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const group = (event.target as HTMLElement).closest<HTMLElement>('[role=tablist]');
  if (!group) return;
  const tabs = [...group.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(tab => tab.getClientRects().length);
  if (!tabs.length) return;
  const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault();
  const label = group.getAttribute('aria-label');
  tabs[next].click();
  const updated = [...root.querySelectorAll('[role=tablist]')].find(list => list.getAttribute('aria-label') === label);
  updated?.querySelector<HTMLButtonElement>('[aria-selected=true]')?.focus({ preventScroll: true });
}

/** Repainting an item or spending a point should not strand keyboard focus on the page. */
export function rememberDialogFocus(root: HTMLElement) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return () => {};
  const attributes = [...active.attributes].filter(attr => attr.name === 'id' || attr.name.startsWith('data-'));
  return () => {
    if (active.isConnected || root.hidden) return;
    const controls = dialogControls(root);
    const replacement = attributes.length ? controls.find(control => attributes.every(attr => control.getAttribute(attr.name) === attr.value)) : undefined;
    (replacement ?? controls.find(control => control.matches('[aria-pressed=true], [aria-selected=true]')) ?? controls[0])?.focus({ preventScroll: true });
  };
}

/** A shared frame keeps headings, close controls and accessibility consistent. */
export function panelFrame(panel: string, title: [string, string], body: string) {
  const [glyph, description] = panelInfo[panel] ?? ['compass', ''];
  return `<section class="panel panel-${escape(panel)}" role="dialog" aria-modal="true" aria-label="${escape(title[0])}" aria-describedby="panel-description">
    <header class="panel-header"><div class="panel-title-group"><span class="panel-emblem" aria-hidden="true"><i data-lucide="${glyph}"></i></span><div class="panel-heading"><small>${escape(title[1])}</small><h2>${escape(title[0])}</h2></div></div><p class="panel-description" id="panel-description">${description}</p>${panel === 'death' ? '' : '<button class="panel-close" aria-label="关闭" data-tip="关闭 · Esc" data-action="close"><kbd>Esc</kbd><i data-lucide="x"></i></button>'}</header>
    <div class="panel-body">${body}</div></section>`;
}
