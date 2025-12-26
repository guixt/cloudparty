# WorldSpec Schema

WorldSpec beschreibt Weltenkonfigurationen für Cloudparty-Runtime-Module. Das Schema ist als JSON/DSL nutzbar und bietet einen klaren Validierungskern sowie Erweiterungspunkte über einen `extensions`-Namespace.

## Kernstruktur

```jsonc
{
  "$schema": "https://cloudparty.io/schemas/worldspec.schema.json",
  "metadata": {
    "name": "string (nicht leer)",
    "version": "semver"
  },
  "environment": {
    "sky": { "preset": "clear|dusk|night|custom", "color": "#RRGGBB?" },
    "light": { "intensity": "0..10", "temperatureK": "1000..12000", "direction": "azimuth,elevation" },
    "audio": { "soundscapeRef": "id", "volume": "0..1" }
  },
  "rules": {
    "movement": { "mode": "grounded|flying|noclip", "speed": "m/s" },
    "gravity": { "enabled": true, "strength": "m/s^2" },
    "abilities": [{ "id": "string", "enabled": true, "params": {"...": "..."} }]
  },
  "personality": {
    "mood": "calm|social|energetic|custom",
    "densityHints": { "min": "int", "max": "int", "peak": "hour" }
  },
  "entities": [
    { "ref": "EntitySpec id", "id": "instanceId", "transform": {"pos": [x,y,z], "rot": [x,y,z,w], "scale": [x,y,z]}, "state": {"...": "..."} }
  ],
  "interactions": [
    { "ref": "InteractionSpec id", "bindTo": "entity instanceId", "conditions": [{"if": "expr"}], "effects": [{"do": "expr"}] }
  ],
  "extensions": { "vendor.namespace": { "...": "frei" } }
}
```

## Validierungsregeln

- **Erforderlich:** `metadata`, `environment`, `rules`, `personality`. `entities`/`interactions` dürfen leer sein, aber wenn vorhanden, muss jedes Objekt mindestens `ref` besitzen.
- **Metadaten:** `name` nicht leer, max. 100 Zeichen. `version` als Semver (`MAJOR.MINOR.PATCH`).
- **Environment:**
  - `sky.preset` aus der vorgegebenen Auswahl, `color` nur bei `custom` zulässig.
  - `light.intensity` 0–10 (float), `temperatureK` 1000–12000, `direction` als `{azimuth: deg, elevation: deg}` oder Komma-String.
  - `audio.volume` 0–1; `soundscapeRef` verweist auf bereitgestellte Assets.
- **Rules:**
  - `movement.mode` begrenzt auf `grounded`, `flying`, `noclip`; `speed` > 0.
  - `gravity.enabled` boolean; bei `true` muss `strength` > 0 sein.
  - `abilities`-Elemente brauchen `id`; `params` ist freies Objekt, aber muss JSON-serialisierbar sein.
- **Personality:** `mood` aus erlaubter Liste oder durch `custom`-String; `densityHints.min/max` ≥ 0 und `max` ≥ `min`; `peak` entspricht Stunde 0–23.
- **Entities:** `ref` muss auf bekannte `EntitySpec` verweisen; `transform`-Arrays haben 3 (pos/scale) bzw. 4 (rot) Zahlen; `state` als freies JSON.
- **Interactions:** `ref` verweist auf `InteractionSpec`; `bindTo` muss auf eine definierte `entities[].id` zeigen; optionale `conditions`/`effects` sind Evaluations-DSL-Ausdrücke.
- **Extensions:** Alle Zusatzschlüssel liegen unter `extensions.*` (z. B. `extensions.acme.analytics`). Keine Kollision mit Top-Level-Feldern.

## Erweiterungspunkte

- **Extensions-Namespace:** Vendor-spezifische Konfigurationen, Versionierung und Feature-Flags ohne Schema-Bruch. Namen verwenden `<vendor>.<feature>`.
- **Abilities-Params:** Offene Schlüssel für Fähigkeiten (z. B. `dash.cooldown`, `voip.enabled`).
- **Interaction-DSL:** Bedingungen und Effekte können in der Pipeline auf konkrete Module (Scripting, Animations, Network) gemappt werden.

## Beispielinstanz: "Spontane Gespräche"

```json
{
  "metadata": { "name": "Spontane Gespräche", "version": "1.0.0" },
  "environment": {
    "sky": { "preset": "dusk" },
    "light": { "intensity": 3.5, "temperatureK": 4200, "direction": { "azimuth": 45, "elevation": 25 } },
    "audio": { "soundscapeRef": "evening-plaza", "volume": 0.4 }
  },
  "rules": {
    "movement": { "mode": "grounded", "speed": 5 },
    "gravity": { "enabled": true, "strength": 9.81 },
    "abilities": [
      { "id": "emote.waves", "enabled": true },
      { "id": "voip.local", "enabled": true, "params": { "range": 15, "duckMusic": true } }
    ]
  },
  "personality": {
    "mood": "social",
    "densityHints": { "min": 4, "max": 25, "peak": 20 }
  },
  "entities": [
    { "ref": "EntitySpec.avatar-spawn", "id": "spawn.main", "transform": { "pos": [0,0,0], "rot": [0,0,0,1], "scale": [1,1,1] } },
    { "ref": "EntitySpec.bench", "id": "bench.n1", "transform": { "pos": [2,0,-1], "rot": [0,0,0.2,0.98], "scale": [1,1,1] }, "state": { "seats": 3 } },
    { "ref": "EntitySpec.lantern", "id": "lantern.e1", "transform": { "pos": [-3,0,4], "rot": [0,0,0,1], "scale": [1,1,1] }, "state": { "intensity": 0.7 } }
  ],
  "interactions": [
    { "ref": "InteractionSpec.seat", "bindTo": "bench.n1", "conditions": [{ "if": "entity.freeSeats > 0" }], "effects": [{ "do": "sit(player)" }] },
    { "ref": "InteractionSpec.light-toggle", "bindTo": "lantern.e1", "effects": [{ "do": "toggleLight()" }] }
  ],
  "extensions": {
    "acme.analytics": { "sessionTag": "spontaneous-chat" }
  }
}
```

Diese Instanz erlaubt das Testen der Pipeline (Parsing, Validation, Mapping) und deckt Entity/Interaction-Verknüpfungen, Ability-Params sowie Extensions ab.
