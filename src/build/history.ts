/**
 * Undo/Redo. Zeichnet lokale, dauerhafte Änderungen aus dem Bus auf und speichert
 * Umkehr-Operationen. Rückgängig/Wiederholen läuft als normale 'local'-Änderung
 * (damit das Netz sie repliziert), wird aber selbst nicht aufgezeichnet (Guard).
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { EntitySpec } from '../../shared/types';
import type { EventBus } from '../core/events';
import type { WorldStore } from '../core/store';

export type HistoryOp =
  | { kind: 'add'; entity: EntitySpec }
  | { kind: 'remove'; entity: EntitySpec }
  | { kind: 'change'; id: string; before: EntitySpec; after: EntitySpec }
  /** Mehrere Operationen als ein Undo-Schritt (z. B. ein KI-Auftrag). */
  | { kind: 'group'; ops: HistoryOp[] };

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

export const HISTORY_LIMIT = 200;
export const COALESCE_MS = 900;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Namen der Felder (außer id), die sich zwischen a und b unterscheiden. */
export function changedKeys(a: EntitySpec, b: EntitySpec): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.delete('id');
  return [...keys].filter((key) => !same((a as unknown as Record<string, unknown>)[key], (b as unknown as Record<string, unknown>)[key])).sort();
}

/** Patch, der `from` in `to` überführt (fehlende Felder werden als undefined = löschen gesetzt). */
export function patchBetween(from: EntitySpec, to: EntitySpec): Partial<EntitySpec> {
  const patch: Record<string, unknown> = {};
  for (const key of changedKeys(from, to)) patch[key] = (to as unknown as Record<string, unknown>)[key];
  return patch as Partial<EntitySpec>;
}

export class History {
  readonly state: StoreApi<HistoryState> = createStore<HistoryState>(() => ({ canUndo: false, canRedo: false }));
  private undoStack: HistoryOp[] = [];
  private redoStack: HistoryOp[] = [];
  private applying = false;
  private pinned = new Map<string, EntitySpec>();
  private lastChangeAt = 0;
  private groupDepth = 0;
  private groupOps: HistoryOp[] = [];
  private offs: (() => void)[] = [];

  constructor(
    private store: WorldStore,
    private bus: EventBus,
    private now: () => number = () => Date.now(),
  ) {}

  attach(): void {
    this.offs.push(
      this.bus.on('entity.added', ({ entity, source, transient }) => {
        if (source !== 'local' || transient) return;
        this.push({ kind: 'add', entity });
      }),
      this.bus.on('entity.removed', ({ entity, source, transient }) => {
        this.pinned.delete(entity.id);
        if (source !== 'local' || transient) return;
        this.push({ kind: 'remove', entity });
      }),
      this.bus.on('entity.changed', ({ entity, prev, source, transient }) => {
        if (source !== 'local' || transient) return;
        const before = this.pinned.get(entity.id) ?? prev;
        this.pinned.delete(entity.id);
        if (changedKeys(before, entity).length === 0) return;
        this.push({ kind: 'change', id: entity.id, before, after: entity });
      }),
      this.bus.on('world.loaded', () => this.clear()),
      this.bus.on('history.group.begin', () => this.beginGroup()),
      this.bus.on('history.group.end', () => this.endGroup()),
    );
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
  }

  /** Merkt den Stand vor einer Geste (Ziehen am Gizmo); der nächste dauerhafte Eintrag nutzt ihn als „vorher". */
  pin(id: string): void {
    if (this.pinned.has(id)) return;
    const entity = this.store.getState().entities[id];
    if (entity) this.pinned.set(id, entity);
  }
  unpin(id: string): void {
    this.pinned.delete(id);
  }

  /** Fasst alle Änderungen bis `endGroup` zu einem Undo-Schritt zusammen (verschachtelbar). */
  beginGroup(): void {
    this.groupDepth += 1;
  }
  endGroup(): void {
    if (this.groupDepth === 0) return;
    this.groupDepth -= 1;
    if (this.groupDepth > 0 || this.groupOps.length === 0) return;
    const ops = this.groupOps;
    this.groupOps = [];
    this.push(ops.length === 1 ? ops[0] : { kind: 'group', ops }, true);
  }

  get isApplying(): boolean {
    return this.applying;
  }
  get undoCount(): number {
    return this.undoStack.length;
  }
  get redoCount(): number {
    return this.redoStack.length;
  }

  clear(): void {
    this.groupDepth = 0;
    this.groupOps = [];
    this.undoStack = [];
    this.redoStack = [];
    this.pinned.clear();
    this.lastChangeAt = 0;
    this.publish();
  }

  undo(): boolean {
    return this.step(this.undoStack, this.redoStack, true);
  }
  redo(): boolean {
    return this.step(this.redoStack, this.undoStack, false);
  }

  private push(op: HistoryOp, fromGroup = false): void {
    if (this.applying) return;
    if (this.groupDepth > 0 && !fromGroup) {
      this.groupOps.push(op);
      return;
    }
    const t = this.now();
    const top = this.undoStack[this.undoStack.length - 1];
    if (
      op.kind === 'change' &&
      top?.kind === 'change' &&
      top.id === op.id &&
      t - this.lastChangeAt < COALESCE_MS &&
      same(changedKeys(top.before, top.after), changedKeys(op.before, op.after))
    ) {
      top.after = op.after;
      if (changedKeys(top.before, top.after).length === 0) this.undoStack.pop();
    } else {
      this.undoStack.push(op);
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    }
    this.lastChangeAt = op.kind === 'change' ? t : 0;
    this.redoStack = [];
    this.publish();
  }

  private step(from: HistoryOp[], to: HistoryOp[], undo: boolean): boolean {
    const op = from.pop();
    if (!op) return false;
    this.applying = true;
    try {
      this.apply(op, undo);
    } finally {
      this.applying = false;
    }
    to.push(op);
    this.lastChangeAt = 0;
    this.publish();
    return true;
  }

  private apply(op: HistoryOp, undo: boolean): void {
    const state = this.store.getState();
    const opts = { source: 'local' as const };
    if (op.kind === 'group') {
      for (const inner of undo ? [...op.ops].reverse() : op.ops) this.apply(inner, undo);
      return;
    }
    if (op.kind === 'add') {
      if (undo) state.removeEntity(op.entity.id, opts);
      else state.addEntity(op.entity, opts);
    } else if (op.kind === 'remove') {
      if (undo) state.addEntity(op.entity, opts);
      else state.removeEntity(op.entity.id, opts);
    } else {
      const current = state.entities[op.id];
      if (!current) return;
      const target = undo ? op.before : op.after;
      state.updateEntity(op.id, patchBetween(current, target), opts);
    }
  }

  private publish(): void {
    this.state.setState({ canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 });
  }
}
