/**
 * Feste Modul-Reihenfolge. VERTRAG: nur der Koordinator ändert diese Datei.
 * Jedes Paket exportiert sein Modul als default aus seinem index.ts(x).
 */
import type { GameModule } from './core/context';
import environment from './engine/environment';
import persistence from './world/persistence';
import entities from './world/entities';
import media from './world/media';
import physics from './engine/physics';
import avatar from './engine/avatar';
import build from './build';
import scriptRuntime from './scripting/runtime';
import scriptEditor from './scripting/editor';
import net from './net';
import shell from './ui/shell';

export const modules: GameModule[] = [
  persistence, // 3
  environment, // 1
  entities, // 4
  media, // 12
  physics, // 5
  avatar, // 2
  build, // 6
  scriptRuntime, // 7
  scriptEditor, // 8
  net, // 10
  shell, // 11
];
