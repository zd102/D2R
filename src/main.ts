import './style.css';
import './profiles.css';
import './character.css';
import './campaign.css';
import './expansion.css';
import { Game } from './game';
import { levelLayout, questComplete } from './campaign';

try {
  const game = new Game();
  // A read-only snapshot supports local browser verification without exposing cheats.
  Object.defineProperty(window, 'eclipseState', { get: () => ({
    profileId: game.profile?.id ?? null, profileName: game.profile?.name ?? null,
    position: { x: game.position.x, z: game.position.z }, level: game.hero.level,
    hp: game.hero.hp, mana: game.hero.mana, kills: game.hero.kills, gold: game.hero.gold,
    inventory: game.hero.inventory.length, shrines: [...game.hero.shrines], stage: game.hero.stage,
    paused: game.paused, dead: game.dead, started: game.started,
    bossDefeated: game.hero.bossDefeated,
    campaign: structuredClone(game.hero.campaign), difficulty: game.hero.difficultyLevel, unlockedDifficulty: game.hero.unlockedDifficulty,
    area: { id: game.level.id, name: game.level.name, act: game.level.act, step: game.level.step, questReady: questComplete(game.hero.campaign) },
    skills: { ...game.hero.skills }, skillPoints: game.hero.skillPoints, points: game.hero.points,
    activeAura: game.hero.activeAura, bindings: { ...game.hero.bindings }, holyShield: game.hero.holyShield,
    stamina: game.hero.stamina, weaponSet: game.hero.weaponSet, projectiles: game.combat.projectiles.length,
    enemyProjectiles: game.monsterCombat.missiles.length, enemyHazards: game.monsterCombat.hazards.length,
    enemies: game.enemies.filter(e => !e.dead).map(e => ({ id: e.id, name: e.name, species: e.definition?.id, model: e.definition?.model, attacks: e.definition?.attacks, cast: game.monsterCombat.telegraph(e), summoned: !!e.summoned, boss: e.boss, level: e.level, hp: e.hp, maxHp: e.maxHp, x: e.actor.group.position.x, z: e.actor.group.position.z, screen: game.project(e.actor.group.position.clone().setY(1)) })),
    objectives: [...levelLayout(game.level).objects.map((p, id) => ({ ...p, kind: 'quest', id })), { x: 0, z: -23, kind: 'boss', id: 0 }, { x: -5.8, z: 12, kind: 'supply', id: 0 }, { x: 0, z: -26, kind: 'exit', id: 0 }].map(point => ({ ...point, route: game.world.path(game.position, point).map(p => ({ x: p.x, z: p.z, screen: game.project(p) })) })),
    loot: game.loot.map(l => ({ id: l.id, x: l.x, z: l.z, item: l.item?.name, screen: game.project(l.mesh.position) })),
    drawCalls: game.renderer.info.render.calls, triangles: game.renderer.info.render.triangles,
  }) });
} catch (error) {
  console.error(error);
  document.getElementById('app')!.innerHTML = '<main class="fatal"><h1>无法开启旅程</h1><p>3D 场景加载失败，请使用支持 WebGL 2 的浏览器并开启硬件加速。</p><button onclick="location.reload()">重新加载</button></main>';
}
