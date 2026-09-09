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
