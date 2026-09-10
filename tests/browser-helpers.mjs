import { LAST_PROFILE_KEY, PROFILE_PREFIX } from '../src/saves.ts';

export async function enterGame(page, name = '测试角色') {
  await page.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
  if (await page.getByRole('option').count()) {
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  } else {
    await page.getByRole('button', { name: '新建角色', exact: true }).click();
    await page.getByRole('textbox', { name: '角色名称', exact: true }).fill(name);
    await page.getByRole('button', { name: '创建并进入', exact: true }).click();
  }
  await page.waitForFunction(() => window.eclipseState?.profileId && !window.eclipseState.paused);
  // Combat fixtures explicitly depart after the character now loads into camp.
  if (await page.evaluate(() => window.eclipseState.inCamp)) {
    await openCampaign(page);
    const index = await page.evaluate(() => window.eclipseState.campaign.current);
    await page.locator(`[data-campaign-act="${Math.floor(index / 5)}"]`).click();
    await page.locator(`[data-enter-level="${index}"]`).click();
    await page.waitForFunction(() => !window.eclipseState.inCamp && !window.eclipseState.paused);
  }
}
export async function openCampaign(page) {
  if (await page.evaluate(() => window.eclipseState.inCamp)) {
    await page.getByRole('button', { name: '远征传送阵', exact: true }).click();
  } else {
    await page.keyboard.press('j');
    await page.locator('[data-panel="campaign"]').click();
  }
  await page.locator('.panel-campaign').waitFor();
}
export async function savedProfile(page) {
  return page.evaluate(({ last, prefix }) => JSON.parse(localStorage.getItem(prefix + localStorage.getItem(last))), { last: LAST_PROFILE_KEY, prefix: PROFILE_PREFIX });
}
export async function inventoryItems(page) {
  const tab = page.locator('button[data-inventory-pane="items"]');
  if (await tab.isVisible() && await tab.getAttribute('aria-pressed') !== 'true') await tab.click();
}
export async function inventoryItem(page, id) {
  await inventoryItems(page);
  await page.locator(`[data-item="${id}"]`).click();
}
export async function itemTab(page, tab) { await page.locator(`button[data-item-tab="${tab}"]`).click(); }
export async function runeRecipes(page) {
  const tab = page.locator('button[data-rune-pane="recipes"]');
  if (await tab.isVisible()) await tab.click();
}
export async function recipeNamed(page, name) {
  await runeRecipes(page);
  const row = page.locator('.runeword-list > div').filter({ has: page.getByText(name, { exact: true }) });
  while (!await row.isVisible()) {
    const next = page.locator('.recipe-pagination button').last();
    if (!await next.isEnabled()) throw new Error(`Recipe missing from pages: ${name}`);
    await next.click();
  }
  return row;
}
