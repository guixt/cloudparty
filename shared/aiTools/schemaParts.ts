/** Wiederverwendete JSON-Schema-Bausteine der Werkzeug-Schemas. */
export const vec3 = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
export const color = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: 'Farbe als #RRGGBB' };
export const material = {
  type: 'object',
  properties: {
    color,
    emissive: color,
    metallic: { type: 'number', minimum: 0, maximum: 1 },
    roughness: { type: 'number', minimum: 0, maximum: 1 },
    alpha: { type: 'number', minimum: 0, maximum: 1 },
    preset: { enum: ['standard', 'metall', 'chrom', 'gold', 'glas', 'spiegel', 'lack', 'holz', 'stein', 'gummi', 'neon', 'hologramm'], description: 'Materialvoreinstellung (setzt sinnvolle Werte; einzelne Felder überschreiben sie)' },
    reflect: { type: 'number', minimum: 0, maximum: 1, description: 'Stärke der Umgebungs-Spiegelung' },
    clearcoat: { type: 'number', minimum: 0, maximum: 1, description: 'Klarlackschicht (glänzender Film)' },
    glass: { type: 'number', minimum: 0, maximum: 1, description: 'Glas: durchsichtig mit Lichtbrechung' },
    ior: { type: 'number', minimum: 1, maximum: 2.5, description: 'Brechungsindex (Glas ≈ 1.5)' },
    mirror: { type: 'boolean', description: 'Echtzeit-Spiegel (nur für ebene Flächen sinnvoll, kostet Leistung)' },
    emissive_intensity: { type: 'number', minimum: 0, maximum: 5, description: 'Helligkeit des Leuchtens' },
    pattern: { enum: ['none', 'karo', 'streifen', 'rauschen', 'ziegel', 'holz', 'wellen'] },
    pattern_color: color,
    uv_scale: { type: 'number', minimum: 0.1, maximum: 50, description: 'Wiederholung des Musters' },
  },
};
export const physics = {
  type: 'object',
  properties: {
    mode: { enum: ['none', 'static', 'dynamic', 'trigger'] },
    mass: { type: 'number', minimum: 0.01 },
    friction: { type: 'number', minimum: 0, maximum: 5 },
    restitution: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['mode'],
};
export const particles = {
  type: 'object',
  properties: { preset: { enum: ['fire', 'sparks', 'smoke', 'confetti'] }, enabled: { type: 'boolean' }, rate: { type: 'number', minimum: 1, maximum: 500 } },
  required: ['preset', 'enabled'],
};
export const transformProps = {
  position: { ...vec3, description: 'Mittelpunkt in Metern (x, y, z); y nach oben, Inseloberseite bei y = 0' },
  rotation_degrees: { ...vec3, description: 'Drehung in Grad (x, y, z)' },
  face_toward: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3, description: 'Dreht das Objekt um die Senkrechte so, dass seine Vorderseite zum Punkt [x, z] (oder [x, y, z]) schaut. Für Tafeln, Spiegel und Schilder statt rotation_degrees zu raten; gilt nach `position`.' },
  scale: { ...vec3, description: 'Größe pro Achse (Faktor, 1 = Standardgröße)' },
};
