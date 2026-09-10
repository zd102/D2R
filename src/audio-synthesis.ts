import type { AudioTerrain, Texture } from './audio-bank.ts';

// A private PRNG keeps sound variation from consuming combat/loot randomness.
export function audioRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}
export const TEXTURE_SECONDS: Record<Texture, number> = { impact: .22, swing: .26, bow: .3, fire: .85, cold: .75, lightning: .48, poison: .75, holy: .95, portal: 1.25, potion: .8, growl: .85, bone: .48, level: 1.45, tick: .08 };
const tau = Math.PI * 2;

/** Cached PCM textures, combining noise, resonant partials and irregular transients. */
export function synthesize(texture: Texture, variant: number, sampleRate: number): Float32Array {
  const seconds = TEXTURE_SECONDS[texture], result = new Float32Array(Math.ceil(seconds * sampleRate));
  const random = audioRandom(19337 + variant * 7919 + texture.charCodeAt(0) * 131), detune = .94 + random() * .12;
  let low = 0, smooth = 0, phase = 0, bubble = 0;
  for (let i = 0; i < result.length; i++) {
    const t = i / sampleRate, p = t / seconds, noise = random() * 2 - 1;
    low += (noise - low) * (1 - Math.exp(-tau * 700 / sampleRate));
    smooth += (low - smooth) * (1 - Math.exp(-tau * 140 / sampleRate));
    const high = noise - low, attack = Math.min(1, t / .004), tail = Math.min(1, (seconds - t) / .035);
    let value = 0;
    switch (texture) {
      case 'impact': value = (Math.sin(tau * (95 * t + 2 * (1 - Math.exp(-t * 35)))) * .7 + low * 2.2 + high * .25 * Math.exp(-t * 70)) * Math.exp(-t * 22); break;
      case 'swing': value = (low * 1.8 + high * .12) * Math.sin(Math.PI * p) ** 1.8 * (.8 + .2 * Math.sin(tau * 24 * t)); break;
      case 'bow': value = (Math.sin(tau * 147 * detune * t + Math.sin(tau * 294 * t) * 2 * Math.exp(-t * 20)) * .32 + high * .45 * Math.exp(-t * 70) + low) * Math.exp(-t * 17); break;
      case 'fire': value = (low * 2.4 + smooth * 2 + high * .15 * (Math.sin(t * 293) > .94 ? 2 : .3)) * Math.exp(-t * 3.8) * Math.min(1, t / .018); break;
      case 'cold':
      case 'bone': {
        const brittle = texture === 'cold';
        for (let n = 0; n < 7; n++) { const start = n * (brittle ? .026 : .034), age = t - start; if (age > 0) value += (Math.sin(tau * (brittle ? 1700 : 720) * (1 + n * .371) * detune * age) * .12 + high * .15) * Math.exp(-age * (brittle ? 14 + n * 3 : 36)); }
        value += low * .9 * Math.exp(-t * 20); break;
      }
      case 'lightning': { const crack = Math.exp(-(t % .073) * 105); value = (high * .9 * crack + low * 1.6 + Math.sin(tau * 57 * t) * .2) * Math.exp(-t * 7); break; }
      case 'poison':
      case 'potion': {
        const swallow = texture === 'potion', pulse = (1 + Math.sin(tau * (swallow ? 6.5 : 10) * t)) / 2;
        bubble += tau * (160 + 700 * pulse ** 5) * detune / sampleRate;
        value = (Math.sin(bubble) * .32 * pulse ** 4 + low * (swallow ? .4 : 1.5)) * Math.sin(Math.PI * p) * (1 - p * .65); break;
      }
      case 'holy':
      case 'portal':
      case 'level': {
        const portal = texture === 'portal', level = texture === 'level', base = (portal ? 115 : level ? 196 : 245) * detune;
        phase += tau * base * (portal ? 1.3 - .6 * p : 1) / sampleRate;
        const envelope = Math.min(1, t / (level ? .045 : .09)) * Math.exp(-t * (portal ? 1.4 : 2.4));
        value = (Math.sin(phase) * .19 + Math.sin(phase * 1.501 + Math.sin(t * 17) * .25) * .14 + Math.sin(phase * 2.003) * .09 + low * (portal ? 2.3 : .8)) * envelope;
        if (level) value += Math.sin(tau * 587.3 * t) * .1 * Math.min(1, t / .3) * Math.exp(-t * 2);
        break;
      }
      case 'growl': phase += tau * (85 - 25 * p + 5 * Math.sin(t * 31)) * detune / sampleRate; value = (Math.tanh(Math.sin(phase) * 3 + low * 2) * .35 + Math.sin(phase * 3.03) * .12 + low * .6) * Math.sin(Math.PI * p) ** .6 * (.65 + .35 * Math.sin(tau * 19 * t)); break;
      case 'tick': value = (high * .6 + Math.sin(tau * 1200 * detune * t) * .3) * Math.exp(-t * 75); break;
    }
    result[i] = Math.tanh(value) * .75 * attack * tail;
  }
  return result;
}

/** Periodic filtered noise with matching ends: no click or silence at the loop seam. */
export function ambienceSamples(terrain: AudioTerrain, sampleRate: number, channel: number): Float32Array {
  const seconds = 8, length = seconds * sampleRate, seam = Math.floor(sampleRate * .15), result = new Float32Array(length + seam), random = audioRandom(401 + terrain.charCodeAt(0) * 701 + channel * 191);
  const fire = terrain === 'lava' || terrain === 'camp', indoor = ['cave', 'temple', 'arcane'].includes(terrain);
  let low = 0, rumble = 0;
  for (let i = 0; i < result.length; i++) {
    const t = i / sampleRate, noise = random() * 2 - 1;
    low += (noise - low) * (1 - Math.exp(-tau * (fire ? 650 : terrain === 'snow' ? 950 : 330) / sampleRate));
    rumble += (low - rumble) * (1 - Math.exp(-tau * 85 / sampleRate));
    const wind = .6 + .22 * Math.sin(tau * t / 8 + channel) + .12 * Math.sin(tau * t * 3 / 8);
    let value = low * wind * (indoor ? .22 : .38) + rumble * (terrain === 'lava' ? .55 : .18);
    if (fire) value += (noise - low) * .09 * Math.max(0, Math.sin(tau * 43 * t + Math.sin(tau * t * 7 / 8)) - .96);
    if (indoor) value += (Math.sin(tau * 48 * t) + Math.sin(tau * 72.125 * t)) * .006 * wind;
    if (terrain === 'field') value += Math.sin(tau * 3100 * t) * Math.max(0, Math.sin(tau * t * 11 / 8 + channel) - .85) * .014;
    result[i] = value;
  }
  // Crossfade the end into the beginning without changing the loop duration.
  for (let i = 0; i < seam; i++) { const blend = i / (seam - 1); result[length + i] = result[length + i] * (1 - blend) + result[i] * blend; }
  return result.subarray(seam);
}
