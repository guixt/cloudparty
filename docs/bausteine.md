# Bausteine, Texturen, Materialien und Tafeln

Klemmbausteine, Bibliothek, Materialien, Vorschaubilder, Überschneidungsprüfung und Medien-Tafeln.

## Gruppen, Bibliothek und Logik-Graph

**Gruppen:** Mehrere Objekte lassen sich zu einer Gruppe zusammenfassen (Strg+G). Ein Klick auf ein Mitglied wählt die ganze Gruppe, ein Doppelklick nur dieses Mitglied. Gruppen werden gemeinsam bewegt, gedreht, skaliert, kopiert und gelöscht, jede Geste ist ein Undo-Schritt. Im Inspector gibt es für Mehrfachauswahlen Farbe, Physik, Ausrichten und Verteilen für alle gewählten Objekte.

**Bibliothek:** „Auswahl speichern …" legt Objekte samt Material, Skripten und Graphen als Baustein ab (Vorschaubild, Name, Stichworte). Bausteine lassen sich per Knopf oder Ziehen in die Welt setzen und als Datei exportieren und importieren. Eine Reihe fertiger Bausteine (Gartenhaus, Brunnen, Pavillon …) ist enthalten. Die Bibliothek liegt im Browser (IndexedDB).

**Logik-Graph:** Wie der Node-Editor in Blender verbindest du Blöcke (Ereignisse, Aktionen, Ablauf, Logik, Werte, Variablen, Medien) zu einem Ablauf. Der Graph wird in ein Skript übersetzt und im Skript-Sandbox-Worker ausgeführt; im Reiter „Code" siehst du das Ergebnis. Es gibt Vorlagen (Tür, Lichtschalter, Zähler, Aufzug …). Ein aktivierter, fehlerfreier Graph hat Vorrang vor einem Skript am selben Objekt. Die KI kann Graphen erzeugen (Reiter „KI" im Editor und Werkzeug `set_graph`).

## Klemmbausteine

Neue Kategorie „Klemmbausteine“ in der Bau-Palette (Stein 2×4/2×2/1×2, Platte 4×8/2×4, Fliese 2×2). Maße: 1 Noppe = 0,25 m, Stein 0,3 m, Platte/Fliese 0,1 m hoch. Beim Platzieren rasten Steine auf dem Noppenraster ein und setzen sich auf den Stein darunter; Größe und Art (`w`, `d`, `kind`) stehen im Zustand des Objekts. Die KI baut mit `add_bricks` (Raster-Koordinaten in Noppen, Auto-Stapeln) und `fill_bricks` (Wände mit Türen/Fenstern und Böden mit versetzten Fugen). Dazu kommen Schrägsteine (Dachsteine), Rundsteine und kleine Räder (Achse längs x, Durchmesser 2–8 Noppen; die Räder sind noch starre Bauteile, drehen sich nicht). Noch nicht enthalten: ein eigener Modus, der die anderen Grundformen ausblendet, umgedrehte Schrägen, Klemm-Physik.

## Vorschaubilder der Bausteine

Die Bau-Palette zeigt zu jedem Baustein ein Vorschaubild (`public/previews/<key>.webp`, 128×128). Sie entstehen aus den echten 3D-Objekten: `npm run previews` (braucht Playwright mit Chromium) rendert jeden Katalogeintrag einzeln auf hellem Hintergrund; `--only key1,key2` nur einzelne. Einzelne Bilder lassen sich auch von Hand überschreiben. Fehlt ein Bild, zeigt die Palette die Farbfläche. Die Palette klappt nach dem Einfügen nicht mehr automatisch zu.

## Bild-Texturen für Materialien

Im Inspector (Material) lässt sich ein Bild als Textur hochladen („Bild hochladen“, auf höchstens 1024 px und ca. 170 kB verkleinert) oder wieder entfernen; „Textur-Wiederholung“ steuert die Kachelung. Die KI sucht mit `search_images` und belegt mit `use_texture` ein Objekt oder eine ganze Gruppe (Grundfarbe und Muster entfallen dabei, damit das Bild unverfälscht erscheint). Es gelten dieselben Schalter und Limits wie bei Bild-Tafeln (Bildsuche in den KI-Einstellungen, 4 Suchen, 6 Bilder je Auftrag). Texturen werden als Daten gespeichert, die KI kann keine fremden Adressen als Textur setzen. Fotos sind nicht nahtlos kachelbar; bei hoher Wiederholung sieht man Nähte, am besten nach „seamless texture“ suchen.

## Runde Klemmbausteine, vier Drehungen, Profil-Werkzeug

Neue Arten (`kind`): `bogen` (Bogenstein, abgerundete Schräge), `schraeg_um` (umgedrehte Schräge), `viertel` (Viertelrundung), `bogenlauf` (Radlauf), `rundplatte` und `kuppel` (Halbkugel); alle in der Palette mit Vorschaubild. `add_bricks` dreht jetzt mit `rot` 0/90/180/270 (Schrägen und Bögen fallen bei 0 nach +z, 90 nach +x, 180 nach −z, 270 nach −x; `rot90` bleibt als Alias) und kennt `studs: false` für verdeckte Lagen. Neu ist `bricks_profile`: ein Seitenprofil als Segmente (Länge, Höhe in Platten, `edge_before`/`edge_after` = `slope` oder `curve`) wird in einem Aufruf zu Karosserie oder Dachlinie, mit Schräg- bzw. Bogenstein an den Rändern. Der Prompt enthält den Teilekatalog und ein Rezept für ein Auto. Die Rundungen sind Näherungen (12 Segmente), keine Originalmaße; Räder drehen sich nicht. Im Browser mit den echten Werkzeugen gebautes Beispielauto: Karosserie mit Bogen an der Haube, Schräge am Heck, vier Räder, Rundplatten als Lichter.

## Leistung bei großen Klemmbau-Werken

Babylon macht von sich aus nur Sichtfeld-Culling (alles außerhalb des Bildes wird nicht gezeichnet), aber **keine** Verdeckungsprüfung: Steine hinter Wänden werden trotzdem gezeichnet. Deshalb gibt es zwei Maßnahmen:

1. **Gemeinsame Geometrie** (`src/world/entities/brickMaster.ts`): Alle Steine gleicher Gestalt und gleichen Aussehens sind Hardware-Instanzen eines einzigen Master-Meshes (Körper und Noppen in einem Stück, ein gemeinsames Material). Gemessen mit einem Beispielschloss (962 Objekte, im Software-Renderer der Testumgebung): Meshes 8158 → 1493, Materialien 976 → 86, Rechenzeit je Bild im Spielmodus 76 → 10 ms, im Baumodus 280 → 12 ms. Änderungen am Material eines Steins bauen ihn neu auf (weil das Material geteilt wird).
2. **Verdeckte Steine** (`src/world/bricks`, `hiddenBrickIds` in `shared/bricks.ts`): Im Spielmodus werden feste Quader-Steine nicht gezeichnet, deren sechs Seiten vollständig an andere feste Quader-Steine (unten: an die Inselfläche) grenzen. Im Baumodus ist alles sichtbar. Dünne, hohle Mauern profitieren davon kaum; massive Blöcke, Böden und Türme schon (Test: Block aus 72 Steinen, 16 verdeckt). Schiefe, bewegliche oder nicht im Raster liegende Steine werden nie versteckt.

Echte Bildraten auf deiner Grafikkarte kann ich nicht messen; die Zahlen oben zeigen Meshes, Materialien und CPU-Zeit je Bild im Software-Renderer.

## Ausrichtung von Tafeln

- **Vorderseite:** Tafeln (Bild, Folien, Web, Video, Text) und Spiegel zeigen ihre Inhalte nur auf der Vorderseite (lokale +Z-Richtung); die Rückseite ist leer. Im Baumodus zeigt ein grüner Pfeil vor der Tafel, wohin sie schaut. Beim Setzen aus der Palette dreht sich die Tafel zur Kamera.
- **KI:** `add_entity`/`update_entity` kennen `face_toward` ([x, z] oder [x, y, z]) und drehen die Vorderseite zum Punkt; `get_world` nennt je Tafel `vorderseite` (Blickrichtung) und `vorderseite_zur_inselmitte`, der Katalog weist auf die Vorderseite hin.

## Überschneidungsprüfung

Nach jedem bauenden KI-Werkzeug (add_entity, update_entity, add_wall, array, clone_group, add_bricks, bricks_profile …) prüft `src/ai/core/overlap.ts` die neuen oder verschobenen Objekte (bis 300) gegen die ganze Welt: orientierte Quader mit Trennachsen-Test, gemessen werden Grundformen und Klemmbausteine. Gemeldet wird im Werkzeugergebnis „ACHTUNG – Überschneidungen“ mit Namen, Tiefe und Achse der kleinsten Verschiebung, außerdem Teile, die mehr als 10 cm unter der Inseloberfläche stecken. Nicht gemeldet werden Berührungen unter 6 cm, Wandecken (Eindringen bis zur halben Dicke des dünnsten Teils, höchstens 20 cm), Paare in derselben Gruppe sowie Zonen, Lichter und Startpunkte. Zusammengesetzte Bausteine (Bank, Baum …) haben keine verlässlichen Maße und werden nicht gemessen. Das Werkzeug `check_overlaps` prüft die ganze Welt, ein Objekt oder eine Gruppe. Die Überschneidung wird nur gemeldet, nicht verhindert: absichtliche Durchdringungen bleiben möglich.

