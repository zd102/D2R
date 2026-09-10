import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const output = process.env.OUTPUT_DIR || '.verification/audio-memory'; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true }), nodes = new Map(), samples = [];
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } }), cdp = await page.context().newCDPSession(page);
  cdp.on('WebAudio.audioNodeCreated', ({ node }) => nodes.set(node.nodeId, node.nodeType));
  cdp.on('WebAudio.audioNodeWillBeDestroyed', ({ nodeId }) => nodes.delete(nodeId));
  await cdp.send('WebAudio.enable');
  await page.route('**/src/main.ts*', async route => { const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.audioMemoryGame = game;') }); });
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173'); await expect(page.getByRole('dialog', { name: '选择角色', exact: true })).toBeVisible();
  await page.evaluate(async () => { const g = window.audioMemoryGame; cancelAnimationFrame(g.frameId); g.audio.unlock(); await g.audio.context.resume(); await g.audio.preload(); g.audio.volume = .001; });
  for (let round = 0; round < 4; round++) {
    await page.evaluate(() => { const audio = window.audioMemoryGame.audio; for (let i = 0; i < 100; i++) audio.play(['hit', 'swing', 'shot', 'spell', 'loot', 'level', 'hurt', 'portal'][i % 8]); });
    await page.waitForFunction(() => window.audioMemoryGame.audio.diagnostics().voices === 0, null, { timeout: 15000 });
    await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(100);
    const byType = Object.fromEntries([...new Set(nodes.values())].map(type => [type, [...nodes.values()].filter(value => value === type).length]));
    const sample = { round, count: nodes.size, byType }; samples.push(sample); console.log(sample);
  }
  await writeFile(`${output}/samples.json`, JSON.stringify(samples, null, 2));
  if (process.env.MEMORY_RECORD_ONLY !== '1') assert.ok(samples.at(-1).count <= samples[0].count + 2, 'finished sounds must not retain more audio nodes every batch');
} finally { await browser.close(); }
