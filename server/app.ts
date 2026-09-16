import Fastify, { type FastifyRequest, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Database } from './database.ts';
import { ApiError, check, record, string, integer, validateHero, importProfile, heroItems, uniqueItems, validateStash } from './validation.ts';
import { hashPassword, verifyPassword } from './password.ts';
import { newHero } from '../src/model.ts';
import { isClassId } from '../src/classes.ts';
import { normalizeName, parseProfile, SaveError, CHARACTER_FILE_FORMAT, type SavedProfile, type SharedStash } from '../src/save-format.ts';
import { moveSharedItem, type SharedTransfer } from '../src/shared-stash.ts';
import { collectResources, withResources, updateResources } from '../src/shared-resources.ts';

type User = { id: string; username: string; normalized: string; password_hash: string };
type Session = { id: string; user_id: string; token_hash: string; expires_at: number; absolute_expires_at: number; writer_id: string | null; writer_epoch: number };
type Character = { id: string; user_id: string; profile: string; deleted_at: number | null };
type Options = { filename: string; now?: () => number; secureCookies?: boolean; origins?: string[]; rateLimit?: number;
  configure?: (app: FastifyInstance) => Promise<void> };
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const equal = (a: string, b: string) => { const left = Buffer.from(a), right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); };
export const SESSION_TIMEOUT = 90_000;
export const REMEMBER_TIMEOUT = 30 * 24 * 60 * 60 * 1000;
const ABSOLUTE_TIMEOUT = 24 * 60 * 60 * 1000;
const emptyStash = (): SharedStash => ({ version: 1, revision: 0, items: [], checkpoints: {} });

export async function createApp(options: Options) {
  const db = new Database(options.filename), now = options.now ?? Date.now;
  const app = Fastify({ bodyLimit: 2 * 1024 * 1024 + 65536, requestTimeout: 15000, logger: false });
  await app.register(cookie);
  const sessionCookie = options.secureCookies ? '__Host-eclipse-session' : 'eclipse-session';
  const rememberCookie = options.secureCookies ? '__Host-eclipse-remember' : 'eclipse-remember';
  const csrfCookie = options.secureCookies ? '__Host-eclipse-csrf' : 'eclipse-csrf';
  const cookieOptions = { path: '/', httpOnly: true, secure: !!options.secureCookies, sameSite: 'lax' as const };
  const body = (req: FastifyRequest) => record(req.body);
  const param = (req: FastifyRequest, key: string) => string(record(req.params)[key], 80);
  const header = (req: FastifyRequest, key: string) => typeof req.headers[key] === 'string' ? req.headers[key] as string : '';
  function session(req: FastifyRequest, allowExpired = false): Session {
    const token = req.cookies[sessionCookie];
    const value = token ? db.get<Session>('SELECT * FROM sessions WHERE token_hash=?', digest(token)) : undefined;
    check(value && (allowExpired || value.expires_at > now() && value.absolute_expires_at > now()), 'SESSION_EXPIRED', '登录已过期，请重新登录。', 401);
    const supplied = header(req, 'x-session-id');
    check(!supplied || supplied === value.id, 'SESSION_EXPIRED', '登录会话已变更，请重新登录。', 401);
    return value;
  }
  function writer(req: FastifyRequest, active: Session) {
    check(active.writer_id && header(req, 'x-page-id') === active.writer_id && header(req, 'x-writer-epoch') === String(active.writer_epoch),
      'WRITER_LOST', '该页面已失去操作权，请重新打开在线模式。', 409);
  }
  function rate(key: string, limit: number, interval = 60_000) {
    const hashed = digest(key);
    db.transaction(() => {
      const row = db.get<{ count: number; expires_at: number }>('SELECT * FROM rate_limits WHERE key=?', hashed);
      check(!row || row.expires_at <= now() || row.count < limit, 'RATE_LIMITED', '操作过于频繁，请稍后重试。', 429);
      db.run('INSERT INTO rate_limits VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count, expires_at=excluded.expires_at',
        hashed, row && row.expires_at > now() ? row.count + 1 : 1, row && row.expires_at > now() ? row.expires_at : now() + interval);
    });
  }
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
    if (req.method === 'GET' || req.method === 'HEAD') return;
    const origin = header(req, 'origin');
    let sameOrigin = false;
    try { const url = new URL(origin); sameOrigin = ['http:', 'https:'].includes(url.protocol) && url.host === new URL(`${url.protocol}//${req.headers.host}`).host && (!options.secureCookies || url.protocol === 'https:'); } catch { /* Invalid origins fail closed. */ }
    check(sameOrigin || options.origins?.includes(origin), 'CSRF', '请求来源无效，请刷新页面。', 403);
    check(header(req, 'content-type').split(';')[0] === 'application/json', 'CONTENT_TYPE', '仅支持 JSON 请求。', 415);
    const csrf = header(req, 'x-csrf-token'), expected = req.cookies[csrfCookie] ?? '';
    check(csrf.length === 64 && expected.length === 64 && equal(csrf, expected), 'CSRF', '页面验证已过期，请刷新后重试。', 403);
    rate(`request:${req.ip}`, options.rateLimit ?? 600);
  });
  app.setErrorHandler((error: Error & { statusCode?: number }, req, reply) => {
    const known = error instanceof ApiError || error instanceof SaveError;
    const status = error instanceof ApiError ? error.status : error instanceof SaveError ? 422 : error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    if (status === 429) reply.header('Retry-After', '60');
    reply.status(status).send({ code: error instanceof ApiError ? error.code : error instanceof SaveError ? 'INVALID_SAVE' : status === 413 ? 'FILE_TOO_LARGE' : status < 500 ? 'INVALID_REQUEST' : 'SERVER_ERROR',
      message: known ? error.message : status === 413 ? '请求或存档文件过大。' : status < 500 ? '请求内容无效。' : '服务暂时不可用，请稍后重试。', requestId: req.id });
  });
  app.get('/api/health', async () => ({ ok: !!db.get('SELECT 1') }));
  app.get('/api/v1/auth/csrf', async (req, reply) => {
    const existing = req.cookies[csrfCookie], token = existing?.length === 64 ? existing : randomBytes(32).toString('hex');
    reply.setCookie(csrfCookie, token, { ...cookieOptions, maxAge: 86400 }); return { token };
  });
  function credentials(req: FastifyRequest) {
    const input = body(req), username = string(input.username, 32).trim(), password = string(input.password, 256);
    check(/^[a-zA-Z0-9_]{4,32}$/.test(username), 'INVALID_USERNAME', '账号需为 4–32 位字母、数字或下划线。');
    check(Array.from(password).length >= 15 && Array.from(password).length <= 128, 'INVALID_PASSWORD', '密码需为 15–128 个字符。');
    rate(`auth-ip:${req.ip}`, options.rateLimit ?? 40);
    rate(`auth-user:${username.toLowerCase()}`, options.rateLimit ?? 30);
    return { username, normalized: username.toLowerCase(), password };
  }
  app.post('/api/v1/auth/register', async (req, reply) => {
    const c = credentials(req), passwordHash = await hashPassword(c.password);
    const result = db.transaction(() => {
      check(!db.get('SELECT id FROM users WHERE normalized=?', c.normalized), 'USERNAME_TAKEN', '该账号已注册。', 409);
      const id = randomUUID(); db.run('INSERT INTO users VALUES (?,?,?,?,?)', id, c.username, c.normalized, passwordHash, now());
      db.run('INSERT INTO stashes VALUES (?,?)', id, JSON.stringify(emptyStash())); return { id, username: c.username };
    });
    reply.status(201); return result;
  });
  function createSession(user: User, token: string) {
    const current = db.get<Session>('SELECT * FROM sessions WHERE user_id=?', user.id);
    check(!current || current.expires_at <= now() || current.absolute_expires_at <= now(), 'ACCOUNT_ALREADY_ONLINE', '该账号已登录，请先退出；异常关闭后最多等待 90 秒。', 409);
    db.run('DELETE FROM sessions WHERE user_id=?', user.id);
    const id = randomUUID(), expiresAt = now() + SESSION_TIMEOUT;
    db.run('INSERT INTO sessions (id,user_id,token_hash,expires_at,absolute_expires_at) VALUES (?,?,?,?,?)', id, user.id, digest(token), expiresAt, now() + ABSOLUTE_TIMEOUT);
    return { id, user: { id: user.id, username: user.username }, expiresAt, heartbeatMs: 15000 };
  }
  app.post('/api/v1/auth/login', async (req, reply) => {
    const c = credentials(req), user = db.get<User>('SELECT * FROM users WHERE normalized=?', c.normalized);
    check(await verifyPassword(c.password, user?.password_hash) && user, 'INVALID_CREDENTIALS', '账号或密码错误。', 401);
    const rememberToken = body(req).remember === true ? randomBytes(32).toString('hex') : undefined;
    const token = randomBytes(32).toString('hex');
    const result = db.transaction(() => {
      const result = createSession(user, token);
      const previous = req.cookies[rememberCookie];
      if (previous) db.run('DELETE FROM remembered_logins WHERE token_hash=?', digest(previous));
      if (rememberToken) db.run('INSERT INTO remembered_logins VALUES (?,?,?)', digest(rememberToken), user.id, now() + REMEMBER_TIMEOUT);
      return result;
    });
    if (rememberToken) reply.setCookie(rememberCookie, rememberToken, { ...cookieOptions, maxAge: REMEMBER_TIMEOUT / 1000 });
    else reply.clearCookie(rememberCookie, cookieOptions);
    reply.setCookie(sessionCookie, token, { ...cookieOptions, maxAge: 86400 }); return result;
  });
  app.post('/api/v1/auth/remember', async (req, reply) => {
    rate(`remember:${req.ip}`, options.rateLimit ?? 40);
    const token = randomBytes(32).toString('hex');
    const result = db.transaction(() => {
      const remembered = req.cookies[rememberCookie];
      const row = remembered ? db.get<{ user_id: string; expires_at: number }>('SELECT * FROM remembered_logins WHERE token_hash=?', digest(remembered)) : undefined;
      check(row && row.expires_at > now(), 'REMEMBER_EXPIRED', '记住的登录已失效，请输入账号密码。', 401);
      const user = db.get<User>('SELECT * FROM users WHERE id=?', row.user_id)!;
      // Use the same exclusive-session transaction as password login; never displace another login.
      return createSession(user, token);
    });
    reply.setCookie(sessionCookie, token, { ...cookieOptions, maxAge: 86400 }); return result;
  });
  app.get('/api/v1/auth/session', async req => {
    const active = session(req), user = db.get<User>('SELECT * FROM users WHERE id=?', active.user_id)!;
    return { id: active.id, user: { id: user.id, username: user.username }, expiresAt: active.expires_at, heartbeatMs: 15000 };
  });
  app.post('/api/v1/writer/acquire', async req => db.transaction(() => {
    const active = session(req), pageId = string(body(req).pageId, 80);
    check(!active.writer_id || active.writer_id === pageId, 'WRITER_BUSY', '账号已在其他页面打开，请先关闭该页面或等待 90 秒。', 409);
    const epoch = active.writer_epoch + 1;
    db.run('UPDATE sessions SET writer_id=?,writer_epoch=?,expires_at=? WHERE id=?', pageId, epoch, Math.min(now() + SESSION_TIMEOUT, active.absolute_expires_at), active.id);
    return { epoch, expiresAt: Math.min(now() + SESSION_TIMEOUT, active.absolute_expires_at) };
  }));
  app.post('/api/v1/writer/heartbeat', async req => db.transaction(() => {
    const active = session(req); writer(req, active);
    const expiresAt = Math.min(now() + SESSION_TIMEOUT, active.absolute_expires_at);
    db.run('UPDATE sessions SET expires_at=? WHERE id=?', expiresAt, active.id); return { expiresAt };
  }));
  app.post('/api/v1/writer/release', async req => db.transaction(() => {
    const active = session(req); writer(req, active);
    db.run('UPDATE sessions SET writer_id=NULL WHERE id=?', active.id); return { released: true };
  }));
  app.post('/api/v1/auth/logout', async (req, reply) => {
    db.transaction(() => {
      const active = session(req, true);
      // Require the exact session to protect a subsequent login from delayed logout.
      check(header(req, 'x-session-id') === active.id, 'SESSION_EXPIRED', '会话已变更。', 401);
      db.run('DELETE FROM remembered_logins WHERE user_id=?', active.user_id);
      db.run('UPDATE sessions SET expires_at=0,writer_id=NULL,writer_epoch=writer_epoch+1 WHERE id=?', active.id);
    });
    reply.clearCookie(rememberCookie, cookieOptions);
    reply.clearCookie(sessionCookie, cookieOptions); return { loggedOut: true };
  });
  function readCharacter(userId: string, id: string): SavedProfile {
    const row = db.get<Character>('SELECT * FROM characters WHERE user_id=? AND id=? AND deleted_at IS NULL', userId, id);
    check(row, 'CHARACTER_NOT_FOUND', '角色不存在或已删除。', 404); return withResources(parseProfile(row.profile)!, readStash(userId).resources);
  }
  function readStash(userId: string): SharedStash {
    if (!db.connection.isTransaction) return db.transaction(() => readStash(userId));
    const row = db.get<{ state: string }>('SELECT state FROM stashes WHERE user_id=?', userId);
    check(row, 'INVALID_SAVE', '账号仓库无法读取。'); const state = JSON.parse(row.state) as SharedStash;
    check([1, 2, 3].includes(state.version) && (state.version === 1 || state.resources !== undefined), 'INVALID_SAVE', '账号仓库无法读取。');
    check(state.version !== 3 || state.resources?.potions && state.resources?.potionMembers, 'INVALID_SAVE', '共享药水仓库无法读取。');
    validateStash(state.items);
    const profiles = db.all<Character>('SELECT * FROM characters WHERE user_id=? AND deleted_at IS NULL', userId).map(row => JSON.parse(row.profile) as SavedProfile);
    const resources = collectResources(state.resources, profiles);
    if (state.version !== 3 || JSON.stringify(resources) !== JSON.stringify(state.resources)) {
      state.version = 3; state.resources = resources;
      db.run('UPDATE stashes SET state=? WHERE user_id=?', JSON.stringify(state), userId);
    }
    return state;
  }
  function noDuplicateItems(userId: string, changed: SavedProfile, shared: SharedStash) {
    const items = [...heroItems(changed.hero), ...shared.items];
    for (const row of db.all<Character>('SELECT * FROM characters WHERE user_id=? AND id<>? AND deleted_at IS NULL', userId, changed.id)) items.push(...heroItems((JSON.parse(row.profile) as SavedProfile).hero));
    uniqueItems(items);
  }
  function updateProfile(userId: string, profile: SavedProfile) {
    db.run('UPDATE characters SET profile=?,name_key=? WHERE user_id=? AND id=? AND deleted_at IS NULL', JSON.stringify(profile), profile.name.toLowerCase(), userId, profile.id);
  }
  function checkName(userId: string, name: unknown, except = '') {
    const normalized = normalizeName(string(name, 128));
    check(!db.get('SELECT id FROM characters WHERE user_id=? AND name_key=? AND id<>? AND deleted_at IS NULL', userId, normalized.toLowerCase(), except), 'NAME_TAKEN', '已有同名角色，请使用其他名称。', 409);
    return normalized;
  }
  function revision(profile: SavedProfile, value: unknown) { check(profile.revision === integer(value, 1), 'SAVE_CONFLICT', '角色存档已更新，请重新载入。', 409); }
  function mutate(req: FastifyRequest, operation: (userId: string, data: Record<string, unknown>) => unknown) {
    return db.transaction(() => {
      const active = session(req), data = body(req), operationId = string(data.operationId, 80);
      const requestHash = digest(`${req.method}:${req.url}:${JSON.stringify(data)}`);
      const previous = db.get<{ request_hash: string; result: string }>('SELECT * FROM receipts WHERE session_id=? AND operation_id=?', active.id, operationId);
      if (previous) { check(previous.request_hash === requestHash, 'OPERATION_MISMATCH', '重试请求与原操作不一致。', 409); return JSON.parse(previous.result); }
      writer(req, active);
      const result = operation(active.user_id, data);
      db.run('INSERT INTO receipts VALUES (?,?,?,?,?)', active.id, operationId, requestHash, JSON.stringify(result), now()); return result;
    });
  }
  app.get('/api/v1/characters', async req => {
    const active = session(req);
    const shared = readStash(active.user_id);
    return db.all<Character>('SELECT * FROM characters WHERE user_id=? AND deleted_at IS NULL', active.user_id).map(row => withResources(parseProfile(row.profile)!, shared.resources)).sort((a: SavedProfile, b: SavedProfile) => b.updatedAt - a.updatedAt);
  });
  app.get('/api/v1/characters/:id', async req => readCharacter(session(req).user_id, param(req, 'id')));
  function createCharacter(userId: string, data: Record<string, unknown>, imported = false) {
    check(db.get<{ count: number }>('SELECT COUNT(*) AS count FROM characters WHERE user_id=? AND deleted_at IS NULL', userId)!.count < 20, 'CHARACTER_LIMIT', '每个账号最多创建 20 个角色。', 409);
    const source = imported ? importProfile(data.content) : undefined;
    check(imported || isClassId(data.classId), 'INVALID_CLASS', '请选择支持的职业。');
    const name = checkName(userId, data.name ?? source?.name), hero = source?.hero ?? newHero(data.classId as Parameters<typeof newHero>[0]);
    heroItems(hero).forEach(item => { item.id = randomUUID(); });
    const stash = readStash(userId);
    if (!imported && stash.resources?.potionMembers?.length) hero.potions.fill(0);
    const profile: SavedProfile = { version: 2, id: randomUUID(), name, createdAt: now(), updatedAt: now(), revision: 1, sharedRevision: stash.revision, hero };
    noDuplicateItems(userId, profile, stash);
    db.run('INSERT INTO characters (id,user_id,name_key,profile) VALUES (?,?,?,?)', profile.id, userId, name.toLowerCase(), JSON.stringify(profile));
    stash.resources = collectResources(stash.resources, [profile]);
    db.run('UPDATE stashes SET state=? WHERE user_id=?', JSON.stringify(stash), userId);
    return withResources(profile, stash.resources);
  }
  app.post('/api/v1/characters', async req => mutate(req, (userId, data) => createCharacter(userId, data)));
  // JSON encoding a file as a string can nearly double its wire size; the decoded file is still capped at 2 MiB.
  app.post('/api/v1/characters/import', { bodyLimit: 4 * 1024 * 1024 + 65536 }, async req => mutate(req, (userId, data) => createCharacter(userId, data, true)));
  app.get('/api/v1/characters/:id/export', async req => {
    const profile = readCharacter(session(req).user_id, param(req, 'id')), exportedAt = new Date(now()).toISOString();
    return { filename: `eclipse-ii-${profile.name.replace(/[<>:"/\\|?*]/g, '_')}-${exportedAt.replace(/[:.]/g, '-')}.json`,
      content: JSON.stringify({ format: CHARACTER_FILE_FORMAT, version: 1, exportedAt, profile }, null, 2) };
  });
  app.patch('/api/v1/characters/:id', async req => mutate(req, (userId, data) => {
    const profile = readCharacter(userId, param(req, 'id')); revision(profile, data.expectedRevision);
    profile.name = checkName(userId, data.name, profile.id); profile.revision++; profile.updatedAt = now(); updateProfile(userId, profile); return profile;
  }));
  app.delete('/api/v1/characters/:id', async req => mutate(req, (userId, data) => {
    const profile = readCharacter(userId, param(req, 'id')); revision(profile, data.expectedRevision);
    db.run('UPDATE characters SET deleted_at=? WHERE user_id=? AND id=?', now(), userId, profile.id); return { deleted: true };
  }));
  app.put('/api/v1/characters/:id/save', async req => mutate(req, (userId, data) => {
    const profile = readCharacter(userId, param(req, 'id')), stash = readStash(userId); revision(profile, data.expectedRevision);
    check(stash.revision === integer(data.expectedStashRevision), 'STASH_CONFLICT', '仓库存档已更新，请重新载入。', 409);
    const hero = validateHero(data.hero); check(hero.classId === profile.hero.classId, 'INVALID_SAVE', '角色职业不能更改。');
    check(data.expectedResourcesRevision !== undefined, 'CLIENT_UPDATE_REQUIRED', '请刷新页面以使用共享金币和符文。', 409);
    stash.resources = updateResources(stash.resources!, hero, integer(data.expectedResourcesRevision));
    profile.resourcesRevision = stash.resources.revision;
    profile.hero = hero; profile.revision++; profile.sharedRevision = stash.revision; profile.updatedAt = now();
    noDuplicateItems(userId, profile, stash); updateProfile(userId, profile);
    db.run('UPDATE stashes SET state=? WHERE user_id=?', JSON.stringify(stash), userId); return profile;
  }));
  app.get('/api/v1/stash', async req => readStash(session(req).user_id));
  app.post('/api/v1/stash/transfer', async req => mutate(req, (userId, data) => {
    const profile = readCharacter(userId, string(data.characterId, 80)), shared = readStash(userId);
    revision(profile, data.expectedRevision);
    check(shared.revision === integer(data.expectedStashRevision), 'STASH_CONFLICT', '共享仓库已更新，请重新载入。', 409);
    const transfer = record(data.transfer);
    check(['deposit', 'withdraw', 'equip', 'unequip', 'move', 'sort'].includes(String(transfer.direction)), 'INVALID_TRANSFER');
    try { moveSharedItem(profile.hero, shared.items, transfer as SharedTransfer); }
    catch (error) { throw new ApiError(422, 'INVALID_TRANSFER', error instanceof Error ? error.message : '无法转移物品。'); }
    profile.revision++; shared.revision++; profile.sharedRevision = shared.revision; profile.updatedAt = now();
    noDuplicateItems(userId, profile, shared); updateProfile(userId, profile);
    db.run('UPDATE stashes SET state=? WHERE user_id=?', JSON.stringify(shared), userId); return { profile, shared };
  }));
  app.get('/api/v1/operations/:id', async req => {
    const active = session(req), result = db.get<{ result: string }>('SELECT result FROM receipts WHERE session_id=? AND operation_id=?', active.id, param(req, 'id'));
    check(result, 'OPERATION_NOT_FOUND', '操作尚未确认。', 404); return JSON.parse(result.result);
  });
  const cleanup = setInterval(() => db.transaction(() => {
    db.run('UPDATE sessions SET writer_id=NULL WHERE expires_at<=? OR absolute_expires_at<=?', now(), now());
    db.run('DELETE FROM receipts WHERE created_at<?', now() - ABSOLUTE_TIMEOUT);
    db.run('DELETE FROM rate_limits WHERE expires_at<=?', now());
    db.run('DELETE FROM remembered_logins WHERE expires_at<=?', now());
    db.run('DELETE FROM characters WHERE deleted_at IS NOT NULL AND deleted_at<?', now() - 7 * ABSOLUTE_TIMEOUT);
  }), 5000);
  cleanup.unref();
  app.addHook('onClose', async () => { clearInterval(cleanup); db.close(); });
  try { await options.configure?.(app); }
  catch (error) { await app.close(); throw error; }
  return app;
}
