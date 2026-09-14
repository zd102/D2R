import { SaveStore, PROFILE_PREFIX, CHARACTER_FILE_FORMAT } from './saves';
import { SAVE_KEY, parseSave } from './model';
import { refreshSharedStorage, sharedRaw, finishOriginMigration } from './shared-storage';
import { captureLocalOrigin, mergeLocalOrigins, type OriginSnapshot } from './local-migration';

export function canonicalLocalUrl(href: string, origin?: string): URL {
  const url = new URL(href);
  if (origin) { const canonical = new URL(origin); url.protocol = canonical.protocol; url.host = canonical.host; }
  else if (url.hostname === 'localhost' || url.hostname === '[::1]') url.hostname = '127.0.0.1';
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
  const maintenance = new URL(location.href).searchParams.get('local-migration-task');
  if (maintenance) {
    const root = document.getElementById('app')!;
    root.innerHTML = '<main class="mode-page"><section class="mode-card"><h1>本地存档迁移</h1><p id="migration-status">正在备份此入口的角色与共享仓库…</p></section></main>';
    try {
      const response = await fetch('/__local-migration-job', { headers: { 'X-Migration-Token': maintenance } });
      if (!response.ok) throw new Error('迁移任务不存在或已过期。');
      const job = await response.json();
      if (!job.origins.includes(location.origin)) throw new Error('此地址不在迁移任务中。');
      const applying = new URL(location.href).searchParams.has('apply-migration');
      let payload: object;
      if (applying) {
        if (location.origin !== job.target || job.origins.some((origin: string) => origin !== job.target && !job.snapshots[origin])) throw new Error('旧入口备份尚未完整，请先完成所有入口备份。');
        const before = await fetch('/__local-migration-job', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Migration-Token': maintenance }, body: JSON.stringify({ kind: 'snapshot', snapshot: await captureLocalOrigin() }) });
        if (!before.ok) throw new Error('统一入口备份未能写入，已停止合并。');
        const report = await mergeLocalOrigins(Object.values(job.snapshots));
        payload = { kind: 'result', report, snapshot: await captureLocalOrigin() };
      } else payload = { kind: 'snapshot', snapshot: await captureLocalOrigin() };
      const saved = await fetch('/__local-migration-job', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Migration-Token': maintenance }, body: JSON.stringify(payload) });
      if (!saved.ok) throw new Error('迁移状态未能确认，请重试；已合并的旧存档不会重复导入。');
      document.getElementById('migration-status')!.textContent = applying ? '角色与共享仓库已合并，原始数据已备份。现在可以从统一入口继续游戏。' : '此入口的原始存档已备份，正在前往统一入口合并…';
      if (!applying) {
        const remaining = job.origins.find((origin: string) => origin !== job.target && origin !== location.origin && !job.snapshots[origin]);
        const next = new URL(remaining ?? job.target); next.searchParams.set('local-migration-task', maintenance);
        if (!remaining) next.searchParams.set('apply-migration', '1');
        location.replace(next.href);
      } else {
        const link = document.createElement('a'); link.href = '/?mode=local'; link.textContent = '进入统一的本地模式'; root.querySelector('section')!.append(link);
      }
    } catch (error) { document.getElementById('migration-status')!.textContent = error instanceof Error ? error.message : '迁移失败，原数据已保留。'; }
    return false;
  }
  let config: { canonicalOrigin?: string; origins?: string[] } = {};
  try { const response = await fetch('/__local-entry'); if (response.ok) config = await response.json(); } catch { /* Static deployments retain the loopback fallback. */ }
  const target = canonicalLocalUrl(location.href, config.canonicalOrigin);
  const query = new URL(location.href).searchParams;
  const receiving = query.get('migration-receive'), nonce = query.get('migration-nonce');
  if (receiving && nonce && target.origin === location.origin) {
    const root = document.getElementById('app')!;
    root.innerHTML = '<main class="mode-page"><section class="mode-card recovery-card"><h1>合并旧入口存档</h1><p id="migration-status">正在读取旧入口的角色与共享仓库…</p><a href="/?mode=local">返回本地模式</a></section></main>';
    const status = document.getElementById('migration-status')!;
    if (!window.opener || !config.origins?.includes(receiving)) { status.textContent = '来源未验证，请从旧入口的恢复页发起迁移。'; return false; }
    const sourceWindow = window.opener;
    const listener = async (event: MessageEvent) => {
      if (event.source !== sourceWindow || event.origin !== receiving || event.data?.nonce !== nonce || event.data?.kind !== 'local-origin-snapshot') return;
      window.removeEventListener('message', listener);
      try {
        const snapshot = event.data.snapshot as OriginSnapshot;
        if (snapshot.origin !== receiving) throw new Error('存档来源不匹配。');
        const report = await mergeLocalOrigins([snapshot]);
        status.textContent = 'alreadyMerged' in report ? '这份旧存档已经合并过，无需重复迁移。' : `合并完成：${report.characters.length} 个角色，共享仓库 ${report.sharedItems} 件物品；${report.overflowItems} 件超出容量的物品保存在“合并仓库余量”角色的个人仓库。原始存档已备份。`;
        sourceWindow.postMessage({ kind: 'local-origin-complete', nonce }, receiving);
      } catch (error) { status.textContent = error instanceof Error ? error.message : '合并失败，原始存档已保留。'; }
    };
    window.addEventListener('message', listener);
    sourceWindow.postMessage({ kind: 'local-origin-ready', nonce }, receiving);
    return false;
  }
  if (target.origin === location.origin) {
    try { await finishOriginMigration(); return true; }
    catch (error) {
      const root = document.getElementById('app')!;
      root.innerHTML = '<main class="mode-page"><section class="mode-card recovery-card"><h1>本地存档暂不可用</h1><p id="migration-error" role="alert"></p><p>迁移备份和恢复日志已保留。请关闭其他游戏页面，检查浏览器存储空间后刷新重试。</p><button id="migration-retry">刷新重试</button></section></main>';
      document.getElementById('migration-error')!.textContent = error instanceof Error ? error.message : '无法恢复本地存档。';
      document.getElementById('migration-retry')!.onclick = () => location.reload();
      return false;
    }
  }
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
    <p>本机游戏入口已统一。可直接迁移角色并合并共享仓库，原始数据会先备份；也可单独导出角色。</p>
    <p>角色文件包含个人仓库，不包含共享仓库。完整备份另行保留共享仓库与原始数据，供恢复排查使用。</p>
    <div id="recovery-characters"></div><p id="recovery-error" role="alert" hidden></p>
    <button id="recovery-backup">下载旧入口完整备份</button>
    <button id="recovery-merge">迁移角色并合并共享仓库</button>
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
  document.getElementById('recovery-merge')!.onclick = () => {
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
    const destination = new URL(target); destination.searchParams.set('migration-receive', location.origin); destination.searchParams.set('migration-nonce', nonce);
    const receiver = window.open(destination.href, '_blank');
    if (!receiver) { error(new Error('请允许打开迁移窗口，然后重试。')); return; }
    const listener = async (event: MessageEvent) => {
      if (event.source !== receiver || event.origin !== target.origin || event.data?.nonce !== nonce) return;
      if (event.data.kind === 'local-origin-ready') {
        try { receiver.postMessage({ kind: 'local-origin-snapshot', nonce, snapshot: await captureLocalOrigin() }, target.origin); } catch (value) { error(value); }
      } else if (event.data.kind === 'local-origin-complete') {
        window.removeEventListener('message', listener); error(new Error('迁移已完成，请在统一入口继续游戏。旧入口数据仍保留。'));
      }
    };
    window.addEventListener('message', listener);
  };
  return false;
}
