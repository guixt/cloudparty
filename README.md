# Cloudparty 2.0

Eine virtuelle 3D-Welt im Browser im Geist von Cloud Party: schwebende Inseln, Bauen in der Welt, JavaScript-Skripte pro Objekt, Physik, Multiplayer und ein KI-Assistent.

Technik: React + Vite + TypeScript, Babylon.js 9 mit Havok-Physik, zustand, vitest. Server: Node.js 22 mit `ws` und `node:sqlite`.

## Schnellstart

Voraussetzung: Node.js ab Version 22.

```bash
npm install
npm run dev          # Client auf http://localhost:5173
npm run server       # optional: Server auf Port 8787 (Multiplayer, Konten, gespeicherte Inseln)
npm test             # Tests (vitest)
npm run typecheck    # TypeScript prüfen
npm run build        # Produktionsbuild
npm run preview      # Produktionsbuild ansehen
```

Ohne Server läuft alles im Einzelspieler-Modus mit lokaler Speicherung (IndexedDB). Mit `?server=off` startet der Client bewusst offline, mit `?server=http://host:port` nutzt er einen anderen Server.

## Funktionen im Überblick

- Schwebende Insel mit Himmel, Wasser, Gras, Wetter und Tageszyklus; vier Qualitätsstufen
- Avatar mit Gesten, Ich-Perspektive und Aussehen
- Baumodus mit Gizmos, Gruppen, Mehrfachauswahl, Undo/Redo und Bibliothek
- Klemmbausteine, Materialien, Texturen und Medien-Tafeln (Bild, Folien, Text, Video, Web)
- Skripte pro Objekt (Sandbox-Worker) und ein Logik-Graph
- Multiplayer mit Konten, Räumen und gespeicherten Inseln
- KI-Assistent mit Werkzeugen, Plan-Board, Screenshots und Bildsuche
- Claude Desktop steuert die App live über MCP
- Export nach Blender (.glb und Skript)

## Dokumentation

- [KI-Assistent und Werkzeuge](docs/ki-werkzeuge.md)
- [Bausteine, Texturen, Materialien und Tafeln](docs/bausteine.md)
- [Skripte](docs/skripte.md)
- [Export nach Blender](docs/export.md)
- [Claude Desktop und MCP](docs/mcp.md)
- [Entwicklung (Befehle, Steuerung, Grafik, Grenzen)](docs/entwicklung.md)
- [Architektur und Verträge](docs/architecture.md)
- [Weltformat](docs/worldspec.md)
- [Optik-Vorgaben](docs/style-reference.md)
- [Avatar-Spezifikation](docs/avatar-spec.md)
