import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it } from 'vitest';
import { BRICK_KINDS, brickState } from '../../../shared/bricks';
import { brickMasterCount, getBrickMaster } from './brickMaster';

function scene() {
  return new Scene(new NullEngine());
}
const mat = (s: Scene) => () => new PBRMaterial('m', s);

describe('Klemmbaustein-Master', () => {
  it('jede Art lässt sich zu EINEM Mesh verschmelzen, ohne Reste in der Szene', () => {
    const s = scene();
    for (const kind of BRICK_KINDS) {
      if (kind === 'rad') continue; // Rad hat eigene Darstellung
      const st = brickState({ kind, w: 4, d: 4 });
      const before = s.meshes.length;
      const master = getBrickMaster(s, st, kind, mat(s));
      expect(master.getTotalVertices(), kind).toBeGreaterThan(0);
      expect(master.isVisible).toBe(false);
      // genau ein neues Mesh (der Master), keine übrig gebliebenen Teile wie „stud“ oder „slope“
      expect(s.meshes.length - before, kind).toBe(1);
    }
    expect(s.meshes.filter((m) => m.name === 'stud' || m.name === 'slope' || m.name === 'body')).toHaveLength(0);
  });

  it('gleiche Gestalt und gleiches Aussehen teilen den Master', () => {
    const s = scene();
    const st = brickState({ kind: 'stein', w: 2, d: 4 });
    const a = getBrickMaster(s, st, 'rot', mat(s));
    const b = getBrickMaster(s, st, 'rot', mat(s));
    const c = getBrickMaster(s, st, 'blau', mat(s));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(brickMasterCount(s)).toBe(2);
  });

  it('ein entsorgtes Material wird ersetzt, der Master bleibt benutzbar', () => {
    const s = scene();
    const st = brickState({ kind: 'bogen', w: 2, d: 3 });
    const a = getBrickMaster(s, st, 'x', mat(s));
    a.material!.dispose();
    expect(a.material).toBeNull();
    const again = getBrickMaster(s, st, 'x', mat(s));
    expect(again).toBe(a);
    expect(again.material).not.toBeNull();
  });
});
