# Export nach Blender

## Export nach Blender

Insel-Menü → „Diese Insel“ → „Export nach Blender“: **Alles als .glb** oder **.glb + Blender-Skript** (und, wenn Objekte gewählt sind, **Nur Auswahl**). Der Export nimmt nur die Objekte der Welt (ohne Marker, Himmel, Gras, Avatare, Licht, Wasser, Spiegel; diese werden gemeldet). Materialien werden für Blender zugeordnet: Klarlack → `KHR_materials_clearcoat`, Glas → `KHR_materials_transmission` mit Brechungsindex, Bild- und Mustertexturen eingebettet (`KHR_texture_transform` für die Wiederholung), gleichaussehende Materialien (z. B. Klemmbausteine) werden zusammengelegt. Jeder Knoten trägt Zusatzdaten (`cp_id`, `cp_ref`, `cp_name`, `cp_group`, `cp_group_name`, `cp_preset`). Das Skript `…-blender.py` (in Blender: Scripting → Datei öffnen → Alt+P; die .glb muss daneben liegen) importiert die Datei, legt Collections je Gruppe an, richtet Sonne (Richtung, Farbtemperatur, Stärke aus der Insel), Nishita-Himmel, eine einfache grüne Insel und eine Kamera ein. Koordinaten: Cloudparty (Babylon) → glTF spiegelt X → Blender macht daraus (−x, −z, y). Nicht dabei: Echtzeit-Spiegel, Wasser, Partikel, Wetter, Skripte, Logik, Physik; Licht-Entities. Getestet habe ich Export, Aufbau der .glb und die Skript-Erzeugung; in Blender selbst konnte ich weder die Datei noch das Skript ausführen.

## Blender-Export: Namen und Gruppen

Knoten heißen im Export wie das Objekt (sonst wie der Baustein, z. B. „box“), nicht mehr `entity.e_…`. Jede Gruppe wird ein Eltern-Knoten mit dem Gruppennamen (z. B. „Bett“); die Namen in der Szene werden danach zurückgesetzt.

