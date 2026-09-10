const STEP = 1 / 60;
const MAX_FRAME_TIME = .25;

// Advance gameplay at a fixed rate regardless of how often the GPU presents a
// frame. Keep fractional time, but do not replay a long suspended-tab interval.
export class FrameClock {
  private accumulated = 0;

  reset() { this.accumulated = 0; }

  advance(elapsed: number, update: (dt: number) => void) {
    const dt = Number.isFinite(elapsed) ? Math.max(0, Math.min(elapsed, MAX_FRAME_TIME)) : 0;
    this.accumulated += dt;
    while (this.accumulated + 1e-10 >= STEP) {
      this.accumulated = Math.max(0, this.accumulated - STEP);
      update(STEP);
    }
    return dt;
  }
}
