import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classFixture } from './class-fixture.ts';
import { monsterStats } from '../src/balance.ts';
import { BOSSES } from '../src/bestiary.ts';
import { LEVELS } from '../src/campaign.ts';
import { newHero } from '../src/model.ts';
import { BASES, makeItem, socketItem, specialItem, type Item } from '../src/items.ts';
import { hireMercenary, mercenaryStats, equipMercenary, MERCENARY_AURAS, type MercenaryAura } from '../src/mercenary.ts';
import { MercenaryCombat } from '../src/mercenary-combat.ts';

test('levels 1–99 retain smooth life and damage growth, with useful but incomplete Hell resistance', () => {
  const h = newHero(); h.gold = 100000; h.campaign.cleared[0] = 5; hireMercenary(h, true);
  let previous = mercenaryStats(h);
  for (let level = 2; level <= 99; level++) {
    h.level = level; const s = mercenaryStats(h);
    assert.ok(s.maxHp > previous.maxHp && s.maxHp - previous.maxHp <= 26);
    assert.ok(s.attack > previous.attack && s.attack / previous.attack < 1.12);
    previous = s;
  }
  h.difficultyLevel = 2;
  for (const level of [70, 80, 90, 99]) {
    h.level = level; const s = mercenaryStats(h);
    assert.ok(s.resistances.fire >= 10 && s.resistances.fire <= 50);
    assert.ok(s.maxHp < 2000 && s.attack < 30, 'Naked late guards cannot replace a damage build');
  }
});

function gear(code: string, mods: Item['mods'] = {}) { const item = makeItem(BASES.find(base => base.baseCode === code)!); item.mods = mods; return item; }
function runeword(code: string, runes: Parameters<typeof socketItem>[1][]) {
  const item = gear(code); item.sockets = runes.length;
  for (const rune of runes) assert.ok(socketItem(item, rune, () => .5)); return item;
}

// Repeatable contact-pressure benchmark, not a replacement for boss AI/browser tests.
// Real Jab, hit checks, resistances, leech, curses, pulses and procs; one boss hit/s.
function pressure(level: number, difficulty: number, index: number, aura: MercenaryAura, equipment: Item[], seed: number) {
  const f = classFixture('sorceress', false), h = f.hero;
  h.level = level; h.difficultyLevel = difficulty; h.campaign.current = index; h.campaign.cleared[0] = 5; h.gold = 100000;
  h.campaign.kills = LEVELS[index].quest.count; h.campaign.objects = Array.from({ length: LEVELS[index].quest.count }, (_, i) => i);
  h.equipment = newHero().equipment; hireMercenary(h, true); h.mercenary!.aura = aura;
  for (const item of equipment) { item.identified = true; h.inventory.push(item); assert.ok(equipMercenary(h, item.id), item.name); }
  h.mercenary!.hp = mercenaryStats(h).maxHp;
  f.game.world.canWalk = () => true; const merc = new MercenaryCombat(f.game); f.game.mercenary = merc; merc.sync();
  const boss = f.enemy(1.6), tuning = monsterStats(BOSSES[index], LEVELS[index], difficulty, true);
  Object.assign(boss, tuning, { hp: tuning.maxHp, boss: true, definition: BOSSES[index], kind: 'boss', playerCount: 1 });
  const original = Math.random;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  f.combat.itemRandom = Math.random;
  let steps = 0;
  try {
    for (; steps < 120 * 25 && h.mercenary!.status === 'alive' && !boss.dead; steps++) {
      f.game.time += .04; merc.update(.04);
      // Expire debuffs and item buffs through the combat controller.
      f.combat.update(.04);
      if (steps % 25 === 24 && !boss.dead) merc.hurt(boss.damage, steps % 50 === 24 ? 'physical' : LEVELS[index].bossType, boss);
    }
    return { seconds: steps / 25, dealt: tuning.maxHp - boss.hp, fraction: 1 - boss.hp / tuning.maxHp, won: boss.dead, alive: h.mercenary!.status === 'alive' };
  } finally { Math.random = original; merc.clear(); }
}

test('all native auras remain support: ordinary early/mid gear cannot solo representative act bosses', () => {
  for (const [level, difficulty, index] of [[24, 0, 9], [35, 0, 19], [42, 0, 24], [55, 1, 9], [65, 1, 19]]) {
    for (const aura of MERCENARY_AURAS) {
      const result = pressure(level, difficulty, index, aura, [gear('spr', { damage: 60, lifeSteal: 5 }), gear('lea', { life: 50, allRes: 15 })], 967);
      assert.ok(result.dealt > 0, 'The guard must actually fight the unlocked boss');
      assert.equal(result.won, false, `${level}/${aura}: ${JSON.stringify(result)}`);
      assert.ok(result.fraction < .5, `${level}/${aura} must not do most of a boss fight alone: ${JSON.stringify(result)}`);
      assert.ok(result.seconds >= 3, `${level}/${aura} should survive enough contact to help`);
    }
  }
});

test('late Reaper/Treachery/Bulwark equipment provides substantial damage and survival over a naked guard', () => {
  for (const seed of [967, 20260914, 12345]) {
    const naked = pressure(90, 2, 19, 'might', [], seed);
    const equipped = pressure(90, 2, 19, 'might', [specialItem('unique-327', () => .5), runeword('lea', ['shael', 'thul', 'lem']), runeword('msk', ['shael', 'io', 'sol'])], seed);
    assert.ok(equipped.dealt > naked.dealt * 5, JSON.stringify({ naked, equipped }));
    assert.ok(equipped.seconds > naked.seconds * 2 || equipped.won, JSON.stringify({ naked, equipped }));
  }
});
