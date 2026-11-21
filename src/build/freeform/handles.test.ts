// @vitest-environment jsdom
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it } from 'vitest';
import { FREEFORM_REF } from '../../../shared/freeform';
import type { GameContext } from '../../core/context';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import { History } from '../history';
import { FreeformHandles } from './handles';

function setup() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const bus = new EventBus();
  const store = createWorldStore(bus);
  const canvas = document.createElement('canvas');
  const ctx = { scene, bus, store, canvas } as unknown as GameContext;
  const history = new History(store, bus);
  history.attach();
  const handles = new FreeformHandles(ctx, history);
  handles.attach();
  const s = store.getState();
  s.setCanBuild(true);
  s.addEntity(
    { id: 'ff1', ref: FREEFORM_REF, name: 'Freiform', state: { kind: 'sweep', path: [{ p: [0, 0] }, { p: [4, 0] }, { p: [4, 3] }], height: 2, thickness: 0.2 }, transform: { pos: [0, 0, 6], rot: [0, 0, 0, 1], scale: [1, 1, 1] } } as never,
    { source: 'local' },
  );
  return { scene, store, handles, engine };
}
const markers = (scene: Scene) => scene.meshes.filter((m) => (m.metadata as { buildOnly?: boolean } | null)?.buildOnly);

describe('FreeformHandles', () => {
  it('Griffe nur bei Auswahl im Baumodus und rückstandsfrei danach', () => {
    const { scene, store, handles, engine } = setup();
    expect(handles.count()).toBe(0);
    store.getState().setMode('build');
    store.getState().select('ff1');
    expect(handles.count()).toBe(3);
    expect(markers(scene)).toHaveLength(3);
    store.getState().select(null);
    expect(handles.count()).toBe(0);
    expect(markers(scene)).toHaveLength(0);
    store.getState().select('ff1');
    store.getState().setMode('play');
    expect(markers(scene)).toHaveLength(0);
    store.getState().setMode('build');
    store.getState().select('ff1');
    store.getState().removeEntity('ff1');
    expect(markers(scene)).toHaveLength(0);
    handles.dispose();
    expect(scene.materials.filter((m) => m.name.startsWith('ffHandle'))).toHaveLength(0);
    scene.dispose();
    engine.dispose();
  });
});
