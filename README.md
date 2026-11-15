# Cloudparty 2.0

Eine virtuelle 3D-Welt im Browser im Geist von Cloud Party: schwebende Inseln, Bauen in der Welt, JavaScript-Skripte pro Objekt, Physik, Multiplayer und ein KI-Assistent.

Technik: React + Vite + TypeScript, Babylon.js 9 mit Havok-Physik, zustand, vitest. Server: Node.js 22 mit `ws` und `node:sqlite`.

## Starten

Voraussetzung: Node.js ab Version 22.

```bash
npm install
npm run dev          # Client auf http://localhost:5173
npm run server       # optional: Server auf Port 8787 (Multiplayer, Konten, gespeicherte Inseln)
```

Ohne Server läuft alles im Einzelspieler-Modus mit lokaler Speicherung (IndexedDB). Mit `?server=off` hinter der Adresse startet der Client bewusst offline, mit `?server=http://host:port` nutzt er einen anderen Server. Auf `localhost` verbindet er sich automatisch mit Port 8787.

## Steuerung

| Aktion | Taste |
|--------|-------|
| Bewegen | WASD / Pfeile |
| Rennen / Springen | Shift / Leertaste |
| Fliegen | F (Leertaste hoch, C runter) |
| Kamera | Maus ziehen, Mausrad |
| Gesten | 1–4 |
| Chat | Enter |
| Bauen ⇄ Spielen | Tab |
| Auswahl / Gizmos | Klick; 1 Verschieben, 2 Drehen, 3 Skalieren |
| Duplizieren / Löschen | Strg+D / Entf |
| Rückgängig / Wiederholen | Strg+Z / Strg+Y |
| Mehrfachauswahl | Shift/Strg-Klick, Rahmen ziehen, Strg+A |
| Gruppieren / Auflösen | Strg+G / Strg+Umschalt+G |
| Kopieren / Einfügen | Strg+C / Strg+V |
| Bibliothek | B |
| Logik-Graph bearbeiten | L (Objekt gewählt) |
| Skript bearbeiten | E (Objekt gewählt) |
| Fotomodus (Tiefenschärfe) | P (nur Ultra) |
| KI-Assistent | K |
| Hilfe | H |

## Gruppen, Bibliothek und Logik-Graph

**Gruppen:** Mehrere Objekte lassen sich zu einer Gruppe zusammenfassen (Strg+G). Ein Klick auf ein Mitglied wählt die ganze Gruppe, ein Doppelklick nur dieses Mitglied. Gruppen werden gemeinsam bewegt, gedreht, skaliert, kopiert und gelöscht, jede Geste ist ein Undo-Schritt. Im Inspector gibt es für Mehrfachauswahlen Farbe, Physik, Ausrichten und Verteilen für alle gewählten Objekte.

**Bibliothek:** „Auswahl speichern …" legt Objekte samt Material, Skripten und Graphen als Baustein ab (Vorschaubild, Name, Stichworte). Bausteine lassen sich per Knopf oder Ziehen in die Welt setzen und als Datei exportieren und importieren. Eine Reihe fertiger Bausteine (Gartenhaus, Brunnen, Pavillon …) ist enthalten. Die Bibliothek liegt im Browser (IndexedDB).

**Logik-Graph:** Wie der Node-Editor in Blender verbindest du Blöcke (Ereignisse, Aktionen, Ablauf, Logik, Werte, Variablen, Medien) zu einem Ablauf. Der Graph wird in ein Skript übersetzt und im Skript-Sandbox-Worker ausgeführt; im Reiter „Code" siehst du das Ergebnis. Es gibt Vorlagen (Tür, Lichtschalter, Zähler, Aufzug …). Ein aktivierter, fehlerfreier Graph hat Vorrang vor einem Skript am selben Objekt. Die KI kann Graphen erzeugen (Reiter „KI" im Editor und Werkzeug `set_graph`).

## Grafik

- **Reflexionen:** Der Himmel dient als Reflexionssonde, Metall, Chrom und Glas spiegeln Himmel, Sonne und Insel. Das Material hat Voreinstellungen (Metall, Chrom, Gold, Glas, Spiegel, Lack, Holz, Stein, Gummi, Neon, Hologramm), Klarlack, Reflexionsstärke, Leuchtstärke und Muster (Karo, Streifen, Ziegel, Holz, Wellen). Ein Echtzeit-Spiegel spiegelt die Szene wirklich (Baustein „Spiegel").
- **Wasser:** Teich, See oder Pool als Baustein mit Spiegelung, Wellen und Wasserfall. Unter der Insel kann statt des Wolkenmeers ein Meer liegen (Einstellung der Insel unter Himmel und Licht).
- **Looks und Effekte:** Stimmungsvorlagen (Filmisch, Warm, Kühl, Comic, Retro), SSAO, Sonnenstrahlen und ein Fotomodus mit Tiefenschärfe (Taste P, nur auf Stufe Ultra).
- **Natur:** Gras im Wind, schwingende Bäume, Wetter (Regen, Schnee, Nebel, Glühwürmchen) und ein Tageszyklus.
- **Qualität:** Der Knopf „Grafik" in der Leiste öffnet die Einstellungen. Beim ersten Start wählt Cloudparty anhand der Bildrate automatisch Niedrig, Mittel, Hoch oder Ultra. Du kannst die Stufe jederzeit ändern, einzelne Effekte ein- und ausschalten und eine FPS-Anzeige einblenden. Teure Effekte wie Spiegel, Wasserspiegelung und SSAO gibt es erst ab Mittel bzw. Hoch.

## KI-Funktionen

Im Fenster „KI" (Taste K) kannst du dem Assistenten Aufträge geben, z. B. „Baue ein kleines Haus mit Garten" oder „Verschiebe die Bank nach links". Er arbeitet mit denselben Funktionen wie du (Bauen, Verschieben, Färben, Himmel, Skripte, Medien-Tafeln), und ein Auftrag lässt sich mit einem Klick auf „Rückgängig" zurücknehmen. Im Skript-Editor gibt es zusätzlich „Mit KI erzeugen" und „Fehler erklären".

**Freigaben:** Standardmäßig fragt der Assistent vor dem Speichern eines Skripts und bei vielen Löschungen nach. In den KI-Einstellungen (Zahnrad) kannst du auf „Alles erlauben" umstellen, dann arbeitet er wie ein Agent im Auto-Modus ohne Rückfragen; ein Abzeichen „Auto" im Fensterkopf erinnert dich daran. Auch dann prüft die KI weiter automatisch: Syntax, gesperrte Befehle (z. B. `fetch`, `eval`), Größenlimits und dein Baurecht, und „Rückgängig" nimmt einen ganzen Auftrag zurück. Die Einstellung gilt pro Browser.

**Längenlimits:** In den KI-Einstellungen stellst du per Schieberegler die maximale Antwortlänge (1.024 bis 16.000 Tokens, Standard 4.096) und die maximale Eingabelänge pro Anfrage (8.000 bis 150.000 Tokens, Standard 40.000) ein. Wird eine Antwort abgeschnitten, erhöhe die Antwortlänge. Überschreitet eine Anfrage die Eingabegrenze, lässt der Assistent zuerst ältere Gesprächsteile weg und kürzt große Ergebnisse; reicht das nicht, meldet er es verständlich. Mehr Tokens kosten mehr. Die Grenzen gelten auch für die KI im Skript-Editor. Die KI kennt die eingestellte Antwortlänge, plant ihre Aufträge in passenden Etappen und macht automatisch in kleineren Schritten weiter, wenn eine Antwort trotzdem abgeschnitten wird (bis zu vier Mal pro Auftrag).

Du brauchst dafür einen eigenen Anthropic-API-Key (Einstellungen im KI-Fenster). Der Key wird nur in deinem Browser gespeichert und direkt an Anthropic gesendet, nie an den Cloudparty-Server oder in Weltdateien. Anfragen kosten Geld bei Anthropic. Der Assistent sieht den Inhalt der aktuellen Insel.

## Entwicklung

```bash
npm run typecheck
npm test
npm run build
npm run e2e          # Smoke-Test im Browser (Playwright)
```

Aufbau und Verträge zwischen den Modulen stehen in [`docs/architecture.md`](docs/architecture.md), die Optik-Vorgaben in [`docs/style-reference.md`](docs/style-reference.md), das Weltformat in [`docs/worldspec.md`](docs/worldspec.md).

## Bekannte Grenzen

- **Skript-Sandbox:** Skripte laufen in Web Workern ohne DOM- und Netzzugriff, mit Zeitlimit. Das ist Best-Effort und kein Schutz gegen gezielte Angriffe (z. B. Speicherverbrauch); eine Content-Security-Policy fehlt noch. Auf offenen Servern solltest du fremden Inseln nur vertrauen, wenn du dem Besitzer vertraust.
- **Web-Tafeln:** Viele Webseiten verbieten das Einbetten. Eine Web-Tafel kann außerdem nicht von 3D-Objekten davor verdeckt werden.
- **Avatare:** Der Avatar ist prozedural gebaut (keine fertigen 3D-Modelle); er ist so angelegt, dass später ein glTF-Modell eingesetzt werden kann.
- **Nicht enthalten:** Marktplatz mit Währung, Voice-Chat, Avatar-Kleidungseditor, eigenständige KI-Bewohner.
