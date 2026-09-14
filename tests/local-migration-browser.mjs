import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { networkInterfaces } from 'node:os';
import { newHero } from '../src/model.ts';
import { PROFILE_PREFIX } from '../src/saves.ts';

const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:5173'), old = new URL(base); old.hostname = 'localhost';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const make = (level) => ({ version: 2, id: 'same-hero', name: '迁移圣骑士', createdAt: 1, updatedAt: level === 24 ? 999 : 100, revision: 10, hero: { ...newHero(), level } });
const sourceHero = make(54), targetHero = make(24);
const shared = { version: 1, revision: 2, items: [{ ...newHero().equipment.weapon, id: 'shared-unique' }], checkpoints: {} };
async function seed(page, profile, stash) {
  await page.evaluate(({ profile, stash, prefix }) => {
    localStorage.setItem(prefix + profile.id, JSON.stringify(profile));
    localStorage.setItem('eclipse-ii-shared-stash-v1', JSON.stringify(stash));
  }, { profile, stash, prefix: PROFILE_PREFIX });
}
try {
  const context = await browser.newContext(); const target = await context.newPage();
  await target.goto(base.origin + '/?mode=local');
  await target.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
  await seed(target, targetHero, shared);
  const source = await context.newPage(); await source.goto(old.origin + '/?recover-local=1&mode=local');
  await source.getByRole('heading', { name: '旧入口存档恢复' }).waitFor();
  await seed(source, sourceHero, { ...shared, items: [...shared.items, { ...shared.items[0], id: 'second-shared' }] });
  await source.reload();
  const original = await source.evaluate(() => ({ ...localStorage }));
  const popupPending = source.waitForEvent('popup');
  await source.getByRole('button', { name: '迁移角色并合并共享仓库' }).click();
  const popup = await popupPending;
  await popup.getByText(/合并完成：1 个角色，共享仓库 2 件物品/).waitFor();
  assert.deepEqual(await source.evaluate(() => ({ ...localStorage })), original);
  const verify = page => page.evaluate(async () => {
    const { SaveStore } = await import('/src/saves.ts');
    const { refreshSharedStorage } = await import('/src/shared-storage.ts'); await refreshSharedStorage();
    const store = new SaveStore(localStorage);
    return { level: store.read('same-hero').hero.level, items: store.readShared().items.map(item => item.id), revision: store.read('same-hero').revision };
  });
  assert.deepEqual(await verify(popup), { level: 54, items: ['shared-unique', 'second-shared'], revision: 11 });
  // A repeated migration after moving an item must not recreate it in the shared stash.
  await popup.evaluate(async () => {
    const { SaveStore } = await import('/src/saves.ts'); const store = new SaveStore(localStorage), p = store.read('same-hero');
    await store.transferShared(p.id, p.hero, p.revision, store.readShared().revision, { direction: 'withdraw', container: 'stash', itemId: 'second-shared' });
  });
  const againPending = source.waitForEvent('popup'); await source.getByRole('button', { name: '迁移角色并合并共享仓库' }).click(); const again = await againPending;
  await again.getByText('这份旧存档已经合并过，无需重复迁移。').waitFor();
  assert.deepEqual((await verify(again)).items, ['shared-unique']);
  await again.goto(base.origin + '/?mode=local'); await again.getByRole('option', { name: '迁移圣骑士', exact: true }).waitFor();
  assert.equal((await verify(again)).level, 54);
  const lan = Object.values(networkInterfaces()).flat().find(value => value?.family === 'IPv4' && !value.internal && !value.address.startsWith('169.254.'));
  if (lan) {
    const lanPage = await context.newPage(); await lanPage.goto(`http://${lan.address}:${base.port}/`);
    await lanPage.locator('#auth-back').waitFor();
    assert.equal(new URL(lanPage.url()).hostname, lan.address, 'Online entry preserves its address');
    await lanPage.locator('#auth-back').click(); await lanPage.locator('#mode-local').click();
    await lanPage.waitForURL(base.origin + '/?mode=local');
    assert.equal((await verify(lanPage)).level, 54, 'LAN entry on this computer uses canonical storage');
  }
  await context.close();

  const failureContext = await browser.newContext(), failurePage = await failureContext.newPage();
  await failurePage.goto(base.origin + '/?mode=local'); await failurePage.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
  const recovered = await failurePage.evaluate(async ({ profile, shared, prefix }) => {
    // Match LAN HTTP, where UUID/SubtleCrypto are unavailable but getRandomValues works.
    Object.defineProperty(crypto, 'subtle', { value: undefined, configurable: true });
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    const { mergeLocalOrigins } = await import('/src/local-migration.ts');
    const { finishOriginMigration } = await import('/src/shared-storage.ts');
    const source = { origin: 'http://localhost:5173', capturedAt: 1, entries: { [prefix + profile.id]: JSON.stringify(profile) }, shared: JSON.stringify(shared) };
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key.startsWith(prefix)) throw new DOMException('Full', 'QuotaExceededError'); return original.call(this, key, value); };
    let failed = false;
    try { await mergeLocalOrigins([source]); } catch { failed = true; } finally { Storage.prototype.setItem = original; }
    await finishOriginMigration();
    const { SaveStore } = await import('/src/saves.ts'); const store = new SaveStore(localStorage);
    return { failed, level: store.read(profile.id).hero.level, repeat: await mergeLocalOrigins([source]) };
  }, { profile: sourceHero, shared, prefix: PROFILE_PREFIX });
  assert.deepEqual(recovered, { failed: true, level: 54, repeat: { alreadyMerged: true } });
  const conflict = await failurePage.evaluate(async () => {
    const { captureLocalOrigin, planOriginMerge } = await import('/src/local-migration.ts');
    const { commitOriginMigration } = await import('/src/shared-storage.ts');
    const before = await captureLocalOrigin(), plan = planOriginMerge(before, [], () => crypto.randomUUID());
    localStorage.setItem('eclipse-ii-last-profile', 'changed-in-another-page');
    try { await commitOriginMigration(before, [], plan); return false; } catch { return true; }
  });
  assert.equal(conflict, true, 'Concurrent local edits abort before committing migration');
  await failureContext.close();
  const jobContext = await browser.newContext(), jobPage = await jobContext.newPage();
  const job = { token: 'browser-test', target: base.origin, origins: [old.origin, base.origin], snapshots: {} };
  await jobContext.route('**/__local-migration-job', async route => {
    if (route.request().method() === 'POST') {
      const data = route.request().postDataJSON();
      if (data.kind === 'snapshot') job.snapshots[data.snapshot.origin] ??= data.snapshot;
      else job.result = data;
      await route.fulfill({ json: { ok: true } });
    } else await route.fulfill({ json: job });
  });
  await jobPage.goto(base.origin + '/?mode=local'); await jobPage.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
  await seed(jobPage, targetHero, shared);
  await jobPage.goto(old.origin + '/?recover-local=1&mode=local'); await jobPage.getByRole('heading', { name: '旧入口存档恢复' }).waitFor();
  await seed(jobPage, sourceHero, shared);
  await jobPage.goto(old.origin + '/?local-migration-task=browser-test');
  await jobPage.getByText('角色与共享仓库已合并，原始数据已备份。现在可以从统一入口继续游戏。').waitFor();
  assert.equal(job.result.snapshot.origin, base.origin);
  assert.equal(JSON.parse(job.snapshots[base.origin].entries[PROFILE_PREFIX + 'same-hero']).hero.level, 24, 'Original target is archived before changing it');
  assert.equal(JSON.parse(job.result.snapshot.entries[PROFILE_PREFIX + 'same-hero']).hero.level, 54);
  await jobContext.close();
  console.log('Cross-origin merge, shared deduplication, reload, LAN entry, idempotency and interrupted-write recovery PASS');
} finally { await browser.close(); }
