import { simulateProgression, referenceHero, referenceMetrics } from '../tests/balance-fixtures.ts';
import { BOSSES, ENCOUNTERS, MONSTERS } from '../src/bestiary.ts';
import { LEVELS } from '../src/campaign.ts';
const names = ['Normal', 'Nightmare', 'Hell'];
for (const fraction of [.65, 1]) {
  console.log(`\nProgression, ${fraction * 100}% of ordinary monsters, no farming:`);
  console.table(simulateProgression(fraction).map(row => ({ difficulty: names[row.difficulty], act: row.act + 1, level: row.level })));
}
const rows = [];
for (const row of simulateProgression()) for (const build of ['zeal', 'hammer'] as const) {
  const index = row.act * 5 + 4, hero = referenceHero(row.level, row.difficulty as 0 | 1 | 2, build);
  const boss = referenceMetrics(hero, BOSSES[index], index, true), enemies = ENCOUNTERS[index].map(id => referenceMetrics(hero, MONSTERS[id], index));
  rows.push({ difficulty: names[row.difficulty], act: row.act + 1, level: row.level, build, life: boss.maxHp, monsterHP: Math.max(...enemies.map(e => e.monsterHp)), monsterSeconds: Math.max(...enemies.map(e => e.seconds)), bossHP: boss.monsterHp, bossSeconds: boss.seconds, bossHitPercent: boss.maxHitPercent, hitChance: boss.hitChance, mana: boss.mana, cost: boss.cost });
}
console.log('\nReference combat: legal skill/attribute budgets, moderate gear, 65% attack uptime; no potion, CB or poison DPS credit.');
console.table(rows);
