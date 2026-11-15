# Architektur und Verträge

Cloudparty 2.0 besteht aus einem Kern (Fundament) und zwölf Modulen (Arbeitspaketen). Der Kern legt Verträge fest; Module berühren sich nur darüber.

## Verzeichnisse

| Pfad | Inhalt | Wer ändert |
|------|--------|-----------|
| `shared/types.ts`, `avatar.ts`, `protocol.ts`, `scriptApi.ts`, `defaultWorld.ts` | Datentypen und Protokolle für Client und Server | nur Koordinator |
| `shared/worldspec/` | Validierung der WorldSpec | Paket 3 |
| `src/core/` | `events.ts` (Bus + Ereigniskatalog), `store.ts` (WorldStore), `context.ts` (GameContext, GameModule), `ui.ts` (UI-Slots) | nur Koordinator |
| `src/engine/bootstrap.ts`, `sideEffects.ts`, `src/modules.ts`, `src/App.tsx`, `src/styles.css` | Start, Modulreihenfolge, Layout | nur Koordinator |
| `src/engine/environment/` | Paket 1 | |
| `src/engine/avatar/` | Paket 2 | |
| `src/world/persistence/` | Paket 3 | |
| `src/world/entities/` | Paket 4 | |
| `src/engine/physics/` | Paket 5 | |
| `src/build/` | Paket 6 | |
| `src/scripting/runtime/` | Paket 7 | |
| `src/scripting/editor/` | Paket 8 | |
| `server/realtime/` | Paket 9 | |
| `src/net/` | Paket 10 | |
| `server/api/`, `src/ui/shell/` | Paket 11 | |
| `src/world/media/` | Paket 12 | |
| `server/index.ts`, `server/context.ts` | Server-Einstieg und -Verträge | nur Koordinator |

## Grundregeln

1. **Der Store ist die Wahrheit.** Die bearbeitbare Welt liegt in `ctx.store` (`src/core/store.ts`). Geändert wird nur über die Aktionen (`addEntity`, `updateEntity`, `removeEntity`, `setEnvironment`, `loadWorld`, …). Jede Aktion löst ein Bus-Ereignis aus.
2. **Module reagieren auf den Bus.** Ein Modul übernimmt in `init(ctx)` den aktuellen Store-Zustand und reagiert danach auf Ereignisse – immer auch auf `world.loaded` (kompletter Neuaufbau).
3. **Änderungsquelle beachten.** `ChangeOptions.source`: `local` (Nutzer), `remote` (vom Netz), `script`, `system`. Das Netz-Modul sendet alles außer `remote`. `transient: true` kennzeichnet Zwischenstände (z. B. während des Ziehens): nicht speichern, nicht ins Undo, nicht senden.
4. **Entity-Knoten.** Paket 4 erzeugt pro Entity einen Wurzelknoten (`TransformNode`), trägt ihn in `ctx.entityNodes` ein und meldet `entity.node.created` / `entity.node.disposed`. Alle Meshes darunter tragen `metadata.entityId` (`tagEntityNode`, `entityIdOf` in `src/core/context.ts`). Andere Module (Physik, Medien, Build, Skripte) hängen sich an diese Knoten, erzeugen aber keine eigenen Wurzelknoten. Wird ein Knoten neu aufgebaut, kommt erst `disposed`, dann `created`.
5. **Transform.** Die Transform im Store ist der gebaute Zustand. Physik bewegt Knoten dynamischer Objekte nur zur Laufzeit und schreibt nicht in den Store. Ändert sich die Transform im Store, setzen Paket 4 den Knoten und Paket 5 den Körper neu.
6. **Koordinaten.** Meter, Y nach oben, Inseloberseite bei y = 0, Mittelpunkt im Ursprung. Entity-`pos` ist der Mittelpunkt der Grundform (ein 1-m-Würfel auf dem Boden hat y = 0.5); zusammengesetzte Prefabs (Bank, Baum, Tafel …) haben ihren Ursprung am Boden.
7. **Avatar.** `ctx.localAvatar` ist der laufend aktualisierte Zustand des lokalen Avatars (Fußpunkt, yaw, motion, emotes). `ctx.avatarFactory` erzeugt Darstellungen für lokale und entfernte Avatare.
8. **Oberfläche.** React-Komponenten über `ctx.ui.register({ id, slot, component })` einhängen (Slots siehe `src/core/ui.ts`). Zustand lesen mit `useStore(ctx.store, selector)` aus `zustand`. Gemeinsame CSS-Klassen `cp-*` aus `src/styles.css`; eigenes CSS im eigenen Verzeichnis. Tastatureingaben ignorieren, solange ein Eingabefeld den Fokus hat.
9. **Babylon-Importe** nur über Unterpfade (`@babylonjs/core/Meshes/Builders/boxBuilder`), nie `from '@babylonjs/core'`. Gängige Seiteneffekt-Importe stehen in `src/engine/sideEffects.ts`; fehlt einer, im eigenen Modul ergänzen.
10. **Offline zuerst.** Der Client muss ohne Server laufen (`?server=off`). `ctx.config.serverUrl` ist dann `null`.

## Tests

- `npm run typecheck`, `npm test` (vitest; Dateien `*.test.ts` neben dem Code; für DOM-Tests `// @vitest-environment jsdom` in der ersten Zeile), `npm run build`.
- `npm run e2e` – Smoke-Test im Browser. `scripts/e2e-smoke.cjs` exportiert `startVite(port)` und `launchGame(url)` für eigene Playwright-Skripte.
- Im Browser steht `window.__cloudparty` bereit: `{ ready, error, ctx, store, bus, scene }`.

## Server

`npm run server` startet HTTP + WebSocket (Standard-Port 8787, `PORT`/`DATA_DIR` per Umgebung). Der Client nimmt auf `localhost` automatisch `http://localhost:8787`; mit `?server=http://localhost:PORT` lässt sich ein anderer Server wählen, mit `?server=off` keiner.

## Gruppen, Bibliothek und Logik-Graph (Stufe 2)

- **Gruppen** sind flach: `entity.group` (ID) und `entity.groupName`. Objekte mit gleicher Gruppen-ID werden gemeinsam gewählt, bewegt (um den Gruppenmittelpunkt), kopiert und als Baustein gespeichert. Die Objekte bleiben eigenständige Entities in Weltkoordinaten (keine Eltern-Kind-Transformation), damit Physik, Netzwerk und Skripte unverändert funktionieren.
- **Mehrfachauswahl:** `store.selectedIds` (alle) und `store.selection` (primär = zuletzt gewählt). `select(id)`, `selectMany(ids)`, `toggleSelect(id)`. Ereignisse: `selection.changed` (primär) und `selection.multi.changed` (Menge).
- **Bibliothek:** Vertrag in `shared/library.ts` und `src/library/api.ts` (`getLibrary()`). Bausteine liegen im Browser (IndexedDB `cloudparty-library`), Export/Import als Datei.
- **Logik-Graph:** Typen und Konventionen in `shared/graph.ts`, Katalog in `shared/graphNodes.ts`, Übersetzer in `shared/graphCompile.ts` (`compileGraph`, `validateGraph`, `entityScriptSource`), Kompaktform für die KI in `shared/graphCompact.ts`. Der Graph hängt an `entity.graph`; die Skript-Laufzeit führt `entityScriptSource(entity)` aus. Editor: `ui.openGraphEditor` → `src/graph/editor/`.
- **KI-Werkzeuge** dazu: `group_entities`, `ungroup`, `library_list`, `library_place`, `library_save`, `set_graph` (Vertrag in `shared/aiTools.ts`).

## Grafik (Stufe 3)

- **Qualitätsstufen:** `src/engine/quality.ts` legt vier Stufen (`low`, `medium`, `high`, `ultra`) und ihre Merkmale fest (`ctx.quality.features()`, `ctx.quality.onChange(...)`). Effekte lesen nur daraus und schalten sich selbst um; die Automatik und die Oberfläche gehören Paket 26.
- **Umgebungs-Effekte:** `src/engine/environment/features.ts` beschreibt die Hooks (`apply`, `islandChanged`, `update`, `onQuality`, `dispose`), `featureList.ts` listet die Effekte. Jeder Effekt liegt in einer eigenen Datei unter `features/` (`ibl`, `sea`, `looks`, `nature`, `weather`). Ein Effekt, der nicht funktioniert, schaltet sich still ab.
- **Material:** `MaterialSpec` (`shared/types.ts`) kennt jetzt `preset`, `reflect`, `clearcoat`, `glass`, `ior`, `mirror`, `emissiveIntensity`, `pattern`, `patternColor`, `uvScale`. Weltformat (Zod) und KI-Werkzeuge nehmen sie an.
- **Umgebung:** `EnvironmentSpec` kennt zusätzlich `sea` (Wolkenmeer oder Wasser), `look`, `dayCycle` und `weather`.
- **Neue Bausteine:** `EntitySpec.water` und `EntitySpec.waterfall` (Paket 23, `src/world/water/`) sowie `EntitySpec.mirror` (Paket 22, `src/world/materials/`), jeweils über `registerPrefab`.
- **Tageszyklus:** Effekte können über `handle.applyVirtual(env, look?)` eine Umgebung anwenden, ohne den Store zu ändern.
