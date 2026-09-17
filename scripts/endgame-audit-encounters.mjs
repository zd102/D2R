import { BOSSES } from '../src/bestiary.ts';
import { LEVELS, SPECIAL_LEVELS } from '../src/campaign.ts';
import { PANDEMONIUM_BOSSES } from '../src/pandemonium.ts';

export const ENDGAME_ENCOUNTERS = [
  { id:'hellBaal', name:'地狱巴尔', area:LEVELS[24], definition:BOSSES[24] },
  { id:'uberDiablo', name:'超级迪亚波罗', area:SPECIAL_LEVELS.uberDiablo, definition:BOSSES[19] },
  ...PANDEMONIUM_BOSSES.map((entry,i) => ({ id:`six-${i+1}`, name:entry.name, area:SPECIAL_LEVELS.pandemonium, definition:entry.definition, aura:i===1?'holyFreeze':i===3?'conviction':undefined })),
];
