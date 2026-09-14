import { SaveStore, PROFILE_PREFIX, CHARACTER_FILE_FORMAT } from './saves';
import { SAVE_KEY, parseSave } from './model';
import { refreshSharedStorage, sharedRaw } from './shared-storage';

export function canonicalLocalUrl(href: string): URL {
  const url = new URL(href);
  if (url.hostname === 'localhost' || url.hostname === '[::1]') url.hostname = '127.0.0.1';
  url.searchParams.delete('recover-local');
  return url;
}

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Run before creating a game or starting autosave on the old origin.
export async function enterLocalOrigin(): Promise<boolean> {
  if (!['localhost', '[::1]'].includes(location.hostname)) return true;
  const target = canonicalLocalUrl(location.href);
  let hasData = true;
  try {
    hasData = Object.keys(localStorage).some(key => key.startsWith(PROFILE_PREFIX) || key === SAVE_KEY || key === 'eclipse-ii-shared-stash-v1');
    // IndexedDB may contain the only durable copy of a shared stash.
    await refreshSharedStorage();
    hasData ||= sharedRaw(localStorage) !== null;
  } catch { hasData = true; /* A read failure must not hide possibly recoverable saves. */ }
  if (!hasData && !new URL(location.href).searchParams.has('recover-local')) {
    location.replace(target.href); return false;
  }
  const root = document.getElementById('app')!;
  root.innerHTML = `<main class="mode-page"><section class="mode-card recovery-card" aria-labelledby="recovery-title">
    <h1 id="recovery-title">旧入口存档恢复</h1>
    <p>本机游戏入口已统一。这里的旧存档仍然保留，请导出需要的角色，再到统一入口导入；同名角色请改名导入。</p>
    <p>角色文件包含个人仓库，不包含共享仓库。完整备份另行保留共享仓库与原始数据，供恢复排查使用。</p>
    <div id="recovery-characters"></div><p id="recovery-error" role="alert" hidden></p>
    <button id="recovery-backup">下载旧入口完整备份</button>
    <a id="canonical-entry">前往统一入口</a>
  </section></main>`;
  (document.getElementById('canonical-entry') as HTMLAnchorElement).href = target.href;
  const error = (value: unknown) => {
    const element = document.getElementById('recovery-error')!;
    element.textContent = value instanceof Error ? value.message : '无法读取旧存档，原数据已保留。'; element.hidden = false;
  };
  try {
    const store = new SaveStore(localStorage);
    const profiles = store.list();
    const legacy = parseSave(localStorage.getItem(SAVE_KEY) ?? '');
    if (legacy && !localStorage.getItem('eclipse-ii-legacy-migrated')) {
      profiles.push({ version: 2, id: 'legacy-recovery', name: '灰烬行者', createdAt: 0, updatedAt: 0, revision: 1, hero: legacy });
    }
    const list = document.getElementById('recovery-characters')!;
    for (const profile of profiles) {
      const button = document.createElement('button');
      button.textContent = `导出 ${profile.name} · ${profile.hero.level} 级 · ${new Date(profile.updatedAt).toLocaleString('zh-CN')}`;
      button.onclick = () => { try {
        const exportedAt = new Date().toISOString();
        download(`eclipse-ii-${profile.name.replace(/[<>:"/\\|?*]/g, '_')}-${Date.now()}.json`, JSON.stringify({ format: CHARACTER_FILE_FORMAT, version: 1, exportedAt, profile }, null, 2));
      } catch (value) { error(value); } };
      list.append(button);
    }
    if (!profiles.length) list.textContent = '未找到可导出的多角色存档。';
    if (store.invalidCount || localStorage.getItem(SAVE_KEY)) {
      const note = document.createElement('p'); note.textContent = '检测到旧版或无法读取的数据，请下载完整备份保留。'; list.append(note);
    }
  } catch (value) { error(value); }
  document.getElementById('recovery-backup')!.onclick = async () => {
    try {
      await refreshSharedStorage();
      const entries = Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('eclipse-ii-')).map(key => [key, localStorage.getItem(key)]));
      let shared: string | null = null, sharedError: string | undefined;
      try { shared = sharedRaw(localStorage); } catch { sharedError = '共享数据库读取失败，此文件仅包含可读取的本地数据。'; error(new Error(sharedError)); }
      const backup = { format: 'eclipse-ii-origin-backup', version: 1, origin: location.origin, exportedAt: new Date().toISOString(), entries, shared, sharedError };
      download(`eclipse-ii-old-origin-${Date.now()}.json`, JSON.stringify(backup, null, 2));
    } catch (value) { error(value); }
  };
  return false;
}
