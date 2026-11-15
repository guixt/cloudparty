import { describe, expect, it } from 'vitest';
import { bezierPath, fitView, hitNode, hitPort, nodeSize, nodesInRect, normRect, portPos, screenToWorld, snap, worldToScreen, zoomAt, distToWire, wireMid } from './geometry';
import { filterPalette } from './meta';
import { compatibleTypes, connect, kindsCompatible, removeNodes } from './rules';
import { createSession } from './state';
import { FIX_DEFS, fixDef, fixGraph } from './fixtures';
import { nodesByCategory } from '../../../shared/graphNodes';

describe('geometry', () => {
  it('berechnet Größe und Anschlusspositionen', () => {
    const def = fixDef('act')!;
    expect(nodeSize(def).h).toBeGreaterThan(nodeSize(fixDef('num')).h);
    const a = portPos({ x: 10, y: 20 }, def, 'in', 0);
    const b = portPos({ x: 10, y: 20 }, def, 'out', 0);
    expect(a.x).toBe(10);
    expect(b.x).toBe(10 + nodeSize(def).w);
    expect(a.y).toBe(b.y);
    expect(portPos({ x: 0, y: 0 }, def, 'in', 1).y).toBeGreaterThan(a.y - 20);
  });
  it('Bézier-Pfad und Mitte', () => {
    expect(bezierPath({ x: 0, y: 0 }, { x: 100, y: 50 })).toMatch(/^M 0 0 C /);
    const m = wireMid({ x: 0, y: 0 }, { x: 100, y: 100 });
    expect(m.x).toBeCloseTo(50);
    expect(distToWire({ x: 0, y: 0 }, { x: 100, y: 100 }, m)).toBeLessThan(1);
  });
  it('Treffer, Raster, Auswahlrahmen', () => {
    const g = fixGraph();
    expect(hitNode(g.nodes, fixDef, { x: 5, y: 5 })).toBe('a');
    expect(hitNode(g.nodes, fixDef, { x: 1000, y: 1000 })).toBeNull();
    const p = portPos(g.nodes[1], fixDef('act'), 'in', 1);
    expect(hitPort(g.nodes, fixDef, p)).toEqual({ node: 'b', port: 'text', side: 'in' });
    expect(hitPort(g.nodes, fixDef, { x: 5000, y: 5000 })).toBeNull();
    expect(snap(29)).toBe(20);
    expect(snap(31)).toBe(40);
    expect(nodesInRect(g.nodes, fixDef, normRect({ x: 290, y: -10 }, { x: 320, y: 10 }))).toEqual(['b']);
    expect(nodesInRect(g.nodes, fixDef, normRect({ x: -10, y: -10 }, { x: 500, y: 500 })).length).toBe(3);
  });
  it('Zoom bleibt am Punkt und ist begrenzt', () => {
    const v = { x: 10, y: 20, zoom: 1 };
    const at = { x: 200, y: 100 };
    const w0 = screenToWorld(v, at);
    const z = zoomAt(v, at, 1.5);
    expect(screenToWorld(z, at).x).toBeCloseTo(w0.x);
    expect(worldToScreen(z, w0).y).toBeCloseTo(at.y);
    expect(zoomAt(v, at, 99).zoom).toBe(2);
    expect(zoomAt(v, at, 0.01).zoom).toBe(0.25);
    expect(fitView({ x: 0, y: 0, w: 4000, h: 100 }, { w: 800, h: 500 }).zoom).toBeLessThan(0.25 + 0.01);
  });
});

describe('Verbindungsregeln', () => {
  const ep = (node: string, port: string) => ({ node, port });
  it('Arten', () => {
    expect(kindsCompatible('number', 'text')).toBe(true);
    expect(kindsCompatible('text', 'number')).toBe(false);
    expect(kindsCompatible('flow', 'flow')).toBe(true);
  });
  it('verbindet in beide Richtungen und ersetzt Daten-Zuflüsse', () => {
    let g = fixGraph();
    const r1 = connect(g, fixDef, { ep: ep('a', 'name'), side: 'out' }, { ep: ep('b', 'text'), side: 'in' });
    expect(r1.ok).toBe(true);
    g = r1.graph;
    const r2 = connect(g, fixDef, { ep: ep('b', 'n'), side: 'in' }, { ep: ep('c', 'value'), side: 'out' });
    expect(r2.ok).toBe(true);
    const r3 = connect(r2.graph, fixDef, { ep: ep('c', 'value'), side: 'out' }, { ep: ep('b', 'text'), side: 'in' });
    expect(r3.ok).toBe(true);
    expect(r3.graph.edges.filter((e) => e.to.port === 'text')).toHaveLength(1);
    expect(r3.graph.edges.find((e) => e.to.port === 'text')!.from.node).toBe('c');
  });
  it('Ablauf darf sich verzweigen, Unpassendes wird abgelehnt', () => {
    let g = fixGraph();
    g.nodes.push({ id: 'd', type: 'act', x: 0, y: 0 });
    g = connect(g, fixDef, { ep: ep('a', 'then'), side: 'out' }, { ep: ep('b', 'in'), side: 'in' }).graph;
    g = connect(g, fixDef, { ep: ep('a', 'then'), side: 'out' }, { ep: ep('d', 'in'), side: 'in' }).graph;
    expect(g.edges).toHaveLength(2);
    expect(connect(g, fixDef, { ep: ep('a', 'name'), side: 'out' }, { ep: ep('b', 'n'), side: 'in' }).ok).toBe(false);
    expect(connect(g, fixDef, { ep: ep('a', 'then'), side: 'out' }, { ep: ep('b', 'text'), side: 'in' }).reason).toMatch(/Ablauf/);
    expect(connect(g, fixDef, { ep: ep('a', 'then'), side: 'out' }, { ep: ep('d', 'then'), side: 'out' }).ok).toBe(false);
    expect(connect(g, fixDef, { ep: ep('a', 'then'), side: 'out' }, { ep: ep('a', 'name'), side: 'in' }).ok).toBe(false);
  });
  it('Löschen entfernt Kanten', () => {
    let g = fixGraph();
    g = connect(g, fixDef, { ep: ep('a', 'then'), side: 'out' }, { ep: ep('b', 'in'), side: 'in' }).graph;
    expect(removeNodes(g, ['a']).edges).toHaveLength(0);
  });
  it('Palette nach passendem Anschluss', () => {
    const t = compatibleTypes(FIX_DEFS, 'flow', 'out').map((c) => c.def.type);
    expect(t).toEqual(['act']);
    expect(compatibleTypes(FIX_DEFS, 'number', 'in').map((c) => c.def.type).sort()).toEqual(['num']);
  });
});

describe('Sitzung', () => {
  it('hinzufügen, bewegen, löschen, Undo/Redo', () => {
    const s = createSession({ version: 1, enabled: true, nodes: [], edges: [] }, fixDef);
    const id = s.addNode('act', 33, 47)!;
    const st = () => s.store.getState();
    expect(st().graph.nodes[0]).toMatchObject({ x: 40, y: 40, params: { text: 'Hi', n: 1 } });
    expect(st().dirty).toBe(true);
    s.moveNodes([id], 20, 0, 'm');
    s.moveNodes([id], 20, 0, 'm');
    expect(st().graph.nodes[0].x).toBe(80);
    s.undo(); // Bewegungen zusammengefasst
    expect(st().graph.nodes[0].x).toBe(40);
    s.undo();
    expect(st().graph.nodes).toHaveLength(0);
    expect(st().dirty).toBe(false);
    s.redo();
    s.redo();
    expect(st().graph.nodes[0].x).toBe(80);
    s.select([id]);
    s.deleteSelection();
    expect(st().graph.nodes).toHaveLength(0);
  });
  it('Kopieren/Einfügen mit neuen IDs und Duplizieren', () => {
    const s = createSession(fixGraph(), fixDef);
    s.connectPorts({ node: 'a', port: 'then', side: 'out' }, { node: 'b', port: 'in', side: 'in' });
    s.select(['a', 'b']);
    s.copy();
    s.paste();
    const g = s.store.getState().graph;
    expect(g.nodes).toHaveLength(5);
    expect(new Set(g.nodes.map((n) => n.id)).size).toBe(5);
    expect(g.edges).toHaveLength(2);
    expect(g.edges[1].from.node).not.toBe('a');
    s.duplicate();
    expect(s.store.getState().graph.nodes).toHaveLength(7);
    expect(s.store.getState().selection).toHaveLength(2);
  });
  it('lehnt unzulässige Verbindung mit Hinweis ab', () => {
    const s = createSession(fixGraph(), fixDef);
    expect(s.connectPorts({ node: 'a', port: 'name', side: 'out' }, { node: 'b', port: 'n', side: 'in' })).toBe(false);
    expect(s.store.getState().hint).toBeTruthy();
    expect(s.store.getState().graph.edges).toHaveLength(0);
  });
});

describe('Palette-Filter', () => {
  it('sucht in Titel und Beschreibung', () => {
    const groups = nodesByCategory();
    const all = filterPalette(groups, '').flatMap((g) => g.nodes).length;
    expect(all).toBeGreaterThan(0);
    expect(filterPalette(groups, 'zzzzzzzz')).toEqual([]);
    const first = groups[0].nodes[0];
    expect(filterPalette(groups, first.title.toUpperCase()).flatMap((g) => g.nodes).map((n) => n.type)).toContain(first.type);
    expect(filterPalette(groups, '', new Set([first.type])).flatMap((g) => g.nodes)).toHaveLength(1);
  });
});
