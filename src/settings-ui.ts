import type { Game } from './game';
import { MOVEMENT_HINTS } from './controls';
import { PLAYER_COUNTS, playerLifeFactor, playerDamageFactor, playerDropExponent } from './player-count';

/** Settings share the existing game actions; changing the presentation never duplicates state. */
export function settingsPanel(game: Game) {
  const volume = Math.round(game.audio.volume * 100);
  const players = game.hero.playerCount;
  return `<div class="pause-layout"><section class="pause-journey"><div class="pause-intro"><img src="/sigil.svg" alt=""/><div><small>篝火尚温</small><h3>下一段旅程，整装待发</h3><p>你的冒险已暂停。</p></div></div>
    <button class="primary-button" data-action="close"><i data-lucide="play"></i>继续旅程</button>
    <div class="pause-actions"><button class="secondary-button" data-action="save"><i data-lucide="save"></i>保存旅程</button><button class="secondary-button" data-action="profiles"><i data-lucide="users"></i>保存并切换角色</button>${game.inCamp ? '' : '<button class="secondary-button" data-action="camp"><i data-lucide="compass"></i>返回营地</button>'}</div>
    <div class="save-state"><i></i>${game.storageAvailable ? '本地自动存档已开启 · 每 8 秒保存' : '本地存档不可用'}</div>
    <details class="control-guide"><summary>冒险者操作手册</summary><dl><dt>角色 / 技能 / 背包</dt><dd><kbd>C / T / I</kbd></dd><dt>任务 / 地图</dt><dd><kbd>J / Tab</kbd></dd><dt>生命 / 法力药剂</dt><dd><kbd>1 / 2</kbd></dd><dt>交互 / 切换武器</dt><dd><kbd>F / X</kbd></dd><dt>跑步与行走</dt><dd><kbd>V</kbd></dd><dt>返回冒险</dt><dd><kbd>Esc</kbd></dd></dl></details></section>
    <section class="pause-settings"><h3><i data-lucide="settings"></i>游戏设置</h3><div class="settings-row"><label for="movement-mode">移动方式</label><select id="movement-mode" aria-describedby="movement-hint"><option value="mouse" ${game.movementMode === 'mouse' ? 'selected' : ''}>鼠标移动</option><option value="wasd" ${game.movementMode === 'wasd' ? 'selected' : ''}>WASD 移动</option></select></div><p class="movement-hint" id="movement-hint">${MOVEMENT_HINTS[game.movementMode]}</p>
    <div class="settings-row"><label for="player-count">人数难度</label><select id="player-count" aria-describedby="player-count-hint">${PLAYER_COUNTS.map(count => `<option value="${count}" ${players === count ? 'selected' : ''}>${count}pp</option>`).join('')}</select></div>
    <p class="movement-hint" id="player-count-hint">生命 / 经验 ×${playerLifeFactor(players)} · 伤害 / 命中 ×${playerDamageFactor(players, game.hero.difficultyLevel)} · 掉落档位 ${playerDropExponent(players)} / 4<br>3、5、7pp 减少不掉落概率，不增加寻获魔法装备。怪物强度与经验在生成时固定；掉落按击杀或开箱时设置结算。每个角色独立保存。</p>
    <div class="settings-row"><label for="volume">总音量</label><input id="volume" type="range" min="0" max="100" value="${volume}"/><span id="volume-value">${volume}%</span></div>
    ${(['effects', 'ambience', 'ui'] as const).map(channel => { const value = Math.round(game.audio.channelVolume(channel) * 100); return `<div class="settings-row"><label for="audio-${channel}">${{ effects: '战斗与动作', ambience: '环境声音', ui: '物品与界面' }[channel]}</label><input id="audio-${channel}" data-audio-channel="${channel}" type="range" min="0" max="100" value="${value}"/><span id="audio-${channel}-value">${value}%</span></div>`; }).join('')}
    <div class="settings-row"><label for="quality">画面质量</label><select id="quality"><option value="auto" ${game.quality === 'auto' ? 'selected' : ''}>自动 · 优先 60 帧</option><option value="high" ${game.quality === 'high' ? 'selected' : ''}>精细</option><option value="low" ${game.quality === 'low' ? 'selected' : ''}>流畅</option></select></div><button class="secondary-button fullscreen-setting" aria-label="切换全屏" data-action="fullscreen"><i data-lucide="maximize"></i>切换全屏</button></section></div>`;
}
