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
  shop: ['heart-pulse', '恢复状态，补充旅途所需'],
  death: ['skull', '重整旗鼓，取回你的装备'],
};

/** A shared frame keeps headings, close controls and accessibility consistent. */
export function panelFrame(panel: string, title: [string, string], body: string) {
  const [glyph, description] = panelInfo[panel] ?? ['compass', ''];
  return `<section class="panel panel-${escape(panel)}" role="dialog" aria-modal="true" aria-label="${escape(title[0])}" aria-describedby="panel-description">
    <header class="panel-header"><div class="panel-title-group"><span class="panel-emblem" aria-hidden="true"><i data-lucide="${glyph}"></i></span><div class="panel-heading"><small>${escape(title[1])}</small><h2>${escape(title[0])}</h2></div></div><p class="panel-description" id="panel-description">${description}</p>${panel === 'death' ? '' : '<button class="panel-close" aria-label="关闭" data-tip="关闭 · Esc" data-action="close"><kbd>Esc</kbd><i data-lucide="x"></i></button>'}</header>
    <div class="panel-body">${body}</div></section>`;
}
