import { newHero, gainXp, learnSkill, allocateAttribute, stats, skillLevel, activeEquipment, hitChance, resistedDamage, selectCampaignLevel, completeCampaignLevel, type HeroState } from '../src/model.ts';
import { EXPERIENCE, skillById, skillValues, type SkillId, type DamageType } from '../src/paladin.ts';
import { BASES, specialItem, makeItem, RUNEWORDS, socketItem, itemRequirements, type Item, type Mods } from '../src/items.ts';
import { LEVELS, SPECIAL_LEVELS, levelLayout } from '../src/campaign.ts';
import { encounterPlan, cowEncounterPlan } from '../src/encounter-plan.ts';
import { BOSSES, MONSTERS, ENCOUNTERS, type MonsterDef } from '../src/bestiary.ts';
import type { PlayerCount } from '../src/player-count.ts';
import { monsterExperience, monsterStats } from '../src/balance.ts';
import { ATTACKS } from '../src/monster-combat.ts';

export type ProgressionOptions = { players?: PlayerCount; cows?: boolean };
export function simulateCowRun(hero: HeroState, seed = 20260910) {
  const area = SPECIAL_LEVELS.cow, diff = hero.difficultyLevel, layout = levelLayout(area, seed);
  const sites = cowEncounterPlan(layout);
  const reward = (rank: 'monster' | 'champion' | 'elite' | 'miniboss') => {
    const enemy = monsterStats(MONSTERS.hellCow, area, diff, rank === 'miniboss', rank === 'elite', hero.playerCount);
    if (rank === 'champion') enemy.level = Math.min(99, enemy.level + 2);
    gainXp(hero, monsterExperience(hero.level, enemy.level, rank, { difficulty: diff, act: area.act, baseLife: MONSTERS.hellCow.hp, players: hero.playerCount }));
  };
  sites.forEach(site => site.ranks.forEach(reward));
  reward('miniboss');
}
export function simulateProgression(clearFraction = 1, seed = 20260910, options: ProgressionOptions = {}) {
  const hero = newHero(), rows: { difficulty: number; act: number; level: number; entryLevel: number; cowLevel?: number; hero: HeroState }[] = [];
  hero.playerCount = options.players ?? 1;
  let entryLevel = hero.level;
  for (const difficulty of [0, 1, 2] as const) for (const area of LEVELS) {
    if (area.index % 5 === 0) entryLevel = hero.level;
    selectCampaignLevel(hero, area.index, difficulty);
    const pool = ENCOUNTERS[area.index], plan = encounterPlan(area, levelLayout(area, seed + area.index + difficulty * 25), difficulty);
    const champions = new Set(plan.elitePacks);
    const species = plan.packs.flatMap((pack, id) => pack.species.map(species => ({ species, champion: champions.has(id) })));
    const count = Math.max(area.quest.kind === 'kill' ? area.quest.count : 0, Math.round(species.length * clearFraction));
    for (const spawn of species.slice(0, count)) {
      const definition = MONSTERS[spawn.species], enemy = monsterStats(definition, area, difficulty);
      if (spawn.champion) enemy.level = Math.min(99, enemy.level + 2);
      gainXp(hero, monsterExperience(hero.level, enemy.level, spawn.champion ? 'champion' : 'monster', { difficulty, act: area.act, baseLife: definition.hp, players: hero.playerCount }) * (spawn.champion ? 1 : plan.xpScale));
    }
    for (let i = 0; i < Math.round(plan.eliteSites.length * clearFraction); i++) {
      const definition = MONSTERS[pool[(area.index + i) % pool.length]], elite = monsterStats(definition, area, difficulty, false, true);
      gainXp(hero, monsterExperience(hero.level, elite.level, 'elite', { difficulty, act: area.act, baseLife: definition.hp, players: hero.playerCount }));
    }
    const boss = monsterStats(BOSSES[area.index], area, difficulty, true);
    gainXp(hero, monsterExperience(hero.level, boss.level, area.actBoss ? 'actBoss' : 'miniboss', { difficulty, act: area.act, players: hero.playerCount, firstClear: hero.campaign.cleared[difficulty] === area.index }));
    hero.campaign.kills = area.quest.count; hero.campaign.objects = Array.from({ length: area.quest.count }, (_, i) => i); completeCampaignLevel(hero);
    if (area.actBoss) {
      const row = { difficulty, act: area.act, level: hero.level, entryLevel, hero: structuredClone(hero), cowLevel: undefined as number | undefined };
      if (area.index === 24 && options.cows) { simulateCowRun(hero, seed); row.cowLevel = hero.level; }
      rows.push(row);
    }
  }
  return rows;
}

export type ReferenceBuild = 'zeal' | 'hammer';
const base = (name: string) => makeItem(BASES.find(b => b.name === name)!);
const word = (baseName: string, name: string) => { const item = base(baseName), recipe = RUNEWORDS.find(w => w.name === name)!; item.sockets = recipe.runes.length; recipe.runes.forEach(rune => socketItem(item, rune, () => .5)); if (item.name !== name) throw new Error(`Invalid fixture recipe: ${name}`); return item; };
const rare = (baseName: string, requiredLevel: number, mods: Mods): Item => ({ ...base(baseName), rarity: 'rare', requiredLevel, mods });
export function referenceHero(level: number, difficulty: 0 | 1 | 2, build: ReferenceBuild, campaignIndex?: number, prepared = false) {
  const hero = newHero(); gainXp(hero, EXPERIENCE[level - 1]); hero.difficultyLevel = difficulty;
  hero.skillPoints += difficulty * 4 + (level >= 34 ? 4 : level >= 15 ? 2 : level >= 3 ? 1 : 0);
  hero.points += difficulty * 5 + (level >= 27 ? 5 : 0); hero.bonusLife = difficulty * 20 + (level >= 24 ? 20 : 0); hero.bonusResist = difficulty * 10 + (level >= 40 ? 10 : 0);
  if (campaignIndex !== undefined) {
    // Progression measurements use actual campaign rewards, not legacy shrine bonuses.
    hero.skillPoints = level - 1 + difficulty * 4 + (campaignIndex >= 5 ? 2 : 0) + (campaignIndex >= 16 ? 2 : 0);
    hero.points = (level - 1) * 5; hero.bonusLife = 0;
    hero.bonusResist = (difficulty + Number(campaignIndex >= 22)) * 5;
    for (const key of ['strength', 'dexterity', 'vitality', 'energy'] as const) hero[key] += (difficulty + Number(campaignIndex >= 11)) * 5;
  }
  const skillBudget = hero.skillPoints;
  hero.campaign.cleared = difficulty === 0 ? [25, 0, 0] : difficulty === 1 ? [25, 25, 0] : [25, 25, 25];
  hero.unlockedDifficulty = difficulty === 0 ? 1 : 2;
  hero.equipment.weapon = build === 'hammer' && level >= 25 ? word('水晶剑', '精神') : level >= 72 ? word('秘仪之剑', '誓约') : level >= 45 ? word('神属权杖', '荣耀') : level >= 27 ? word('巨战权杖', '荣耀') : level >= 13 ? word('水晶剑', '钢铁') : base('权杖');
  hero.equipment.shield = build === 'hammer' && level >= 65 ? word('统治者大盾', '精神') : level >= 21 ? word('轻圆盾', '先祖之誓') : base('圆盾');
  hero.equipment.armor = level >= 37 ? word(level >= 55 ? '灰暮寿衣' : '鬼魂战甲', '烟雾') : level >= 17 ? word('皮甲', '隐密') : base('皮甲');
  hero.equipment.helm = level >= 27 ? word('头盔', '知识') : base('皮帽');
  if (level >= 15) hero.equipment.gloves = rare('皮手套', 15, { ias: 10, fireRes: 15 });
  if (level >= 20) hero.equipment.boots = rare('皮靴', 20, { runWalk: 20, coldRes: 20, lightningRes: 20 });
  if (level >= 30) { hero.equipment.belt = rare('饰带', 30, { life: 40, fhr: 24, fireRes: 20 }); hero.equipment.ring = rare('戒指', 30, { life: 20, attackRating: 70, lightningRes: 15 }); }
  if (level >= 40) hero.equipment.amulet = rare('项链', 40, { paladinSkills: 1, allRes: 15, life: 20, ...(build === 'hammer' ? { fcr: 10 } : {}) });
  // Hell completion uses attainable endgame drops with median rolls, not starter runewords.
  // Keep the moderate fixture as the default for independent stat-budget measurements.
  if (difficulty === 2 && prepared) {
    for (const id of ['unique-249', 'unique-273', 'unique-377', 'set-97', 'unique-276']) {
      const item = specialItem(id, () => .5); item.identified = true; hero.equipment[item.slot] = item;
    }
  }
  if (difficulty === 2 && prepared) { hero.equipment.ring2 = specialItem('unique-275', () => .5); hero.equipment.ring2.identified = true; }
  const equipment = Object.values(hero.equipment).filter((item): item is Item => !!item);
  allocateAttribute(hero, 'strength', Math.max(0, Math.max(...equipment.map(item => itemRequirements(item).strength)) - hero.strength));
  allocateAttribute(hero, 'dexterity', Math.max(0, Math.max(build === 'zeal' ? Math.min(110, 20 + level) : 20, ...equipment.map(item => itemRequirements(item).dexterity)) - hero.dexterity));
  if (hero.points) allocateAttribute(hero, 'vitality', hero.points);
  const learn = (id: SkillId, rank = 1) => {
    if (level < skillById[id].level) return;
    for (const prerequisite of skillById[id].requires) if (!hero.skills[prerequisite]) learn(prerequisite);
    while (hero.skills[id] < rank && learnSkill(hero, id)) { /* Spend only legal, earned points. */ }
  };
  if (level >= 24) learn('holyShield');
  if (build === 'hammer' && level >= 18) {
    learn('blessedHammer', 20); learn('concentration', Math.max(1, Math.floor((level - 17) / 3))); learn('vigor', 20); learn('blessedAim', 20); learn('concentration', 20);
    hero.activeAura = 'concentration'; hero.bindings.attack = 'blessedHammer';
  } else if (level >= 30) {
    learn('zeal', Math.min(20, Math.floor(level * .35))); learn('fanaticism', 20); learn('sacrifice', 20); learn('holyShield', 10); learn('zeal', 20);
    hero.activeAura = 'fanaticism'; hero.bindings.attack = 'zeal';
  } else {
    learn('might'); learn('sacrifice'); if (level >= 12) learn('zeal', 4); learn('holyFire', Math.min(12, level - 5)); learn('resistFire', 10); learn('sacrifice', 10);
    hero.activeAura = hero.skills.holyFire ? 'holyFire' : 'might'; hero.bindings.attack = hero.skills.zeal ? 'zeal' : 'sacrifice';
  }
  if (hero.skills.holyShield) { hero.holyShieldLevel = skillLevel(hero, 'holyShield'); hero.holyShield = skillValues('holyShield', hero.holyShieldLevel, hero.skills).duration; }
  const s = stats(hero); hero.hp = s.maxHp; hero.mana = s.maxMana; hero.stamina = s.maxStamina; hero.potions = [8, 8];
  if (activeEquipment(hero).length !== equipment.length) throw new Error(`Unusable ${build} fixture at ${level}`);
  if (Object.values(hero.skills).reduce((sum, rank) => sum + rank, 0) > skillBudget) throw new Error('Skill budget');
  return hero;
}

export function referenceMetrics(hero: HeroState, definition: MonsterDef, index: number, boss = false) {
  const enemy = monsterStats(definition, LEVELS[index], hero.difficultyLevel, boss, false, hero.playerCount), s = stats(hero), action = hero.bindings.attack, skill = skillValues(action, skillLevel(hero, action), hero.skills);
  let hit = 1, perHit = 0;
  if (action === 'blessedHammer') perHit = resistedDamage((skill.min + skill.max) / 2 * (1 + (s.aura.id === 'concentration' ? s.aura.damage / 200 : 0)), enemy.resistances.magic);
  else {
    const raceAttack = definition.race === 'undead' ? s.mods.attackUndead ?? 0 : definition.race === 'demon' ? s.mods.attackDemons ?? 0 : 0;
    hit = hitChance((s.baseAttackRating + raceAttack) * (1 + (s.attackRatingBonus + skill.attack) / 100), enemy.defense, hero.level, enemy.level) / 100;
    const raceDamage = definition.race === 'undead' ? s.mods.damageUndead ?? 0 : definition.race === 'demon' ? s.mods.damageDemons ?? 0 : 0;
    perHit = resistedDamage((s.weaponMin + s.weaponMax) / 2 * (1 + (s.damageBonus + skill.damage + raceDamage) / 100) * (1 + (s.mods.deadlyStrike ?? 0) / 100), enemy.resistances.physical);
    for (const type of ['fire', 'cold', 'lightning'] as const) {
      let amount = (s.mods[`${type}Damage`] ?? 0) + ((s.mods[`${type}MinDamage`] ?? 0) + (s.mods[`${type}MaxDamage`] ?? 0)) / 2;
      if (s.aura.type === type) amount += (s.aura.min + s.aura.max) / 2 * s.aura.secondary;
      perHit += resistedDamage(amount, enemy.resistances[type]);
    }
  }
  const attacksPerSecond = action === 'blessedHammer' ? 25 / s.castFrames : skill.hits * 25 / (s.zealFrames * (skill.hits - 1));
  const dps = perHit * hit * attacksPerSecond * .65;
  const connectedHit = (type: DamageType, amount: number) => type === 'physical' ? Math.max(0, amount - (s.mods.damageReductionFlat ?? 0)) * (1 - Math.min(50, s.mods.damageReduction ?? 0) / 100) : resistedDamage(Math.max(0, amount - (s.mods.magicReduction ?? 0)), type === 'magic' ? 0 : s.resistances[type]);
  const maxHit = Math.max(...definition.attacks.map(id => connectedHit(ATTACKS[id].type, enemy.damage * ATTACKS[id].damage)));
  return { maxHp: Math.round(s.maxHp), monsterHp: enemy.maxHp, dps: Math.round(dps), seconds: Math.round(enemy.maxHp / dps * 10) / 10, maxHitPercent: Math.round(maxHit / s.maxHp * 1000) / 10, hitChance: Math.round(hit * 100), mana: Math.round(s.maxMana), cost: Math.round(skill.cost * 1000) / 1000 };
}
