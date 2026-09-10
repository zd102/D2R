import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classFixture } from './class-fixture.ts';
import { stats } from '../src/model.ts';

test('unconfigured slots use normal attacks and share their cooldown across all classes', t => {
  for (const classId of ['paladin', 'amazon', 'sorceress'] as const) {
    const { hero, game, combat } = classFixture(classId, false);
    const panel = t.mock.method(game.ui, 'openPanel');
    for (const slot of ['cleave', 'ward', 'nova', 'dash', 'bolt'] as const) hero.bindings[slot] = 'attack';
    const mana = hero.mana;
    for (const slot of ['cleave', 'ward', 'nova', 'dash', 'bolt'] as const) {
      assert.equal(combat.cast(slot, true), true, `${classId} ${slot}`);
      assert.equal(combat.cast('attack', true), false, 'fallback cannot bypass normal attack cadence');
      assert.equal(combat.cast('bolt', true), false);
      combat.update(combat.cooldown('attack') + .01);
    }
    assert.equal(hero.mana, mana);
    assert.equal(panel.mock.callCount(), 0);
  }
});

test('all three classes can switch from attack to a skill immediately without resetting either cadence', () => {
  for (const [classId, skill] of [['paladin', 'holyBolt'], ['amazon', 'poisonJavelin'], ['sorceress', 'fireBolt']] as const) {
    const { hero, game, combat } = classFixture(classId);
    hero.bindings.cleave = hero.bindings.bolt = skill;
    hero.bindings.ward = classId === 'paladin' ? 'prayer' : classId === 'amazon' ? 'innerSight' : 'iceBolt';
    assert.equal(combat.castAction('attack', true), true, classId);
    assert.equal(combat.castAction(skill, true), true, classId);
    const mana = hero.mana;
    assert.equal(combat.castAction('attack', true), false, 'switching back cannot bypass attack speed');
    assert.equal(combat.cast('cleave', true), false);
    assert.equal(combat.cast('bolt', true), false, 'duplicate bindings share the same skill timer');
    assert.equal(hero.mana, mana);
    combat.update(.01);
    assert.ok(game.cooldowns.attack > 0 && game.cooldowns.cleave > 0);
    assert.equal(game.cooldowns.cleave, game.cooldowns.bolt);
    assert.equal(game.cooldowns.ward, 0, 'unused skills and auras show no cooldown');
  }
});

test('weapon and cast frame rates still control repeated use while movement recovers early', () => {
  for (const id of ['attack', 'holyBolt'] as const) {
    const { combat, hero } = classFixture('paladin'), s = stats(hero);
    const duration = (id === 'attack' ? s.attackFrames : s.castFrames) / 25;
    assert.equal(combat.castAction(id, true), true);
    assert.equal(combat.lock, duration);
    assert.equal(combat.movementLocked, true);
    combat.update(.13);
    assert.equal(combat.movementLocked, false);
    assert.equal(combat.castAction(id, true), false);
    combat.update(duration - .13);
    assert.equal(combat.castAction(id, true), true, 'ready on the frame boundary');
  }
});

test('authored spell delays are independent of other spells and normal attacks', () => {
  const paladin = classFixture('paladin'); paladin.enemy();
  assert.equal(paladin.combat.castAction('fistOfHeavens'), true);
  assert.equal(paladin.combat.cooldown('fistOfHeavens'), 1);
  assert.equal(paladin.combat.castAction('holyBolt'), true);
  paladin.tick(.6);
  assert.equal(paladin.combat.castAction('fistOfHeavens'), false);
  assert.equal(paladin.combat.castAction('attack'), true);
  paladin.tick(.44);
  assert.equal(paladin.combat.castAction('fistOfHeavens'), true);

  const { hero, combat, tick } = classFixture('sorceress');
  hero.mana = 500;
  assert.equal(combat.castAction('blizzard', true), true);
  assert.equal(combat.castAction('fireBall', true), true);
  assert.equal(combat.castAction('frozenOrb', true), true);
  tick(1.04);
  assert.equal(combat.castAction('blizzard', true), false);
  assert.equal(combat.castAction('frozenOrb', true), true);
  tick(.8);
  assert.equal(combat.castAction('blizzard', true), true);
});

test('a successful different action cancels a combo, failed casts keep the combo and its cooldown', () => {
  for (const [classId, combo, next] of [['paladin', 'zeal', 'holyBolt'], ['amazon', 'jab', 'poisonJavelin']] as const) {
    const { combat, hero } = classFixture(classId);
    assert.equal(combat.castAction(combo, true), true);
    const duration = combat.cooldown(combo), mana = hero.mana;
    hero.mana = 0;
    assert.equal(combat.castAction(next, true), false);
    assert.ok(combat.zeal || combat.classes.sequence);
    hero.mana = mana;
    assert.equal(combat.castAction(next, true), true);
    assert.equal(combat.zeal, null);
    assert.equal(combat.classes.sequence, undefined);
    assert.equal(combat.cooldown(combo), duration);
    assert.equal(combat.castAction(combo, true), false);
  }
});

test('hit recovery blocks actions without turning unrelated skill buttons into cooldowns', () => {
  const { combat, hero, game } = classFixture('sorceress');
  hero.bindings.cleave = 'fireBolt';
  combat.hurt(stats(hero).maxHp / 10, 'magic');
  assert.ok(combat.stagger > 0);
  assert.equal(combat.castAction('fireBolt'), false);
  assert.equal(combat.movementLocked, true);
  combat.update(.01);
  assert.equal(game.cooldowns.cleave, 0);
  combat.update(combat.stagger + .001);
  assert.equal(combat.castAction('fireBolt'), true);
});
