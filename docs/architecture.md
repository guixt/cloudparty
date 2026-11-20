# Architektur und Verträge

Cloudparty 2.0 besteht aus einem Kern (Fundament) und einer Reihe von Modulen. Der Kern legt Verträge fest; Module berühren sich nur darüber.

## Module

Die feste Reihenfolge steht in `src/modules.ts` (nur der Koordinator ändert sie). Jedes Modul exportiert ein `GameModule` als Standard aus seinem `index.ts(x)`.

| Modul (Reihenfolge) | Pfad | Aufgabe |
|---------------------|------|---------|
| persistence | `src/world/persistence/` | Speichern (IndexedDB), JSON-Import/Export |
| environment | `src/engine/environment/` | Insel, Himmel, Licht, Effekte unter `features/` |
| entities | `src/world/entities/` | Entity-Knoten, Prefabs, glTF, Klemmbaustein-Geometrie (`brickMaster.ts`) |
| brickCulling | `src/world/bricks/` | verdeckte Klemmbausteine im Spielmodus ausblenden |
| media | `src/world/media/` | Medien-Tafeln (Bild, Folien, Text, Video, Web) |
| water, materials | `src/world/water/`, `src/world/materials/` | Wasser, Wasserfall, Spiegel, Material-Editor |
| physics | `src/engine/physics/` | Havok-Physik, Berührungs- und Trigger-Ereignisse |
| avatar | `src/engine/avatar/` | Figur, Steuerung, Kamera |
| build | `src/build/` | Baumodus: Auswahl, Gizmos, Palette, Inspector, Undo/Redo |
| scriptRuntime, scriptEditor | `src/scripting/runtime/`, `src/scripting/editor/` | Skript-Laufzeit und Editor |
| net | `src/net/` | Multiplayer-Client |
| shell | `src/ui/shell/` | Menü, Konten, Ortslinks, Hilfe |
| graphics | `src/ui/graphics/` | Grafik-Dialog, Qualitätsautomatik |
| library | `src/library/` | Baustein-Bibliothek |
| graphEditor | `src/graph/editor/` | Editor des Logik-Graphen |
| planEditor | `src/plan/editor/` | Plan-Board (Fenster, Canvas) |
| aiCore | `src/ai/core/` | KI-Kern |
| aiBridge | `src/ai/bridge/` | MCP-Brücke in der App |
| aiUi | `src/ai/ui/` | KI-Fenster, Einstellungen, Markdown |
| planRun | `src/plan/run/` | Plan-Ausführung über die Auftragswarteschlange |

Außerdem: `src/world/export/` (Blender-Export, wird über die Menüs aufgerufen), `src/plan/core/` (Plan-Daten), `src/graph/ai/`, `src/scripting/editor/ai/` (KI im Editor).

## Verzeichnisse

| Pfad | Inhalt | Wer ändert |
|------|--------|-----------|
| `shared/types.ts`, `avatar.ts`, `protocol.ts`, `scriptApi.ts`, `defaultWorld.ts` | Datentypen und Protokolle für Client und Server | nur Koordinator |
| `shared/worldspec/` | Validierung der WorldSpec | Weltformat |
| `shared/aiTools.ts`, `mcpBridge.ts`, `plan.ts`, `bricks.ts`, `graph*.ts`, `library.ts` | Verträge für KI-Werkzeuge, MCP, Pläne, Klemmbausteine, Logik-Graph, Bibliothek | |
| `src/core/` | `events.ts` (Bus + Ereigniskatalog), `store.ts` (WorldStore), `context.ts` (GameContext, GameModule), `ui.ts` (UI-Slots) | nur Koordinator |
| `src/engine/bootstrap.ts`, `sideEffects.ts`, `src/modules.ts`, `src/App.tsx`, `src/styles.css` | Start, Modulreihenfolge, Layout | nur Koordinator |
| `server/index.ts`, `server/context.ts` | Server-Einstieg und -Verträge | nur Koordinator |
| `server/realtime/`, `server/api/` | Echtzeit-Räume mit Rechteprüfung, REST-API mit Konten und SQLite-Inseln | |
| `mcp/` | MCP-Server für Claude Desktop (`server.ts`, `bridge.ts`, `rpc.ts`) | |

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

- Weitere Befehle: [entwicklung.md](entwicklung.md). `npm run typecheck`, `npm test` (vitest; Dateien `*.test.ts` neben dem Code; für DOM-Tests `// @vitest-environment jsdom` in der ersten Zeile), `npm run build`.
- `npm run e2e` – Smoke-Test im Browser. `scripts/e2e-smoke.cjs` exportiert `startVite(port)` und `launchGame(url)` für eigene Playwright-Skripte.
- Im Browser steht `window.__cloudparty` bereit: `{ ready, error, ctx, store, bus, scene }`.

## Server

`npm run server` startet HTTP + WebSocket (Standard-Port 8787, `PORT`/`DATA_DIR` per Umgebung). Der Client nimmt auf `localhost` automatisch `http://localhost:8787`; mit `?server=http://localhost:PORT` lässt sich ein anderer Server wählen, mit `?server=off` keiner.

## Gruppen, Bibliothek und Logik-Graph

- **Gruppen** sind flach: `entity.group` (ID) und `entity.groupName`. Objekte mit gleicher Gruppen-ID werden gemeinsam gewählt, bewegt (um den Gruppenmittelpunkt), kopiert und als Baustein gespeichert. Die Objekte bleiben eigenständige Entities in Weltkoordinaten (keine Eltern-Kind-Transformation), damit Physik, Netzwerk und Skripte unverändert funktionieren.
- **Mehrfachauswahl:** `store.selectedIds` (alle) und `store.selection` (primär = zuletzt gewählt). `select(id)`, `selectMany(ids)`, `toggleSelect(id)`. Ereignisse: `selection.changed` (primär) und `selection.multi.changed` (Menge).
- **Bibliothek:** Vertrag in `shared/library.ts` und `src/library/api.ts` (`getLibrary()`). Bausteine liegen im Browser (IndexedDB `cloudparty-library`), Export/Import als Datei.
- **Logik-Graph:** Typen und Konventionen in `shared/graph.ts`, Katalog in `shared/graphNodes.ts`, Übersetzer in `shared/graphCompile.ts` (`compileGraph`, `validateGraph`, `entityScriptSource`), Kompaktform für die KI in `shared/graphCompact.ts`. Der Graph hängt an `entity.graph`; die Skript-Laufzeit führt `entityScriptSource(entity)` aus. Editor: `ui.openGraphEditor` → `src/graph/editor/`.

## Brick-System

`shared/bricks.ts` hält Maße, Raster (1 Noppe = 0,25 m) und `hiddenBrickIds`. Die Darstellung teilt sich pro Gestalt ein Master-Mesh mit Instanzen (`src/world/entities/brickMaster.ts`); `src/world/bricks/` blendet im Spielmodus vollständig verdeckte Steine aus. Details: [bausteine.md](bausteine.md).

## Skript-Laufzeit

`src/scripting/runtime/` führt Skripte in Web Workern aus (`worker.ts`, `sandbox.ts`, Zeitlimit-Watchdog). `host.ts` verbindet sie mit dem Store, `commands.ts` setzt ihre Befehle um. Die API-Typen stehen in `shared/scriptApi.ts`. Details: [skripte.md](skripte.md).

## KI-Kern

`src/ai/core/` enthält den Claude-Client (`client.ts`, Streaming), die Tool-Use-Schleife mit Warteschlange (`loop.ts`), den Systemprompt (`prompt.ts`), Einstellungen (`settings.ts`), Laufzeit-Grenzen (`runLimits.ts`, Token-Budget in `budget.ts`), das Protokoll (`log.ts`) und die Werkzeuge (`tools.ts` sowie `buildTools`, `brickTools`, `placeTools`, `groupTools`, `libraryTools`, `graphTools`, `planTools`, `imageTools`, `scriptTestTools`). Die Werkzeugdefinitionen und `AI_LIMITS` liegen in `shared/aiTools.ts`, damit auch der MCP-Server sie kennt. `overlap.ts` meldet Überschneidungen nach bauenden Werkzeugen, `capture.ts` erzeugt Screenshots für `look`. Die Oberfläche (`src/ai/ui/`) hängt am Vertrag `src/ai/api.ts`. Details: [ki-werkzeuge.md](ki-werkzeuge.md).

## Plan-Board

`shared/plan.ts` beschreibt Pläne (Knoten, Abhängigkeiten, Status), sie gehören zur Welt. `src/plan/core/` hält die Daten-API, `src/plan/editor/` das Fenster, `src/plan/run/` reiht Knoten in die Auftragswarteschlange des KI-Assistenten ein (`queue.ts`, `runner.ts`).

## MCP-Brücke

Claude Desktop ↔ MCP-Server (`mcp/server.ts`, stdio) ↔ WebSocket auf `127.0.0.1` (`mcp/bridge.ts`) ↔ App (`src/ai/bridge/`). Der Vertrag steht in `shared/mcpBridge.ts`; die App führt die Werkzeuge mit demselben Code wie der KI-Chat aus. Details: [mcp.md](mcp.md).

## Export

`src/world/export/` baut aus den Entities eine .glb (`gltf.ts`, Materialzuordnung in `materialPlan.ts`) und das Blender-Skript (`blenderScript.ts`). Details: [export.md](export.md).

## Grafik

- **Qualitätsstufen:** `src/engine/quality.ts` legt vier Stufen (`low`, `medium`, `high`, `ultra`) und ihre Merkmale fest (`ctx.quality.features()`, `ctx.quality.onChange(...)`). Effekte lesen nur daraus und schalten sich selbst um; Automatik und Oberfläche liegen in `src/ui/graphics/`.
- **Umgebungs-Effekte:** `src/engine/environment/features.ts` beschreibt die Hooks (`apply`, `islandChanged`, `update`, `onQuality`, `dispose`), `featureList.ts` listet die Effekte. Jeder Effekt liegt in einer eigenen Datei unter `features/`. Ein Effekt, der nicht funktioniert, schaltet sich still ab.
- **Material:** `MaterialSpec` (`shared/types.ts`) kennt `preset`, `reflect`, `clearcoat`, `glass`, `ior`, `mirror`, `emissiveIntensity`, `pattern`, `patternColor`, `uvScale`.
- **Umgebung:** `EnvironmentSpec` kennt zusätzlich `sea` (Wolkenmeer oder Wasser), `look`, `dayCycle` und `weather`.
- **Bausteine:** `EntitySpec.water`, `EntitySpec.waterfall` (`src/world/water/`) und `EntitySpec.mirror` (`src/world/materials/`), jeweils über `registerPrefab`.
- **Tageszyklus:** Effekte können über `handle.applyVirtual(env, look?)` eine Umgebung anwenden, ohne den Store zu ändern.
