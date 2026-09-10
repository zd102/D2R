import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHero, stats } from '../src/model.ts';
import { heroStatuses, statusTime } from '../src/status-effects.ts';

test('shield buffs never hide concurrent poison, curses or cold', () => {
  const hero = newHero(); hero.holyShield = 60; hero.holyShieldLevel = 1;
  hero.poison = 8; hero.curse = 12; hero.cold = 4;
  const effects = heroStatuses(hero);
  assert.deepEqual(effects.filter(e => e.kind === 'debuff').map(e => e.id), ['poison', 'curse', 'cold']);
  assert.ok(effects.some(e => e.id === 'holyShield' && e.remaining === 60));
  hero.poison = hero.curse = hero.cold = 0;
  assert.deepEqual(heroStatuses(hero).map(e => e.id), ['holyShield']);
});

test('all active class buffs are listed, expired buffs are removed and absent shields grant no shield status', () => {
  const hero = newHero('sorceress');
  hero.buffs = { frozenArmor: { remaining: 100, rank: 4 }, enchant: { remaining: 50, rank: 3 }, energyShield: { remaining: 25, rank: 2 }, blaze: { remaining: 0, rank: 1 } };
  assert.deepEqual(heroStatuses(hero).map(e => e.id), ['frozenArmor', 'enchant', 'energyShield']);
  hero.holyShield = 40; hero.equipment.shield = null;
  assert.ok(!heroStatuses(hero).some(e => e.id === 'holyShield'));
});

test('selected and equipment auras remain distinct from timed effects', () => {
  const hero = newHero(); hero.skills.prayer = 1; hero.activeAura = 'prayer';
  const current = stats(hero); current.auras.push({ ...current.auras[0], id: 'vigor', rank: 5 });
  const effects = heroStatuses(hero, current);
  assert.equal(effects.length, 2);
  assert.ok(effects.every(e => e.remaining === null && e.kind === 'buff'));
  assert.match(effects.find(e => e.id === 'aura-vigor')!.description, /装备/);
});

test('status timers show expiry precision and never display a 60-second minute component', () => {
  assert.equal(statusTime(null), '常驻');
  assert.equal(statusTime(.25), '0.3秒');
  assert.equal(statusTime(5.1), '6秒');
  assert.equal(statusTime(119.9), '2:00');
  assert.equal(statusTime(61.2), '1:02');
});
