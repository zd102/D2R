import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AVAILABLE_RUNEWORDS, MOD_NAMES } from '../src/items.ts';
import { runewordPreviewSections, runewordTooltip } from '../src/runeword-tooltip.ts';

test('every available recipe has deterministic, read-only attribute previews', () => {
  const before = JSON.stringify(AVAILABLE_RUNEWORDS);
  for (const word of AVAILABLE_RUNEWORDS) {
    const sections = runewordPreviewSections(word);
    assert.ok(sections.length > 0 && sections.every(section => section.lines.length > 0), word.name);
    const html = runewordTooltip(word.catalogId!);
    assert.ok(html?.includes(word.name)); assert.equal(html, runewordTooltip(word.catalogId!));
    assert.ok(!html!.includes('undefined') && !html!.includes('NaN'), word.name);
  }
  assert.equal(JSON.stringify(AVAILABLE_RUNEWORDS), before);
  assert.equal(runewordTooltip('missing-recipe'), undefined);
});

test('Spirit shows roll ranges and the different rune bonuses for weapons and shields', () => {
  const spirit = AVAILABLE_RUNEWORDS.find(word => word.name === '精神')!;
  const sections = runewordPreviewSections(spirit), weapon = sections.find(section => section.slot === 'weapon')!, shield = sections.find(section => section.slot === 'shield')!;
  assert.ok(weapon && shield);
  for (const section of sections) assert.equal(section.lines.find(line => line.text.includes(MOD_NAMES.fcr))!.range, '25 - 35');
  assert.ok(weapon.lines.some(line => line.text.includes(MOD_NAMES.lifeSteal)));
  assert.ok(shield.lines.some(line => line.text.includes(MOD_NAMES.coldRes)));
  assert.ok(!weapon.lines.some(line => line.text.includes(MOD_NAMES.coldRes)));
});
