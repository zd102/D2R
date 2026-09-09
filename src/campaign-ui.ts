import type { UI } from './ui';
import { ACTS, LEVELS, canEnterLevel, questComplete, questProgress, levelTuning, unlockedCampaignDifficulty } from './campaign';
import { difficultyNames } from './model';
import { bossDropLabel } from './boss-loot';

const icon = (name: string) => `<i data-lucide="${name}"></i>`;
export class CampaignScreen {
  private ui: UI;
  act = 0;
  difficulty = 0;
  replayConfirm = false;
  constructor(ui: UI) {
    this.ui = ui;
    ui.overlay.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button'); if (!button || button.disabled) return;
      if (button.dataset.campaignAct !== undefined) { this.act = Number(button.dataset.campaignAct); ui.renderPanel(); }
      if (button.dataset.campaignDifficulty !== undefined) {
        this.difficulty = Number(button.dataset.campaignDifficulty);
        this.act = Math.floor(Math.min(24, ui.game.hero.campaign.cleared[this.difficulty]) / 5); ui.renderPanel();
      }
      if (button.dataset.enterLevel !== undefined) {
        const index = Number(button.dataset.enterLevel), hero = ui.game.hero;
        if (!ui.game.inCamp && index === hero.campaign.current && this.difficulty === hero.difficultyLevel && !hero.bossDefeated && index >= hero.campaign.cleared[this.difficulty]) ui.closePanel();
        else ui.game.enterLevel(index, this.difficulty);
      }
      if (button.dataset.replayCurrent !== undefined && ui.panel === 'victory' && ui.game.hero.bossDefeated) {
        if (ui.game.loot.length && button.dataset.replayCurrent !== 'confirm') { this.replayConfirm = true; ui.renderPanel(); }
        else { this.replayConfirm = false; ui.game.enterLevel(ui.game.hero.campaign.current); }
      }
      if (button.dataset.cancelReplay !== undefined) { this.replayConfirm = false; ui.renderPanel(); }
    });
  }
  reset() {
    const game = this.ui.game;
    this.difficulty = game.hero.difficultyLevel;
    this.act = game.inCamp ? Math.floor(Math.min(24, game.hero.campaign.cleared[this.difficulty]) / 5) : game.level.act;
  }
  render() {
    const hero = this.ui.game.hero, campaign = hero.campaign, diff = this.difficulty, completed = campaign.cleared[diff], act = ACTS[this.act];
    return `<div class="campaign-toolbar"><div class="character-tabs" role="tablist" aria-label="战役难度">${difficultyNames.map((name, value) => `<button role="tab" aria-selected="${diff === value}" data-campaign-difficulty="${value}" ${value > unlockedCampaignDifficulty(campaign) ? `disabled title="通关${difficultyNames[value - 1]}全部25关后解锁"` : ''}>${icon(value > unlockedCampaignDifficulty(campaign) ? 'shield' : 'flame')}${name}</button>`).join('')}</div><span>已通关 <b>${completed}</b> / 25</span></div>
      <div class="campaign-layout"><nav class="campaign-acts" aria-label="章节">${ACTS.map((chapter, index) => `<button data-campaign-act="${index}" aria-pressed="${this.act === index}" style="--act-color:${chapter.color}">${icon(chapter.icon)}<span><strong>第 ${index + 1} 章</strong><small>${chapter.region}</small></span><b>${Math.min(5, Math.max(0, completed - index * 5))}/5</b></button>`).join('')}</nav>
      <section class="campaign-stages" style="--act-color:${act.color}"><div class="campaign-heading"><small>${act.english}</small><h3>${act.name}</h3></div><ol>${LEVELS.filter(level => level.act === this.act).map(level => {
        const unlocked = canEnterLevel(campaign, level.index, diff), cleared = level.index < completed, current = !this.ui.game.inCamp && !cleared && level.index === campaign.current && diff === hero.difficultyLevel && !hero.bossDefeated;
        return `<li><button class="campaign-level ${current ? 'current' : ''}" data-enter-level="${level.index}" ${unlocked ? '' : 'disabled'} aria-label="${level.name}，${current ? '继续本关' : cleared ? '重玩' : unlocked ? '进入关卡' : '未解锁'}"><span class="stage-number">${level.step + 1}</span><span class="stage-info"><strong>${level.name}</strong><small>${level.quest.name}</small><span>${level.actBoss ? '章节首领' : '守关首领'} · ${level.boss}</span><small>${bossDropLabel(level.index, diff)}</small></span><span class="stage-state"><small>Lv. ${levelTuning(level, diff).level}</small>${icon(current ? 'play' : cleared ? 'check' : unlocked ? 'chevron-right' : 'shield')}<span>${current ? '继续' : cleared ? '重玩' : unlocked ? '进入' : '未解锁'}</span></button></li>`;
      }).join('')}</ol></section></div>`;
  }
  quest() {
    const { game } = this.ui, { hero, level } = game, ready = questComplete(hero.campaign);
    return `<div class="campaign-quest-heading"><small>第 ${level.act + 1} 章 · 第 ${level.step + 1} 关</small><h3>${level.quest.name}</h3><span>${level.name}</span></div><p class="quest-story">${level.quest.description}</p><div class="quest-objectives"><div class="${ready ? 'complete' : ''}"><span class="objective-check">${ready ? icon('check') : icon(level.quest.kind === 'kill' ? 'swords' : 'gem')}</span><span>${level.quest.action}<b>${questProgress(hero.campaign)} / ${level.quest.count}</b></span></div><div class="${hero.bossDefeated ? 'complete' : ''}"><span class="objective-check">${icon(hero.bossDefeated ? 'check' : 'skull')}</span><span>击败${level.boss}<b>${hero.bossDefeated ? '已完成' : ready ? '已现身' : '未现身'}</b></span></div></div><div class="quest-rewards"><span>${icon('coins')}首次通关 ${100 + level.index * 35 + hero.difficultyLevel * 250} 金币</span><span>${icon('gem')}${level.actBoss ? '暗金装备掉落' : '装备与补给掉落'}</span></div><button class="secondary-button" data-panel="campaign">${icon('map')}关卡选择</button>${!game.inCamp && hero.bossDefeated ? `<button class="primary-button" data-panel="victory">${icon('chevron-right')}通关结算</button>` : ''}`;
  }
  victory() {
    const { hero, level } = this.ui.game, final = level.index === 24, canAdvance = !final || hero.difficultyLevel < 2 && hero.unlockedDifficulty > hero.difficultyLevel;
    const next = final ? `${difficultyNames[Math.min(2, hero.difficultyLevel + 1)]} · 邪恶洞窟` : `${LEVELS[level.index + 1].name}`;
    return `<div class="end-mark victory-mark">${icon(level.actBoss ? 'crown' : 'swords')}</div><div class="campaign-quest-heading"><small>${difficultyNames[hero.difficultyLevel]} · 第 ${level.act + 1} 章 · 第 ${level.step + 1} 关</small><h3>${level.name}</h3></div><p class="end-story">${level.boss}已被击败。</p><div class="end-stats"><span>战役进度 <b>${hero.campaign.cleared[hero.difficultyLevel]} / 25</b></span><span>${final ? hero.difficultyLevel === 2 ? '地狱战役全部完成' : `${difficultyNames[hero.difficultyLevel + 1]}难度已解锁` : level.actBoss ? `第 ${level.act + 2} 章已解锁` : '下一关已解锁'}</span></div><button class="primary-button" data-action="close">${icon('backpack')}收集战利品</button>${canAdvance ? `<button class="secondary-button" data-action="next">${icon('chevron-right')}${next}</button>` : ''}${this.replayConfirm ? `<div class="respec-confirm" role="alert"><strong>刷新本关？</strong><p>地上未拾取的战利品将消失。</p><button class="secondary-button" data-replay-current="confirm">${icon('rotate-ccw')}确认重刷</button><button class="text-button" data-cancel-replay>取消</button></div>` : `<button class="secondary-button" data-replay-current>${icon('rotate-ccw')}再刷本关</button>`}<button class="text-button" data-panel="campaign">${icon('map')}关卡选择</button>`;
  }
}
