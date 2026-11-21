import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../shared/types';
import { GeometryError, arrayItems, beamTransform, rotateVec, rotatedBox, transformPoint, transformRotation, wallPieces, yawQuat } from './buildGeometry';

const close = (a: number[], b: number[], eps = 1e-6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 5 + Math.round(-Math.log10(eps)) - 5));

describe('Drehung', () => {
  it('Yaw 90° bildet +X auf −Z und +Z auf +X ab (Babylon, linkshändig)', () => {
    close(rotateVec(yawQuat(90), [1, 0, 0]), [0, 0, -1]);
    close(rotateVec(yawQuat(90), [0, 0, 1]), [1, 0, 0]);
  });
});

describe('beamTransform', () => {
  it('richtet +Y von a nach b aus (Achsen, Diagonale, Gegenrichtung)', () => {
    const cases: [Vec3, Vec3][] = [
      [[0, 0, 0], [0, 5, 0]],
      [[0, 0, 0], [4, 0, 0]],
      [[0, 0, 0], [0, 0, -3]],
      [[1, 2, 3], [4, 6, 3]],
      [[0, 5, 0], [0, 0, 0]],
      [[0, 0, 0], [3, 4, 12]],
    ];
    for (const [a, b] of cases) {
      const t = beamTransform(a, b, 0.3);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      expect(t.length).toBeCloseTo(len);
      expect(t.scale).toEqual([0.3, t.length, 0.3]);
      close(t.center, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
      close(rotateVec(t.rot, [0, 1, 0]), [(b[0] - a[0]) / len, (b[1] - a[1]) / len, (b[2] - a[2]) / len]);
    }
  });
});

describe('wallPieces', () => {
  it('ohne Öffnung: eine Box der Wandlänge, mittig, richtig gedreht', () => {
    const [p] = wallPieces([0, 0], [6, 0], 3, 0.3, 0);
    expect(wallPieces([0, 0], [6, 0], 3, 0.3, 0)).toHaveLength(1);
    expect(p.size).toEqual([6, 3, 0.3]);
    close(p.center, [3, 1.5, 0]);
    // gedrehte Wand entlang +Z: lokale +X-Achse der Box zeigt von a nach b
    const [q] = wallPieces([0, 0], [0, 4], 3, 0.3, 0);
    close(rotateVec(yawQuat(q.yawDeg), [1, 0, 0]), [0, 0, 1]);
    close(q.center, [0, 1.5, 2]);
  });

  it('Tür: drei Stücke (links, Sturz, rechts), Fläche stimmt', () => {
    const pieces = wallPieces([0, 0], [10, 0], 3, 0.3, 0, [{ at: 4, width: 2, height: 2.2 }]);
    expect(pieces).toHaveLength(3);
    const area = pieces.reduce((s, p) => s + p.size[0] * p.size[1], 0);
    expect(area).toBeCloseTo(10 * 3 - 2 * 2.2);
  });

  it('Fenster: vier Stücke (links, Brüstung, Sturz, rechts), keine Überlappung', () => {
    const pieces = wallPieces([0, 0], [10, 0], 3, 0.3, 0, [{ at: 4, width: 2, height: 1, sill: 1 }]);
    expect(pieces).toHaveLength(4);
    const area = pieces.reduce((s, p) => s + p.size[0] * p.size[1], 0);
    expect(area).toBeCloseTo(30 - 2);
    const boxes = pieces.map((p) => rotatedBox(p.center, p.size, yawQuat(p.yawDeg)));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const overlapX = Math.min(boxes[i].max[0], boxes[j].max[0]) - Math.max(boxes[i].min[0], boxes[j].min[0]);
      const overlapY = Math.min(boxes[i].max[1], boxes[j].max[1]) - Math.max(boxes[i].min[1], boxes[j].min[1]);
      expect(overlapX > 1e-6 && overlapY > 1e-6).toBe(false);
    }
  });

  it('Öffnung am Rand und mehrere Öffnungen; Fußhöhe y0 verschiebt alles', () => {
    const edge = wallPieces([0, 0], [6, 0], 3, 0.3, 2, [{ at: 0, width: 1, height: 2 }, { at: 3, width: 1, height: 1, sill: 1 }]);
    expect(edge.every((p) => p.center[1] >= 2)).toBe(true);
    expect(edge.reduce((s, p) => s + p.size[0] * p.size[1], 0)).toBeCloseTo(18 - 2 - 1);
  });

  it('ungültige Wände und Öffnungen werden abgewiesen', () => {
    expect(() => wallPieces([0, 0], [0.05, 0], 3, 0.3, 0)).toThrow(GeometryError);
    expect(() => wallPieces([0, 0], [5, 0], 3, 0.3, 0, [{ at: 4.5, width: 2, height: 2 }])).toThrow(/nicht auf der Wand/);
    expect(() => wallPieces([0, 0], [5, 0], 3, 0.3, 0, [{ at: 1, width: 1, height: 4 }])).toThrow(/höher/);
    expect(() => wallPieces([0, 0], [5, 0], 3, 0.3, 0, [{ at: 1, width: 2, height: 1 }, { at: 2, width: 1, height: 1 }])).toThrow(/überlappt/);
  });
});

describe('arrayItems', () => {
  it('Kreis: gleiche Abstände zur Mitte, Blick zur Mitte', () => {
    const items = arrayItems({ pattern: 'circle', count: 8, radius: 5, center: [10, 1, -4], faceCenter: true });
    expect(items).toHaveLength(8);
    for (const it of items) {
      expect(Math.hypot(it.pos[0] - 10, it.pos[2] + 4)).toBeCloseTo(5);
      const facing = rotateVec(yawQuat(it.yawDeg), [0, 0, 1]);
      const toCenter = [10 - it.pos[0], 0, -4 - it.pos[2]].map((v) => v / 5);
      close(facing, toCenter);
    }
  });
  it('Linie und Raster', () => {
    expect(arrayItems({ pattern: 'line', count: 3, start: [0, 1, 0], step: [2, 0, 1] }).map((i) => i.pos)).toEqual([[0, 1, 0], [2, 1, 1], [4, 1, 2]]);
    const grid = arrayItems({ pattern: 'grid', rows: 2, cols: 3, spacing: [1, 2], origin: [5, 0, 5] });
    expect(grid).toHaveLength(6);
    expect(grid[5].pos).toEqual([7, 0, 7]);
  });
});

describe('Klonen', () => {
  it('Verschieben, Drehen um den Pivot, Spiegeln', () => {
    close(transformPoint([4, 1, 0], [0, 0], 0, undefined, [10, 0, 0]), [14, 1, 0]);
    close(transformPoint([4, 1, 0], [0, 0], 90, undefined, [0, 0, 0]), [0, 1, -4]);
    close(transformPoint([4, 1, 2], [0, 0], 0, 'x', [0, 0, 0]), [-4, 1, 2]);
    close(transformPoint([4, 1, 2], [0, 0], 0, 'z', [0, 0, 0]), [4, 1, -2]);
    // Drehung um 180° um einen Pivot, Punkt am Pivot bleibt
    close(transformPoint([3, 0, 3], [3, 3], 180, undefined, [0, 0, 0]), [3, 0, 3]);
  });
  it('Rotation wird mitgedreht; Spiegeln dreht die Yaw-Richtung um', () => {
    const q = transformRotation(yawQuat(30), 90, undefined);
    close(rotateVec(q, [0, 0, 1]), rotateVec(yawQuat(120), [0, 0, 1]));
    const mq = transformRotation(yawQuat(30), 0, 'x');
    close(rotateVec(mq, [0, 0, 1]), rotateVec(yawQuat(-30), [0, 0, 1]));
  });
});
