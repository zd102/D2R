import './style.css';
import './profiles.css';
import './character.css';
import './campaign.css';
import './expansion.css';
import './encyclopedia.css';
import './item-art.css';
import './shared-stash.css';
import './ui-layout.css';
import './ui-theme.css';
import './item-details.css';
import { Game } from './game';
import { levelLayout, questComplete } from './campaign';
import { CAMP } from './camp';
import { stats } from './model';
import { refreshSharedStorage } from './shared-storage';

try {
  await refreshSharedStorage();
  const game = new Game();
  // A read-only snapshot supports local browser verification without exposing cheats.
  Object.defineProperty(window, 'eclipseState', { get: () => ({
    profileId: game.profile?.id ?? null, profileName: game.profile?.name ?? null,
    classId:game.hero.classId, classModel:game.actor.group.userData.classId, buffs:structuredClone(game.hero.buffs),
    classCombat:{missiles:game.combat.classes.missiles.map(m=>({skill:m.skill,x:m.mesh.position.x,z:m.mesh.position.z,direction:m.direction.toArray()})),fields:game.combat.classes.fields.map(f=>({skill:f.id,life:f.life})),summons:game.combat.classes.summons.map(s=>({skill:s.id,hp:s.hp,maxHp:s.maxHp,x:s.actor.group.position.x,z:s.actor.group.position.z}))},
    position: { x: game.position.x, z: game.position.z }, level: game.hero.level,
    controls: { movementMode: game.movementMode, facing: game.actor.group.rotation.y, aim: { x: game.aim.x, z: game.aim.z }, pointerAim: game.pointerAimActive, gesture: game.pointerGesture?.mode ?? null, dragging: game.pointerGesture?.dragging ?? false,
      destination: game.path.length ? { x: game.path.at(-1)!.x, z: game.path.at(-1)!.z } : null, target: game.target?.id ?? null,
      projectiles: game.combat.projectiles.map(projectile => ({ kind: projectile.kind, direction: { x: projectile.direction.x, z: projectile.direction.z }, x: projectile.mesh.position.x, z: projectile.mesh.position.z })) },
    hp: game.hero.hp, mana: game.hero.mana, kills: game.hero.kills, gold: game.hero.gold,
    inventory: game.hero.inventory.length, shrines: [...game.hero.shrines], stage: game.hero.stage,
    paused: game.paused, dead: game.dead, started: game.started, inCamp: game.inCamp,
    bossDefeated: game.hero.bossDefeated,
    campaign: structuredClone(game.hero.campaign), difficulty: game.hero.difficultyLevel, unlockedDifficulty: game.hero.unlockedDifficulty,
    area: { id: game.inCamp ? CAMP.id : game.level.id, name: game.areaName, act: game.inCamp ? null : game.level.act, step: game.inCamp ? null : game.level.step, questReady: !game.inCamp && questComplete(game.hero.campaign), gridSize: game.world.grid.width, floorCells: game.world.floorCells.length },
    skills: { ...game.hero.skills }, skillPoints: game.hero.skillPoints, points: game.hero.points,
    activeAura: game.hero.activeAura, bindings: { ...game.hero.bindings }, holyShield: game.hero.holyShield,
    stamina: game.hero.stamina, weaponSet: game.hero.weaponSet, projectiles: game.combat.projectiles.length,
    ranged: { kind: stats(game.hero).ranged?.kind ?? null, ammo: stats(game.hero).ranged ? 'infinite' : 0, reserves: { ...game.hero.ammo }, model: game.actor.group.userData.rangedKind ?? null },
    enemyProjectiles: game.monsterCombat.missiles.length, enemyHazards: game.monsterCombat.hazards.length,
    enemies: game.enemies.filter(e => !e.dead).map(e => ({ id: e.id, name: e.name, species: e.definition?.id, model: e.definition?.model, attacks: e.definition?.attacks, cast: game.monsterCombat.telegraph(e), summoned: !!e.summoned, boss: e.boss, elite: !!e.elite, level: e.level, hp: e.hp, maxHp: e.maxHp, x: e.actor.group.position.x, z: e.actor.group.position.z, screen: game.project(e.actor.group.position.clone().setY(1)), ...(e.elite ? { route: game.world.path(game.position, e.actor.group.position).map(p => ({ x: p.x, z: p.z, screen: game.project(p) })) } : {}) })),
    objectives: (game.inCamp ? [{ ...CAMP.portal, kind: 'camp-portal', id: 0 }, { ...CAMP.supply, kind: 'supply', id: 0 }] : [...levelLayout(game.level).objects.map((p, id) => ({ ...p, kind: 'quest', id })), { ...levelLayout(game.level).boss, kind: 'boss', id: 0 }, { ...levelLayout(game.level).supply, kind: 'supply', id: 0 }, { ...levelLayout(game.level).exit, kind: 'exit', id: 0 }]).map(point => ({ ...point, screen: game.project(game.world.portal.position.clone().set(point.x, .3, point.z)), route: game.world.path(game.position, point).map(p => ({ x: p.x, z: p.z, screen: game.project(p) })) })),
    chests: game.world.chests.map(chest => ({ id: chest.id, x: chest.x, z: chest.z, opened: chest.opened, lidAngle: chest.lid.rotation.x, screen: game.project(chest.group.position.clone().setY(.7)), route: game.world.path(game.position, chest).map(p => ({ x: p.x, z: p.z, screen: game.project(p) })) })),
    loot: game.loot.map(l => ({ id: l.id, x: l.x, z: l.z, item: l.item?.name, gold: l.gold, potion: l.potion, rune: l.rune, screen: game.project(l.mesh.position) })),
    drawCalls: game.renderer.info.render.calls, triangles: game.renderer.info.render.triangles,
  }) });
} catch (error) {
  console.error(error);
  document.getElementById('app')!.innerHTML = '<main class="fatal"><h1>无法开启旅程</h1><p>3D 场景加载失败，请使用支持 WebGL 2 的浏览器并开启硬件加速。</p><button onclick="location.reload()">重新加载</button></main>';
}
