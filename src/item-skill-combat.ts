import type { PaladinCombat } from './combat.ts';
import type { ItemCurse } from './item-effects.ts';
import { itemDamage } from './item-effects.ts';
import { itemSkillKind, type ItemSkillId } from './item-skill-definitions.ts';
import { castingSkillLevel, castingSkillCost, stats, skillLevel } from './model.ts';
import { skillValues } from './paladin.ts';
import { clearShot } from './ranged.ts';

export function castItemSkill(combat: PaladinCombat, id: ItemSkillId, aimed: boolean) {
  const g = combat.game, h = g.hero, rank = castingSkillLevel(h, id), v = skillValues(id, rank, h.skills), kind = itemSkillKind(id);
  if (!rank) return false;
  const point = kind==='buff' || kind==='melee' || id==='battleCry' || id==='poisonNova' || id==='cloakOfShadows' ? g.position : aimed ? g.aim : g.target?.actor.group.position ?? g.aim;
  if (point.distanceTo(g.position) > 14 || !clearShot(g.world.grid, g.position, point)) return false;
  const targets = g.enemies.filter(enemy => combat.hostile(enemy) && enemy.actor.group.position.distanceTo(point) <= v.radius && clearShot(g.world.grid, g.position, enemy.actor.group.position));
  const corpse = g.enemies.find(enemy => enemy.dead && !enemy.redeemed && enemy.actor.group.position.distanceTo(point) < 4 && g.position.distanceTo(enemy.actor.group.position) <= 14 && clearShot(g.world.grid, g.position, enemy.actor.group.position));
  if (kind === 'corpse' && !corpse) { g.ui.toast('需要可用的尸体'); return false; }
  if (kind === 'melee' && (!stats(h).weapon || stats(h).ranged || id === 'feralRage' && !h.buffs.wearwolf)) { g.ui.toast('需要近战武器及对应变形状态'); return false; }
  const destination = kind === 'summon' ? combat.classes.destination(point, false) : undefined;
  if (kind === 'summon' && !destination) return false;
  // Iron Golem consumes a metal item lying on the ground, never an inventory item.
  const metal = id === 'ironGolem' ? g.loot?.find(loot => loot.item && ['weapon','armor','helm','shield'].includes(loot.item.slot) && loot.mesh.position.distanceTo(point) < 3) : undefined;
  if (id === 'ironGolem' && !metal) { g.ui.toast('需要地上的金属装备'); return false; }
  v.cost = castingSkillCost(h, id, v.cost);
  if (h.mana < v.cost) { g.ui.toast('法力不足'); return false; }
  if (kind === 'melee' && !g.enemies.some(enemy => combat.hostile(enemy) && enemy.actor.group.position.distanceTo(g.position) < (id === 'whirlwind' ? 3 : 2.6))) return false;
  h.mana -= v.cost; g.monsterCombat?.castCost?.(v.cost); if(g.dead)return false;
  combat.startAction(id, stats(h).castFrames / 25); g.attackTime = 1;
  g.audio.play('spell', { nativeKey: `cast:${id}` }); g.burst(point.clone().setY(1), 0xb9c6eb, 16);
  if (kind === 'buff') {
    if (id === 'wearwolf' || id === 'wearbear') { delete h.buffs.wearwolf; delete h.buffs.wearbear; v.duration += skillValues('shapeShifting', skillLevel(h, 'shapeShifting')).duration; }
    h.buffs[id] = { rank, remaining: v.duration }; return true;
  }
  if (kind === 'summon' || id === 'revive') {
    if (corpse && id === 'revive') { corpse.redeemed = true; corpse.actor.group.visible = false; }
    if (metal) { g.disposeObject(metal.mesh); g.loot.splice(g.loot.indexOf(metal), 1); }
    combat.classes.summon('valkyrie', destination ?? corpse!.actor.group.position.clone(), rank, id);
    return true;
  }
  if (id === 'grimWard') {
    corpse!.redeemed = true;
    for (const enemy of g.enemies) if (combat.hostile(enemy) && !enemy.boss && enemy.actor.group.position.distanceTo(corpse!.actor.group.position) < v.radius) enemy.flee = Math.max(enemy.flee ?? 0, v.duration);
    return true;
  }
  if (id === 'corpseExplosion' || id === 'poisonExplosion') {
    corpse!.redeemed = true; corpse!.actor.group.visible = false;
    for (const enemy of g.enemies) if (combat.hostile(enemy) && enemy.actor.group.position.distanceTo(corpse!.actor.group.position) < v.radius) {
      if (id === 'corpseExplosion') { const amount = corpse!.maxHp * (.7 + Math.random() * .5) / 2; combat.damage(enemy, amount, 'physical'); combat.damage(enemy, amount, 'fire'); }
      else enemy.poison = { dps: itemDamage((v.min + v.max) / 2 / v.duration, 'poison', stats(h).mods, enemy.resistances.poison), remaining: v.duration, snapshot: combat.snapshot() };
    }
    return true;
  }
  if (kind === 'curse') {
    for (const enemy of targets) {
      if (enemy.champion?.id === 'possessed') continue;
      if (id === 'cloakOfShadows' || id === 'dimVision') { if (!enemy.boss) enemy.blind = Math.max(enemy.blind ?? 0, v.duration); }
      else if (id === 'terror') { if (!enemy.boss) enemy.flee = Math.max(enemy.flee ?? 0, v.duration); }
      else if (id === 'attract' || id === 'confuse') { if (!enemy.boss) enemy.converted = Math.max(enemy.converted, v.duration); }
      else combat.itemCurses.set(enemy, { kind: id === 'amplifyDamage' ? 'amplify' : id as ItemCurse, remaining: v.duration, rank });
    }
    return true;
  }
  if (kind === 'melee') {
    for (const enemy of g.enemies.filter(enemy => combat.hostile(enemy) && enemy.actor.group.position.distanceTo(g.position) < (id === 'whirlwind' ? 3 : 2.6)).slice(0, id === 'whirlwind' ? undefined : 1)) {
      combat.weaponHit(enemy, id);
      if (id === 'stun' && !enemy.boss) enemy.stunned = Math.max(enemy.stunned, v.duration);
      if (id === 'bash' && !enemy.boss) combat.knockback(enemy, 1);
      if (id === 'poisonDagger') enemy.poison = { dps: itemDamage((v.min + v.max) / 2 / v.duration, 'poison', stats(h).mods, enemy.resistances.poison), remaining: v.duration, snapshot: combat.snapshot() };
    }
    if (id === 'feralRage') h.buffs.feralRage = { rank, remaining: 20 };
    return true;
  }
  for (const enemy of id === 'poisonNova' ? g.enemies.filter(enemy => combat.hostile(enemy) && enemy.actor.group.position.distanceTo(g.position) < v.radius) : targets) {
    if (id === 'bonePrison') { if (!enemy.boss) enemy.stunned = Math.max(enemy.stunned, v.duration); }
    else if (v.type === 'poison') enemy.poison = { dps: itemDamage((v.min + v.max) / 2 / v.duration, 'poison', stats(h).mods, enemy.resistances.poison), remaining: v.duration, snapshot: combat.snapshot() };
    else { combat.damage(enemy, (v.min + v.max) / 2, v.type); if (v.type === 'cold') enemy.coldTime = Math.max(enemy.coldTime, v.duration); if (id === 'twister' && !enemy.boss) enemy.stunned = Math.max(enemy.stunned, .4); }
  }
  return true;
}
