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
