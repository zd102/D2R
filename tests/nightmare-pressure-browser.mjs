import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { serializeSave } from '../src/model.ts';
import { enterGame } from './browser-helpers.mjs';
import assert from 'node:assert/strict';
import { nightmareMeleeHero } from './nightmare-pressure-fixture.ts';
// An isolated headless context owns every save write; never attach to the player's browser.
const loadout = nightmareMeleeHero();
const output = process.env.OUTPUT_DIR || '.verification/nightmare-pressure';
const baseUrl = new URL(process.env.BASE_URL || 'http://127.0.0.1:5173');
baseUrl.searchParams.set('mode', 'local');
fs.mkdirSync(output, { recursive: true });
const errors = [];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/src/main.ts*', async (route) => { const r = await route.fetch(); await route.fulfill({ response: r, body: (await r.text()).replace('const game = new Game();', 'const game = new Game(); window.pressureGame=game;') }); });
    await page.route('**/src/world.ts*', async (route) => { const r = await route.fetch(); await route.fulfill({ response: r, body: (await r.text()).replace('seed = nextMapSeed()', 'seed = 20260915') }); });
    const hero = structuredClone(loadout);
    await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(hero));
    await page.goto(baseUrl.href);
    await enterGame(page);
    await page.evaluate(() => cancelAnimationFrame(window.pressureGame.frameId));
    const results = [];
    for (const scenario of [{ seed: 967, players: 5, mode: 'fight' }, { seed: 20260915, players: 5, mode: 'fight' }, { seed: 42, players: 5, mode: 'fight' }, { seed: 967, players: 5, mode: 'idle' }, { seed: 967, players: 1, mode: 'fight' }, { seed: 967, players: 8, mode: 'fight' }, { seed: 967, players: 5, mode: 'fight', elite: true }]) {
        const { seed: initialSeed, players, mode, elite = false } = scenario;
        const result = await page.evaluate(async ({ loadout, initialSeed, players, mode, elite }) => {
            const g = window.pressureGame, { stats } = await import('/src/model.ts'), { mercenaryStats } = await import('/src/mercenary.ts'), { MONSTERS } = await import('/src/bestiary.ts');
            const original = Math.random;
            let seed = initialSeed;
            Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
            try {
                Object.assign(g.hero, structuredClone(loadout));
                g.hero.playerCount = players;
                g.hero.campaign.current = 22;
                g.hero.campaign.cleared = [25, 25, 0];
                g.dead = false;
                g.loadArea(false);
                g.started = true;
                g.paused = false;
                g.inCamp = false;
                g.hero.holyShield = 1000;
                g.hero.holyShieldLevel = loadout.holyShieldLevel;
                g.hero.hp = stats(g.hero).maxHp;
                g.hero.mana = stats(g.hero).maxMana;
                g.hero.mercenary.hp = mercenaryStats(g.hero).maxHp;
                for (const e of g.enemies) {
                    g.world.physics.removeBody(e.body);
                    g.disposeObject(e.actor.group);
                }
                g.enemies = [];
                // Real walkable terrain, collision, AI, attacks, leech and fixed game ticks.
                // Place a controlled mixed pack so encounter pressure is repeatable.
                const grid = g.world.grid;
                let center;
                outer: for (let x = 8; x < grid.width - 8; x++)
                    for (let z = 8; z < grid.height - 8; z++) {
                        let open = true;
                        for (let dx = -6; dx <= 6; dx++)
                            for (let dz = -6; dz <= 6; dz++)
                                if (!grid.isWalkableAt(x + dx, z + dz))
                                    open = false;
                        if (open) {
                            center = { x: x - Math.floor(grid.width / 2), z: z - Math.floor(grid.height / 2) };
                            break outer;
                        }
                    }
                if (!center)
                    throw Error('No open arena');
                g.position.set(center.x, 0, center.z);
                g.body.position.set(center.x, .5, center.z);
                g.body.velocity.set(0, 0, 0);
                g.path = [];
                g.target = undefined;
                g.mercenary.clear();
                g.mercenary.sync();
                const kinds = ['bloodLord', 'bloodLord', 'bloodLord', 'bloodLord', 'succubus', 'succubus', 'soul', 'soul'];
                const enemies = kinds.map((id, i) => { const angle = i * Math.PI / 4, r = i < 4 ? 3 : 5; const e = g.spawnEnemy(center.x + Math.cos(angle) * r, center.z + Math.sin(angle) * r, 'demon', MONSTERS[id], elite && i === 0); e.active = true; e.cooldown = i * .12; return e; });
                const maxHp = g.hero.hp, maxMerc = g.hero.mercenary.hp;
                let minHp = maxHp, minMerc = maxMerc, hurt = 0, mercHurt = 0;
                const originalHurt = g.combat.hurt.bind(g.combat), originalMerc = g.mercenary.hurt.bind(g.mercenary);
                // Sample every damage call: frame-end sampling misses life restored by leech.
                g.combat.hurt = (...args) => { const before = g.hero.hp, r = originalHurt(...args); hurt += Math.max(0, before - g.hero.hp); minHp = Math.min(minHp, g.hero.hp); return r; };
                g.mercenary.hurt = (...args) => { const before = g.hero.mercenary.hp, r = originalMerc(...args); mercHurt += Math.max(0, before - g.hero.mercenary.hp); minMerc = Math.min(minMerc, g.hero.mercenary.hp); return r; };
                let steps = 0;
                try {
                    for (; steps < 30 * 60 && !g.dead; steps++) {
                        if (mode === 'fight' && (!g.target || g.target.dead)) {
                            g.target = enemies.filter(e => !e.dead).sort((a, b) => a.actor.group.position.distanceToSquared(g.position) - b.actor.group.position.distanceToSquared(g.position))[0];
                            g.path = [];
                            g.targetDestination = undefined;
                            g.targetPathTimer = 0;
                        }
                        g.update(1 / 60);
                        if (enemies.every(e => e.dead))
                            break;
                    }
                }
                finally {
                    g.combat.hurt = originalHurt;
                    g.mercenary.hurt = originalMerc;
                }
                g.updateCamera(1);
                g.ui.update(.2);
                g.renderer.render(g.world.scene, g.camera);
                return { seed: initialSeed, players, mode, elite, seconds: steps / 60, kills: enemies.filter(e => e.dead).length, minHp: minHp / maxHp, minMerc: minMerc / maxMerc, hurt, mercHurt, dead: g.dead, mercDead: g.hero.mercenary.status === 'dead' };
            }
            finally {
                Math.random = original;
            }
        }, { loadout, initialSeed, players, mode, elite });
        results.push(result);
        console.log(JSON.stringify(result));
        for (const key of ['seconds', 'minHp', 'minMerc', 'hurt', 'mercHurt'])
            assert.ok(Number.isFinite(result[key]), JSON.stringify(result));
        if (!elite && mode === 'fight') {
            assert.equal(result.dead, false, JSON.stringify(result));
            assert.equal(result.mercDead, false, JSON.stringify(result));
            assert.equal(result.kills, 8, JSON.stringify(result));
            assert.ok(result.seconds < 20, JSON.stringify(result));
            if (players === 5) {
                assert.ok(result.minHp > .5 && result.minHp < .92, JSON.stringify(result));
                assert.ok(result.minMerc > .15 && result.minMerc < .85, JSON.stringify(result));
            }
        }
        if (mode === 'idle') {
            assert.equal(result.mercDead, true, 'Unsupported guard cannot clear the dangerous pack alone');
            assert.ok(result.kills < 8 && result.minHp < .5, JSON.stringify(result));
        }
        if (elite) {
            assert.equal(result.dead, false, JSON.stringify(result));
            assert.equal(result.kills, 8, JSON.stringify(result));
            assert.ok(result.minHp > .3 && result.minHp < .85, JSON.stringify(result));
            assert.ok(result.minMerc < .3, 'Elite pressure must require attention to the guard');
        }
        await page.screenshot({ path: output + '/' + players + 'pp-' + initialSeed + '-' + mode + (elite ? '-elite' : '') + '.png' });
    }
    fs.writeFileSync(output + '/results.json', JSON.stringify(results, null, 2));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: output + '/mixed-pack.png' });
}
finally {
    await browser.close();
}
