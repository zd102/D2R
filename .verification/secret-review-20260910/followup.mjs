import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { newHero, serializeSave, moveStorage, activeCharms } from '../../src/model.ts';
import { specialItem } from '../../src/items.ts';
import { SPECIAL_LEVELS } from '../../src/campaign.ts';
import { MONSTERS } from '../../src/bestiary.ts';
import { monsterStats } from '../../src/balance.ts';
import { chestContext, rollChestLoot } from '../../src/chests.ts';
import { mapRandom } from '../../src/map-random.ts';

const output = '.verification/secret-review-20260910', results = {};
results.cowBalance = [0, 1, 2].map(difficulty => ({ difficulty,
  normal: monsterStats(MONSTERS.hellCow, SPECIAL_LEVELS.cow, difficulty),
  elite: monsterStats(MONSTERS.hellCow, SPECIAL_LEVELS.cow, difficulty, false, true),
  king: monsterStats(MONSTERS.hellCow, SPECIAL_LEVELS.cow, difficulty, true),
}));
results.cowChests = [0, 1, 2].map(difficulty => {
  const context = chestContext(SPECIAL_LEVELS.cow, difficulty), random = mapRandom(1729);
  let invalidGold = 0, invalidItems = 0;
  const examples = [];
  for (let i = 0; i < 300; i++) {
    for (const drop of rollChestLoot(context, random)) {
      if (Object.hasOwn(drop, 'gold') && !Number.isFinite(drop.gold)) {
        invalidGold++; if (examples.length < 3) examples.push({ roll: i, gold: String(drop.gold) });
      }
      if (drop.item && !Number.isFinite(drop.item.level)) {
        invalidItems++; if (examples.length < 3) examples.push({ roll: i, item: drop.item.name, level: String(drop.item.level) });
      }
    }
  }
  return { difficulty, contextLevel: String(context.level), invalidGold, invalidItems, examples };
});
const h = newHero(); h.level = 99;
const first = specialItem('unique-382', () => .3), second = specialItem('unique-382', () => .7);
first.identified = second.identified = true; h.inventory = [first]; h.stash = [second];
results.annihilusStorage = { allowed: moveStorage(h, second.id, false), count: h.inventory.length, activeCount: activeCharms(h).length };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.reviewGame = game;') });
  });
  await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(newHero()));
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState?.inCamp && !window.eclipseState.paused);
  await page.locator('[data-action="mystery-portal"]').click();
  await page.waitForFunction(() => window.reviewGame.ui.panel === 'mystery-portal');
  results.lockedPanel = await page.locator('#overlay').innerText();
  await page.screenshot({ path: `${output}/portal-locked.png` });
  await page.evaluate(async () => {
    const { createWirtsLeg, specialItem } = await import('/src/items.ts');
    const g = window.reviewGame;
    g.hero.inventory = [createWirtsLeg(1), specialItem('unique-122', () => .5)];
    g.hero.campaign.cleared = [25, 25, 25]; g.hero.unlockedDifficulty = 2;
    g.ui.renderPanel();
  });
  results.readyPanel = await page.locator('#overlay').innerText();
  await page.screenshot({ path: `${output}/portal-ready.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/portal-mobile.png` });
  console.log(JSON.stringify(results, null, 2));
} finally {
  await writeFile(`${output}/followup-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
