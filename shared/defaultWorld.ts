import { DEFAULT_ISLAND, type WorldSpec } from './types';

/** Startwelt, die geladen wird, solange nichts anderes gewählt ist. */
export function createDefaultWorld(name = 'Willkommensinsel', id = 'willkommen'): WorldSpec {
  return {
    metadata: { name, version: '1.0.0', id },
    environment: {
      sky: { preset: 'clear' },
      light: { intensity: 3.2, temperatureK: 6000, direction: { azimuth: 40, elevation: 50 } },
      audio: { volume: 0.4 },
    },
    rules: {
      movement: { mode: 'grounded', speed: 5 },
      gravity: { enabled: true, strength: 9.81 },
      abilities: [{ id: 'fly', enabled: true }],
    },
    personality: { mood: 'social', densityHints: { min: 1, max: 25, peak: 20 } },
    island: { ...DEFAULT_ISLAND },
    entities: [
      { id: 'spawn.main', ref: 'EntitySpec.avatar-spawn', name: 'Startpunkt', transform: { pos: [0, 0, 6], rot: [0, 0, 0, 1], scale: [1, 1, 1] } },
      {
        id: 'box.rot',
        ref: 'EntitySpec.box',
        name: 'Roter Würfel',
        transform: { pos: [-3, 0.5, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] },
        material: { color: '#d9453a' },
        physics: { mode: 'static' },
      },
      {
        id: 'kiste.1',
        ref: 'EntitySpec.box',
        name: 'Kiste',
        transform: { pos: [2, 3, -1], rot: [0, 0, 0, 1], scale: [0.8, 0.8, 0.8] },
        material: { color: '#c79a52' },
        physics: { mode: 'dynamic', mass: 4 },
      },
      {
        id: 'kugel.1',
        ref: 'EntitySpec.sphere',
        name: 'Ball',
        transform: { pos: [4, 2, 2], rot: [0, 0, 0, 1], scale: [1, 1, 1] },
        material: { color: '#3a7bd9' },
        physics: { mode: 'dynamic', mass: 1, restitution: 0.7 },
      },
      {
        id: 'schalter.1',
        ref: 'EntitySpec.cylinder',
        name: 'Farbschalter',
        transform: { pos: [0, 0.5, -4], rot: [0, 0, 0, 1], scale: [0.8, 1, 0.8] },
        material: { color: '#f2c230' },
        physics: { mode: 'static' },
        script: {
          enabled: true,
          source:
            "const farben = ['#f2c230', '#33cc66', '#d94fa0', '#3a7bd9'];\nlet i = 0;\nfunction onClick(avatar) {\n  i = (i + 1) % farben.length;\n  self.setColor(farben[i]);\n  self.say('Danke, ' + avatar.name + '!');\n  world.playSound('ding');\n}\n",
        },
      },
    ],
    interactions: [],
    extensions: {},
  };
}
