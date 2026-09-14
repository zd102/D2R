import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero } from '../src/model.ts';
import { PROFILE_PREFIX, parseCharacterFile } from '../src/saves.ts';

const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:5173');
const old = new URL(base); old.hostname = 'localhost';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
async function downloadJson(page, button) {
  const pending = page.waitForEvent('download'); await button.click();
  const stream = await (await pending).createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
try {
  const context = await browser.newContext(); const page = await context.newPage();
  await page.goto(`${old.origin}/?mode=local#test`);
  await page.waitForURL(`${base.origin}/?mode=local#test`);
  await page.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
  // Seed the legacy origin without allowing a game to run there.
  await page.goto(`${old.origin}/?recover-local=1&mode=local`);
  await page.getByRole('heading', { name: '旧入口存档恢复' }).waitFor();
  const hero = newHero(); hero.level = 54;
  const profile = { version: 2, id: 'old-hero', name: '旧角色', revision: 2, createdAt: 1, updatedAt: 2, hero };
  await page.evaluate(({ profile, prefix }) => {
    localStorage.setItem(prefix + profile.id, JSON.stringify(profile));
    localStorage.setItem('eclipse-ii-shared-stash-v1', JSON.stringify({ version: 1, revision: 0, items: [], checkpoints: {} }));
  }, { profile, prefix: PROFILE_PREFIX });
  const before = await page.evaluate(() => ({ ...localStorage }));
  await page.goto(`${old.origin}/?mode=local`);
  const raw = await downloadJson(page, page.getByRole('button', { name: /导出 旧角色/ }));
  assert.equal(parseCharacterFile(raw).hero.level, 54);
  const backup = JSON.parse(await downloadJson(page, page.getByRole('button', { name: '下载旧入口完整备份' })));
  assert.deepEqual(backup.entries, before);
  assert.equal(backup.shared, before['eclipse-ii-shared-stash-v1']);
  assert.deepEqual(await page.evaluate(() => ({ ...localStorage })), before, 'Recovery never modifies old storage');
  assert.equal(await page.evaluate(() => typeof window.eclipseState), 'undefined', 'No game/autosave on old origin');
  await page.setViewportSize({ width: 360, height: 780 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Recovery fits mobile');
  await page.getByRole('link', { name: '前往统一入口' }).click();
  await page.waitForURL(`${base.origin}/?mode=local`);
  await page.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
  const result = await page.evaluate(async raw => {
    const { SaveStore } = await import('/src/saves.ts');
    const store = new SaveStore(localStorage);
    store.create('旧角色');
    return store.importCharacter(raw, '旧角色恢复').id;
  }, raw);
  await page.reload();
  await page.getByRole('option', { name: '旧角色恢复', exact: true }).waitFor();
  assert.equal(await page.evaluate(async id => {
    const { SaveStore } = await import('/src/saves.ts'); return new SaveStore(localStorage).read(id).hero.level;
  }, result), 54);
  await page.getByRole('link', { name: '找回 localhost 旧入口存档' }).click();
  await page.getByRole('heading', { name: '旧入口存档恢复' }).waitFor();
  assert.deepEqual(await page.evaluate(() => ({ ...localStorage })), before);
  // A broken profile must remain accessible as raw backup, not disappear via redirect.
  await page.evaluate(prefix => localStorage.setItem(prefix + 'broken', '{invalid'), PROFILE_PREFIX);
  await page.reload();
  const damaged = JSON.parse(await downloadJson(page, page.getByRole('button', { name: '下载旧入口完整备份' })));
  assert.equal(damaged.entries[PROFILE_PREFIX + 'broken'], '{invalid');
  await context.close();
  const databaseContext = await browser.newContext(); const databasePage = await databaseContext.newPage();
  await databasePage.goto(`${old.origin}/?recover-local=1`);
  await databasePage.getByRole('heading', { name: '旧入口存档恢复' }).waitFor();
  const shared = JSON.stringify({ version: 1, revision: 4, items: [], checkpoints: {} });
  await databasePage.evaluate(async raw => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('eclipse-ii-local-shared-v1', 1);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('shared', 'readwrite');
        tx.objectStore('shared').put(raw, 'state');
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, shared);
  await databasePage.goto(`${old.origin}/?mode=local`);
  await databasePage.getByRole('heading', { name: '旧入口存档恢复' }).waitFor();
  const databaseBackup = JSON.parse(await downloadJson(databasePage, databasePage.getByRole('button', { name: '下载旧入口完整备份' })));
  assert.equal(databaseBackup.shared, shared, 'Preserve IndexedDB-only shared data');
  await databaseContext.close();
  const failedContext = await browser.newContext();
  await failedContext.addInitScript(() => { indexedDB.open = () => { throw new Error('Database unavailable'); }; });
  const failedPage = await failedContext.newPage(); await failedPage.goto(`${old.origin}/?mode=local`);
  await failedPage.getByRole('heading', { name: '旧入口存档恢复' }).waitFor();
  const partial = JSON.parse(await downloadJson(failedPage, failedPage.getByRole('button', { name: '下载旧入口完整备份' })));
  assert.ok(partial.sharedError, 'An unreadable database is reported, not treated as an empty origin');
  await failedContext.close();
  console.log('Local entry redirect, recovery, backup, import/reload, mobile and source preservation PASS');
} finally { await browser.close(); }
