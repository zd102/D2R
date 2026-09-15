// Keep the established spiral footprint, but travel by arc length rather than
// advancing the angle by time. Equal cast intervals must not lock every hammer
// into a rigid rotating spoke. These are project-scale values, not D2 frame data.
export const HAMMER_LIFETIME = 2.3;
export const HAMMER_START_RADIUS = .7;
export const HAMMER_PITCH = 2.5 / 7;
const endRadius = HAMMER_START_RADIUS + 2.5 * HAMMER_LIFETIME;
const arcPrimitive = (radius: number) => .5 * (radius * Math.hypot(radius, HAMMER_PITCH)
  + HAMMER_PITCH ** 2 * Math.asinh(radius / HAMMER_PITCH));
const startArc = arcPrimitive(HAMMER_START_RADIUS);
const arcRange = arcPrimitive(endRadius) - startArc;

export function hammerRadiusAt(age: number) {
  const progress = Math.max(0, Math.min(1, age / HAMMER_LIFETIME));
  const targetArc = startArc + progress * arcRange;
  let radius = Math.sqrt(HAMMER_START_RADIUS ** 2 + progress * (endRadius ** 2 - HAMMER_START_RADIUS ** 2));
  // Invert the Archimedean spiral's arc length. Four Newton steps converge from
  // this area-based estimate without a frame-rate-dependent integration state.
  for (let i = 0; i < 4; i++) radius -= (arcPrimitive(radius) - targetArc) / Math.hypot(radius, HAMMER_PITCH);
  return radius;
}
