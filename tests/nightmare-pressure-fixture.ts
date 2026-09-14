import { readFileSync } from 'node:fs';
import { newHero, parseSave, serializeSave, stats } from '../src/model.ts';
import { mercenaryStats } from '../src/mercenary.ts';

// Anonymized equipment/point allocation from a level-73 Nightmare Act V save.
// No profile identity, inventory, stash, currency or live progress is retained.
export function nightmareMeleeHero() {
  const loadout = JSON.parse(readFileSync(new URL('./fixtures/nightmare-melee.json', import.meta.url), 'utf8'));
  const hero = Object.assign(newHero(), loadout);
  hero.skills = { ...newHero().skills, ...loadout.skills };
  hero.campaign.current = 22; hero.campaign.cleared = [25, 25, 0];
  const parsed = parseSave(serializeSave(hero))!;
  parsed.hp = stats(parsed).maxHp; parsed.mana = stats(parsed).maxMana;
  parsed.mercenary!.hp = mercenaryStats(parsed).maxHp;
  return parsed;
}
