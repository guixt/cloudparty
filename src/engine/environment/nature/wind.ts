/** Gemeinsamer Wind für Gras, Bäume und Wetter (rein, ohne Babylon). */

/** Windstärke 0.3..1 (böig, langsam wechselnd); `time` in Sekunden. */
export function windAt(time: number): number {
  const slow = 0.5 + 0.5 * Math.sin(time * 0.17);
  const gust = 0.5 + 0.5 * Math.sin(time * 0.61 + 1.3 * Math.sin(time * 0.23));
  return 0.3 + 0.7 * (0.55 * slow + 0.45 * gust);
}

let current = 0.6;
/** Zuletzt berechneter Wind (von der Natur-Funktion pro Bild gesetzt). */
export function getWind(): number {
  return current;
}
export function setWind(value: number): void {
  current = value;
}
