import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp, SESSION_TIMEOUT, REMEMBER_TIMEOUT } from '../app.ts';
import { backupDatabase } from '../backup.ts';
import { newHero, gainXp, learnSkill } from '../../src/model.ts';
import { skillsForClass, EXPERIENCE } from '../../src/paladin.ts';
import { BASES, makeItem } from '../../src/items.ts';
import { CHARACTER_FILE_FORMAT } from '../../src/save-format.ts';

const password = 'online-test-password-123';
type App = Awaited<ReturnType<typeof createApp>>;
async function client(app: App) {
  const cookies = new Map<string, string>(), csrfResponse = await app.inject('/api/v1/auth/csrf');
  csrfResponse.cookies.forEach(cookie => cookies.set(cookie.name, cookie.value));
  const state = { csrf: csrfResponse.json().token as string, id: '', page: randomUUID(), epoch: 0 };
  const request = async (path: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET', data?: object) => {
    const response = await app.inject({ url: '/api/v1' + path, method, headers: { origin: 'http://localhost:80', host: 'localhost:80', 'content-type': 'application/json',
      'x-csrf-token': state.csrf, 'x-session-id': state.id, 'x-page-id': state.page, 'x-writer-epoch': String(state.epoch) },
      cookies: Object.fromEntries(cookies), ...(data === undefined ? {} : { payload: data }) });
    response.cookies.forEach(cookie => cookie.value ? cookies.set(cookie.name, cookie.value) : cookies.delete(cookie.name)); return response;
  };
  const login = async (username: string) => {
    const response = await request('/auth/login', 'POST', { username, password });
    if (response.statusCode === 200) state.id = response.json().id; return response;
  };
  const acquire = async () => {
    const response = await request('/writer/acquire', 'POST', { pageId: state.page });
    if (response.statusCode === 200) state.epoch = response.json().epoch; return response;
  };
  return { request, login, acquire, state, cookies };
}
async function fixture(t: test.TestContext, filename = ':memory:') {
  let time = Date.now();
  const app = await createApp({ filename, now: () => time, rateLimit: 10000 }); t.after(() => app.close());
  const a = await client(app), b = await client(app);
  for (const [c, username] of [[a, 'account_a'], [b, 'account_b']] as const) {
    assert.equal((await c.request('/auth/register', 'POST', { username, password })).statusCode, 201);
    assert.equal((await c.login(username)).statusCode, 200); assert.equal((await c.acquire()).statusCode, 200);
  }
  const create = async (name = '测试角色', c = a) => {
    const response = await c.request('/characters', 'POST', { name, classId: 'paladin', operationId: randomUUID() });
    assert.equal(response.statusCode, 200, response.body); return response.json();
  };
  return { app, a, b, create, advance: (ms: number) => { time += ms; } };
}

test('four restored classes retain skills, offhand weapons and companions through authenticated saves',async t=>{
  const {a}=await fixture(t);
  for(const classId of ['necromancer','barbarian','druid','assassin'] as const){
    const created=await a.request('/characters','POST',{name:classId,classId,operationId:randomUUID()});assert.equal(created.statusCode,200,created.body);
    const profile=created.json();gainXp(profile.hero,EXPERIENCE[79]);for(const skill of skillsForClass(classId))assert.ok(learnSkill(profile.hero,skill.id));
    if(classId==='barbarian'||classId==='assassin')profile.hero.equipment.shield=makeItem(BASES.find(b=>b.baseCode===(classId==='barbarian'?'hax':'ktr'))!);
    if(classId==='necromancer')profile.hero.companions=[{id:'ironGolem',rank:1,hp:.7,life:3000,metal:makeItem(BASES.find(b=>b.baseCode==='hax')!)}];
    if(classId==='druid')profile.hero.companions=[{id:'summonSpiritWolf',rank:1,hp:.8,life:3000}];
    const saved=await a.request(`/characters/${profile.id}/save`,'PUT',{hero:profile.hero,expectedRevision:profile.revision,expectedStashRevision:0,expectedResourcesRevision:profile.resourcesRevision,operationId:randomUUID()});assert.equal(saved.statusCode,200,saved.body);
    const read=(await a.request(`/characters/${profile.id}`)).json();assert.equal(read.hero.classId,classId);assert.equal(Object.values(read.hero.skills).filter(value=>Number(value)>0).length,30);
    assert.equal(read.hero.equipment.shield?.id,profile.hero.equipment.shield?.id);assert.equal(read.hero.companions?.[0]?.id,profile.hero.companions?.[0]?.id);
    if(classId==='necromancer')assert.equal(read.hero.companions[0].metal.id,profile.hero.companions[0].metal.id);
  }
});

test('existing account balances migrate without truncation or rewriting source characters', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'd2r-resources-')), filename = join(directory, 'account.sqlite');
  const { a, create } = await fixture(t, filename);
  t.after(() => { for (const suffix of ['', '-wal', '-shm']) rmSync(filename + suffix, { force: true }); rmdirSync(directory); });
  const first = await create('旧甲'), second = await create('旧乙');
  first.hero.gold = 10000000; first.hero.runes = Array(1000).fill('el'); second.hero.gold = 200; second.hero.runes = ['tir'];
  for (const profile of [first, second]) {
    profile.hero.potions = [6, 4, 1, 2, 3]; delete profile.hero.potionsShared; delete profile.hero.potionBindings; delete profile.hero.potionRecovery;
  }
  const db = new DatabaseSync(filename);
  try {
    for (const profile of [first, second]) db.prepare('UPDATE characters SET profile=? WHERE id=?').run(JSON.stringify(profile), profile.id);
    db.prepare('UPDATE stashes SET state=?').run(JSON.stringify({ version: 1, revision: 0, items: [], checkpoints: {} }));
    const shared = (await a.request('/stash')).json();
    assert.equal(shared.resources.gold, 10000200); assert.equal(shared.resources.runes.length, 1001);
    assert.deepEqual(shared.resources.potions, [12, 8, 2, 4, 6, ...Array(10).fill(0)]);
    assert.deepEqual((await a.request('/stash')).json(), shared);
    assert.equal((db.prepare('SELECT profile FROM characters WHERE id=?').get(first.id) as { profile: string }).profile, JSON.stringify(first));
    const profile = (await a.request(`/characters/${second.id}`)).json();
    assert.deepEqual(profile.hero.potionBindings, [0, 1, 13, 14]); assert.deepEqual(profile.hero.potionRecovery, []);
    const saved = await a.request(`/characters/${profile.id}/save`, 'PUT', { hero: profile.hero, expectedRevision: profile.revision, expectedStashRevision: 0, expectedResourcesRevision: profile.resourcesRevision, operationId: randomUUID() });
    assert.equal(saved.statusCode, 200, saved.body); assert.equal(saved.json().hero.gold, 10000200); assert.equal(saved.json().hero.runes.length, 1001);
  } finally { db.close(); }
});

test('gold and runes belong to the account, reject stale snapshots and survive character deletion', async t => {
  const { a, b, create } = await fixture(t);
  let first = await create('第一位'); const second = await create('第二位'), other = await create('其他账号', b);
  first = (await a.request(`/characters/${first.id}`)).json();
  const save = (profile: typeof first, gold: number, runes: string[]) => a.request(`/characters/${profile.id}/save`, 'PUT', {
    hero: { ...profile.hero, gold, runes }, expectedRevision: profile.revision, expectedStashRevision: 0,
    expectedResourcesRevision: profile.resourcesRevision, operationId: randomUUID(),
  });
  const response = await save(first, 12345, ['el', 'tir', 'el']); assert.equal(response.statusCode, 200, response.body);
  const fresh = (await a.request(`/characters/${second.id}`)).json();
  assert.equal(fresh.hero.gold, 12345); assert.deepEqual(fresh.hero.runes, ['el', 'tir', 'el']);
  assert.equal((await save(second, 99999, [])).statusCode, 422);
  const spent = await save(fresh, 12000, ['el', 'el']); assert.equal(spent.statusCode, 200, spent.body);
  assert.equal((await b.request(`/characters/${other.id}`)).json().hero.gold, 0);
  assert.deepEqual((await b.request('/stash')).json().resources.runes, []);
  for (const profile of [response.json(), spent.json()]) assert.equal((await a.request(`/characters/${profile.id}`, 'DELETE', { expectedRevision: profile.revision, operationId: randomUUID() })).statusCode, 200);
  const next = await create('新的角色'); assert.equal(next.hero.gold, 12000); assert.deepEqual(next.hero.runes, ['el', 'el']);
});

test('account potion inventory is shared, isolated, retry-safe and preserved after all characters are deleted', async t => {
  const { a, b, create } = await fixture(t);
  let first = await create('药水甲'); const second = await create('药水乙'), other = await create('其他账号药水', b);
  first = (await a.request(`/characters/${first.id}`)).json();
  assert.equal(first.hero.potions[0], 6); // New roles cannot farm starter potions.
  first.hero.potions[0]--; first.hero.potions[11] = 1200; first.hero.potions[14] = 2;
  first.hero.potionBindings = [11, 12, 13, 14];
  const body = { hero: first.hero, expectedRevision: first.revision, expectedStashRevision: 0, expectedResourcesRevision: first.resourcesRevision, operationId: randomUUID() };
  const response = await a.request(`/characters/${first.id}/save`, 'PUT', body);
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual((await a.request(`/characters/${first.id}/save`, 'PUT', body)).json(), response.json());
  const fresh = (await a.request(`/characters/${second.id}`)).json();
  assert.deepEqual(fresh.hero.potions, first.hero.potions); assert.deepEqual(fresh.hero.potionBindings, [0, 1, 13, 14]);
  const stale = await a.request(`/characters/${second.id}/save`, 'PUT', { ...body, hero: second.hero, expectedRevision: second.revision, expectedResourcesRevision: second.resourcesRevision, operationId: randomUUID() });
  assert.notEqual(stale.statusCode, 200);
  assert.equal((await b.request(`/characters/${other.id}`)).json().hero.potions[14], 0);
  for (const profile of [response.json(), fresh]) assert.equal((await a.request(`/characters/${profile.id}`, 'DELETE', { expectedRevision: profile.revision, operationId: randomUUID() })).statusCode, 200);
  const next = await create('药水继承'); assert.equal(next.hero.potions[11], 1200); assert.equal(next.hero.potions[14], 2); assert.equal(next.hero.potions[0], 5);
});

test('remembered login restores saves after expiry, remains exclusive and is revoked by logout', async t => {
  const { app, a, create, advance } = await fixture(t), profile = await create();
  await a.request('/auth/logout', 'POST', {});
  const login = await a.request('/auth/login', 'POST', { username: 'account_a', password, remember: true });
  a.state.id = login.json().id;
  const remembered = a.cookies.get('eclipse-remember')!;
  assert.match(remembered, /^[a-f0-9]{64}$/);
  const cookie = login.cookies.find(c => c.name === 'eclipse-remember')!;
  assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, 'Lax');
  assert.equal(Number(cookie.maxAge), REMEMBER_TIMEOUT / 1000);
  const other = await client(app); other.cookies.set('eclipse-remember', remembered);
  assert.equal((await other.request('/auth/remember', 'POST', {})).statusCode, 409);
  advance(SESSION_TIMEOUT);
  const results = await Promise.all(Array.from({ length: 8 }, () => other.request('/auth/remember', 'POST', {})));
  assert.equal(results.filter(r => r.statusCode === 200).length, 1);
  assert.equal(results.filter(r => r.statusCode === 409).length, 7);
  other.state.id = results.find(r => r.statusCode === 200)!.json().id;
  assert.notEqual(other.state.id, a.state.id);
  assert.equal((await other.request('/characters')).json()[0].id, profile.id);
  assert.equal((await a.request('/auth/logout', 'POST', {})).statusCode, 401);
  assert.equal((await other.request('/auth/logout', 'POST', {})).statusCode, 200);
  a.cookies.set('eclipse-remember', remembered);
  assert.equal((await a.request('/auth/remember', 'POST', {})).statusCode, 401);
});

test('remembering is opt-in, unchecked login revokes old token and expiry is fixed at 30 days', async t => {
  const { a, advance } = await fixture(t);
  assert.equal(a.cookies.has('eclipse-remember'), false);
  assert.equal((await a.request('/auth/remember', 'POST', {})).statusCode, 401);
  advance(SESSION_TIMEOUT);
  await a.request('/auth/login', 'POST', { username: 'account_a', password, remember: true });
  const old = a.cookies.get('eclipse-remember')!;
  advance(SESSION_TIMEOUT);
  assert.equal((await a.login('account_a')).statusCode, 200);
  assert.equal(a.cookies.has('eclipse-remember'), false);
  a.cookies.set('eclipse-remember', old);
  advance(SESSION_TIMEOUT);
  assert.equal((await a.request('/auth/remember', 'POST', {})).statusCode, 401);
  await a.request('/auth/login', 'POST', { username: 'account_a', password, remember: true });
  advance(REMEMBER_TIMEOUT - 1);
  assert.equal((await a.request('/auth/remember', 'POST', {})).statusCode, 200);
  advance(1);
  assert.equal((await a.request('/auth/remember', 'POST', {})).statusCode, 401);
});

test('registration and concurrent login enforce one account session', async t => {
  const app = await createApp({ filename: ':memory:', rateLimit: 10000 }); t.after(() => app.close());
  const clients = await Promise.all(Array.from({ length: 20 }, () => client(app)));
  const registrations = await Promise.all(clients.slice(0, 4).map(c => c.request('/auth/register', 'POST', { username: 'race_user', password })));
  assert.equal(registrations.filter(r => r.statusCode === 201).length, 1);
  const logins = await Promise.all(clients.map(c => c.login('race_user')));
  assert.equal(logins.filter(r => r.statusCode === 200).length, 1);
  assert.equal(logins.filter(r => r.json().code === 'ACCOUNT_ALREADY_ONLINE').length, 19);
  const winner = clients[logins.findIndex(r => r.statusCode === 200)];
  assert.equal((await winner.request('/auth/logout', 'POST', {})).statusCode, 200);
  assert.equal((await clients[0].login('race_user')).statusCode, 200);
});
test('heartbeat expiry is 90 seconds; an old save and logout cannot affect a later login', async t => {
  const { app, a, create, advance } = await fixture(t), profile = await create();
  const other = await client(app);
  advance(SESSION_TIMEOUT - 1); assert.equal((await other.login('account_a')).statusCode, 409);
  advance(1); assert.equal((await other.login('account_a')).statusCode, 200); await other.acquire();
  assert.equal((await a.request(`/characters/${profile.id}/save`, 'PUT', { hero: profile.hero, expectedRevision: 1, expectedStashRevision: 0, expectedResourcesRevision: profile.resourcesRevision, operationId: randomUUID() })).statusCode, 401);
  assert.equal((await a.request('/auth/logout', 'POST', {})).statusCode, 401);
  assert.equal((await other.request('/auth/session')).statusCode, 200);
  assert.equal((await other.request(`/characters/${profile.id}`)).json().revision, 1);
});
test('heartbeats renew only a valid writer and do not revive expired sessions', async t => {
  const { a, advance } = await fixture(t);
  advance(80000); assert.equal((await a.request('/writer/heartbeat', 'POST', {})).statusCode, 200);
  advance(80000); assert.equal((await a.request('/auth/session')).statusCode, 200);
  advance(10000); assert.equal((await a.request('/writer/heartbeat', 'POST', {})).statusCode, 401);
});
test('page ownership and epochs fence old browser documents', async t => {
  const { a, create } = await fixture(t); const profile = await create();
  const oldEpoch = a.state.epoch;
  assert.equal((await a.acquire()).statusCode, 200);
  const currentEpoch = a.state.epoch; a.state.epoch = oldEpoch;
  assert.equal((await a.request(`/characters/${profile.id}/save`, 'PUT', { hero: profile.hero, expectedRevision: 1, expectedStashRevision: 0, expectedResourcesRevision: profile.resourcesRevision, operationId: randomUUID() })).json().code, 'WRITER_LOST');
  assert.equal((await a.request('/writer/release', 'POST', {})).json().code, 'WRITER_LOST');
  a.state.epoch = currentEpoch;
  assert.equal((await a.request('/writer/heartbeat', 'POST', {})).statusCode, 200);
});
test('account ownership protects read, export, save, rename, delete and stash', async t => {
  const { a, b, create } = await fixture(t), profile = await create();
  for (const [path, method, payload] of [
    [`/characters/${profile.id}`, 'GET'], [`/characters/${profile.id}/export`, 'GET'],
    [`/characters/${profile.id}/save`, 'PUT', { hero: profile.hero, expectedRevision: 1, expectedStashRevision: 0, expectedResourcesRevision: profile.resourcesRevision }],
    [`/characters/${profile.id}`, 'PATCH', { name: '他人', expectedRevision: 1 }],
    [`/characters/${profile.id}`, 'DELETE', { expectedRevision: 1 }],
    ['/stash/transfer', 'POST', { characterId: profile.id, expectedRevision: 1, expectedStashRevision: 0, expectedResourcesRevision: profile.resourcesRevision, transfer: { direction: 'unequip', slot: 'weapon' } }],
  ] as const) {
    assert.equal((await b.request(path, method, method === 'GET' ? undefined : { ...payload, operationId: randomUUID(), userId: a.state.id })).statusCode, 404);
  }
  assert.deepEqual((await b.request('/characters')).json(), []);
});
test('save retries are idempotent and stale revisions cannot overwrite progress', async t => {
  const { a, create } = await fixture(t), profile = await create();
  profile.hero.gold = 87654;
  const payload = { hero: profile.hero, expectedRevision: 1, expectedStashRevision: 0, expectedResourcesRevision: profile.resourcesRevision, operationId: randomUUID() };
  const first = await a.request(`/characters/${profile.id}/save`, 'PUT', payload);
  assert.equal(first.statusCode, 200, first.body); assert.equal(first.json().revision, 2);
  assert.deepEqual((await a.request(`/characters/${profile.id}/save`, 'PUT', payload)).json(), first.json());
  assert.equal((await a.request(`/characters/${profile.id}/save`, 'PUT', { ...payload, expectedRevision: 2 })).json().code, 'OPERATION_MISMATCH');
  assert.equal((await a.request(`/characters/${profile.id}/save`, 'PUT', { ...payload, operationId: randomUUID() })).json().code, 'SAVE_CONFLICT');
  assert.equal((await a.request(`/characters/${profile.id}`)).json().hero.gold, 87654);
});
test('shared transfers atomically update both records, retry safely and reject old snapshots', async t => {
  const { a, create } = await fixture(t), profile = await create();
  const payload = { characterId: profile.id, expectedRevision: 1, expectedStashRevision: 0, expectedResourcesRevision: profile.resourcesRevision, operationId: randomUUID(), transfer: { direction: 'unequip', slot: 'weapon' } };
  const first = await a.request('/stash/transfer', 'POST', payload); assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().profile.hero.equipment.weapon, null); assert.equal(first.json().shared.items.length, 1);
  assert.deepEqual((await a.request('/stash/transfer', 'POST', payload)).json(), first.json());
  const stale = await a.request(`/characters/${profile.id}/save`, 'PUT', { hero: profile.hero, expectedRevision: 2, expectedStashRevision: 0, expectedResourcesRevision: profile.resourcesRevision, operationId: randomUUID() });
  assert.equal(stale.json().code, 'STASH_CONFLICT');
  const invalid = await a.request('/stash/transfer', 'POST', { ...payload, operationId: randomUUID(), expectedRevision: 2, expectedStashRevision: 1, transfer: { direction: 'withdraw', itemId: 'missing', container: 'inventory' } });
  assert.equal(invalid.statusCode, 422); assert.equal((await a.request('/stash')).json().revision, 1);
  assert.equal((await a.request(`/characters/${profile.id}`)).json().revision, 2);
  let current = first.json();
  for (const transfer of [
    { direction: 'sort', container: 'shared' },
    { direction: 'withdraw', container: 'stash', itemId: profile.hero.equipment.weapon.id, position: { x: 8, y: 27 } },
    { direction: 'sort', container: 'stash' },
    { direction: 'deposit', container: 'stash', itemId: profile.hero.equipment.weapon.id, position: { x: 8, y: 47 } },
  ]) {
    const nextPayload = { ...payload, expectedRevision: current.profile.revision, expectedStashRevision: current.shared.revision, operationId: randomUUID(), transfer };
    const response = await a.request('/stash/transfer', 'POST', nextPayload);
    assert.equal(response.statusCode, 200, response.body); current = response.json();
    assert.deepEqual((await a.request('/stash/transfer', 'POST', nextPayload)).json(), current);
  }
  assert.equal((await a.request('/stash')).json().items[0].y, 47);
});
test('upload creates new profiles and IDs; exports preserve gameplay data and omit account stash', async t => {
  const { a, create } = await fixture(t), first = await create('原角色');
  first.hero.gold = 23456; first.hero.level = 12; first.hero.inventory = [{ ...first.hero.equipment.weapon, id: 'import-bag', x: 0, y: 0 }];
  const content = JSON.stringify({ format: CHARACTER_FILE_FORMAT, version: 1, profile: first });
  const uploaded = await a.request('/characters/import', 'POST', { content, name: '上传角色', operationId: randomUUID() });
  assert.equal(uploaded.statusCode, 200, uploaded.body); const imported = uploaded.json();
  assert.notEqual(imported.id, first.id); assert.notEqual(imported.hero.equipment.weapon.id, first.hero.equipment.weapon.id);
  const exported = (await a.request(`/characters/${imported.id}/export`)).json(); const file = JSON.parse(exported.content);
  assert.equal(file.format, CHARACTER_FILE_FORMAT); assert.equal(file.profile.hero.gold, 23456); assert.equal(file.profile.hero.level, 12);
  assert.equal(file.profile.hero.inventory.length, 1); assert.equal(file.stash, undefined);
  const copy = await a.request('/characters/import', 'POST', { content: exported.content, name: '导出副本', operationId: randomUUID() });
  assert.equal(copy.statusCode, 200, copy.body); assert.notEqual(copy.json().hero.inventory[0].id, imported.hero.inventory[0].id);
  assert.equal((await a.request('/characters')).json().length, 3);
});
test('invalid and oversized uploads preserve existing records, and deleted saves stay deleted', async t => {
  const { a, create } = await fixture(t), profile = await create();
  for (const content of ['{broken', '{}', JSON.stringify({ format: 'wrong', version: 1 }), 'x'.repeat(2 * 1024 * 1024 + 1)]) {
    const response = await a.request('/characters/import', 'POST', { name: '坏存档', content, operationId: randomUUID() });
    assert.ok(response.statusCode >= 400 && response.statusCode < 500, response.body);
  }
  assert.equal((await a.request('/characters')).json().length, 1);
  const removed = await a.request(`/characters/${profile.id}`, 'DELETE', { expectedRevision: 1, operationId: randomUUID() }); assert.equal(removed.statusCode, 200);
  assert.equal((await a.request(`/characters/${profile.id}/save`, 'PUT', { hero: profile.hero, expectedRevision: 1, expectedStashRevision: 0, expectedResourcesRevision: profile.resourcesRevision, operationId: randomUUID() })).statusCode, 404);
});
test('invalid save shapes and CSRF are rejected', async t => {
  const { a, create } = await fixture(t), profile = await create();
  for (const hero of [{}, { ...profile.hero, level: 100 }, { ...profile.hero, gold: -1 }, { ...profile.hero, rulesVersion: 999 }]) {
    const response = await a.request(`/characters/${profile.id}/save`, 'PUT', { hero, expectedRevision: 1, expectedStashRevision: 0, expectedResourcesRevision: profile.resourcesRevision, operationId: randomUUID() });
    assert.ok([409, 422].includes(response.statusCode), response.body);
  }
  a.state.csrf = ''; assert.equal((await a.request('/auth/logout', 'POST', {})).statusCode, 403);
  assert.equal((await a.request('/auth/session')).statusCode, 200);
});
test('role quota and normalized names are enforced without modifying existing characters', async t => {
  const { a, create } = await fixture(t);
  const first = await create('First');
  assert.equal((await a.request('/characters', 'POST', { name: 'first', classId: 'paladin', operationId: randomUUID() })).json().code, 'NAME_TAKEN');
  for (let i = 1; i < 20; i++) await create(`角色${i}`);
  assert.equal((await a.request('/characters', 'POST', { name: '超限角色', classId: 'paladin', operationId: randomUUID() })).json().code, 'CHARACTER_LIMIT');
  assert.equal((await a.request(`/characters/${first.id}`)).json().revision, 1);
});
test('database survives restart and shares exclusivity across two API instances', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'd2r-online-test-')), filename = join(directory, 'online.sqlite');
  const snapshot = join(directory, 'backup.sqlite');
  let app = await createApp({ filename }); const other = await createApp({ filename });
  try {
    const first = await client(app), second = await client(other);
    await first.request('/auth/register', 'POST', { username: 'durable_user', password }); await first.login('durable_user'); await first.acquire();
    await first.request('/characters', 'POST', { name: '持久角色', classId: 'amazon', operationId: randomUUID() });
    assert.equal((await second.login('durable_user')).statusCode, 409);
    await app.close(); app = await createApp({ filename });
    const reconnected = await client(app); first.cookies.forEach((v, k) => { if (k.includes('session')) reconnected.cookies.set(k, v); });
    assert.equal((await reconnected.request('/characters')).json()[0].name, '持久角色');
    assert.equal((await second.login('durable_user')).statusCode, 409);
    await backupDatabase(filename, snapshot);
    await assert.rejects(backupDatabase(filename, snapshot), /已存在/);
    const restored = await createApp({ filename: snapshot });
    try {
      const restoredClient = await client(restored);
      first.cookies.forEach((v, k) => { if (k.includes('session')) restoredClient.cookies.set(k, v); });
      assert.equal((await restoredClient.request('/characters')).json()[0].name, '持久角色');
    } finally { await restored.close(); }
  } finally {
    await app.close(); await other.close();
    for (const file of [filename, snapshot]) for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true }); rmdirSync(directory);
  }
});
