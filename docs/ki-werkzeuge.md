# KI-Assistent und Werkzeuge

Alles zum KI-Assistenten: Werkzeuge, Limits, Freigaben, Plan-Board, Bilder, Einstellungen. Überschneidungsprüfung und Bausteine stehen in [bausteine.md](bausteine.md), die Anbindung an Claude Desktop in [mcp.md](mcp.md).

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

## Mengengrenzen der KI

Je Aufruf bis zu 500 Steine/Teile, je Auftrag bis zu 1000 neue Objekte (ab 300 fragt die KI den Nutzer einmal um Erlaubnis, außer im Modus „alles erlaubt“) und keine Obergrenze je Welt mehr (der Server begrenzt eine Insel auf 20000 Objekte, änderbar mit `CLOUDPARTY_MAX_ENTITIES`). Über dem Auftragslimit meldet das Werkzeug der KI den Grund und rät, die Arbeit aufzuteilen oder größere Teile zu nehmen. Die Zahlen stehen in `AI_LIMITS` (`shared/aiTools.ts`). Ob der Browser mehrere tausend Steine mit Noppen flüssig darstellt, hängt von der Grafikkarte ab und ist nicht getestet.

### Nach dem Testsuite-Lauf

`get_bounds` und `look` rechnen Klemmbaustein-Gruppen jetzt mit den echten Maßen (vorher geschätzt, Wand 3,25 × 2,5 × 2,25 statt 2,5 × 1,8 × 1,5 m). `fill_bricks` nennt Öffnungen mit Welt-Koordinaten und erklärt die Seiten (north = kleineres z, south = größeres z, west = kleineres x, east = größeres x). Eine Materialvoreinstellung ohne eigene Farbe (`preset: gold`) wird nicht mehr von der Standardfarbe des Bausteins überstimmt. `get_world` zeigt Materialwerte (metallic, roughness, uvScale …) und Medien-Details (Folienzahl, aktuelle Folie, Text) und versteht Gruppennamen bei `group`. Wichtig beim Testen: Browser und Dev-Server nach jedem Update neu laden, sonst läuft die KI mit alten Werkzeugen.

## Formatierte KI-Antworten

Die Antworten im KI-Chat werden als Markdown dargestellt (`src/ai/ui/markdown.tsx`, ohne zusätzliche Bibliothek): Überschriften, Absätze, **fett**, *kursiv*, `Code`, durchgestrichen, Listen (auch nummeriert und verschachtelt), Zitate, Codeblöcke, Tabellen, Trennlinien und Links (nur http/https, öffnen in neuem Tab). Es wird kein HTML eingeschleust: alles entsteht als React-Elemente, fremdes HTML erscheint als Text. Unfertiger Text beim Streamen bleibt lesbar.

## Plan-Knoten und Ausgabelänge (Ergänzung)

- **Plan-Knoten und Ausgabelänge:** Jeder Knoten läuft mit mindestens 8000 Tokens Ausgabegrenze (höher eingestellte Werte bleiben, Maximum 16000), unabhängig von der Chat-Einstellung; die Grenze steht im Auftragstext, die KI soll größere Knoten per `plan_add_node` teilen. Eine abgeschnittene Antwort (auch eine leere) lässt die KI kürzer neu ansetzen (bis zu 4 Mal), erst danach bricht der Knoten mit einer Meldung ab, die die Grenze nennt.

## Bilder im KI-Chat

Im KI-Chat lassen sich bis zu 4 Bilder pro Nachricht anhängen: Knopf 📎, Einfügen aus der Zwischenablage (Strg+V, z. B. ein Screenshot) oder Ablegen auf das Eingabefeld. Die Bilder werden im Browser auf höchstens 1280 px und ca. 400 kB (JPEG) verkleinert, als Vorschau über dem Eingabefeld gezeigt (✕ entfernt eines) und mit der Nachricht an die KI geschickt (sie gehen an Anthropic); eine Nachricht darf auch nur aus Bildern bestehen. Die KI soll sie als Vorlage oder Hinweis nutzen, Maße nur schätzen und Text im Bild als Daten behandeln. Die Bilder gelten nur für diesen Auftrag: spätere Aufträge bekommen nur den Hinweis, dass Bilder angehängt waren, und der Plan oder die Antwort sollte wichtige Angaben festhalten. Ein Bild kostet etwa 1000–1600 Eingabetokens. Plan-Knoten und Warteschlange behalten die Bilder bei, bis ihr Auftrag läuft.

## KI: Platzieren und Prüfen

Neue Werkzeuge, damit die KI nicht mehr Koordinaten raten muss:

- **Öffnungen als Metadaten:** `add_wall` und `fill_bricks` speichern Türen und Fenster (Name, Mitte, Größe, Wanddicke, Vorderseite) in `world.extensions['cloudparty.ai.openings']`. Das Ergebnis der Werkzeuge, `get_bounds` und `group_entities` kennen sie.
- **`fit_to_opening`:** passt eine Medien-Tafel oder einen Quader (Glasscheibe) in eine Öffnung ein (Größe, Position, Drehung, Blickseite `face`, `fit` contain/stretch, `mode` flush/surface). Der versteckte Versatz von Tafeln (Ursprung am Boden, Bildfläche 0,9 m darüber) ist eingerechnet.
- **`place_relative`** (auf, unter, nördlich, südlich, östlich, westlich von einem anderen Teil, mit Abstand und Ausrichtung), **`align_entities`** (ausrichten und gleichmäßig verteilen), **`find_free_spot`** (freier Boden, ohne Überschneidung).
- **`verify`:** rechnerische Prüfung (sitzt in Öffnung, berührt, steht auf dem Boden, Maße, innerhalb, keine Überschneidung) mit Messwert und Korrekturhinweis; **`what_changed`:** Zusammenfassung des Auftrags.
- **`look`** kann mit `views` zwei Ansichten in einem Bild zeigen (zählt als ein Screenshot) und das Ziel mit `mark` magenta hervorheben.
- `get_bounds` kennt jetzt die Maße von Medien-Tafeln (mit und ohne Standfüße).

## KI und Pläne: nachträglich ändern

Zusätzlich zu `plan_create`, `plan_get`, `plan_add_node`, `plan_update_node`, `plan_remove_node` und `plan_complete_node` kann die KI jetzt: **`plan_connect`** (Abhängigkeiten nachträglich setzen oder lösen: `chain` für eine Kette, `edges` für einzelne Verbindungen, Kreise werden abgelehnt), **`plan_add_node`** mit `before` (Knoten in eine bestehende Kette einfügen) und **`plan_edit`** (Plan umbenennen oder löschen, Löschen fragt nach). `plan_get` weist auf Knoten ohne Verbindungen hin. Die Werkzeuge stehen auch über MCP zur Verfügung.

## KI-Einstellungen: Tabs und Laufzeit-Limits

Der Einstellungsdialog ist in vier Tabs gegliedert: **Zugang** (API-Key, Modell), **Limits**, **Funktionen** (Freigaben, Screenshots, Bildsuche, Externe Steuerung per MCP) und **Protokoll**.

Unter **Limits** lassen sich neben den Token-Längen jetzt auch die Laufzeit-Grenzen einstellen (Standardwerte wie bisher): Schritte (Modellaufrufe) und Werkzeugaufrufe pro Auftrag, neue Objekte pro Auftrag, ab wann die KI nachfragt (neue Objekte, Löschungen), Screenshots, Bildsuchen, Bilder und Skripttests pro Auftrag sowie für „Alle ausführen“ die Knoten pro Lauf und die Token-Obergrenze pro Plan-Lauf. Die Werte gelten pro Browser; „Alle Limits auf Standard“ setzt sie zurück.

**Lange Pläne (temporär):** Ein Schalter hebt alle Laufzeit-Grenzen auf großzügige Werte an (mindestens 60 Schritte, 400 Werkzeugaufrufe, 10000 neue Objekte, 120 Knoten, 5 Mio. Tokens pro Lauf …), aber nur bis zum Neuladen bzw. Schließen des Tabs (`sessionStorage`). Die gespeicherten Werte bleiben unverändert. Das kann deutlich mehr Tokens und Kosten verursachen.

