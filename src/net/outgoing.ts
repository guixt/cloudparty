/** Ausgangsdrosselung: pro Schlüssel nur der neueste Wert, höchstens alle `interval` ms. */
export class Coalescer<T> {
  private last = new Map<string, number>();
  private pending = new Map<string, T>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private sendFn: (key: string, value: T) => void,
    private now: () => number = () => Date.now(),
  ) {}

  /** Sendet sofort, falls das Intervall abgelaufen ist, sonst später (letzter Wert gewinnt, der Endzustand geht immer raus). */
  push(key: string, value: T, intervalMs: number): void {
    const t = this.now();
    const wait = intervalMs - (t - (this.last.get(key) ?? -Infinity));
    if (wait <= 0) {
      this.cancel(key);
      this.fire(key, value);
      return;
    }
    this.pending.set(key, value);
    if (this.timers.has(key)) return;
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        if (!this.pending.has(key)) return;
        const v = this.pending.get(key) as T;
        this.pending.delete(key);
        this.fire(key, v);
      }, wait),
    );
  }

  /** Sofort senden und Ausstehendes verwerfen. */
  sendNow(key: string, value: T): void {
    this.cancel(key);
    this.fire(key, value);
  }

  cancel(key: string): void {
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
    this.pending.delete(key);
  }

  clear(): void {
    for (const key of [...this.timers.keys()]) this.cancel(key);
    this.pending.clear();
    this.last.clear();
  }

  private fire(key: string, value: T): void {
    this.last.set(key, this.now());
    this.sendFn(key, value);
  }
}
