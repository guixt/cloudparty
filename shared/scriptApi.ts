/**
 * Skript-API: was ein Objekt-Skript sehen und tun darf.
 * VERTRAG: Diese Datei wird nur vom Koordinator geändert.
 *
 * Ein Skript ist JavaScript-Quelltext, der Ereignisfunktionen auf oberster
 * Ebene definiert, z. B.:
 *
 *   let offen = false;
 *   function onClick(avatar) {
 *     offen = !offen;
 *     self.setColor(offen ? '#33cc66' : '#cc3333');
 *     self.say('Hallo ' + avatar.name);
 *   }
 *
 * Das Skript läuft isoliert (Web Worker), ohne DOM- und Netzzugriff. Alle
 * API-Aufrufe sind asynchrone Befehle an die Welt; Lesefunktionen liefern den
 * zuletzt bekannten Zustand.
 */

export const SCRIPT_EVENTS = [
  { name: 'onStart', signature: 'onStart()', description: 'Einmal beim Laden des Skripts.' },
  { name: 'onClick', signature: 'onClick(avatar)', description: 'Ein Avatar klickt das Objekt an. avatar = { id, name }.' },
  { name: 'onTouch', signature: 'onTouch(avatar)', description: 'Ein Avatar berührt das Objekt.' },
  { name: 'onTriggerEnter', signature: 'onTriggerEnter(avatar)', description: 'Ein Avatar betritt das Objekt (Physik-Modus „Trigger").' },
  { name: 'onTriggerExit', signature: 'onTriggerExit(avatar)', description: 'Ein Avatar verlässt den Trigger.' },
  { name: 'onTick', signature: 'onTick(dt, time)', description: 'Regelmäßig, ca. 20-mal pro Sekunde. dt und time in Sekunden.' },
  { name: 'onMessage', signature: 'onMessage(message, data, fromId)', description: 'Nachricht von einem anderen Skript.' },
  { name: 'onChat', signature: 'onChat(text, avatar)', description: 'Jemand schreibt im Chat.' },
] as const;
export type ScriptEventName = (typeof SCRIPT_EVENTS)[number]['name'];

export interface ScriptApiDoc {
  name: string;
  signature: string;
  description: string;
}

/** Methoden des globalen Objekts `self` im Skript (das eigene Objekt). */
export const SCRIPT_SELF_API: ScriptApiDoc[] = [
  { name: 'id', signature: 'self.id', description: 'ID des eigenen Objekts.' },
  { name: 'getPosition', signature: 'self.getPosition() → {x, y, z}', description: 'Aktuelle Position.' },
  { name: 'setPosition', signature: 'self.setPosition(x, y, z)', description: 'Position setzen.' },
  { name: 'move', signature: 'self.move(dx, dy, dz)', description: 'Relativ verschieben.' },
  { name: 'getRotation', signature: 'self.getRotation() → {x, y, z}', description: 'Drehung in Grad (Euler).' },
  { name: 'setRotation', signature: 'self.setRotation(xGrad, yGrad, zGrad)', description: 'Drehung in Grad setzen.' },
  { name: 'rotate', signature: 'self.rotate(dxGrad, dyGrad, dzGrad)', description: 'Relativ drehen.' },
  { name: 'setScale', signature: 'self.setScale(x, y, z)', description: 'Größe setzen.' },
  { name: 'setColor', signature: "self.setColor('#rrggbb')", description: 'Farbe setzen.' },
  { name: 'setEmissive', signature: "self.setEmissive('#rrggbb')", description: 'Leuchtfarbe setzen (\'#000000\' = aus).' },
  { name: 'setAlpha', signature: 'self.setAlpha(0..1)', description: 'Durchsichtigkeit setzen.' },
  { name: 'setParticles', signature: "self.setParticles(an, preset?)", description: "Partikel ein/aus; preset: 'fire' | 'sparks' | 'smoke' | 'confetti'." },
  { name: 'applyImpulse', signature: 'self.applyImpulse(x, y, z)', description: 'Stoß auf ein dynamisches Physikobjekt.' },
  { name: 'setPhysics', signature: "self.setPhysics('none' | 'static' | 'dynamic' | 'trigger')", description: 'Physik-Modus wechseln.' },
  { name: 'say', signature: 'self.say(text)', description: 'Text im lokalen Chat ausgeben.' },
  { name: 'getState', signature: 'self.getState(key)', description: 'Wert aus dem Objektzustand lesen.' },
  { name: 'setState', signature: 'self.setState(key, value)', description: 'Wert im Objektzustand speichern (bleibt erhalten).' },
  { name: 'setImage', signature: 'self.setImage(url)', description: 'Bild einer Medien-Fläche setzen.' },
  { name: 'setUrl', signature: 'self.setUrl(url)', description: 'Webseite/Video einer Medien-Fläche setzen.' },
  { name: 'setText', signature: 'self.setText(text)', description: 'Text einer Text-Fläche setzen.' },
  { name: 'nextSlide', signature: 'self.nextSlide()', description: 'Nächste Folie einer Folien-Fläche.' },
  { name: 'prevSlide', signature: 'self.prevSlide()', description: 'Vorherige Folie.' },
  { name: 'moveTo', signature: "self.moveTo(x, y, z, sekunden = 1, kurve = 'inOut')", description: "Sanft zu einer Position bewegen (kurve: 'linear' | 'inOut' | 'out'); die Position ist sofort gesetzt, nur die Darstellung gleitet." },
  { name: 'rotateTo', signature: "self.rotateTo(xGrad, yGrad, zGrad, sekunden = 1, kurve = 'inOut')", description: 'Sanft zu einer Drehung (Grad) drehen.' },
  { name: 'scaleTo', signature: "self.scaleTo(x, y, z, sekunden = 1, kurve = 'inOut')", description: 'Sanft auf eine Größe skalieren.' },
];

/** Methoden des globalen Objekts `world` im Skript. */
export const SCRIPT_WORLD_API: ScriptApiDoc[] = [
  { name: 'send', signature: 'world.send(zielIdOderName, message, data?)', description: 'Nachricht an das Skript eines anderen Objekts.' },
  { name: 'broadcast', signature: 'world.broadcast(message, data?)', description: 'Nachricht an alle Skripte der Insel.' },
  { name: 'playSound', signature: "world.playSound(name)", description: "Ton abspielen: 'click' | 'ding' | 'pop' | 'whoosh' | 'error'." },
  { name: 'playTone', signature: 'world.playTone(frequenzHz, dauerSek)', description: 'Sinuston abspielen.' },
  { name: 'teleportAvatar', signature: 'world.teleportAvatar(avatarId, x, y, z)', description: 'Avatar versetzen (wirkt nur auf den lokalen Avatar).' },
  { name: 'time', signature: 'world.time() → Sekunden', description: 'Sekunden seit Skriptstart.' },
  { name: 'group', signature: "world.group('Name')", description: "Ganze Gruppe steuern (Name oder Gruppen-id): .moveBy(dx,dy,dz,sek?,kurve?), .rotateBy(xGrad,yGrad,zGrad,sek?,kurve?,pivot?) dreht um die Mitte der Gruppe (pivot = [x,y,z] optional; 360 Grad = einmal im Kreis), .setColor('#rrggbb'), .setEmissive('#rrggbb'), .setAlpha(0..1); Lesen: .count, .center() → {x,y,z}, .ids." },
  { name: 'find', signature: 'world.find(nameOderId) → {id, name, group, ref, x, y, z} | null', description: 'Anderes Objekt finden (Position vom letzten Abgleich, ca. 4-mal pro Sekunde).' },
  { name: 'findAll', signature: 'world.findAll(gruppeOderNamensanfang) → Liste', description: 'Mehrere Objekte finden (höchstens 200), z. B. alle Teile einer Gruppe.' },
  { name: 'avatars', signature: 'world.avatars() → [{id, name, x, y, z}]', description: 'Avatare mit Position (ca. 4-mal pro Sekunde aktualisiert; derzeit der lokale Avatar).' },
  { name: 'spawn', signature: "world.spawn(ref, {x, y, z, scale?, color?, name?, physics?, mass?, lifetime?}) → id", description: "Objekt erzeugen (ref z. B. 'EntitySpec.sphere'); lifetime = Sekunden bis zum Verschwinden; erzeugte Objekte verschwinden beim Verlassen des Spielmodus." },
  { name: 'destroy', signature: 'world.destroy(id)', description: 'Ein mit world.spawn erzeugtes Objekt entfernen.' },
  { name: 'log', signature: 'log(...werte)', description: 'In die Skript-Konsole schreiben (auch console.log).' },
  { name: 'setTimeout', signature: 'setTimeout(fn, ms) / setInterval(fn, ms)', description: 'Timer wie im Browser; clearTimeout/clearInterval ebenso.' },
];

export const SCRIPT_SOUND_NAMES = ['click', 'ding', 'pop', 'whoosh', 'error'] as const;

/** Maximale Laufzeit eines einzelnen Ereignisaufrufs, danach wird das Skript beendet. */
export const SCRIPT_EVENT_TIMEOUT_MS = 250;
export const SCRIPT_TICK_HZ = 20;

/** Erlaubte Bausteine für world.spawn. */
export const SCRIPT_SPAWN_REFS = ['EntitySpec.box', 'EntitySpec.sphere', 'EntitySpec.cylinder', 'EntitySpec.cone', 'EntitySpec.torus', 'EntitySpec.plane', 'EntitySpec.brick'] as const;
export const SCRIPT_SPAWN_LIMIT_PER_SCRIPT = 100;
export const SCRIPT_SPAWN_LIMIT_WORLD = 300;
export const SCRIPT_SPAWN_RATE_PER_SEC = 20;
export const SCRIPT_TWEEN_MAX_SECONDS = 120;
export const SCRIPT_TWEEN_EASES = ['linear', 'inOut', 'out'] as const;
export type ScriptEase = (typeof SCRIPT_TWEEN_EASES)[number];
/** Obergrenze der Objekte, die der Skript-Index (world.find …) enthält. */
export const SCRIPT_INDEX_MAX = 1500;
/** Höchste Zahl Objekte, die ein Gruppenbefehl auf einmal ändert. */
export const SCRIPT_GROUP_MAX = 1000;
