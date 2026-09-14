// Guard-first growth: no chapter multipliers, and late damage comes from gear.
export function mercenaryBase(level: number) {
  const l = Math.max(1, Math.min(99, Math.floor(level)));
  return {
    strength: 40 + l * 2,
    dexterity: 25 + Math.floor(l * 1.5),
    life: 120 + 14 * Math.min(l, 45) + 18 * Math.max(0, Math.min(l, 75) - 45) + 26 * Math.max(0, l - 75),
    // Keep growing before the shared difficulty penalty; Hell still needs gear.
    resistance: Math.min(150, 15 + Math.floor(l * 14 / 10)),
  };
}

// Smooth weapon effectiveness from early support to an equipped late-game ally.
export const mercenaryDamageScale = (level: number) => .3 + .5 * Math.max(0, Math.min(1, (level - 15) / 60));
