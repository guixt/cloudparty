import { describe, expect, it } from 'vitest';
import { PLATE_H, STUD, brickSize, brickState, brickWorldPos, layerFootprints, profilePieces, restLevel, studSpots, tile1D } from './bricks';

describe('Klemmbaustein-Maße', () => {
  it('Stein 2×4 ist 0,5 × 0,3 × 1,0 m', () => {
    const s = brickSize(brickState({ w: 2, d: 4, kind: 'stein' }));
    expect(s[0]).toBeCloseTo(0.5);
    expect(s[1]).toBeCloseTo(0.3);
    expect(s[2]).toBeCloseTo(1);
  });
  it('ungültiger state wird zu Standardwerten', () => {
    expect(brickState({ w: -3, d: 99, kind: 'x' })).toEqual({ w: 1, d: 16, kind: 'stein', studs: true });
    expect(brickState(undefined)).toEqual({ w: 2, d: 4, kind: 'stein', studs: true });
  });
  it('Weltposition: Mitte der Grundfläche, Unterkante', () => {
    const p = brickWorldPos({ gx: 2, gz: 0, w: 2, d: 4, level: 3, plates: 3 }, [1, 0.5, -1]);
    expect(p[0]).toBeCloseTo(1 + 3 * STUD);
    expect(p[1]).toBeCloseTo(0.5 + 3 * PLATE_H);
    expect(p[2]).toBeCloseTo(-1 + 2 * STUD);
  });
  it('restLevel: liegt auf dem höchsten überlappenden Stein', () => {
    const below = [
      { gx: 0, gz: 0, w: 2, d: 2, level: 0, plates: 3 },
      { gx: 4, gz: 0, w: 2, d: 2, level: 0, plates: 1 },
    ];
    expect(restLevel({ gx: 1, gz: 1, w: 2, d: 2 }, below)).toBe(3);
    expect(restLevel({ gx: 4, gz: 0, w: 1, d: 1 }, below)).toBe(1);
    expect(restLevel({ gx: 10, gz: 10, w: 1, d: 1 }, below)).toBe(0);
  });
  it('tile1D deckt die Länge ohne Lücke ab, Versatz verschiebt die Fugen', () => {
    for (const len of [1, 2, 3, 5, 8, 11]) expect(tile1D(len).reduce((a, b) => a + b, 0)).toBe(len);
    expect(tile1D(8, 2).reduce((a, b) => a + b, 0)).toBe(8);
    const joints = (l: number[]) => l.slice(0, -1).reduce<number[]>((acc, n) => [...acc, (acc.at(-1) ?? 0) + n], []);
    expect(joints(tile1D(12))).not.toEqual(joints(tile1D(12, 2)));
  });
  it('Wandschicht: Rand ohne Überlappung, Fläche genau abgedeckt', () => {
    const fps = layerFootprints(6, 5, 0, true);
    const cells = new Set<string>();
    for (const f of fps) for (let x = f.gx; x < f.gx + f.w; x++) for (let z = f.gz; z < f.gz + f.d; z++) {
      const k = `${x},${z}`;
      expect(cells.has(k)).toBe(false);
      cells.add(k);
    }
    expect(cells.size).toBe(2 * 6 + 2 * 3);
    const floor = layerFootprints(6, 5, 0, false);
    expect(floor.reduce((a, f) => a + f.w * f.d, 0)).toBe(30);
  });
});

describe('Sonderformen', () => {
  it('Rundstein ist quadratisch, Schrägstein mindestens 2 tief, Rad 1 breit mit geradem Durchmesser', () => {
    expect(brickState({ w: 3, d: 1, kind: 'rund' })).toEqual({ w: 3, d: 3, kind: 'rund', studs: true });
    expect(brickState({ w: 2, d: 1, kind: 'schraeg' }).d).toBe(2);
    expect(brickState({ w: 5, d: 3, kind: 'rad' })).toEqual({ w: 1, d: 2, kind: 'rad', studs: true });
    const rad = brickSize(brickState({ w: 1, d: 4, kind: 'rad' }));
    expect(rad[1]).toBeCloseTo(1); // Durchmesser = Höhe
    expect(brickSize(brickState({ w: 2, d: 2, kind: 'schraeg' }))[1]).toBeCloseTo(0.3);
  });
});

describe('Runde Formen', () => {
  it('Normalisierung und Höhen der neuen Arten', () => {
    expect(brickState({ kind: 'viertel', w: 3, d: 1 })).toMatchObject({ w: 3, d: 3 });
    expect(brickState({ kind: 'bogenlauf', w: 1, d: 2 })).toMatchObject({ d: 4 });
    expect(brickState({ kind: 'bogen', w: 2, d: 1 }).d).toBe(2);
    expect(brickState({ kind: 'kuppel', w: 1 })).toMatchObject({ w: 2, d: 2 });
    expect(brickSize(brickState({ kind: 'rundplatte', w: 2 }))[1]).toBeCloseTo(0.1);
    expect(brickSize(brickState({ kind: 'bogen', w: 2, d: 3 }))[1]).toBeCloseTo(0.3);
    expect(brickSize(brickState({ kind: 'kuppel', w: 4 }))[1]).toBeCloseTo(0.5);
  });
  it('Noppen je Art', () => {
    expect(studSpots(brickState({ kind: 'bogen', w: 2, d: 3 }))).toHaveLength(2); // nur hintere Reihe
    expect(studSpots(brickState({ kind: 'schraeg_um', w: 2, d: 3 }))).toHaveLength(6);
    expect(studSpots(brickState({ kind: 'rund', w: 3 }))).toEqual([[0, 0]]);
    expect(studSpots(brickState({ kind: 'kuppel', w: 4 }))).toHaveLength(0);
    expect(studSpots(brickState({ kind: 'stein', w: 2, d: 2, studs: false }))).toHaveLength(0);
    expect(studSpots(brickState({ kind: 'viertel', w: 3 })).length).toBeGreaterThan(2);
    expect(studSpots(brickState({ kind: 'viertel', w: 3 })).length).toBeLessThan(9);
  });
});

describe('Profil (Höhenverlauf)', () => {
  const area = (ps: ReturnType<typeof profilePieces>, level?: number) => ps.filter((p) => level === undefined || p.level === level).reduce((a, p) => a + p.w * p.d, 0);
  it('deckt jede Lage lückenlos ohne Überlappung ab', () => {
    const ps = profilePieces(6, [{ len: 5, h: 4, edgeBefore: 'curve' }, { len: 8, h: 9 }, { len: 4, h: 3, edgeAfter: 'slope' }]);
    for (const level of new Set(ps.map((p) => p.level))) {
      const cells = new Set<string>();
      for (const p of ps.filter((q) => q.level === level)) {
        for (let x = p.gx; x < p.gx + p.w; x++) for (let z = p.gz; z < p.gz + p.d; z++) {
          const k = `${x},${z},${p.segment}`;
          expect(cells.has(k)).toBe(false);
          cells.add(k);
        }
      }
    }
    // Segment 2 (Länge 8, Höhe 9): drei Steinlagen, je 6 × 8 Zellen
    expect(area(ps.filter((p) => p.segment === 1))).toBe(3 * 6 * 8);
    // Höhe 4 = 1 Platte + 1 Stein
    expect(ps.filter((p) => p.segment === 0).map((p) => p.level).sort()).toContain(0);
    expect(Math.max(...ps.filter((p) => p.segment === 0).map((p) => p.level))).toBe(1);
  });
  it('Ränder: Bogenstein am Anfang (fällt nach −z), Schrägstein am Ende (fällt nach +z), nur die oberste Lage hat Noppen', () => {
    const ps = profilePieces(4, [{ len: 6, h: 6, edgeBefore: 'curve', edgeAfter: 'slope' }]);
    const bogen = ps.find((p) => p.kind === 'bogen')!;
    const schraeg = ps.find((p) => p.kind === 'schraeg')!;
    expect(bogen).toMatchObject({ rot: 180, gz: 0, d: 2, level: 3 });
    expect(schraeg).toMatchObject({ rot: 0, gz: 4, d: 2, level: 3 });
    expect(ps.filter((p) => p.level === 0).every((p) => !p.studs)).toBe(true);
    expect(ps.filter((p) => p.level === 3).every((p) => p.studs)).toBe(true);
  });
  it('Segmente ohne Rand oder zu kurz bleiben Quader', () => {
    expect(profilePieces(2, [{ len: 2, h: 3, edgeBefore: 'curve' }]).every((p) => p.kind === 'stein')).toBe(true);
    expect(profilePieces(40, [{ len: 40, h: 3 }]).length).toBeLessThanOrEqual(9);
  });
});
