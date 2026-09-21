import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { chromium } from '@playwright/test';
import { savedProfile } from './browser-helpers.mjs';

async function observeAudio(page) {
  await page.addInitScript(() => {
    window.nativeAudioPlayed = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer) window.nativeAudioPlayed.push(JSON.stringify({
        length: this.buffer.length, channels: this.buffer.numberOfChannels,
        samples: Array.from(this.buffer.getChannelData(0).slice(0, 32)), rate: this.playbackRate.value,
      }));
      return start.apply(this, args);
    };
  });
}

async function verifyNativePlayback(page) {
  const expected = await page.evaluate(async () => {
    const response = await fetch('/audio/local/manifest.json');
    if (!response.ok) throw new Error('Packaged native audio manifest is missing');
    const manifest = await response.json(), file = manifest.sounds['ambient:camp'][0];
    const context = new AudioContext();
    try {
      const response = await fetch(`/audio/${file}`);
      if (!response.ok) throw new Error(`Packaged native recording is missing: ${file}`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      return JSON.stringify({ length: buffer.length, channels: buffer.numberOfChannels,
        samples: Array.from(buffer.getChannelData(0).slice(0, 32)), rate: 1 });
    } finally { await context.close(); }
  });
  await page.waitForFunction(expected => window.nativeAudioPlayed.includes(expected), expected, { timeout: 30000 });
}

async function enterCamp(page, name = '发布包验证') {
  await page.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
  if (await page.getByRole('option').count()) {
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  } else {
    await page.getByRole('button', { name: '新建角色', exact: true }).click();
    await page.getByRole('textbox', { name: '角色名称', exact: true }).fill(name);
    await page.getByRole('button', { name: '创建并进入', exact: true }).click();
  }
  await page.waitForFunction(() => window.eclipseState?.profileId && window.eclipseState.drawCalls > 0);
  const resume = page.getByRole('button', { name: '继续旅程', exact: true });
  if (await resume.isVisible()) await resume.click();
}

const installed = process.env.INSTALLED_URL;
const root = resolve(process.env.PACKAGE_DIR || 'release/package');
const output = resolve(process.env.OUTPUT_DIR || '.verification/server-package');
await mkdir(output, { recursive: true });
const port = process.env.D2R_TEST_PORT || '15173';
const base = installed || `http://127.0.0.1:${port}`;
let child, browser, exited;
const deadline = setTimeout(() => {
  console.error('Packaged server smoke exceeded 180 seconds');
  child?.kill('SIGKILL');
  process.exit(1);
}, 180_000);
try {
  if (!installed) {
    child = spawn(join(root, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node'), [join(root, 'app/server.mjs')], {
      cwd: output, windowsHide: true, stdio: 'inherit',
      env: { ...process.env, D2R_PORT: port, D2R_HOST: '127.0.0.1', D2R_DATABASE: join(output, 'smoke.sqlite'), D2R_SECURE_COOKIES: 'false' },
    });
    exited = once(child, 'exit');
  }
  let healthy = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { healthy = (await (await fetch(`${base}/api/health`)).json()).ok === true; } catch { /* starting */ }
    if (healthy) break;
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error('Packaged server exited');
    await new Promise(done => setTimeout(done, 500));
  }
  assert.ok(healthy, 'Packaged server is healthy');
  console.log('Health check passed');
  const html = await (await fetch(base)).text();
  assert.match(html, /assets\/.*\.js/);
  for (const path of ['/package.json', '/server.env', '/app/server.mjs', '/runtime/node.exe', '/api/missing']) {
    assert.equal((await fetch(base + path)).status, 404, `Private or missing file is not served: ${path}`);
  }
  assert.equal((await fetch(`${base}/.env`)).status, 403, 'Dotfiles are forbidden');
  assert.equal((await fetch(`${base}/api/v1/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  const entry = await (await fetch(`${base}/__local-entry`)).json();
  assert.equal(new URL(entry.canonicalOrigin).port, new URL(base).port);
  browser = await chromium.launch({ headless: true,
    args: process.env.CI ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
    ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  console.log('Browser launched');
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await observeAudio(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/?mode=local`);
  await enterCamp(page);
  await verifyNativePlayback(page);
  await page.waitForFunction(() => window.eclipseState?.drawCalls > 0);
  await page.getByRole('button', { name: '保存旅程', exact: true }).click();
  assert.ok((await savedProfile(page)).hero);
  await page.reload();
  await enterCamp(page);
  console.log('Local game save/reload passed');
  await page.close();
  const online = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await observeAudio(online);
  await online.bringToFront();
  online.on('pageerror', error => errors.push(error.message));
  online.on('response', async response => {
    if (response.url().includes('/api/') && response.status() >= 500) console.error('API failure:', response.status(), await response.text());
  });
  await online.goto(base);
  const marker = join(output, `account-${new URL(base).port}.json`);
  let account;
  try { account = JSON.parse(await readFile(marker, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!account) await online.getByRole('button', { name: '没有账号，去注册', exact: true }).click();
  const username = account?.username || `release_${Date.now()}`;
  await online.locator('#online-username').fill(username);
  await online.locator('#online-password').fill('release-smoke-password-123');
  if (!account) await online.locator('#online-confirm').fill('release-smoke-password-123');
  await online.getByRole('button', { name: account ? '登录' : '注册账号', exact: true }).click();
  if (!account) {
    await online.getByRole('button', { name: '登录', exact: true }).waitFor();
    await online.locator('#online-username').fill(username);
    await online.locator('#online-password').fill('release-smoke-password-123');
    await online.getByRole('button', { name: '登录', exact: true }).click();
  }
  if (account) await online.getByRole('option', { name: /服务端验证/ }).waitFor();
  await enterCamp(online, '服务端验证');
  await verifyNativePlayback(online);
  console.log('Native D2R recordings play in local and online release modes');
  assert.equal(await online.evaluate(() => window.eclipseState.mode), 'online');
  await online.getByRole('button', { name: '保存旅程', exact: true }).click();
  await online.waitForFunction(() => !window.eclipseState.saveBusy);
  await writeFile(marker, JSON.stringify({ username }));
  if (!await online.getByRole('button', { name: '保存并切换角色', exact: true }).isVisible()) await online.keyboard.press('Escape');
  await online.getByRole('button', { name: '保存并切换角色', exact: true }).click();
  await online.getByRole('button', { name: '退出账号', exact: true }).click();
  await online.getByRole('button', { name: /^本地模式/ }).waitFor();
  console.log('Online game and logout passed');
  assert.deepEqual(errors, []);
  console.log('Packaged server: health, static isolation, CSRF, local save/reload, online registration and gameplay passed');
} catch (error) {
  for (const context of browser?.contexts() || []) for (const page of context.pages()) {
    console.error('Browser failure context:', page.url(), (await page.locator('body').innerText()).slice(0, 1500));
  }
  throw error;
} finally {
  await browser?.close();
  if (child && child.exitCode === null) {
    const forceStop = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.kill();
    await exited;
    clearTimeout(forceStop);
  }
  clearTimeout(deadline);
}
