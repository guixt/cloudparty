import { describe, expect, it, vi } from 'vitest';
import { createSandbox, hardenGlobals, SandboxCompileError, type SandboxOptions } from './sandbox';
import type { ScriptCommand } from './commands';

function make(source: string, extra: Partial<SandboxOptions> = {}) {
  const cmds: ScriptCommand[] = [];
  const logs: { level: string; message: string }[] = [];
  const sandbox = createSandbox({
    source,
    snapshot: { id: 'e1', name: 'Test', position: [1, 2, 3], rotation: [0, 90, 0], state: { a: 1 } },
    post: (c) => cmds.push(c),
    log: (level, message) => logs.push({ level, message }),
    ...extra,
  });
  return { sandbox, cmds, logs };
}

describe('sandbox', () => {
  it('findet Handler und behält Top-Level-Zustand', () => {
    const { sandbox, cmds } = make(`
      let n = 0;
      function onClick(avatar) { n++; self.say('Hallo ' + avatar.name + ' ' + n); }
      const onTouch = () => {};
    `);
    expect(sandbox.handlers.sort()).toEqual(['onClick', 'onTouch']);
    sandbox.dispatch('onClick', [{ id: 'a', name: 'Anna' }]);
    sandbox.dispatch('onClick', [{ id: 'a', name: 'Anna' }]);
    expect(cmds).toEqual([
      { c: 'say', text: 'Hallo Anna 1' },
      { c: 'say', text: 'Hallo Anna 2' },
    ]);
  });

  it('erzeugt Befehle und verfolgt Lesezustand optimistisch', () => {
    const { sandbox, cmds } = make(`
      function onStart() {
        self.move(1, 0, 0);
        self.setRotation(0, 45, 0);
        self.setState('k', { x: [1, 2] });
        self.setColor('#FF0000');
        world.send('Bob', 'hi', { v: 1 });
        world.playSound('ding');
        self.say(JSON.stringify([self.getPosition(), self.getRotation(), self.getState('k'), self.getState('a')]));
      }`);
    sandbox.dispatch('onStart', []);
    expect(cmds[0]).toEqual({ c: 'position', v: [2, 2, 3] });
    expect(cmds[3]).toEqual({ c: 'color', v: '#ff0000' });
    expect(cmds[4]).toEqual({ c: 'send', target: 'Bob', message: 'hi', data: { v: 1 } });
    expect(cmds[5]).toEqual({ c: 'sound', name: 'ding' });
    const say = cmds[6] as { text: string };
    expect(JSON.parse(say.text)).toEqual([{ x: 2, y: 2, z: 3 }, { x: 0, y: 45, z: 0 }, { x: [1, 2] }, 1]);
  });

  it('updateSnapshot ersetzt den Lesezustand', () => {
    const { sandbox, cmds } = make(`function onStart(){ self.say(String(self.getPosition().x)); }`);
    sandbox.updateSnapshot({ id: 'e1', position: [9, 0, 0], rotation: [0, 0, 0], state: {} });
    sandbox.dispatch('onStart', []);
    expect(cmds[0]).toEqual({ c: 'say', text: '9' });
  });

  it('versteckt verbotene Globals; self ist das API-Objekt', () => {
    const { sandbox, cmds } = make(`
      function onStart() {
        self.say([typeof fetch, typeof XMLHttpRequest, typeof WebSocket, typeof importScripts, typeof navigator,
          typeof postMessage, typeof globalThis, typeof Worker, typeof self.setColor, typeof self.id].join(','));
      }`);
    sandbox.dispatch('onStart', []);
    expect((cmds[0] as { text: string }).text).toBe(
      'undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,function,string',
    );
  });

  it('meldet Fehler in Handlern mit Zeilennummer, Skript bleibt nutzbar', () => {
    const { sandbox, logs } = make(`let x = 1;\nfunction onClick() {\n  null.boom;\n}`);
    sandbox.dispatch('onClick', []);
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('error');
    expect(logs[0].message).toMatch(/TypeError/);
    expect(logs[0].message).toContain('Zeile 3');
  });

  it('meldet Syntaxfehler und Fehler bei der Auswertung', () => {
    expect(() => make('function onClick( {')).toThrow(SandboxCompileError);
    expect(() => make('const a = 1;\nundefinedFunction();')).toThrow(/ReferenceError.*Zeile 2/);
  });

  it('verbietet dynamisches import()', () => {
    expect(() => make(`import('https://example.com/x.js')`)).toThrow(SandboxCompileError);
    expect(() => make(`import /* x */ ("a")`)).toThrow(SandboxCompileError);
  });

  it('wirft bei ungültigen API-Argumenten im Skript (Fehler wird geloggt)', () => {
    const { sandbox, cmds, logs } = make(`function onStart(){ self.setColor('rot'); }
      function onClick(){ self.setPosition(NaN, 0, 0); }
      function onTouch(){ self.setState('f', () => 1); }`);
    sandbox.dispatch('onStart', []);
    sandbox.dispatch('onClick', []);
    sandbox.dispatch('onTouch', []);
    expect(cmds).toEqual([]);
    expect(logs).toHaveLength(3);
  });

  it('log und console.log landen im Log', () => {
    const { sandbox, logs } = make(`function onStart(){ log('a', 1, {b: 2}); console.log('c'); console.error('d'); }`);
    sandbox.dispatch('onStart', []);
    expect(logs).toEqual([
      { level: 'log', message: 'a 1 {"b":2}' },
      { level: 'log', message: 'c' },
      { level: 'error', message: 'd' },
    ]);
  });

  it('Timer laufen, lassen sich löschen und werden bei dispose gestoppt', () => {
    vi.useFakeTimers();
    try {
      const enter = vi.fn();
      const leave = vi.fn();
      const { sandbox, cmds } = make(
        `let c = 0;
         function onStart(){
           setTimeout(() => self.say('once'), 100);
           const h = setInterval(() => { c++; self.say('tick' + c); }, 50);
           setTimeout(() => clearInterval(h), 180);
           const dead = setTimeout(() => self.say('nie'), 10); clearTimeout(dead);
         }`,
        { enter, leave },
      );
      sandbox.dispatch('onStart', []);
      vi.advanceTimersByTime(500);
      expect(cmds.map((c) => (c as { text: string }).text)).toEqual(['tick1', 'once', 'tick2', 'tick3']);
      expect(enter).toHaveBeenCalledTimes(leave.mock.calls.length);
      sandbox.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('begrenzt Befehle und say pro Sekunde und warnt einmal', () => {
    let t = 0;
    const { sandbox, cmds, logs } = make(
      `function onStart(){ for (let i = 0; i < 20; i++) self.say('x' + i); for (let i = 0; i < 500; i++) self.setAlpha(0.5); }`,
      { now: () => t },
    );
    sandbox.dispatch('onStart', []);
    expect(cmds.filter((c) => c.c === 'say')).toHaveLength(5);
    expect(cmds.length).toBeLessThanOrEqual(200);
    expect(logs.filter((l) => l.level === 'error')).toHaveLength(2);
    t = 1500;
    sandbox.dispatch('onStart', []);
    expect(cmds.filter((c) => c.c === 'say')).toHaveLength(10);
  });

  it('hardenGlobals entfernt Eigenschaften', () => {
    const g: Record<string, unknown> = { fetch: () => 1, WebSocket: class {}, keep: 1 };
    hardenGlobals(g);
    expect(g.fetch).toBeUndefined();
    expect(g.WebSocket).toBeUndefined();
    expect(g.keep).toBe(1);
  });
});

describe('sandbox: sanfte Bewegung, Gruppen, Weltsicht, Spawn', () => {
  it('moveTo/rotateTo/scaleTo senden Bewegungsbefehle mit Dauer und Kurve und merken die Zielposition', () => {
    const { sandbox, cmds } = make(`function onClick() { self.moveTo(5, 0, 1, 2, 'out'); self.rotateTo(0, 180, 0); self.scaleTo(2, 2, 2, 0.5, 'linear'); const p = self.getPosition(); self.say(p.x + ',' + p.z); }`);
    sandbox.dispatch('onClick', []);
    expect(cmds).toEqual([
      { c: 'tween', op: 'move', v: [5, 0, 1], seconds: 2, ease: 'out' },
      { c: 'tween', op: 'rotate', v: [0, 180, 0], seconds: 1, ease: 'inOut' },
      { c: 'tween', op: 'scale', v: [2, 2, 2], seconds: 0.5, ease: 'linear' },
      { c: 'say', text: '5,1' },
    ]);
  });

  it('unbekannte Kurve ist ein Fehler im Skript, kein Befehl', () => {
    const { sandbox, cmds, logs } = make(`function onClick() { self.moveTo(1, 1, 1, 1, 'wild'); }`);
    sandbox.dispatch('onClick', []);
    expect(cmds).toEqual([]);
    expect(logs[0].message).toContain('Kurve');
  });

  it('world.group steuert die Gruppe; Lesen aus der Weltsicht', () => {
    const { sandbox, cmds, logs } = make(`
      function onClick() {
        const g = world.group('Rad');
        log(g.count, JSON.stringify(g.center()));
        g.rotateBy(0, 0, 360, 20, 'linear');
        g.moveBy(0, 1, 0, 2);
        g.setColor('#ff0000');
      }
    `);
    sandbox.updateWorld({
      objects: [
        { id: 'a', name: 'R1', group: 'g1', groupName: 'Rad', ref: 'EntitySpec.box', p: [0, 0, 0] },
        { id: 'b', name: 'R2', group: 'g1', groupName: 'Rad', ref: 'EntitySpec.box', p: [4, 2, 0] },
        { id: 'c', name: 'Tür', ref: 'EntitySpec.box', p: [9, 9, 9] },
      ],
      avatars: [{ id: 'me', name: 'Ich', p: [1, 0, 2] }],
    });
    sandbox.dispatch('onClick', []);
    expect(logs[0].message).toBe('2 {"x":2,"y":1,"z":0}');
    expect(cmds).toEqual([
      { c: 'group', name: 'Rad', op: 'rotate', v: [0, 0, 360], seconds: 20, ease: 'linear' },
      { c: 'group', name: 'Rad', op: 'move', v: [0, 1, 0], seconds: 2, ease: 'inOut' },
      { c: 'group', name: 'Rad', op: 'color', color: '#ff0000', seconds: 0, ease: 'inOut' },
    ]);
  });

  it('world.find, findAll und avatars lesen die Weltsicht', () => {
    const { sandbox, logs } = make(`
      function onClick() {
        log(JSON.stringify(world.find('tür')), world.find('gibtsnicht'));
        log(world.findAll('Rad').length, world.findAll('R').length);
        log(JSON.stringify(world.avatars()));
      }
    `);
    sandbox.updateWorld({
      objects: [
        { id: 'a', name: 'R1', group: 'g1', groupName: 'Rad', ref: 'EntitySpec.box', p: [0, 0, 0] },
        { id: 'c', name: 'Tür', ref: 'EntitySpec.box', p: [9, 9, 9] },
      ],
      avatars: [{ id: 'me', name: 'Ich', p: [1, 0, 2] }],
    });
    sandbox.dispatch('onClick', []);
    expect(logs[0].message).toContain('"x":9');
    expect(logs[0].message).toContain('null');
    expect(logs[1].message).toBe('1 1');
    expect(logs[2].message).toBe('[{"id":"me","name":"Ich","x":1,"y":0,"z":2}]');
    // Teilaktualisierung ersetzt nur, was mitkommt
    sandbox.updateWorld({ avatars: [] });
    sandbox.dispatch('onClick', []);
    expect(logs[5].message).toBe('[]');
    expect(logs[3].message).toContain('"x":9');
  });

  it('world.spawn liefert eine gültige id und sendet den Befehl; destroy ebenso', () => {
    const { sandbox, cmds } = make(`function onClick() { const id = world.spawn('EntitySpec.sphere', { x: 1, y: 2, z: 3, color: '#ff0000', physics: 'dynamic', lifetime: 5, scale: 0.5 }); world.destroy(id); }`);
    sandbox.dispatch('onClick', []);
    const spawn = cmds[0] as Extract<ScriptCommand, { c: 'spawn' }>;
    expect(spawn.id).toMatch(/^sp_[a-z0-9]+_1_[a-z0-9]+$/);
    expect(spawn).toMatchObject({ ref: 'EntitySpec.sphere', v: [1, 2, 3], opts: { color: '#ff0000', physics: 'dynamic', lifetime: 5, scale: [0.5, 0.5, 0.5] } });
    expect(cmds[1]).toEqual({ c: 'destroy', target: spawn.id });
  });
});
