# Entwicklung

Befehle, Tests, Steuerung, Grafik und bekannte Grenzen.

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

## Entwicklung

```bash
npm run typecheck
npm test
npm run build
npm run e2e          # Smoke-Test im Browser (Playwright)
```

Aufbau und Verträge zwischen den Modulen stehen in [`docs/architecture.md`](architecture.md), die Optik-Vorgaben in [`docs/style-reference.md`](style-reference.md), das Weltformat in [`docs/worldspec.md`](worldspec.md).

## Grafik

- **Reflexionen:** Der Himmel dient als Reflexionssonde, Metall, Chrom und Glas spiegeln Himmel, Sonne und Insel. Das Material hat Voreinstellungen (Metall, Chrom, Gold, Glas, Spiegel, Lack, Holz, Stein, Gummi, Neon, Hologramm), Klarlack, Reflexionsstärke, Leuchtstärke und Muster (Karo, Streifen, Ziegel, Holz, Wellen). Ein Echtzeit-Spiegel spiegelt die Szene wirklich (Baustein „Spiegel").
- **Wasser:** Teich, See oder Pool als Baustein mit Spiegelung, Wellen und Wasserfall. Unter der Insel kann statt des Wolkenmeers ein Meer liegen (Einstellung der Insel unter Himmel und Licht).
- **Looks und Effekte:** Stimmungsvorlagen (Filmisch, Warm, Kühl, Comic, Retro), SSAO, Sonnenstrahlen und ein Fotomodus mit Tiefenschärfe (Taste P, nur auf Stufe Ultra).
- **Natur:** Gras im Wind, schwingende Bäume, Wetter (Regen, Schnee, Nebel, Glühwürmchen) und ein Tageszyklus.
- **Qualität:** Der Knopf „Grafik" in der Leiste öffnet die Einstellungen. Beim ersten Start wählt Cloudparty anhand der Bildrate automatisch Niedrig, Mittel, Hoch oder Ultra. Du kannst die Stufe jederzeit ändern, einzelne Effekte ein- und ausschalten und eine FPS-Anzeige einblenden. Teure Effekte wie Spiegel, Wasserspiegelung und SSAO gibt es erst ab Mittel bzw. Hoch.

## Baukamera (Blender-Steuerung)

Im Baumodus: **Mitteltaste ziehen** dreht die Ansicht um den Blickpunkt, **Shift + Mitteltaste** verschiebt sie, **Strg + Mitteltaste** und das **Mausrad** zoomen. Rechtstaste ziehen und Alt + Linkstaste drehen ebenfalls (für Mäuse ohne Mitteltaste), Shift verschiebt auch dort. **Ziffernblock** 1 / 3 / 7 = Vorder-, Seiten-, Draufsicht (mit Strg die Gegenseite), 4 / 6 / 8 / 2 drehen in 15°-Schritten, **F** oder Ziffernblock-Punkt zentriert auf die Auswahl; WASD/QE verschieben weiter. Die frühere Belegung über Babylons Standard-Eingabe reagierte in diesem Aufbau gar nicht auf Maus-Ziehen; die Steuerung steckt jetzt selbst in `src/build/camera.ts` (Rechnung in `cameraControls.ts`). Orthografische Ansicht (Ziffernblock 5) gibt es noch nicht.

## Baumodus: schnellere Kamera

**Baumodus:** Mit gedrückter Shift-Taste bewegt sich die Kamera per W A S D / Q E dreimal so schnell.

## Breite der Leisten

Die Leisten im Baumodus (Bausteine links, Inspector rechts) lassen sich verbreitern: am inneren Rand erscheint beim Darüberfahren ein Griff, Ziehen ändert die Breite (200 px bis höchstens die halbe Fensterbreite, maximal 640 px), Doppelklick setzt sie zurück. Die Breite wird pro Browser gespeichert. Bausteine und Material-Voreinstellungen ordnen sich dabei in mehr oder weniger Spalten an; die Bausteine stehen jetzt als Kacheln (Bild über dem Namen), damit Namen nicht mitten im Wort umbrechen.

## Boden und Grundplatten ohne Flimmern

Die Inseloberfläche (`env.islandMat`) hat einen Tiefenversatz (`ISLAND_Z_OFFSET` in `src/engine/environment/island.ts`). Platten, Böden und Flächen, deren Oberkante genau bei y = 0 liegt, gewinnen dadurch immer gegen das Gras; das Z-Fighting (Streifen) entfällt, ein manuelles Anheben ist nicht mehr nötig.

## Figur, Ich-Perspektive und Gras

- **Figur (nur lokal):** Menü „Aussehen“ › Figur: *Normal*, *Neutral* (einfarbige helle Maßstabsfigur ohne Gesicht) oder *Ausgeblendet* (Figur und Namensschild). Andere Besucher sehen deine Figur weiterhin. Gespeichert pro Browser (`cloudparty.avatar.view`).
- **Ich-Perspektive:** Taste **V** oder Knopf „Ich-Sicht“ in der Leiste (auch im Aussehen-Dialog). Die Kamera sitzt auf Augenhöhe, die Figur ist dabei ausgeblendet; Blick mit gedrückter Maustaste ziehen, Bewegung wie gewohnt mit WASD. Im Baumodus gilt nur die Figur-Einstellung.
- **Gras pro Insel:** Menü › Diese Insel › „Gras auf dieser Insel anzeigen“ (nur mit Baurecht; gilt für alle Besucher, gespeichert in der Welt als `environment.grass`). Die KI kann es mit `set_environment` (`grass`) setzen. Die grüne Bodenfläche bleibt, nur die 3D-Grashalme entfallen.

## Bekannte Grenzen

- **Skript-Sandbox:** Skripte laufen in Web Workern ohne DOM- und Netzzugriff, mit Zeitlimit. Das ist Best-Effort und kein Schutz gegen gezielte Angriffe (z. B. Speicherverbrauch); eine Content-Security-Policy fehlt noch. Auf offenen Servern solltest du fremden Inseln nur vertrauen, wenn du dem Besitzer vertraust.
- **Videos von YouTube/Vimeo:** Sie werden als Player in die Tafel eingebettet (Adresse der Seite genügt). Das klappt nur, wenn Cloudparty über `http://` läuft (z. B. `npm run dev` oder `npx vite preview`, nicht per Doppelklick auf `index.html` als Datei) und der Besitzer des Videos das Einbetten erlaubt hat; sonst zeigt der Player einen Fehler (z. B. „Fehler 153“) und die Tafel bleibt dunkel – dann hilft „In neuem Tab öffnen“. Bedienen lässt sich der Player nur im Spielmodus, nicht im Baumodus.
- **Web-Tafeln:** Viele Webseiten verbieten das Einbetten. Eine Web-Tafel kann außerdem nicht von 3D-Objekten davor verdeckt werden.
- **Avatare:** Der Avatar ist prozedural gebaut (keine fertigen 3D-Modelle); er ist so angelegt, dass später ein glTF-Modell eingesetzt werden kann.
- **Nicht enthalten:** Marktplatz mit Währung, Voice-Chat, Avatar-Kleidungseditor, eigenständige KI-Bewohner (die KI arbeitet nur auf deinen Auftrag, auch beim Plan-Board).


## Server-Umgebungsvariablen

| Variable | Wirkung |
|----------|---------|
| `PORT` | Port des Servers (Standard 8787) |
| `DATA_DIR` | Ordner für Konten und gespeicherte Inseln |
| `CLOUDPARTY_MAX_ENTITIES` | Obergrenze an Objekten je Insel auf dem Server (Standard 20000) |
| `CLOUDPARTY_MCP_PORT`, `CLOUDPARTY_MCP_TOKEN` | Port und Token des MCP-Servers, siehe [mcp.md](mcp.md) |

Weitere Befehle: `npm run preview` (Produktionsbuild ansehen), `npm run server:watch` (Server mit Neustart), `npm run previews` (Vorschaubilder, siehe [bausteine.md](bausteine.md)).
