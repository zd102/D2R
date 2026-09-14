import { simulateProgression, referenceHero, referenceMetrics } from '../tests/balance-fixtures.ts';
import { BOSSES, ENCOUNTERS, MONSTERS } from '../src/bestiary.ts';
import { LEVELS, SPECIAL_LEVELS, levelTuning } from '../src/campaign.ts';
import { PLAYER_COUNTS, playerLifeFactor, playerExperienceFactor, playerDropExponent } from '../src/player-count.ts';
import { simulateDuel } from '../tests/balance-duel.ts';
const names = ['Normal', 'Nightmare', 'Hell'];
console.log('PP reward tradeoffs: XP per kill; XP per second improves only if clear time grows less than the XP factor.');
console.table(PLAYER_COUNTS.map(players => ({ players, life: playerLifeFactor(players), xp: +playerExperienceFactor(players).toFixed(3), xpPerLife: +(playerExperienceFactor(players) / playerLifeFactor(players)).toFixed(3), dropTier: playerDropExponent(players) })));
for (const fraction of [.65, 1]) for (const cows of [false, true]) {
  console.log(`\nProgression, ${fraction * 100}% campaign clearing, champions included, ${cows ? 'one cow run after each difficulty' : 'no farming'}:`);
  console.table(PLAYER_COUNTS.flatMap(players => simulateProgression(fraction, 20260910, { players, cows }).filter(row => row.act === 4).map(row => ({ players, difficulty: names[row.difficulty], level: row.level, afterCow: row.cowLevel ?? '-' }))));
}
console.log('\nArea budgets (species and PP multipliers apply separately):');
console.table([0, 1, 2].flatMap(difficulty => [...LEVELS, SPECIAL_LEVELS.cow].map(area => {
  const tuning = levelTuning(area, difficulty);
  return { difficulty: names[difficulty], area: area.id, level: tuning.level, life: +tuning.hp.toFixed(2), damage: +tuning.damage.toFixed(2) };
})));
const rows = [];
for (const players of [1, 5, 8] as const) for (const row of simulateProgression(.65, 20260910, { players })) for (const build of ['zeal', 'hammer'] as const) {
  const index = row.act * 5 + 4, hero = referenceHero(row.level, row.difficulty as 0 | 1 | 2, build, index);
  hero.playerCount = players;
  const boss = referenceMetrics(hero, BOSSES[index], index, true), enemies = ENCOUNTERS[index].map(id => referenceMetrics(hero, MONSTERS[id], index));
  rows.push({ players, difficulty: names[row.difficulty], act: row.act + 1, level: row.level, build, life: boss.maxHp, monsterHP: Math.max(...enemies.map(e => e.monsterHp)), monsterSeconds: Math.max(...enemies.map(e => e.seconds)), bossHP: boss.monsterHp, bossSeconds: boss.seconds, bossHitPercent: boss.maxHitPercent, hitChance: boss.hitChance, mana: boss.mana, cost: boss.cost });
}
console.log('\nReference combat: legal skill/attribute budgets, moderate gear, 65% attack uptime; no potion, CB or poison DPS credit.');
console.table(rows);
if (process.argv.includes('--duels')) {
  const results = [], random = Math.random;
  try {
    for (const players of [1, 5, 8] as const) for (const row of simulateProgression(.65, 20260910, { players }).filter(row => row.act === 4)) for (const build of ['zeal', 'hammer'] as const) {
      let seed = 967; Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      results.push({ players, ...simulateDuel(row.level, row.difficulty as 0 | 1 | 2, 24, build, players) });
    }
  } finally { Math.random = random; }
  console.log('\nActual controller duels: eight potions of each type, moderate gear, 180-second limit. Losses are reported; high-PP Hell is an equipment challenge.');
  console.table(results);
}
