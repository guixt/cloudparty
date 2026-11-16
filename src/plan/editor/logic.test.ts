import { describe, expect, it } from 'vitest';
import type { PlanSpec } from '../../../shared/plan';
import { edgePath, fitView, inPort, outPort, previewNotes, progressText, runAllBlockReason, runBlockReason, screenToWorld, zoomAt, NODE_W, NODE_H } from './logic';

const plan = (): PlanSpec => ({
  id: 'p', title: 'P',
  nodes: [
    { id: 'a', title: 'A', notes: '', status: 'done', x: 0, y: 0 },
    { id: 'b', title: 'B', notes: '', status: 'open', x: 300, y: 0 },
    { id: 'c', title: 'C', notes: '', status: 'open', x: 600, y: 0 },
    { id: 'd', title: 'D', notes: '', status: 'disabled', x: 0, y: 200 },
  ],
  edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
});

describe('logic', () => {
  it('Fortschritt ohne deaktivierte', () => expect(progressText(plan())).toBe('1/3 fertig'));
  it('Gründe', () => {
    const p = plan();
    expect(runBlockReason(p, 'b', true)).toBeNull();
    expect(runBlockReason(p, 'c', true)).toContain('Vorgänger');
    expect(runBlockReason(p, 'b', false)).toContain('bauen');
    expect(runBlockReason(p, 'a', true)).toContain('fertig');
    expect(runBlockReason(p, 'd', true)).toContain('deaktiviert');
    expect(runAllBlockReason(p, true)).toBeNull();
    expect(runAllBlockReason(p, false)).not.toBeNull();
    p.nodes.forEach((n) => { n.status = 'done'; });
    expect(runAllBlockReason(p, true)).toContain('Nichts');
  });
  it('Geometrie', () => {
    expect(outPort({ x: 10, y: 10 })).toEqual({ x: 10 + NODE_W, y: 10 + NODE_H / 2 });
    expect(inPort({ x: 10, y: 10 })).toEqual({ x: 10, y: 10 + NODE_H / 2 });
    expect(edgePath({ x: 0, y: 0 }, { x: 100, y: 50 })).toMatch(/^M 0 0 C /);
  });
  it('Zoom hält Punkt fest', () => {
    const v = { x: 20, y: 30, zoom: 1 };
    const at = { x: 200, y: 100 };
    const before = screenToWorld(v, at);
    const z = zoomAt(v, at, 1.5);
    const after = screenToWorld(z, at);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(zoomAt(v, at, 99).zoom).toBe(2);
  });
  it('Vorschau und Einpassen', () => {
    expect(previewNotes('a\n  b', 10)).toBe('a b');
    expect(previewNotes('x'.repeat(100), 10)).toHaveLength(10);
    expect(fitView([], { w: 500, h: 400 }).zoom).toBe(1);
    expect(fitView(plan().nodes, { w: 500, h: 400 }).zoom).toBeLessThan(1);
  });
});
