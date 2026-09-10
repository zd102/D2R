// Adjust resolution only after sustained pressure, and recover slowly. Loading,
// suspended tabs and a single OS scheduling hiccup must not lower image quality.
export class RenderBudget {
  level = 0;
  private frames = 0;
  private slow = 0;
  private work = 0;
  private stable = 0;

  reset() { this.frames = this.slow = this.work = this.stable = 0; }

  sample(interval: number, work: number) {
    if (!Number.isFinite(interval) || interval <= 0 || interval > 100) { this.reset(); return false; }
    this.frames++; this.slow += Number(interval > 18); this.work += work;
    if (this.frames < 45) return false;
    let next = this.level;
    if (this.slow >= 5) { next = Math.min(4, this.level + 1); this.stable = 0; }
    else if (this.slow === 0 && this.work / this.frames < 9) { if (++this.stable >= 12) { next = Math.max(0, this.level - 1); this.stable = 0; } }
    else this.stable = 0;
    this.frames = this.slow = this.work = 0;
    if (next === this.level) return false;
    this.level = next; return true;
  }

  pixelRatio(width: number, height: number, dpr: number) {
    const native = Math.min(dpr, 1.75);
    const base = Math.min(native, Math.sqrt(2560 * 1440 / Math.max(1, width * height)));
    return Math.max(.5, base * .85 ** this.level);
  }
}
