import type { Game } from './game';
import type { UI } from './ui';
import { SaveError, NAME_LIMIT, CHARACTER_FILE_LIMIT, parseCharacterFile, type SavedProfile } from './saves';
import { LEVELS } from './campaign';
import { difficultyNames } from './model';
import { CLASSES, CLASS_IDS, isClassId } from './classes';
import { treeNames } from './paladin';

export type ProfilePanel = 'profiles' | 'new-profile' | 'rename-profile' | 'delete-profile' | 'import-profile' | 'save-conflict' | 'encyclopedia';
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const icon = (name: string) => `<i data-lucide="${name}"></i>`;
const date = (value: number) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

export class ProfileScreen {
  game: Game;
  ui: UI;
  selectedId?: string;
  editing?: SavedProfile;
  profiles: SavedProfile[] = [];
  importing?: SavedProfile;
  importRaw?: string;
  importFileName = '';
  importPending = false;
  importRequest = 0;
  constructor(game: Game, ui: UI) {
    this.game = game; this.ui = ui;
    ui.overlay.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button || button.disabled) return;
      try {
        if (button.dataset.profileId) {
          this.selectedId = button.dataset.profileId; this.render();
          ui.overlay.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
        }
        const profile = this.profiles.find(p => p.id === this.selectedId);
        switch (button.dataset.profileAction) {
          case 'new': this.editing = undefined; ui.openPanel('new-profile'); break;
          case 'back': this.editing = undefined; ui.openPanel('profiles'); break;
          case 'play': if (profile) game.startProfile(profile.id); break;
          case 'encyclopedia': ui.openPanel('encyclopedia'); break;
          case 'rename': if (profile) { this.editing = profile; ui.openPanel('rename-profile'); } break;
          case 'delete': if (profile) { this.editing = profile; ui.openPanel('delete-profile'); } break;
          case 'export': if (profile) this.exportCharacter(profile.id); break;
          case 'import':
            this.importRequest++; this.importPending = false; this.importing = undefined; this.importRaw = undefined; this.importFileName = '';
            ui.openPanel('import-profile'); this.chooseFile(); break;
          case 'choose-file': this.chooseFile(); break;
          case 'confirm-delete':
            if (this.editing && game.saves) {
              game.saves.delete(this.editing.id, this.editing.revision);
              game.storageAvailable = true;
              this.selectedId = undefined; this.editing = undefined; ui.openPanel('profiles');
            }
            break;
          case 'reload-profiles': game.returnToProfiles(true); break;
        }
      } catch (error) { this.error(error); }
    });
    ui.overlay.addEventListener('submit', event => {
      if (!(event.target instanceof HTMLFormElement) || event.target.id !== 'profile-form') return;
      event.preventDefault();
      const name = new FormData(event.target).get('name');
      if (typeof name !== 'string' || !game.saves) return;
      try {
        if (ui.panel === 'new-profile') {
          const classId = new FormData(event.target).get('class');
          const profile = game.saves.create(name, isClassId(classId) ? classId : 'paladin'); this.selectedId = profile.id;
          ui.openPanel('profiles'); game.startProfile(profile.id);
        } else if (ui.panel === 'rename-profile' && this.editing) {
          const profile = game.saves.rename(this.editing.id, name, this.editing.revision);
          this.selectedId = profile.id; this.editing = undefined; ui.openPanel('profiles');
        } else if (ui.panel === 'import-profile' && this.importRaw && !this.importPending) {
          const profile = game.saves.importCharacter(this.importRaw, name);
          this.selectedId = profile.id; this.importing = undefined; this.importRaw = undefined;
          game.storageAvailable = true; ui.openPanel('profiles'); ui.toast('角色已导入', profile.name);
        }
      } catch (error) { this.error(error); }
    });
    ui.overlay.addEventListener('change', event => {
      const input = event.target;
      if(input instanceof HTMLInputElement&&input.name==='class'&&isClassId(input.value))game.previewClass(input.value);
      if (input instanceof HTMLInputElement && input.id === 'profile-file' && input.files?.[0]) {
        const file = input.files[0]; input.value = ''; void this.readFile(file);
      }
    });
    ui.overlay.addEventListener('input', event => {
      if ((event.target as HTMLElement).id === 'profile-name') {
        const error = document.getElementById('profile-error'); if (error) error.hidden = true;
      }
    });
    ui.overlay.addEventListener('keydown', event => {
      if (ui.panel !== 'profiles' || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      if (!(event.target as HTMLElement).closest('[role="listbox"]')) return;
      event.preventDefault();
      const index = this.profiles.findIndex(p => p.id === this.selectedId);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? this.profiles.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + this.profiles.length) % this.profiles.length;
      this.selectedId = this.profiles[next]?.id; this.render();
      ui.overlay.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    });
  }
  chooseFile() { this.ui.overlay.querySelector<HTMLInputElement>('#profile-file')?.click(); }
  async readFile(file: File) {
    const request = ++this.importRequest;
    this.importing = undefined; this.importRaw = undefined; this.importFileName = file.name; this.importPending = true;
    this.render();
    const current = () => request === this.importRequest && this.ui.panel === 'import-profile';
    try {
      if (file.size > CHARACTER_FILE_LIMIT) throw new SaveError('存档文件不能超过 2 MB。', 'file');
      let raw: string;
      try { raw = await file.text(); }
      catch { throw new SaveError('无法读取所选文件，请重新选择。', 'file'); }
      if (!current()) return;
      this.importing = parseCharacterFile(raw); this.importRaw = raw; this.importPending = false;
      this.render(); this.ui.overlay.querySelector<HTMLInputElement>('#profile-name')?.focus({ preventScroll: true });
    } catch (error) {
      if (!current()) return;
      this.importPending = false; this.render(); this.error(error);
    } finally { if (request === this.importRequest) this.importPending = false; }
  }
  exportCharacter(id: string) {
    if (!this.game.saves) return;
    const { filename, content } = this.game.saves.exportCharacter(id);
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = filename;
    document.body.appendChild(link);
    try { link.click(); }
    finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  error(error: unknown) {
    const element = document.getElementById('profile-error');
    if (element) { element.textContent = error instanceof SaveError ? error.message : '本地存储不可用，操作未能完成。'; element.hidden = false; }
  }
  render() {
    const { game, ui } = this;
    ui.overlay.classList.add('profile-overlay');
    document.getElementById('app')!.classList.toggle('is-roster', !game.profile);
    let warning = game.profileNotice;
    try {
      this.profiles = game.saves?.list() ?? [];
      if (!this.selectedId) this.selectedId = game.saves?.lastId ?? undefined;
      if (!this.profiles.some(p => p.id === this.selectedId)) this.selectedId = this.profiles[0]?.id;
      if (game.saves?.invalidCount) warning = `${game.saves.invalidCount} 个存档无法读取，原数据已保留。`;
    } catch { this.profiles = []; warning = '本地存储不可用，暂时无法读取角色。'; }
    const selected = this.profiles.find(p => p.id === this.selectedId);
    if(ui.panel==='profiles'&&selected)game.previewClass(selected.hero.classId);
    if(ui.panel==='new-profile')game.previewClass('paladin');
    const error = `<p id="profile-error" class="profile-error" role="alert" hidden></p>`;
    let title = '选择角色', subtitle = 'YOUR CHARACTERS', body = '';
    if (ui.panel === 'profiles') {
      const rows = this.profiles.map(profile => {
        const h = profile.hero, active = profile.id === this.selectedId;
        return `<button class="profile-row ${active ? 'selected' : ''}" role="option" aria-selected="${active}" aria-label="${escape(profile.name)}" data-profile-id="${profile.id}">
          <span class="profile-emblem" style="color:${CLASSES[h.classId].color}">${icon(CLASSES[h.classId].icon)}</span><span class="profile-info"><strong>${escape(profile.name)}</strong><span>${CLASSES[h.classId].name} <b>Lv. ${h.level}</b><span>${difficultyNames[h.difficultyLevel]} · 第 ${LEVELS[h.campaign.current].act + 1} 章</span></span><small>${LEVELS[h.campaign.current].name} · ${h.campaign.cleared[h.difficultyLevel]} / 25<span>${date(profile.updatedAt)}</span></small></span>${icon(active ? 'check' : 'chevron-right')}
        </button>`;
      }).join('');
      body = `<div class="roster-label"><span>${this.profiles.length} 位冒险者</span><span class="roster-storage">本地存档<button aria-label="导入角色存档" data-tip="导入角色存档" data-profile-action="import" ${game.saves && game.storageAvailable ? '' : 'disabled'}>${icon('upload')}<span>导入</span></button></span></div>
        <div class="profile-list" role="listbox" aria-label="角色存档">${rows || `<div class="profile-empty">${icon('users')}<h3>尚无角色</h3><span>新的誓约，始于此刻。</span></div>`}</div>
        ${selected ? `<div class="profile-summary"><span>${icon('coins')}${selected.hero.gold.toLocaleString()}</span><span>${icon('skull')}${selected.hero.kills}</span><div class="profile-tools"><button aria-label="导出角色存档" data-tip="导出角色存档" data-profile-action="export">${icon('download')}<span>导出</span></button><button aria-label="重命名角色" data-tip="重命名角色" data-profile-action="rename">${icon('pencil')}<span>改名</span></button><button aria-label="删除角色" data-tip="删除角色" data-profile-action="delete">${icon('trash-2')}<span>删除</span></button></div></div>` : ''}
        ${error}<div class="profile-commands"><button class="primary-button" data-profile-action="play" ${selected ? '' : 'disabled'}>${icon('play')}进入旅程</button><button class="secondary-button" data-profile-action="new" ${game.saves && game.storageAvailable ? '' : 'disabled'}>${icon('user-plus')}新建角色</button></div>${warning ? `<p class="profile-notice">${escape(warning)}</p>` : ''}`;
    } else if (ui.panel === 'import-profile') {
      title = '导入角色'; subtitle = 'IMPORT CHARACTER';
      const h = this.importing?.hero;
      body = `<input id="profile-file" type="file" accept=".json,application/json" aria-label="角色存档文件" hidden/>
        <div class="profile-import-file" aria-busy="${this.importPending}">${icon('file-json')}<span>${this.importPending ? '正在读取存档…' : escape(this.importFileName || '尚未选择文件')}</span><button aria-label="选择存档文件" data-tip="选择存档文件" data-profile-action="choose-file" ${this.importPending ? 'disabled' : ''}>${icon('folder-open')}</button></div>
        ${h ? `<div class="profile-import-content"><div class="profile-import-preview"><div class="profile-class">${icon(CLASSES[h.classId].icon)}<div><h3>${CLASSES[h.classId].name}</h3><span>${difficultyNames[h.difficultyLevel]} · ${LEVELS[h.campaign.current].name}</span></div><b>Lv. ${h.level}</b></div>
        <div class="profile-import-summary"><span>${icon('coins')}${h.gold.toLocaleString()}</span><span>已通关 ${h.campaign.cleared[h.difficultyLevel]} / 25</span></div></div>
        <form id="profile-form"><label for="profile-name">角色名称</label><input id="profile-name" name="name" type="text" required maxlength="${NAME_LIMIT}" autocomplete="off" value="${escape(this.importing!.name)}" aria-describedby="profile-error"/>${error}<button class="primary-button" type="submit">${icon('user-plus')}导入为新角色</button></form></div>` : error}
        <button class="text-button" data-profile-action="back">${icon('arrow-left')}返回角色选择</button>`;
    } else if (ui.panel === 'new-profile' || ui.panel === 'rename-profile') {
      const creating = ui.panel === 'new-profile'; title = creating ? '新建角色' : '重命名角色'; subtitle = creating ? 'A NEW OATH' : 'RENAME CHARACTER';
      const selectedClass = CLASSES[this.editing?.hero.classId ?? 'paladin'];
      body = `${creating ? '' : `<div class="profile-class">${icon(selectedClass.icon)}<div><h3>${selectedClass.name}</h3><span>${selectedClass.trees.map(tree => treeNames[tree]).join(' / ')}</span></div><b>Lv. ${this.editing?.hero.level ?? 1}</b></div>`}
        <form id="profile-form">${creating ? `<fieldset class="class-picker"><legend>选择职业</legend>${CLASS_IDS.map(id => { const c=CLASSES[id]; return `<label class="class-option" style="--class-color:${c.color}"><input type="radio" name="class" value="${id}" ${id==='paladin'?'checked':''}/><span class="class-option-icon">${icon(c.icon)}</span><span><strong>${c.name}<small>${c.english}</small></strong><span>${c.trees.map(tree=>treeNames[tree]).join(' · ')}</span><small>${({paladin:'剑盾近战，灵气庇护',amazon:'弓箭与标枪，召唤女武神',sorceress:'冰火雷法术，传送与护盾'})[id]}</small></span></label>`; }).join('')}</fieldset>` : ''}<label for="profile-name">角色名称</label><input id="profile-name" name="name" type="text" required maxlength="${NAME_LIMIT}" autocomplete="off" value="${escape(creating ? '' : this.editing?.name ?? '')}" aria-describedby="profile-error"/>${error}<button class="primary-button" type="submit">${icon(creating ? 'user-plus' : 'check')}${creating ? '创建并进入' : '保存名称'}</button></form><button class="text-button" data-profile-action="back">${icon('arrow-left')}返回角色选择</button>`;
    } else if (ui.panel === 'delete-profile') {
      title = '删除角色'; subtitle = 'DELETE CHARACTER';
      body = `<div class="profile-delete-mark">${icon('trash-2')}</div><h3 class="profile-delete-name">${escape(this.editing?.name ?? '')}</h3><p class="profile-delete-copy">此角色的等级、装备与远征进度将永久删除。</p>${error}<button class="primary-button danger-button" data-profile-action="confirm-delete">${icon('trash-2')}确认删除</button><button class="secondary-button" data-profile-action="back">保留角色</button>`;
    } else {
      title = '存档已变更'; subtitle = 'SAVE UPDATED';
      body = `<div class="profile-delete-mark">${icon('save')}</div><p class="profile-delete-copy">当前角色存档已在其他窗口更新或删除。游戏已暂停，本页未保存的变更不会覆盖现有存档。</p>${error}<button class="primary-button" data-profile-action="reload-profiles">${icon('users')}返回角色选择</button>`;
    }
    ui.overlay.innerHTML = `<section class="profile-screen ${ui.panel === 'import-profile' ? 'profile-import' : ''}" role="dialog" aria-modal="true" aria-label="${title}"><header class="profile-header"><small>${subtitle}</small><h2>${title}</h2>${ui.panel === 'profiles' ? `<button class="profile-encyclopedia" data-profile-action="encyclopedia" aria-label="打开百科">${icon('book-open')}<span>百科</span></button>` : ''}</header>${body}<div class="profile-footer"><span></span><img src="/sigil.svg" alt=""/><span></span></div></section>`;
    ui.refreshIcons();
    ui.overlay.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
}
