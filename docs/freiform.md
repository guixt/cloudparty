# Freiform: gekrümmte Flächen

Mit dem Prefab `EntitySpec.freeform` entstehen Rundungen: geschwungene Wände und Decken, Wannen, Sitzgruben, gewellte Lamellenwände. Gespeichert wird nur ein kleiner Parametersatz im `state` der Entity; das Netz baut der Client daraus (`shared/freeform/`, `src/world/entities/freeformMesh.ts`). Das bleibt klein für Netz und Speicher und ist deterministisch.

## Arten (`state.kind`)
- **`sweep`**: Wand bzw. Platte entlang eines Grundriss-Pfades. `path` = Punkte `{ p: [x, z], bulge? }`, `bulge` ist die Pfeilhöhe des Bogens zum nächsten Punkt in Metern (positiv = Bogen nach links in Laufrichtung). Dazu `height`, optional `heightEnd` (Höhenverlauf), `thickness`, `y0`, `closedPath`, `segments`, `wave { amplitude, length }`.
- **`lathe`** (Drehkörper): `profile` = Punkte `[Radius, y]` von unten nach oben, `sweepDeg`, `startDeg`, `segments`, `ellipse` (z/x-Verhältnis für ovale Formen: Wanne, Vase, Sitzgrube). Deckel entstehen über Profilpunkte mit Radius 0.
- **`patch`** (Kontrollpunkt-Fläche): `grid[zeile][spalte]` aus Kontrollpunkten `[x, y, z]`, `degree` 1–3 (B-Spline/Bézier, kein echtes NURBS), `thickness`, `subdivisions`.
- **`cuts`** (bei allen Arten): boolesche Schnitte (`box`, `cylinder`, `sphere` mit `pos`, `size`, `rotY`), z. B. Türen und Fenster in einer Bogenwand. Umgesetzt mit dem JavaScript-CSG von Babylon (`src/world/entities/freeformCuts.ts`); bei Fehlern bleibt das Netz unverändert.

Grenzen stehen in `FREEFORM_LIMITS` (`shared/freeform/types.ts`): höchstens 200 Punkte, Gitter 16 × 16, 256 Segmente, 8 Schnitte, 200 m, 60000 Vertices. `sanitizeFreeformState` klemmt und prüft jeden State (auch der Server).

## KI-Werkzeuge
`add_curved_wall` (Pfad mit `bulge`, Öffnungen werden zu Schnitten und wie bei `add_wall` gespeichert, also nutzbar mit `fit_to_opening`), `add_lathe`, `add_surface`, `add_wavy_wall` und `update_freeform` (Parameter einer bestehenden Freiform ändern). Der Prompt enthält Rezepte (Kopfwand, Wanne, Sitzgrube, Decke, Lamellenwand, Fensterband).

## Bearbeiten im Baumodus
- Inspector-Abschnitt „Freiform“: Tabellen für Pfad, Profil, Gitter und Schnitte, jede Änderung wird geprüft und ist ein Undo-Schritt.
- Griffe: Bei ausgewählter Freiform erscheinen Kugeln an den Kontrollpunkten (nur im Baumodus, nicht exportiert); Ziehen verschiebt den Punkt (Raster-Einrasten wie die Gizmos, Fläche: Shift wechselt die Ziehebene).

## Weiteres
- Physik: statisch Mesh-Collider, dynamisch konvexe Hülle (`src/engine/physics/helpers.ts`).
- Maße und Überschneidungen: `get_bounds`, `check_overlaps`, `place_relative`, `verify` nutzen die Hülle aus `freeformBounds`; bei gekrümmten Formen ist sie grob, deshalb melden Überschneidungen mit Freiformen erst ab 0,15 m Tiefe.
- Export nach Blender: Das Netz kommt als normales Mesh in die `.glb` (kein NURBS).
- Grenzen: Die KI muss Kurven in Zahlen beschreiben; hohe Werkzeuge („Pfad mit Pfeilhöhe“) helfen dabei. Der Look bleibt Echtzeit-PBR.
