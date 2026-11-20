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

**Bildsuche:** In den KI-Einstellungen kannst du „Die KI darf im Internet nach freien Bildern suchen“ einschalten (Standard: aus, gilt pro Browser). Dann kann die KI mit `search_images` freie Fotos bei Wikimedia Commons und Openverse suchen (ohne Key; der Suchbegriff geht an diese Dienste) und mit `use_image` eines auf einer Bild- oder Folien-Tafel zeigen. Das Bild wird in deinem Browser heruntergeladen, auf höchstens 1024 Pixel verkleinert und als JPEG in der Welt gespeichert (etwa 170 kB, damit es auch online unter die Größengrenze eines Objekts passt). Dadurch ist es eine echte Textur ohne die Verdeckungsprobleme der HTML-Ebene. Autor und Lizenz stehen am Objekt (`state.credit`, bei Folien `state.credits`). Die Bild-Tafel stellt sich dabei auf das Seitenverhältnis des Bildes ein (zwischen 0,35 und 3,5, bei Folien bestimmt die erste Folie das Format), damit keine schwarzen Balken entstehen. Im Baumodus kannst du das mit „Tafel ans Bild anpassen“ auch für eigene Bilder tun (nach einem Upload geschieht es automatisch) und mit „Standardformat“ zurück zu 16:9 gehen. Pro Auftrag höchstens 4 Suchen und 6 Bilder. Die Anbieter-Schnittstellen sind von der Entwicklungsumgebung aus nicht erreichbar gewesen und nur mit nachgestellten Antworten getestet; ob ein Anbieter den Abruf im Browser erlaubt (CORS), siehst du erst im Betrieb. Ein Treffer, der sich nicht laden lässt, wird der KI gemeldet, und sie nimmt einen anderen. Außerdem kann die KI jetzt Medien-Tafeln (Bild, Folien, Video, Web, Text) selbst anlegen.

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

## Klemmbausteine

Neue Kategorie „Klemmbausteine“ in der Bau-Palette (Stein 2×4/2×2/1×2, Platte 4×8/2×4, Fliese 2×2). Maße: 1 Noppe = 0,25 m, Stein 0,3 m, Platte/Fliese 0,1 m hoch. Beim Platzieren rasten Steine auf dem Noppenraster ein und setzen sich auf den Stein darunter; Größe und Art (`w`, `d`, `kind`) stehen im Zustand des Objekts. Die KI baut mit `add_bricks` (Raster-Koordinaten in Noppen, Auto-Stapeln) und `fill_bricks` (Wände mit Türen/Fenstern und Böden mit versetzten Fugen). Dazu kommen Schrägsteine (Dachsteine), Rundsteine und kleine Räder (Achse längs x, Durchmesser 2–8 Noppen; die Räder sind noch starre Bauteile, drehen sich nicht). Noch nicht enthalten: ein eigener Modus, der die anderen Grundformen ausblendet, umgedrehte Schrägen, Klemm-Physik.

## Vorschaubilder der Bausteine

Die Bau-Palette zeigt zu jedem Baustein ein Vorschaubild (`public/previews/<key>.webp`, 128×128). Sie entstehen aus den echten 3D-Objekten: `npm run previews` (braucht Playwright mit Chromium) rendert jeden Katalogeintrag einzeln auf hellem Hintergrund; `--only key1,key2` nur einzelne. Einzelne Bilder lassen sich auch von Hand überschreiben. Fehlt ein Bild, zeigt die Palette die Farbfläche. Die Palette klappt nach dem Einfügen nicht mehr automatisch zu.

## Bild-Texturen für Materialien

Im Inspector (Material) lässt sich ein Bild als Textur hochladen („Bild hochladen“, auf höchstens 1024 px und ca. 170 kB verkleinert) oder wieder entfernen; „Textur-Wiederholung“ steuert die Kachelung. Die KI sucht mit `search_images` und belegt mit `use_texture` ein Objekt oder eine ganze Gruppe (Grundfarbe und Muster entfallen dabei, damit das Bild unverfälscht erscheint). Es gelten dieselben Schalter und Limits wie bei Bild-Tafeln (Bildsuche in den KI-Einstellungen, 4 Suchen, 6 Bilder je Auftrag). Texturen werden als Daten gespeichert, die KI kann keine fremden Adressen als Textur setzen. Fotos sind nicht nahtlos kachelbar; bei hoher Wiederholung sieht man Nähte, am besten nach „seamless texture“ suchen.

### Plan-Knoten und die Ausgabelänge

Jeder Plan-Knoten läuft als eigener Auftrag und muss in die eingestellte Ausgabegrenze (KI-Einstellungen, Standard 4096 Tokens) passen. Die KI bekommt dazu bei jedem Knoten die Grenze und eine Faustzahl für Werkzeugaufrufe genannt, soll große Knoten mit `plan_add_node` selbst in kleinere teilen, Notizen kurz halten und Sammelwerkzeuge (`add_wall`, `array`, `fill_bricks`, `clone_group`) bevorzugen. Wird eine Antwort trotzdem abgeschnitten, macht sie in kleineren Schritten weiter (bis zu 4 Mal). Wer oft Abbrüche sieht, kann die Ausgabegrenze erhöhen: bezahlt werden nur tatsächlich erzeugte Tokens.

## KI-Protokoll

In den KI-Einstellungen (Abschnitt „Protokoll“) schreibt der Assistent ein lokales Protokoll: je Auftrag Start und Ende, je Modellrunde Tokens, Cache-Treffer und Abbruchgrund, je Werkzeugaufruf Name, Erfolg, Dauer und Kurzergebnis, dazu abgeschnittene Antworten und Fehler. Stufen: Aus, Normal (Standard) und Ausführlich (zusätzlich Auftragstext, Werkzeug-Eingaben, Ergebnisse und Antworten, auf 1500 Zeichen gekürzt). „Protokoll exportieren“ lädt eine `.jsonl`-Datei (ein JSON-Objekt je Zeile). Gespeichert wird nur im Browser (höchstens die letzten 1000 Einträge, ca. 300 kB), der API-Key wird nie protokolliert.

Gruppen-ids (`grp_…`) aus den Ergebnissen von `add_wall`, `array`, `fill_bricks` usw. akzeptieren `get_bounds`, `clone_group` und `use_texture`; bei anderen Werkzeugen nennt die Fehlermeldung eine Mitglieds-id.

### Gruppen-ids und kompaktes `get_world`

Gruppen-ids (`grp_…`) gelten jetzt auch für `remove_entity` (ganze Gruppe, zählt als eine Aktion für die Rückfrage) und `update_entity` (`material`, `physics`, `particles`, `name`, `move_by` auf alle Mitglieder; absolute Position/Drehung/Größe werden abgelehnt). `get_world` fasst Gruppen mit mindestens 3 Teilen zu einer Zeile zusammen (bei 500 Steinen statt ca. 27 000 nur wenige tausend Tokens), `group` listet die Mitglieder, `name_contains` filtert. Die Bauwerkzeuge nennen im Ergebnis Gruppen-id, Anzahl und Maße (min/max/Mitte). `plan_complete_node` löst Gruppen-ids auf, nimmt ohne ids die im Auftrag neu gebauten Objekte und kürzt zu lange Zusammenfassungen, statt sie abzulehnen. Tipp aus dem Protokoll: Das Eingabelimit (Standard 40 000) ist mit dem 28 k Tokens großen Grundprompt knapp; ca. 80 000 schneidet den Verlauf seltener und erhält den Prompt-Cache.

### Plan-Kennungen, Namen als Ziel, große Böden

- `plan_add_node` kennt ein optionales `key` (z. B. „n08“); `after` löst echte id, `key` und Titelnummer („8“, „n08“ ↔ „8 Hauswand …“) auf, und der Fehler nennt die vorhandenen Knoten. `plan_get` zeigt die aktuelle Gruppen-id eines Knoten-Ergebnisses, auch wenn die Objekte später neu gruppiert wurden.
- Werkzeuge nehmen als Ziel zusätzlich eindeutige **Objekt- oder Gruppennamen**; mehrdeutige Namen werden mit den ersten ids gemeldet. `look`, `library_save` und `group_entities` akzeptieren Gruppen-ids.
- `fill_bricks` mauert Böden aus großen Platten (bis 16 × 16 Noppen) und erlaubt bis 200 Steine je Aufruf. `get_world` mit `group` oder `name_contains` liefert ohne Katalog und Umgebung (spart Tokens).

## Baukamera (Blender-Steuerung)

Im Baumodus: **Mitteltaste ziehen** dreht die Ansicht um den Blickpunkt, **Shift + Mitteltaste** verschiebt sie, **Strg + Mitteltaste** und das **Mausrad** zoomen. Rechtstaste ziehen und Alt + Linkstaste drehen ebenfalls (für Mäuse ohne Mitteltaste), Shift verschiebt auch dort. **Ziffernblock** 1 / 3 / 7 = Vorder-, Seiten-, Draufsicht (mit Strg die Gegenseite), 4 / 6 / 8 / 2 drehen in 15°-Schritten, **F** oder Ziffernblock-Punkt zentriert auf die Auswahl; WASD/QE verschieben weiter. Die frühere Belegung über Babylons Standard-Eingabe reagierte in diesem Aufbau gar nicht auf Maus-Ziehen; die Steuerung steckt jetzt selbst in `src/build/camera.ts` (Rechnung in `cameraControls.ts`). Orthografische Ansicht (Ziffernblock 5) gibt es noch nicht.

## Mengengrenzen der KI

Je Aufruf bis zu 500 Steine/Teile, je Auftrag bis zu 1000 neue Objekte (ab 300 fragt die KI den Nutzer einmal um Erlaubnis, außer im Modus „alles erlaubt“) und keine Obergrenze je Welt mehr (der Server begrenzt eine Insel auf 20000 Objekte, änderbar mit `CLOUDPARTY_MAX_ENTITIES`). Über dem Auftragslimit meldet das Werkzeug der KI den Grund und rät, die Arbeit aufzuteilen oder größere Teile zu nehmen. Die Zahlen stehen in `AI_LIMITS` (`shared/aiTools.ts`). Ob der Browser mehrere tausend Steine mit Noppen flüssig darstellt, hängt von der Grafikkarte ab und ist nicht getestet.

### Nach dem Testsuite-Lauf

`get_bounds` und `look` rechnen Klemmbaustein-Gruppen jetzt mit den echten Maßen (vorher geschätzt, Wand 3,25 × 2,5 × 2,25 statt 2,5 × 1,8 × 1,5 m). `fill_bricks` nennt Öffnungen mit Welt-Koordinaten und erklärt die Seiten (north = kleineres z, south = größeres z, west = kleineres x, east = größeres x). Eine Materialvoreinstellung ohne eigene Farbe (`preset: gold`) wird nicht mehr von der Standardfarbe des Bausteins überstimmt. `get_world` zeigt Materialwerte (metallic, roughness, uvScale …) und Medien-Details (Folienzahl, aktuelle Folie, Text) und versteht Gruppennamen bei `group`. Wichtig beim Testen: Browser und Dev-Server nach jedem Update neu laden, sonst läuft die KI mit alten Werkzeugen.

## Runde Klemmbausteine, vier Drehungen, Profil-Werkzeug

Neue Arten (`kind`): `bogen` (Bogenstein, abgerundete Schräge), `schraeg_um` (umgedrehte Schräge), `viertel` (Viertelrundung), `bogenlauf` (Radlauf), `rundplatte` und `kuppel` (Halbkugel); alle in der Palette mit Vorschaubild. `add_bricks` dreht jetzt mit `rot` 0/90/180/270 (Schrägen und Bögen fallen bei 0 nach +z, 90 nach +x, 180 nach −z, 270 nach −x; `rot90` bleibt als Alias) und kennt `studs: false` für verdeckte Lagen. Neu ist `bricks_profile`: ein Seitenprofil als Segmente (Länge, Höhe in Platten, `edge_before`/`edge_after` = `slope` oder `curve`) wird in einem Aufruf zu Karosserie oder Dachlinie, mit Schräg- bzw. Bogenstein an den Rändern. Der Prompt enthält den Teilekatalog und ein Rezept für ein Auto. Die Rundungen sind Näherungen (12 Segmente), keine Originalmaße; Räder drehen sich nicht. Im Browser mit den echten Werkzeugen gebautes Beispielauto: Karosserie mit Bogen an der Haube, Schräge am Heck, vier Räder, Rundplatten als Lichter.

## Export nach Blender

Insel-Menü → „Diese Insel“ → „Export nach Blender“: **Alles als .glb** oder **.glb + Blender-Skript** (und, wenn Objekte gewählt sind, **Nur Auswahl**). Der Export nimmt nur die Objekte der Welt (ohne Marker, Himmel, Gras, Avatare, Licht, Wasser, Spiegel; diese werden gemeldet). Materialien werden für Blender zugeordnet: Klarlack → `KHR_materials_clearcoat`, Glas → `KHR_materials_transmission` mit Brechungsindex, Bild- und Mustertexturen eingebettet (`KHR_texture_transform` für die Wiederholung), gleichaussehende Materialien (z. B. Klemmbausteine) werden zusammengelegt. Jeder Knoten trägt Zusatzdaten (`cp_id`, `cp_ref`, `cp_name`, `cp_group`, `cp_group_name`, `cp_preset`). Das Skript `…-blender.py` (in Blender: Scripting → Datei öffnen → Alt+P; die .glb muss daneben liegen) importiert die Datei, legt Collections je Gruppe an, richtet Sonne (Richtung, Farbtemperatur, Stärke aus der Insel), Nishita-Himmel, eine einfache grüne Insel und eine Kamera ein. Koordinaten: Cloudparty (Babylon) → glTF spiegelt X → Blender macht daraus (−x, −z, y). Nicht dabei: Echtzeit-Spiegel, Wasser, Partikel, Wetter, Skripte, Logik, Physik; Licht-Entities. Getestet habe ich Export, Aufbau der .glb und die Skript-Erzeugung; in Blender selbst konnte ich weder die Datei noch das Skript ausführen.

## Leistung bei großen Klemmbau-Werken

Babylon macht von sich aus nur Sichtfeld-Culling (alles außerhalb des Bildes wird nicht gezeichnet), aber **keine** Verdeckungsprüfung: Steine hinter Wänden werden trotzdem gezeichnet. Deshalb gibt es zwei Maßnahmen:

1. **Gemeinsame Geometrie** (`src/world/entities/brickMaster.ts`): Alle Steine gleicher Gestalt und gleichen Aussehens sind Hardware-Instanzen eines einzigen Master-Meshes (Körper und Noppen in einem Stück, ein gemeinsames Material). Gemessen mit einem Beispielschloss (962 Objekte, im Software-Renderer der Testumgebung): Meshes 8158 → 1493, Materialien 976 → 86, Rechenzeit je Bild im Spielmodus 76 → 10 ms, im Baumodus 280 → 12 ms. Änderungen am Material eines Steins bauen ihn neu auf (weil das Material geteilt wird).
2. **Verdeckte Steine** (`src/world/bricks`, `hiddenBrickIds` in `shared/bricks.ts`): Im Spielmodus werden feste Quader-Steine nicht gezeichnet, deren sechs Seiten vollständig an andere feste Quader-Steine (unten: an die Inselfläche) grenzen. Im Baumodus ist alles sichtbar. Dünne, hohle Mauern profitieren davon kaum; massive Blöcke, Böden und Türme schon (Test: Block aus 72 Steinen, 16 verdeckt). Schiefe, bewegliche oder nicht im Raster liegende Steine werden nie versteckt.

Echte Bildraten auf deiner Grafikkarte kann ich nicht messen; die Zahlen oben zeigen Meshes, Materialien und CPU-Zeit je Bild im Software-Renderer.

## Skript-API: Gruppen, Weltsicht, Spawn, sanfte Bewegung, Testen durch die KI

- **Sanft bewegen:** `self.moveTo(x, y, z, sekunden, kurve)`, `self.rotateTo(...)`, `self.scaleTo(...)` (Kurve `linear`, `inOut`, `out`). Die Zielposition steht sofort im Store (Physik, Speichern, Netz), nur die Darstellung gleitet dorthin.
- **Ganze Gruppen:** `world.group('Name')` (Gruppenname oder -id) mit `.moveBy(dx, dy, dz, sek, kurve)`, `.rotateBy(xGrad, yGrad, zGrad, sek, kurve, pivot?)` (starre Drehung um die Mitte der Gruppe, Bahn statt Gerade; 360° in N Sekunden ergibt einen vollen Umlauf), `.setColor`, `.setEmissive`, `.setAlpha`, `.count`, `.center()`, `.ids`. Bis 1000 Teile je Befehl, höchstens 30 Gruppenbefehle pro Sekunde und Skript.
- **Welt lesen:** `world.find(nameOderId)`, `world.findAll(gruppeOderNamensanfang)`, `world.avatars()` liefern eine Lesesicht, die der Host etwa 4-mal pro Sekunde an Skripte schickt, die diese Aufrufe im Quelltext verwenden (nur Objekte mit Namen oder Gruppe, höchstens 1500). Entfernte Avatare sind noch nicht enthalten (derzeit der lokale Avatar).
- **Erzeugen:** `world.spawn(ref, { x, y, z, scale, color, name, physics, mass, lifetime })` für Würfel, Kugel, Zylinder, Kegel, Ring, Platte und Klemmbaustein (höchstens 100 je Skript, 300 insgesamt, 20 pro Sekunde); `world.destroy(id)` nur für selbst erzeugte Objekte. Erzeugte Objekte verschwinden beim Verlassen des Spielmodus.
- **KI testet ihre Skripte:** `script_test` schaltet kurz in den Spielmodus, löst ein Ereignis aus (onClick, onTouch, Trigger, onChat, onMessage oder nur Warten), wartet und meldet Status, `log()`-Ausgaben, Fehler mit Zeilennummer, Chat-Ausgaben, gesendete Nachrichten, erzeugte und geänderte Objekte (vorher → nachher) und setzt danach alles zurück; `script_log` liest Status und Protokoll. Höchstens 6 Tests je Auftrag.
- **Grenzen:** Bewegte Objekte mit statischer Physik springen für die Physik sofort ans Ziel (kein „Mitnehmen“ von Avataren auf bewegten Plattformen). Andere Spieler im Netz sehen das Ziel, nicht den Verlauf der Bewegung.

## Formatierte KI-Antworten

Die Antworten im KI-Chat werden als Markdown dargestellt (`src/ai/ui/markdown.tsx`, ohne zusätzliche Bibliothek): Überschriften, Absätze, **fett**, *kursiv*, `Code`, durchgestrichen, Listen (auch nummeriert und verschachtelt), Zitate, Codeblöcke, Tabellen, Trennlinien und Links (nur http/https, öffnen in neuem Tab). Es wird kein HTML eingeschleust: alles entsteht als React-Elemente, fremdes HTML erscheint als Text. Unfertiger Text beim Streamen bleibt lesbar.

## Ausrichtung von Tafeln und Plan-Knoten

- **Vorderseite:** Tafeln (Bild, Folien, Web, Video, Text) und Spiegel zeigen ihre Inhalte nur auf der Vorderseite (lokale +Z-Richtung); die Rückseite ist leer. Im Baumodus zeigt ein grüner Pfeil vor der Tafel, wohin sie schaut. Beim Setzen aus der Palette dreht sich die Tafel zur Kamera.
- **KI:** `add_entity`/`update_entity` kennen `face_toward` ([x, z] oder [x, y, z]) und drehen die Vorderseite zum Punkt; `get_world` nennt je Tafel `vorderseite` (Blickrichtung) und `vorderseite_zur_inselmitte`, der Katalog weist auf die Vorderseite hin.
- **Plan-Knoten und Ausgabelänge:** Jeder Knoten läuft mit mindestens 8000 Tokens Ausgabegrenze (höher eingestellte Werte bleiben, Maximum 16000), unabhängig von der Chat-Einstellung; die Grenze steht im Auftragstext, die KI soll größere Knoten per `plan_add_node` teilen. Eine abgeschnittene Antwort (auch eine leere) lässt die KI kürzer neu ansetzen (bis zu 4 Mal), erst danach bricht der Knoten mit einer Meldung ab, die die Grenze nennt.

## Breite der Leisten

Die Leisten im Baumodus (Bausteine links, Inspector rechts) lassen sich verbreitern: am inneren Rand erscheint beim Darüberfahren ein Griff, Ziehen ändert die Breite (200 px bis höchstens die halbe Fensterbreite, maximal 640 px), Doppelklick setzt sie zurück. Die Breite wird pro Browser gespeichert. Bausteine und Material-Voreinstellungen ordnen sich dabei in mehr oder weniger Spalten an; die Bausteine stehen jetzt als Kacheln (Bild über dem Namen), damit Namen nicht mitten im Wort umbrechen.

## Überschneidungsprüfung

Nach jedem bauenden KI-Werkzeug (add_entity, update_entity, add_wall, array, clone_group, add_bricks, bricks_profile …) prüft `src/ai/core/overlap.ts` die neuen oder verschobenen Objekte (bis 300) gegen die ganze Welt: orientierte Quader mit Trennachsen-Test, gemessen werden Grundformen und Klemmbausteine. Gemeldet wird im Werkzeugergebnis „ACHTUNG – Überschneidungen“ mit Namen, Tiefe und Achse der kleinsten Verschiebung, außerdem Teile, die mehr als 10 cm unter der Inseloberfläche stecken. Nicht gemeldet werden Berührungen unter 6 cm, Wandecken (Eindringen bis zur halben Dicke des dünnsten Teils, höchstens 20 cm), Paare in derselben Gruppe sowie Zonen, Lichter und Startpunkte. Zusammengesetzte Bausteine (Bank, Baum …) haben keine verlässlichen Maße und werden nicht gemessen. Das Werkzeug `check_overlaps` prüft die ganze Welt, ein Objekt oder eine Gruppe. Die Überschneidung wird nur gemeldet, nicht verhindert: absichtliche Durchdringungen bleiben möglich.

## Bilder im KI-Chat

Im KI-Chat lassen sich bis zu 4 Bilder pro Nachricht anhängen: Knopf 📎, Einfügen aus der Zwischenablage (Strg+V, z. B. ein Screenshot) oder Ablegen auf das Eingabefeld. Die Bilder werden im Browser auf höchstens 1280 px und ca. 400 kB (JPEG) verkleinert, als Vorschau über dem Eingabefeld gezeigt (✕ entfernt eines) und mit der Nachricht an die KI geschickt (sie gehen an Anthropic); eine Nachricht darf auch nur aus Bildern bestehen. Die KI soll sie als Vorlage oder Hinweis nutzen, Maße nur schätzen und Text im Bild als Daten behandeln. Die Bilder gelten nur für diesen Auftrag: spätere Aufträge bekommen nur den Hinweis, dass Bilder angehängt waren, und der Plan oder die Antwort sollte wichtige Angaben festhalten. Ein Bild kostet etwa 1000–1600 Eingabetokens. Plan-Knoten und Warteschlange behalten die Bilder bei, bis ihr Auftrag läuft.

## Boden und Grundplatten ohne Flimmern

Die Inseloberfläche (`env.islandMat`) hat einen Tiefenversatz (`ISLAND_Z_OFFSET` in `src/engine/environment/island.ts`). Platten, Böden und Flächen, deren Oberkante genau bei y = 0 liegt, gewinnen dadurch immer gegen das Gras; das Z-Fighting (Streifen) entfällt, ein manuelles Anheben ist nicht mehr nötig.

## KI: Platzieren und Prüfen

Neue Werkzeuge, damit die KI nicht mehr Koordinaten raten muss:

- **Öffnungen als Metadaten:** `add_wall` und `fill_bricks` speichern Türen und Fenster (Name, Mitte, Größe, Wanddicke, Vorderseite) in `world.extensions['cloudparty.ai.openings']`. Das Ergebnis der Werkzeuge, `get_bounds` und `group_entities` kennen sie.
- **`fit_to_opening`:** passt eine Medien-Tafel oder einen Quader (Glasscheibe) in eine Öffnung ein (Größe, Position, Drehung, Blickseite `face`, `fit` contain/stretch, `mode` flush/surface). Der versteckte Versatz von Tafeln (Ursprung am Boden, Bildfläche 0,9 m darüber) ist eingerechnet.
- **`place_relative`** (auf, unter, nördlich, südlich, östlich, westlich von einem anderen Teil, mit Abstand und Ausrichtung), **`align_entities`** (ausrichten und gleichmäßig verteilen), **`find_free_spot`** (freier Boden, ohne Überschneidung).
- **`verify`:** rechnerische Prüfung (sitzt in Öffnung, berührt, steht auf dem Boden, Maße, innerhalb, keine Überschneidung) mit Messwert und Korrekturhinweis; **`what_changed`:** Zusammenfassung des Auftrags.
- **`look`** kann mit `views` zwei Ansichten in einem Bild zeigen (zählt als ein Screenshot) und das Ziel mit `mark` magenta hervorheben.
- `get_bounds` kennt jetzt die Maße von Medien-Tafeln (mit und ohne Standfüße).

## Blender-Export: Namen und Gruppen

Knoten heißen im Export wie das Objekt (sonst wie der Baustein, z. B. „box“), nicht mehr `entity.e_…`. Jede Gruppe wird ein Eltern-Knoten mit dem Gruppennamen (z. B. „Bett“); die Namen in der Szene werden danach zurückgesetzt.

## Figur, Ich-Perspektive und Gras

- **Figur (nur lokal):** Menü „Aussehen“ › Figur: *Normal*, *Neutral* (einfarbige helle Maßstabsfigur ohne Gesicht) oder *Ausgeblendet* (Figur und Namensschild). Andere Besucher sehen deine Figur weiterhin. Gespeichert pro Browser (`cloudparty.avatar.view`).
- **Ich-Perspektive:** Taste **V** oder Knopf „Ich-Sicht“ in der Leiste (auch im Aussehen-Dialog). Die Kamera sitzt auf Augenhöhe, die Figur ist dabei ausgeblendet; Blick mit gedrückter Maustaste ziehen, Bewegung wie gewohnt mit WASD. Im Baumodus gilt nur die Figur-Einstellung.
- **Gras pro Insel:** Menü › Diese Insel › „Gras auf dieser Insel anzeigen“ (nur mit Baurecht; gilt für alle Besucher, gespeichert in der Welt als `environment.grass`). Die KI kann es mit `set_environment` (`grass`) setzen. Die grüne Bodenfläche bleibt, nur die 3D-Grashalme entfallen.

## Claude Desktop baut live in der App (MCP)

Ein kleiner lokaler MCP-Server (`mcp/server.ts`) verbindet Claude Desktop mit der geöffneten App. Claude ruft dieselben Werkzeuge auf wie der KI-Chat (`add_wall`, `fill_bricks`, `fit_to_opening`, `verify`, `look` …) und bekommt auch Screenshots zurück. Die Werkzeuge laufen in der App mit denselben Prüfungen, Limits und Überschneidungsmeldungen; jeder verändernde Aufruf ist ein eigener Undo-Schritt.

**Einrichten (einmalig)**
1. Im Projektordner `npm install`, dann `npm run mcp:token` – zeigt Token und Port (Standard 8765). Das Token liegt in `~/.cloudparty-mcp/token`.
2. Claude Desktop › Einstellungen › Entwickler › „Konfiguration bearbeiten“ und eintragen (Pfad anpassen, unter Windows `C:/…` mit Schrägstrichen):
   ```json
   {
     "mcpServers": {
       "cloudparty": {
         "command": "npx",
         "args": ["--prefix", "/PFAD/ZU/cloudparty", "tsx", "/PFAD/ZU/cloudparty/mcp/server.ts"]
       }
     }
   }
   ```
   Claude Desktop danach neu starten (Node.js muss installiert sein).
3. In der App: KI-Einstellungen › „Externe Steuerung (MCP)“ einschalten, Token einfügen (Port nur ändern, wenn nötig). Status zeigt „Verbunden“.
4. In Claude Desktop z. B.: „Rufe cloudparty_guide auf und baue ein Haus mit Fenster und einem Bild im Fenster.“

**Sicherheit:** Der Server hört nur auf `127.0.0.1` und verlangt das Token; die Steuerung ist standardmäßig aus und nur mit Baurecht wirksam. Rückfragen bei großen Bauten erscheinen als Bestätigungsdialog im Browser (oder entfallen im Freigabe-Modus „alles erlaubt“). Screenshots gehen an Claude Desktop. Inhalte aus der Welt bleiben Daten. Der Port lässt sich mit `CLOUDPARTY_MCP_PORT`, das Token mit `CLOUDPARTY_MCP_TOKEN` überschreiben. Die App und Claude Desktop müssen auf demselben Rechner laufen.

**Mehrere Instanzen:** Startet Claude Desktop den MCP-Server mehrfach (oder blieb ein Prozess vom letzten Start übrig), besitzt die erste Instanz den Port; jede weitere hängt sich an sie und ruft über sie in der App auf. Endet die erste, übernimmt die nächste beim nächsten Aufruf, und die App verbindet sich von selbst neu. Meldung „Port belegt und der Server dort passt nicht“: ein anderes Programm nutzt den Port oder ein Prozess mit anderem Token läuft; im Task-Manager die `node`-Prozesse beenden oder `CLOUDPARTY_MCP_PORT` setzen.

## KI und Pläne: nachträglich ändern

Zusätzlich zu `plan_create`, `plan_get`, `plan_add_node`, `plan_update_node`, `plan_remove_node` und `plan_complete_node` kann die KI jetzt: **`plan_connect`** (Abhängigkeiten nachträglich setzen oder lösen: `chain` für eine Kette, `edges` für einzelne Verbindungen, Kreise werden abgelehnt), **`plan_add_node`** mit `before` (Knoten in eine bestehende Kette einfügen) und **`plan_edit`** (Plan umbenennen oder löschen, Löschen fragt nach). `plan_get` weist auf Knoten ohne Verbindungen hin. Die Werkzeuge stehen auch über MCP zur Verfügung.

**Baumodus:** Mit gedrückter Shift-Taste bewegt sich die Kamera per W A S D / Q E dreimal so schnell.

## KI-Einstellungen: Tabs und Laufzeit-Limits

Der Einstellungsdialog ist in vier Tabs gegliedert: **Zugang** (API-Key, Modell), **Limits**, **Funktionen** (Freigaben, Screenshots, Bildsuche, Externe Steuerung per MCP) und **Protokoll**.

Unter **Limits** lassen sich neben den Token-Längen jetzt auch die Laufzeit-Grenzen einstellen (Standardwerte wie bisher): Schritte (Modellaufrufe) und Werkzeugaufrufe pro Auftrag, neue Objekte pro Auftrag, ab wann die KI nachfragt (neue Objekte, Löschungen), Screenshots, Bildsuchen, Bilder und Skripttests pro Auftrag sowie für „Alle ausführen“ die Knoten pro Lauf und die Token-Obergrenze pro Plan-Lauf. Die Werte gelten pro Browser; „Alle Limits auf Standard“ setzt sie zurück.

**Lange Pläne (temporär):** Ein Schalter hebt alle Laufzeit-Grenzen auf großzügige Werte an (mindestens 60 Schritte, 400 Werkzeugaufrufe, 10000 neue Objekte, 120 Knoten, 5 Mio. Tokens pro Lauf …), aber nur bis zum Neuladen bzw. Schließen des Tabs (`sessionStorage`). Die gespeicherten Werte bleiben unverändert. Das kann deutlich mehr Tokens und Kosten verursachen.
