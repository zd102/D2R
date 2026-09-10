import type { Game } from './game';
import { MOVEMENT_HINTS } from './controls';

/** Settings share the existing game actions; changing the presentation never duplicates state. */
export function settingsPanel(game: Game) {
  const volume = Math.round(game.audio.volume * 100);
  return `<div class="pause-layout"><section class="pause-journey"><div class="pause-intro"><img src="/sigil.svg" alt=""/><div><small>篝火尚温</small><h3>下一段旅程，整装待发</h3><p>你的冒险已暂停。</p></div></div>
    <button class="primary-button" data-action="close"><i data-lucide="play"></i>继续旅程</button>
    <div class="pause-actions"><button class="secondary-button" data-action="save"><i data-lucide="save"></i>保存旅程</button><button class="secondary-button" data-action="profiles"><i data-lucide="users"></i>保存并切换角色</button>${game.inCamp ? '' : '<button class="secondary-button" data-action="camp"><i data-lucide="compass"></i>返回营地</button>'}${!game.inCamp && game.hero.bossDefeated ? '<button class="secondary-button" data-panel="victory"><i data-lucide="crown"></i>通关结算</button>' : ''}</div>
    <div class="save-state"><i></i>${game.storageAvailable ? '本地自动存档已开启' : '本地存档不可用'}</div></section>
    <section class="pause-settings"><h3><i data-lucide="settings"></i>游戏设置</h3><div class="settings-row"><label for="movement-mode">移动方式</label><select id="movement-mode" aria-describedby="movement-hint"><option value="mouse" ${game.movementMode === 'mouse' ? 'selected' : ''}>鼠标移动</option><option value="wasd" ${game.movementMode === 'wasd' ? 'selected' : ''}>WASD 移动</option></select></div><p class="movement-hint" id="movement-hint">${MOVEMENT_HINTS[game.movementMode]}</p>
    <div class="settings-row"><label for="volume">音效音量</label><input id="volume" type="range" min="0" max="100" value="${volume}"/><span id="volume-value">${volume}%</span></div>
    <div class="settings-row"><label for="quality">画面质量</label><select id="quality"><option value="high" ${game.quality === 'high' ? 'selected' : ''}>精细</option><option value="low" ${game.quality === 'low' ? 'selected' : ''}>流畅</option></select></div><button class="secondary-button fullscreen-setting" aria-label="切换全屏" data-action="fullscreen"><i data-lucide="maximize"></i>切换全屏</button></section></div>`;
}
