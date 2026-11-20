# Skripte

Skript-Laufzeit und Skript-API (`script_test` für die KI).

## Skript-API: Gruppen, Weltsicht, Spawn, sanfte Bewegung, Testen durch die KI

- **Sanft bewegen:** `self.moveTo(x, y, z, sekunden, kurve)`, `self.rotateTo(...)`, `self.scaleTo(...)` (Kurve `linear`, `inOut`, `out`). Die Zielposition steht sofort im Store (Physik, Speichern, Netz), nur die Darstellung gleitet dorthin.
- **Ganze Gruppen:** `world.group('Name')` (Gruppenname oder -id) mit `.moveBy(dx, dy, dz, sek, kurve)`, `.rotateBy(xGrad, yGrad, zGrad, sek, kurve, pivot?)` (starre Drehung um die Mitte der Gruppe, Bahn statt Gerade; 360° in N Sekunden ergibt einen vollen Umlauf), `.setColor`, `.setEmissive`, `.setAlpha`, `.count`, `.center()`, `.ids`. Bis 1000 Teile je Befehl, höchstens 30 Gruppenbefehle pro Sekunde und Skript.
- **Welt lesen:** `world.find(nameOderId)`, `world.findAll(gruppeOderNamensanfang)`, `world.avatars()` liefern eine Lesesicht, die der Host etwa 4-mal pro Sekunde an Skripte schickt, die diese Aufrufe im Quelltext verwenden (nur Objekte mit Namen oder Gruppe, höchstens 1500). Entfernte Avatare sind noch nicht enthalten (derzeit der lokale Avatar).
- **Erzeugen:** `world.spawn(ref, { x, y, z, scale, color, name, physics, mass, lifetime })` für Würfel, Kugel, Zylinder, Kegel, Ring, Platte und Klemmbaustein (höchstens 100 je Skript, 300 insgesamt, 20 pro Sekunde); `world.destroy(id)` nur für selbst erzeugte Objekte. Erzeugte Objekte verschwinden beim Verlassen des Spielmodus.
- **KI testet ihre Skripte:** `script_test` schaltet kurz in den Spielmodus, löst ein Ereignis aus (onClick, onTouch, Trigger, onChat, onMessage oder nur Warten), wartet und meldet Status, `log()`-Ausgaben, Fehler mit Zeilennummer, Chat-Ausgaben, gesendete Nachrichten, erzeugte und geänderte Objekte (vorher → nachher) und setzt danach alles zurück; `script_log` liest Status und Protokoll. Höchstens 6 Tests je Auftrag.
- **Grenzen:** Bewegte Objekte mit statischer Physik springen für die Physik sofort ans Ziel (kein „Mitnehmen“ von Avataren auf bewegten Plattformen). Andere Spieler im Netz sehen das Ziel, nicht den Verlauf der Bewegung.

