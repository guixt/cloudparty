/** Ein Knoten im Graphen (Blender-artig). Memoisiert: rendert nur bei Änderung seiner eigenen Daten. */
import { memo } from 'react';
import type { GraphNode, NodeDef, ParamValue, PortDef } from '../../../shared/graph';
import { extraParams, nodeSize } from './geometry';
import { CATEGORY_COLOR } from './meta';
import { ParamField } from './ParamField';
import { kindsCompatible, type Side } from './rules';
import type { Session } from './state';

export interface LinkInfo {
  node: string;
  port: string;
  side: Side;
  kind: PortDef['kind'];
}

interface Props {
  node: GraphNode;
  def: NodeDef | undefined;
  selected: boolean;
  issue: 'error' | 'warning' | null;
  /** Kommagetrennte IDs der verbundenen Eingänge. */
  connected: string;
  link: LinkInfo | null;
  session: Session;
  onPortDown(e: React.PointerEvent, node: string, port: string, side: Side): void;
  onNodeDown(e: React.PointerEvent, node: string): void;
  onHover(id: string | null): void;
}

function portState(link: LinkInfo | null, nodeId: string, p: PortDef, side: Side): string {
  if (!link) return '';
  if (link.node === nodeId) return link.port === p.id && link.side === side ? ' ge-port-source' : ' ge-port-dim';
  if (link.side === side) return ' ge-port-dim';
  const ok = side === 'in' ? kindsCompatible(link.kind, p.kind) : kindsCompatible(p.kind, link.kind);
  return ok ? ' ge-port-ok' : ' ge-port-dim';
}

function NodeViewImpl({ node, def, selected, issue, connected, link, session, onPortDown, onNodeDown, onHover }: Props) {
  const size = nodeSize(def);
  const style = { left: node.x, top: node.y, width: size.w, height: size.h };
  const cls = `ge-node${selected ? ' ge-node-selected' : ''}${issue ? ` ge-node-${issue}` : ''}${def ? '' : ' ge-node-unknown'}`;
  if (!def) {
    return (
      <div className={cls} style={style} data-testid="graph-node" data-node-id={node.id} data-type={node.type} onPointerDown={(e) => onNodeDown(e, node.id)} onPointerEnter={() => onHover(node.id)} onPointerLeave={() => onHover(null)}>
        <div className="ge-node-head" style={{ background: '#a02a2a' }}>Unbekannter Knoten</div>
        <div className="ge-node-body"><div className="ge-row ge-row-unknown">„{node.type}“ gibt es nicht.</div></div>
      </div>
    );
  }
  const conn = new Set(connected ? connected.split(',') : []);
  const rows = Math.max(def.inputs.length, def.outputs.length);
  const extras = extraParams(def);
  const setParam = (id: string, v: ParamValue) => session.setParam(node.id, id, v);
  const paramDef = (id: string) => def.params.find((p) => p.id === id);
  return (
    <div className={cls} style={style} title={def.description} data-testid="graph-node" data-node-id={node.id} data-type={node.type} onPointerDown={(e) => onNodeDown(e, node.id)} onPointerEnter={() => onHover(node.id)} onPointerLeave={() => onHover(null)}>
      <div className="ge-node-head" style={{ background: CATEGORY_COLOR[def.category] }}>{def.title}</div>
      <div className="ge-node-body">
        {Array.from({ length: rows }, (_, i) => {
          const inp = def.inputs[i];
          const out = def.outputs[i];
          const pd = inp && inp.kind !== 'flow' && !conn.has(inp.id) ? paramDef(inp.id) : undefined;
          return (
            <div className="ge-row" key={i}>
              <div className="ge-cell ge-cell-in">
                {inp && (
                  <>
                    <span className={`ge-port ge-k-${inp.kind}${portState(link, node.id, inp, 'in')}${conn.has(inp.id) ? ' ge-port-used' : ''}`} data-testid="graph-port" data-node={node.id} data-port={inp.id} data-side="in" onPointerDown={(e) => onPortDown(e, node.id, inp.id, 'in')} />
                    {inp.label && <span className="ge-label">{inp.label}</span>}
                    {pd && <ParamField def={pd} value={node.params?.[pd.id]} onChange={(v) => setParam(pd.id, v)} />}
                  </>
                )}
              </div>
              <div className="ge-cell ge-cell-out">
                {out && (
                  <>
                    {out.label && <span className="ge-label">{out.label}</span>}
                    <span className={`ge-port ge-port-right ge-k-${out.kind}${portState(link, node.id, out, 'out')}`} data-testid="graph-port" data-node={node.id} data-port={out.id} data-side="out" onPointerDown={(e) => onPortDown(e, node.id, out.id, 'out')} />
                  </>
                )}
              </div>
            </div>
          );
        })}
        {extras.map((p) => (
          <div className="ge-row ge-row-param" key={p.id}>
            <span className="ge-label">{p.label}</span>
            <ParamField def={p} value={node.params?.[p.id]} onChange={(v) => setParam(p.id, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

export const NodeView = memo(NodeViewImpl);
