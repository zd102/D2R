import { OnlineClient, OnlineError } from './online-client';
import { OnlineSaveStore } from './online-saves';
import './mode.css';

export let onlineStore: OnlineSaveStore | undefined;
export function returnToMode(mode?: 'local' | 'online') {
  try { if (mode) sessionStorage.setItem('eclipse-return-mode', mode); else sessionStorage.removeItem('eclipse-return-mode'); } catch { /* Mode selector is the fallback. */ }
  const url = new URL(location.href); if (mode !== 'local') url.searchParams.delete('mode'); location.assign(url.href);
}
export async function initializeMode() {
  let resumed: string | null = null;
  try { resumed = sessionStorage.getItem('eclipse-return-mode'); sessionStorage.removeItem('eclipse-return-mode'); } catch { /* Preferences are optional. */ }
  // An explicit local-mode URL also makes existing browser regressions select their storage mode.
  if (resumed === 'local' || new URL(location.href).searchParams.get('mode') === 'local') return;
  const root = document.getElementById('app')!;
  await new Promise<void>(resolve => {
    let client: OnlineClient | undefined, generation = 0;
    const shell = (title: string, content: string) => {
      root.innerHTML = `<main class="mode-page"><section class="mode-card" aria-labelledby="mode-title"><img src="/sigil.svg" alt=""/><small>ECLIPSE II</small><h1 id="mode-title">${title}</h1>${content}<p id="mode-error" role="alert" hidden></p></section></main>`;
    };
    const error = (value: unknown) => {
      const element = document.getElementById('mode-error');
      if (element) { element.textContent = value instanceof Error ? value.message : '在线服务暂时不可用。'; element.hidden = false; }
    };
    const finish = () => { root.innerHTML = ''; resolve(); };
    const choose = () => {
      generation++; client?.dispose(); client = undefined;
      shell('选择游戏模式', `<p>选择角色与旅程的保存方式</p><div class="mode-options"><button id="mode-local"><strong>本地模式</strong><span>无需账号 · 存档保存在本机浏览器</span></button><button id="mode-online"><strong>在线模式</strong><span>注册或登录 · 存档保存在服务器</span></button></div>`);
      document.getElementById('mode-local')!.onclick = finish;
      document.getElementById('mode-online')!.onclick = () => { void connect(); };
      document.getElementById('mode-local')!.focus();
    };
    const enter = async (active: OnlineClient, current: number) => {
      await active.acquire();
      const store = new OnlineSaveStore(active); await store.refresh();
      if (generation !== current) { active.dispose(); return; }
      onlineStore = store; finish();
    };
    const form = (registering = false, notice = '') => {
      const current = generation, active = client!;
      shell(registering ? '注册在线账号' : '登录在线模式', `<p id="auth-notice"></p><form id="online-auth"><label for="online-username">账号</label><input id="online-username" name="username" autocomplete="username" minlength="4" maxlength="32" pattern="[a-zA-Z0-9_]{4,32}" required/><small>4–32 位字母、数字或下划线</small><label for="online-password">密码</label><input id="online-password" name="password" type="password" autocomplete="${registering ? 'new-password' : 'current-password'}" minlength="15" maxlength="128" required/><small>15–128 个字符</small>${registering ? '<label for="online-confirm">确认密码</label><input id="online-confirm" name="confirm" type="password" autocomplete="new-password" required/>' : ''}<button class="primary-button" type="submit">${registering ? '注册账号' : '登录'}</button></form><button id="auth-toggle" class="secondary-button">${registering ? '已有账号，去登录' : '没有账号，去注册'}</button><button id="auth-back" class="text-button">返回模式选择</button>`);
      document.getElementById('auth-notice')!.textContent = notice || '同一账号只允许一次登录；异常关闭后最多等待 90 秒。';
      document.getElementById('auth-toggle')!.onclick = () => form(!registering);
      document.getElementById('auth-back')!.onclick = choose;
      document.getElementById('online-auth')!.onsubmit = async event => {
        event.preventDefault();
        const element = event.currentTarget as HTMLFormElement, values = new FormData(element);
        const username = String(values.get('username')), password = String(values.get('password'));
        if (registering && password !== values.get('confirm')) { error(new Error('两次输入的密码不一致。')); return; }
        element.querySelector<HTMLButtonElement>('button')!.disabled = true;
        document.getElementById('auth-toggle')!.setAttribute('disabled', '');
        try {
          if (registering) { await active.register(username, password); if (current === generation) form(false, '注册成功，请登录并创建或上传角色。'); }
          else { await active.login(username, password); if (current === generation) await enter(active, current); }
        } catch (failure) {
          if (current !== generation) return;
          // If the login response was lost but its Cookie arrived, resume that same login.
          if (!registering && failure instanceof OnlineError && failure.code === 'NETWORK') {
            try { await active.restore(); await enter(active, current); return; } catch { /* Show the original failure; no second login is created. */ }
          }
          error(failure);
        } finally {
          if (element.isConnected) { element.querySelector<HTMLButtonElement>('button')!.disabled = false; document.getElementById('auth-toggle')?.removeAttribute('disabled'); }
        }
      };
      document.getElementById('online-username')!.focus();
    };
    const connect = async () => {
      const current = ++generation; client = new OnlineClient(); const active = client;
      shell('连接在线服务', '<p>正在检查账号会话…</p><button id="auth-back" class="text-button">返回模式选择</button>');
      document.getElementById('auth-back')!.onclick = choose;
      try {
        await active.initialize();
        try { await active.restore(); } catch (failure) { if (!(failure instanceof OnlineError && failure.status === 401)) throw failure; }
        if (current !== generation) return;
        if (active.session) await enter(active, current); else form();
      } catch (failure) {
        if (current !== generation) return;
        if (active.session) {
          shell('在线会话暂不可用', '<p>可返回后重试，或明确退出此账号。</p><button id="auth-logout" class="secondary-button">退出账号</button><button id="auth-back" class="text-button">返回模式选择</button>');
          document.getElementById('auth-logout')!.onclick = async () => { try { await active.logout(); await connect(); } catch (e) { error(e); } };
          document.getElementById('auth-back')!.onclick = choose;
        }
        error(failure);
      }
    };
    if (resumed === 'online') void connect(); else choose();
  });
}
