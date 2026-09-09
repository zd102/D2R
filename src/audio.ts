export class GameAudio {
  context?: AudioContext;
  volume = .35;
  unlock() { this.context ??= new AudioContext(); if (this.context.state === 'suspended') void this.context.resume(); }
  play(kind: 'hit' | 'swing' | 'shot' | 'spell' | 'loot' | 'level' | 'hurt' | 'portal') {
    if (!this.context || !this.volume) return;
    const ctx = this.context, now = ctx.currentTime;
    const notes = kind === 'shot' ? [620, 310] : kind === 'level' ? [330, 440, 554, 660] : kind === 'loot' ? [740, 980] : kind === 'spell' ? [180, 280, 420] : [kind === 'hit' ? 95 : kind === 'hurt' ? 65 : kind === 'portal' ? 220 : 160];
    notes.forEach((freq, index) => {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      const start = now + index * .09, duration = kind === 'spell' || kind === 'portal' ? .45 : .16;
      oscillator.type = ['hit', 'hurt', 'swing'].includes(kind) ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(freq, start); oscillator.frequency.exponentialRampToValueAtTime(kind === 'hit' ? 30 : freq * .7, start + duration);
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(this.volume * .17, start + .01); gain.gain.exponentialRampToValueAtTime(.001, start + duration);
      oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(start); oscillator.stop(start + duration);
    });
  }
}
