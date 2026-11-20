import type { EntitySpec } from '../../../../shared/types';
import { Section, Vec3Field } from '../../fields';
import { eulerDegFromQuat, quatFromEulerDeg } from '../../logic';

export function TransformSection({ entity, patch }: { entity: EntitySpec; patch(p: Partial<EntitySpec>): void }) {
  const t = entity.transform;
  const euler = eulerDegFromQuat(t.rot);
  return (
    <Section title="Transformation">
      <Vec3Field label="Position (m)" value={t.pos} step={0.25} testId="insp-pos" onChange={(pos) => patch({ transform: { ...t, pos } })} />
      <Vec3Field label="Drehung (°)" value={euler} step={15} testId="insp-rot" onChange={(e) => patch({ transform: { ...t, rot: quatFromEulerDeg(e[0], e[1], e[2]) } })} />
      <Vec3Field label="Skalierung" value={t.scale} step={0.25} testId="insp-scale" onChange={(scale) => patch({ transform: { ...t, scale } })} />
    </Section>
  );
}
