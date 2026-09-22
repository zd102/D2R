import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RenderBudget } from '../src/render-budget.ts';

test('resolution responds to sustained missed frames and recovers with hysteresis', () => {
  const budget = new RenderBudget();
  for (let i = 0; i < 90; i++) budget.sample(i === 8 ? 50 : 1000 / 60, 6);
  assert.equal(budget.level, 0, 'one long frame does not reduce resolution');
  for (let i = 0; i < 45; i++) budget.sample(1000 / 30, 14);
  assert.equal(budget.level, 1);
  for (let i = 0; i < 450; i++) budget.sample(1000 / 60, 6);
  assert.equal(budget.level, 1, 'no rapid quality oscillation');
  for (let i = 0; i < 90; i++) budget.sample(1000 / 60, 6);
  assert.equal(budget.level, 0);
  for (let i = 0; i < 450; i++) budget.sample(50, 20);
  assert.equal(budget.level, 4); assert.ok(budget.pixelRatio(1920, 1080, 1) >= .5);
  budget.sample(10000, 5); assert.equal(budget.level, 4, 'loading and tab suspension are ignored');
  budget.reset(); assert.equal(budget.level, 4, 'area transitions retain the learned device budget');
});

test('high DPI and 4K buffers stay within the automatic pixel budget', () => {
  const budget = new RenderBudget();
  for (const [width, height, dpr] of [[1920, 1080, 1], [1920, 1080, 2], [3840, 2160, 1], [390, 844, 3]]) {
    const ratio = budget.pixelRatio(width, height, dpr);
    assert.ok(ratio <= Math.min(dpr, 1.75));
    assert.ok(width * height * ratio ** 2 <= 2560 * 1440 + 1);
  }
});

test('recurring long GPU frames cannot starve adaptive quality sampling',()=>{
  const budget=new RenderBudget();
  for(let i=0;i<90;i++)budget.sample(i%9===0?133.3:33.3,22);
  assert.equal(budget.level,2);
  const isolated=new RenderBudget();
  for(let i=0;i<90;i++)isolated.sample(i===8?133.3:16.67,6);
  assert.equal(isolated.level,0);
  isolated.sample(2000,300);
  for(let i=0;i<44;i++)isolated.sample(33.3,22);
  assert.equal(isolated.level,0,'loading starts a fresh sampling window');
});
