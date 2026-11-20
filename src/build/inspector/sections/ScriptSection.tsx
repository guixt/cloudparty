import type { EntitySpec } from '../../../../shared/types';
import type { GameContext } from '../../../core/context';
import { Section } from '../../fields';

export function ScriptSection({ ctx, entity, patch }: { ctx: GameContext; entity: EntitySpec; patch(p: Partial<EntitySpec>): void }) {
  const script = entity.script;
  const lines = script?.source ? script.source.split('\n').length : 0;
  return (
    <Section title="Skript">
      <div className="cp-muted">{lines > 0 ? `${lines} ${lines === 1 ? 'Zeile' : 'Zeilen'}` : '(kein Skript)'}</div>
      <label className="cpb-check">
        <input type="checkbox" disabled={!script} checked={script?.enabled ?? false} onChange={(e) => script && patch({ script: { ...script, enabled: e.target.checked } })} /> Skript aktiv
      </label>
      <button className="cp-button cpb-wide" data-testid="insp-edit-script" onClick={() => ctx.bus.emit('ui.openScriptEditor', { entityId: entity.id })}>
        Skript bearbeiten
      </button>
      <button className="cp-button cpb-wide" data-testid="insp-edit-graph" onClick={() => ctx.bus.emit('ui.openGraphEditor', { entityId: entity.id })}>
        {entity.graph ? 'Logik-Graph bearbeiten' : 'Logik-Graph erstellen'}
      </button>
    </Section>
  );
}
