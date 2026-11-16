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

**Warteschlange:** Während die KI arbeitet, kannst du weitere Nachrichten eingeben. Sie warten in einer Liste über dem Eingabefeld (höchstens 20), lassen sich einzeln entfernen oder alle leeren und laufen danach der Reihe nach. Bei „Stopp“ oder einem Fehler pausiert die Schlange, und „Fortsetzen“ arbeitet sie weiter ab.

**Freigaben:** Standardmäßig fragt der Assistent vor dem Speichern eines Skripts und bei vielen Löschungen nach. In den KI-Einstellungen (Zahnrad) kannst du auf „Alles erlauben" umstellen, dann arbeitet er wie ein Agent im Auto-Modus ohne Rückfragen; ein Abzeichen „Auto" im Fensterkopf erinnert dich daran. Auch dann prüft die KI weiter automatisch: Syntax, gesperrte Befehle (z. B. `fetch`, `eval`), Größenlimits und dein Baurecht, und „Rückgängig" nimmt einen ganzen Auftrag zurück. Die Einstellung gilt pro Browser.

**Längenlimits:** In den KI-Einstellungen stellst du per Schieberegler die maximale Antwortlänge (1.024 bis 16.000 Tokens, Standard 4.096) und die maximale Eingabelänge pro Anfrage (8.000 bis 150.000 Tokens, Standard 40.000) ein. Wird eine Antwort abgeschnitten, erhöhe die Antwortlänge. Überschreitet eine Anfrage die Eingabegrenze, lässt der Assistent zuerst ältere Gesprächsteile weg und kürzt große Ergebnisse; reicht das nicht, meldet er es verständlich. Mehr Tokens kosten mehr. Die Grenzen gelten auch für die KI im Skript-Editor. Die KI kennt die eingestellte Antwortlänge, plant ihre Aufträge in passenden Etappen und macht automatisch in kleineren Schritten weiter, wenn eine Antwort trotzdem abgeschnitten wird (bis zu vier Mal pro Auftrag).

**Plan-Board:** Für größere Vorhaben sag der KI z. B. „Plane den Bau eines Hauses mit Garten". Sie legt dann einen Plan aus Knoten an (Fundament, Wände, Dach …) und schreibt Maße, Farben und Positionen in die Notizen. Das Fenster „Plan" (Knopf unten oder Taste P im Baumodus) zeigt ihn wie den Logik-Graph: Knoten verschieben, per Ziehen verbinden (Abhängigkeiten), Titel und Notizen ändern, Knoten deaktivieren. „Ausführen" lässt die KI genau einen Knoten bauen, „Alle ausführen" arbeitet alle offenen Knoten in Abhängigkeitsreihenfolge ab (höchstens 20 pro Lauf, stoppt bei Fehler oder Abbruch). Jeder Knoten ist ein eigener Auftrag mit frischem Gesprächsverlauf und ein eigener „Rückgängig"-Schritt; fertige Knoten merken sich, welche Objekte sie gebaut haben („Objekte zeigen"), und spätere Knoten bauen darauf auf. **Einreihen:** „Ausführen“ geht jederzeit, auch während die KI schon arbeitet oder andere Knoten laufen: der Knoten bekommt den Status „Wartet“, erscheint in der Warteschlange des KI-Fensters („Plan: Titel“) und startet danach. Auch Knoten, deren Vorgänger selbst noch warten, lassen sich einreihen; sie laufen erst, wenn die Vorgänger fertig sind (schlägt ein Vorgänger fehl, werden die wartenden Knoten wieder „Offen“). „Stopp“ und „Leeren“ der Warteschlange geben eingereihte Knoten frei. Beim Laden einer Welt werden „Wartet“ und „Läuft“ wieder zu „Offen“. Pläne gehören zur Welt (Autosave, Export). Die KI sieht ihr Ergebnis nicht, bei großen Bauten können Maße abweichen – die Notizen der Knoten helfen, das klein zu halten.

**Bildsuche:** In den KI-Einstellungen kannst du „Die KI darf im Internet nach freien Bildern suchen“ einschalten (Standard: aus, gilt pro Browser). Dann kann die KI mit `search_images` freie Fotos bei Wikimedia Commons und Openverse suchen (ohne Key; der Suchbegriff geht an diese Dienste) und mit `use_image` eines auf einer Bild- oder Folien-Tafel zeigen. Das Bild wird in deinem Browser heruntergeladen, auf höchstens 1024 Pixel verkleinert und als JPEG in der Welt gespeichert (etwa 170 kB, damit es auch online unter die Größengrenze eines Objekts passt). Dadurch ist es eine echte Textur ohne die Verdeckungsprobleme der HTML-Ebene. Autor und Lizenz stehen am Objekt (`state.credit`, bei Folien `state.credits`). Pro Auftrag höchstens 4 Suchen und 6 Bilder. Die Anbieter-Schnittstellen sind von der Entwicklungsumgebung aus nicht erreichbar gewesen und nur mit nachgestellten Antworten getestet; ob ein Anbieter den Abruf im Browser erlaubt (CORS), siehst du erst im Betrieb. Ein Treffer, der sich nicht laden lässt, wird der KI gemeldet, und sie nimmt einen anderen. Außerdem kann die KI jetzt Medien-Tafeln (Bild, Folien, Video, Web, Text) selbst anlegen.

**KI mit Augen (Screenshots):** In den KI-Einstellungen kannst du „Die KI darf Screenshots der Welt ansehen“ einschalten (Standard: aus, gilt pro Browser). Dann kann die KI mit dem Werkzeug `look` ein Bild der Insel aus einer Blickrichtung (vorne, hinten, links, rechts, oben, schräg) auf ein Objekt, eine Gruppe oder eine Position machen und ihr Ergebnis prüfen: fehlende Wand, schwebende Teile, falsche Farben, Überlappungen. Das Bild entsteht mit einer eigenen Kamera (800 × 500 Pixel, JPEG), deine Spielkamera bleibt unberührt. Grenzen: höchstens 2 Screenshots pro Auftrag, nur das neueste Bild bleibt im Verlauf, und die Bilder gehen zur Auswertung an Anthropic. Ein Bild kostet grob 500 bis 800 Tokens. Aus dem Bild erkennt die KI Form, Anordnung und Farben, keine genauen Maße. Bei Haiku ist das Sehen deutlich schwächer als bei Sonnet.

**Bauhilfen:** Für größere Bauten hat die KI Werkzeuge, die aus wenigen Angaben viele korrekt platzierte Teile machen: `add_wall` (Wand von A nach B, mit Türen und Fenstern als Öffnungen), `add_beam` (Balken, Pfosten oder Seil zwischen zwei Punkten), `array` (Kopien im Kreis, in einer Linie oder im Raster, z. B. Zinnen, Säulen, Zäune), `clone_group` (Gruppe kopieren, verschieben, drehen, spiegeln) sowie `get_bounds` und `surface_height_at` (Maße und Höhe der Fläche abfragen, bevor etwas gestapelt wird). Pro Auftrag sind bis zu 200 neue Objekte möglich. Maße zusammengesetzter Bausteine (Bank, Baum …) sind dabei nur geschätzt.

**Prompt-Caching:** Werkzeugliste, Systemprompt und bisheriger Verlauf werden bei jeder Anfrage als Cache-Präfix markiert; Cache-Treffer kosten bei Anthropic deutlich weniger. Die Verbrauchszeile zeigt „davon … aus dem Cache". Kurze Anfragen unter der Mindestlänge werden nicht gecacht.

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
- **Videos von YouTube/Vimeo:** Sie werden als Player in die Tafel eingebettet (Adresse der Seite genügt). Das klappt nur, wenn Cloudparty über `http://` läuft (z. B. `npm run dev` oder `npx vite preview`, nicht per Doppelklick auf `index.html` als Datei) und der Besitzer des Videos das Einbetten erlaubt hat; sonst zeigt der Player einen Fehler (z. B. „Fehler 153“) und die Tafel bleibt dunkel – dann hilft „In neuem Tab öffnen“. Bedienen lässt sich der Player nur im Spielmodus, nicht im Baumodus.
- **Web-Tafeln:** Viele Webseiten verbieten das Einbetten. Eine Web-Tafel kann außerdem nicht von 3D-Objekten davor verdeckt werden.
- **Avatare:** Der Avatar ist prozedural gebaut (keine fertigen 3D-Modelle); er ist so angelegt, dass später ein glTF-Modell eingesetzt werden kann.
- **Nicht enthalten:** Marktplatz mit Währung, Voice-Chat, Avatar-Kleidungseditor, eigenständige KI-Bewohner (die KI arbeitet nur auf deinen Auftrag, auch beim Plan-Board).
