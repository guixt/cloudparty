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
- `shared/` – Verträge für Client, Server und MCP: Typen, Protokoll, `aiTools/` (Werkzeug-Schemas), `scriptApi.ts`, Graph, Steine, `worldspec/`.
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
- `shared/aiTools/` ist der Vertrag für KI-Werkzeuge (Client, Server und MCP lesen ihn; Import weiter über `shared/aiTools`). Schemas liegen je Gruppe in einer Datei (`core`, `plan`, `build`, `bricks`, `place` …), gemeinsame Bausteine in `schemaParts.ts`, Grenzen in `limits.ts`.
- Neues KI-Werkzeug: (1) Namen in die Union `AiToolName` (`shared/aiTools/types.ts`) und ans Ende von `TOOL_ORDER` (`shared/aiTools/index.ts`; die Reihenfolge hängt am Prompt-Cache der API), (2) Schema in die passende Gruppen-Datei unter `shared/aiTools/`, (3) Handler in die Tabelle der Gruppe in `src/ai/core/*Tools.ts` (läuft über `registerHandlers` in `src/ai/core/registry.ts`; bei einer neuen Datei per `import` in `tools.ts` einbinden), (4) Hinweis in `prompt.ts`, (5) Test. `registry.test.ts` prüft, dass Schema und Handler zusammenpassen; ein neues Werkzeug ändert den dort festgehaltenen Hash von `AI_TOOLS` absichtlich, dann `EXPECTED_ORDER`, Länge und SHA im Test anpassen. Validierungshelfer stehen in `validate.ts`, Ziel-Auflösung (ids, Namen, Gruppen) in `targets.ts`.
- Gruppen-ids und Namen löst man mit `resolveTargets` / `getEntityOrGroup` (`src/ai/core/tools.ts`) auf, nicht von Hand.
- Grenzen in Prompts kommen aus `getRunLimits` (`src/ai/core/runLimits.ts`), nie als feste Zahlen.
- `localStorage`-Schlüssel der KI stehen in `AI_STORAGE_KEYS` (`shared/aiTools/limits.ts`).

## So prüfst du eine Änderung

1. `npx tsc --noEmit -p .` – muss ohne Fehler laufen.
2. `npx vitest run` – alle Tests grün (Ausgangsstand 941).
3. `npm run build` – bei Änderungen an Importen, Assets oder Konfiguration.
4. Bei UI-Änderungen: Seite mit Playwright (SwiftShader, `?server=off`) laden, Screenshot machen und ansehen.
