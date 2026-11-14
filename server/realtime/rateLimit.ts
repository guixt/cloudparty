/**
 * Einfache Ratenbegrenzung (Token-Bucket). Zeit wird von außen übergeben,
 * damit die Logik ohne Timer testbar bleibt.
 */
export class RateLimiter {
  private tokens: number;
  private last: number | undefined;

  /** Erlaubt höchstens `max` Ereignisse je `windowMs` (Burst bis `max`). */
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {
    this.tokens = max;
  }

  /** true, wenn das Ereignis zugelassen ist (und verbucht wird). */
  allow(now: number = Date.now()): boolean {
    if (this.last !== undefined && now > this.last) {
      this.tokens = Math.min(this.max, this.tokens + ((now - this.last) * this.max) / this.windowMs);
    }
    this.last = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}
