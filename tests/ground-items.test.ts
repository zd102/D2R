import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASES, makeItem, groundItemName } from '../src/items.ts';

test('unidentified ground equipment hides rolled names but shows its socket count', () => {
  for (const rarity of ['magic', 'rare', 'unique', 'set'] as const) {
    const item = makeItem(BASES[0]);
    Object.assign(item, { name: '锐利的短剑之火焰', rarity, identified: false, sockets: 2, mods: { fireDamage: 10 } });
    assert.equal(groundItemName(item), `${item.base} [2孔]`);
    item.sockets = 0; assert.equal(groundItemName(item), item.base);
    item.identified = true; assert.equal(groundItemName(item), item.name);
    item.sockets = 1; assert.equal(groundItemName(item), `${item.name} [1孔]`);
  }
});

test('legacy unidentified items use the base code or slot without leaking a stored affix name', () => {
  const item = makeItem(BASES.find(base => base.baseCode === 'ssd')!);
  item.identified = false; item.name = '隐藏的词缀名称'; delete item.base;
  assert.equal(groundItemName(item), BASES.find(base => base.baseCode === 'ssd')!.name);
  delete item.baseCode; assert.equal(groundItemName(item), '主手');
});
