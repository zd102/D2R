export type OnlineSession = { id: string; user: { id: string; username: string }; expiresAt: number; heartbeatMs: number };
export const onlineId = (): string => crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
export class OnlineError extends Error {
  status: number; code: string;
  constructor(message: string, code: string, status = 0) { super(message); this.status = status; this.code = code; }
  get expired() { return this.status === 401 || ['WRITER_LOST', 'WRITER_BUSY', 'SAVE_CONFLICT', 'STASH_CONFLICT'].includes(this.code); }
}
export class OnlineClient {
  session?: OnlineSession;
  pageId = onlineId();
  epoch = 0;
  csrf = '';
  disposed = false;
  onStatus?: (state: 'offline' | 'expired' | 'ready', message?: string) => void;
  private requests = new Set<AbortController>();
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private heartbeatPending = false;
  private terminal?: OnlineError;
  private releaseLock?: () => void;
  async request<T>(path: string, method = 'GET', data?: unknown, keepalive = false): Promise<T> {
    if (this.disposed) throw new OnlineError('请求已取消。', 'CANCELLED');
    const controller = new AbortController(); this.requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/v1' + path, { method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal, keepalive,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf, 'X-Session-ID': this.session?.id ?? '', 'X-Page-ID': this.pageId, 'X-Writer-Epoch': String(this.epoch) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
      const value = await response.json().catch(() => null);
      if (response.ok && value === null) throw new OnlineError('在线服务未启动或连接配置无效，请启动在线服务后重试。', 'SERVER_ERROR', 503);
      if (!response.ok) throw new OnlineError(value?.message ?? '在线服务暂时不可用。', value?.code ?? 'SERVER_ERROR', response.status);
      return value as T;
    } catch (error) {
      if (error instanceof OnlineError) throw error;
      throw new OnlineError(this.disposed ? '请求已取消。' : '连接中断，游戏已暂停，正在重连…', this.disposed ? 'CANCELLED' : 'NETWORK');
    } finally { clearTimeout(timeout); this.requests.delete(controller); }
  }
  async initialize() { this.csrf = (await this.request<{ token: string }>('/auth/csrf')).token; }
  async restore() { this.session = await this.request<OnlineSession>('/auth/session'); return this.session; }
  async restoreRemembered() { this.session = await this.request<OnlineSession>('/auth/remember', 'POST', {}); return this.session; }
  async login(username: string, password: string, remember = false) { this.session = await this.request<OnlineSession>('/auth/login', 'POST', { username, password, remember }); return this.session; }
  async register(username: string, password: string) { return this.request('/auth/register', 'POST', { username, password }); }
  async acquire() {
    const key = `eclipse-online-page:${this.session!.id}`;
    // Web Locks distinguish a duplicated tab even when sessionStorage is copied.
    if (navigator.locks) {
      await new Promise<void>((resolve, reject) => {
        void navigator.locks.request(key, { ifAvailable: true }, async lock => {
          if (!lock) { reject(new OnlineError('账号已在其他页面打开。', 'WRITER_BUSY', 409)); return; }
          await new Promise<void>(release => { this.releaseLock = release; resolve(); });
        }).catch(reject);
      });
    }
    try {
      const remembered = navigator.locks ? sessionStorage.getItem(key) : null; if (remembered) this.pageId = remembered;
      else sessionStorage.setItem(key, this.pageId);
    } catch { /* A page ID can remain in memory if browser settings storage is unavailable. */ }
    try { this.epoch = (await this.request<{ epoch: number }>('/writer/acquire', 'POST', { pageId: this.pageId })).epoch; }
    catch (error) { this.releaseLock?.(); this.releaseLock = undefined; throw error; }
  }
  startHeartbeat() {
    const heartbeat = async () => {
      if (this.heartbeatPending || this.disposed || this.terminal) return;
      this.heartbeatPending = true;
      try {
        const result = await this.request<{ expiresAt: number }>('/writer/heartbeat', 'POST', {});
        if (this.session) this.session.expiresAt = result.expiresAt;
        this.onStatus?.('ready');
      } catch (error) { this.report(error); }
      finally { this.heartbeatPending = false; }
    };
    this.heartbeatTimer = setInterval(() => void heartbeat(), 15000);
    window.addEventListener('online', this.onlineListener = () => { void heartbeat(); });
    window.addEventListener('offline', this.offlineListener = () => this.onStatus?.('offline'));
    document.addEventListener('visibilitychange', this.visibleListener = () => { if (!document.hidden) { this.onStatus?.('offline', '正在检查在线会话…'); void heartbeat(); } });
    window.addEventListener('pageshow', this.showListener = event => { if (event.persisted) { this.onStatus?.('offline', '正在检查在线会话…'); void heartbeat(); } });
    window.addEventListener('pagehide', this.hideListener = () => { void this.request('/writer/release', 'POST', {}, true).catch(() => {}); });
  }
  private onlineListener?: () => void;
  private offlineListener?: () => void;
  private visibleListener?: () => void;
  private showListener?: (event: PageTransitionEvent) => void;
  private hideListener?: () => void;
  report(error: unknown) {
    const failure = error instanceof OnlineError ? error : new OnlineError('在线服务暂时不可用。', 'NETWORK');
    if (failure.expired || failure.status === 403) {
      this.terminal = failure; this.onStatus?.('expired', failure.message);
    } else if (!this.disposed) this.onStatus?.('offline', failure.message);
  }
  async reliable<T>(path: string, method: string, data: unknown): Promise<T> {
    // Keep the exact operation ID and body while a response is unknown.
    while (!this.disposed && !this.terminal) {
      try { return await this.request<T>(path, method, data); }
      catch (error) {
        if (error instanceof OnlineError && error.status >= 400 && error.status < 500 && error.status !== 429 && !error.expired && error.status !== 403) throw error;
        this.report(error);
        if (this.terminal || this.disposed) throw error;
        await new Promise(resolve => setTimeout(resolve, error instanceof OnlineError && error.status === 429 ? 5000 : 2000));
      }
    }
    throw this.terminal ?? new OnlineError('请求已取消。', 'CANCELLED');
  }
  async logout() { await this.request('/auth/logout', 'POST', {}); this.dispose(); }
  dispose() {
    this.disposed = true; clearInterval(this.heartbeatTimer); this.requests.forEach(request => request.abort()); this.releaseLock?.();
    if (this.onlineListener) window.removeEventListener('online', this.onlineListener);
    if (this.offlineListener) window.removeEventListener('offline', this.offlineListener);
    if (this.visibleListener) document.removeEventListener('visibilitychange', this.visibleListener);
    if (this.showListener) window.removeEventListener('pageshow', this.showListener);
    if (this.hideListener) window.removeEventListener('pagehide', this.hideListener);
  }
}
