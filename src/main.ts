import './style.css';
import './profiles.css';
import { Game } from './game';
import { SHRINES } from './world';

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
    enemies: game.enemies.filter(e => !e.dead).map(e => ({ id: e.id, name: e.name, hp: e.hp, x: e.actor.group.position.x, z: e.actor.group.position.z, screen: game.project(e.actor.group.position.clone().setY(1)) })),
    objectives: [...SHRINES, { x: 0, z: -23 }, { x: -5.8, z: 12 }].map(point => ({ ...point, route: game.world.path(game.position, point).map(p => ({ x: p.x, z: p.z, screen: game.project(p) })) })),
    loot: game.loot.map(l => ({ id: l.id, x: l.x, z: l.z, item: l.item?.name, screen: game.project(l.mesh.position) })),
    drawCalls: game.renderer.info.render.calls, triangles: game.renderer.info.render.triangles,
  }) });
} catch (error) {
  console.error(error);
  document.getElementById('app')!.innerHTML = '<main class="fatal"><h1>无法开启旅程</h1><p>3D 场景加载失败，请使用支持 WebGL 2 的浏览器并开启硬件加速。</p><button onclick="location.reload()">重新加载</button></main>';
}
