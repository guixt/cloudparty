# Cloudparty 2.0 – Hinweise für Claude

Browser-Nachbau von Cloud Party: React + Vite + TypeScript, Babylon.js 9 + Havok, zustand, zod, vitest; Node-Server mit `ws` und `node:sqlite`; MCP-Server in `mcp/`. Texte, Kommentare und UI sind Deutsch. Details zu Verträgen: `docs/architecture.md`.

## Befehle

- `npm run dev` – Vite-Entwicklungsserver; `npm run build` – Produktionsbuild.
- `npm test` – vitest (einmaliger Lauf). Tests liegen neben dem Code als `*.test.ts` / `*.test.tsx`; DOM-Tests beginnen mit `// @vitest-environment jsdom`.
- `npx tsc --noEmit -p .` – Typecheck (alias `npm run typecheck`).
- `npm run server` (`server:watch`) – HTTP + WebSocket, Standard-Port 8787, `PORT` / `DATA_DIR` per Umgebung.
- `npm run mcp` – MCP-Server für Claude Desktop; `npm run mcp:token` zeigt das Zugangs-Token.
- `npm run e2e` – Browser-Smoke-Test (`scripts/e2e-smoke.cjs`, exportiert `startVite(port)` und `launchGame(url)`); `npm run previews` erzeugt Vorschaubilder.
- Eigene Playwright-Skripte (ohne GPU): `chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })`, Seite mit `?server=off` öffnen (kein Server nötig), dann auf `window.__cloudparty?.ready` warten (Objekt: `{ ready, error, ctx, store, bus, scene }`).

## Verzeichniskarte

- `src/core/` – Vertragskern: Ereignisbus, Store, `GameContext`, UI-Slots.
- `src/modules.ts` – feste Modulreihenfolge (nur der Koordinator ändert sie); jedes Modul ist `default` aus seinem `index`.
- `src/engine/` – Start (`bootstrap.ts`), Umgebung, Avatar, Physik (Havok), Qualitätsstufen.
- `src/world/` – Welt-Daten: Persistenz, Entities, Steine (`bricks`), Medien, Wasser, Materialien, Export.
- `src/build/` – Baumodus: Auswahl, Gizmos, Inspektor, Palette, Undo/Redo.
- `src/ai/core/` – KI-Assistent: Werkzeuge (`*Tools.ts`), Prompt, Client, Schleife, Grenzen, Einstellungen; `src/ai/ui/` Panel und Einstellungen; `src/ai/bridge/` MCP-Brücke zum Browser.
- `src/scripting/` – Skript-Laufzeit (`runtime`) und Editor (`editor`, CodeMirror).
- `src/plan/` – Pläne für lange KI-Aufträge (`core`, `editor`, `run`).
- `src/graph/` – Logik-Graph-Editor und KI-Unterstützung (`editor`, `ai`).
- `src/library/` – Bibliothek wiederverwendbarer Objekte und Gruppen.
- `src/net/` – Client-Netz: Verbindung, Synchronisation, Chat, entfernte Avatare.
- `src/ui/shell/` – Shell mit Menüs, Weltwahl und Anmeldung; `src/ui/graphics/` Grafik-Einstellungen.
- `shared/` – Verträge für Client, Server und MCP: Typen, Protokoll, `aiTools.ts`, `scriptApi.ts`, Graph, Steine, `worldspec/`.
- `server/` – `index.ts`, `context.ts`, `api/` (REST), `realtime/` (WebSocket).
- `mcp/` – MCP-Server (`server.ts`, `bridge.ts`, `rpc.ts`).
- `docs/` – `architecture.md`, `worldspec.md`, `style-reference.md`, `reference/` (Bilder).
- `scripts/` – E2E- und Vorschau-Skripte.

## Konventionen

- UI-Texte, Kommentare und Commit-Zeilen auf Deutsch im Projektstil (kurze Titelzeile, beschreibend).
- Jeder Commit endet mit den Attributionszeilen, die die Sitzung vorgibt.
- Entwicklungsbranch: `claude/claude-party-expansion-plan-7t8syk`; nur dorthin pushen. Keine Pull Requests ohne ausdrücklichen Auftrag.
- Tests neben den Code legen, nicht in ein getrenntes Verzeichnis.
- Der Store (`ctx.store`) ist die Wahrheit; Änderungen nur über seine Aktionen. Babylon-Importe nur über Unterpfade (`@babylonjs/core/Meshes/...`).
- Der Client muss offline laufen (`?server=off`).

## Bekannte Fallen

- `src/ai/core/prompt.ts`: Prompt-Texte sind Template-Literale. Keine unmaskierten Backticks; Anführungen mit „…“ oder `\`` schreiben.
- `shared/aiTools.ts` ist der Vertrag für KI-Werkzeuge (Client, Server und MCP lesen ihn).
- Neues KI-Werkzeug, aktueller Stand: Namen in `AiToolName` eintragen, Schema in `AI_TOOLS` ergänzen, Handler in einer Handler-Tabelle in `src/ai/core/*Tools.ts` ablegen (die Tabellen werden in `executeTool` in `src/ai/core/tools.ts` per `??` verkettet; bei einer neuen Tabelle dort ergänzen), Hinweis in `prompt.ts` und einen Test hinzufügen. (Dieser Absatz beschreibt den heutigen Stand und wird nach einem Umbau vom Koordinator angepasst.)
- Gruppen-ids und Namen löst man mit `resolveTargets` / `getEntityOrGroup` (`src/ai/core/tools.ts`) auf, nicht von Hand.
- Grenzen in Prompts kommen aus `getRunLimits` (`src/ai/core/runLimits.ts`), nie als feste Zahlen.
- `localStorage`-Schlüssel der KI stehen in `AI_STORAGE_KEYS` (`shared/aiTools.ts`).

## So prüfst du eine Änderung

1. `npx tsc --noEmit -p .` – muss ohne Fehler laufen.
2. `npx vitest run` – alle Tests grün (Ausgangsstand 941).
3. `npm run build` – bei Änderungen an Importen, Assets oder Konfiguration.
4. Bei UI-Änderungen: Seite mit Playwright (SwiftShader, `?server=off`) laden, Screenshot machen und ansehen.
