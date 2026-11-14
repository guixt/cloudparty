/**
 * Beispielskripte für den Skript-Editor. Sie nutzen ausschließlich die in
 * shared/scriptApi.ts dokumentierte API (wird in examples.test.ts geprüft).
 */
export interface ScriptExample {
  id: string;
  title: string;
  description: string;
  source: string;
}

export const SCRIPT_EXAMPLES: ScriptExample[] = [
  {
    id: 'tuer',
    title: 'Tür',
    description: 'Ein Klick öffnet bzw. schließt die Tür: Sie wird zur Seite geschoben und wieder zurück.',
    source: `// Tür: Klick öffnet und schließt.
// Die Tür gleitet beim Öffnen 1,5 Meter zur Seite (entlang der x-Achse).
let offen = false;
const weite = 1.5; // wie weit die Tür aufgeht (Meter)

function onClick(avatar) {
  offen = !offen;
  // Relativ verschieben: auf = nach rechts, zu = wieder zurück.
  self.move(offen ? weite : -weite, 0, 0);
  world.playSound(offen ? 'whoosh' : 'click');
  self.say(offen ? 'Die Tür ist offen.' : 'Die Tür ist zu.');
}
`,
  },
  {
    id: 'lichtschalter',
    title: 'Lichtschalter',
    description: 'Ein Klick schaltet um: Der Schalter leuchtet und alle Objekte mit dem Namen „Lampe" bekommen eine Nachricht.',
    source: `// Lichtschalter: schaltet alle Objekte namens "Lampe" an oder aus.
// Gib der Lampe den Namen "Lampe" und das Skript aus dem Beispiel "Lampe".
let an = false;

function onClick(avatar) {
  an = !an;
  // Der Schalter selbst leuchtet grün, wenn das Licht an ist.
  self.setEmissive(an ? '#33cc66' : '#000000');
  // Nachricht an die Lampe(n): 'an' oder 'aus'.
  world.send('Lampe', an ? 'an' : 'aus');
  world.playSound('click');
}
`,
  },
  {
    id: 'lampe',
    title: 'Lampe',
    description: 'Empfängt die Nachrichten „an" und „aus" vom Lichtschalter und leuchtet entsprechend.',
    source: `// Lampe: reagiert auf Nachrichten des Lichtschalters.
// Das Objekt muss "Lampe" heißen, damit world.send('Lampe', ...) es findet.
function onMessage(message, data, fromId) {
  if (message === 'an') {
    self.setEmissive('#fff1a8'); // warmes Licht
  } else if (message === 'aus') {
    self.setEmissive('#000000'); // Leuchten aus
  }
}
`,
  },
  {
    id: 'aufzug',
    title: 'Aufzug',
    description: 'Fährt regelmäßig zwischen zwei Höhen hin und her. Ein Klick startet oder stoppt die Fahrt.',
    source: `// Aufzug: pendelt zwischen der Startposition und "hub" Metern darüber.
const hub = 5;      // Hubhöhe in Metern
const tempo = 2;    // Meter pro Sekunde
let unten = 0;
let oben = 0;
let richtung = 1;   // 1 = hoch, -1 = runter
let faehrt = false;

function onStart() {
  // Die Höhe beim Start merken, damit der Aufzug überall funktioniert.
  unten = self.getPosition().y;
  oben = unten + hub;
}

function onClick(avatar) {
  faehrt = !faehrt;
  world.playSound('ding');
}

// onTick wird ca. 20-mal pro Sekunde aufgerufen; dt = Zeit seit dem letzten Aufruf.
function onTick(dt, time) {
  if (!faehrt) return;
  const p = self.getPosition();
  let y = p.y + richtung * tempo * dt;
  if (y >= oben) { y = oben; richtung = -1; }
  if (y <= unten) { y = unten; richtung = 1; }
  self.setPosition(p.x, y, p.z);
}
`,
  },
  {
    id: 'sprungfeld',
    title: 'Sprungfeld',
    description: 'Wer das Feld berührt, wird in die Luft katapultiert und hört ein Geräusch.',
    source: `// Sprungfeld: beim Berühren landet der Avatar 8 Meter höher.
const hoehe = 8;

function onTouch(avatar) {
  const p = self.getPosition();
  // Den Avatar direkt über das Feld versetzen (wirkt nur auf den eigenen Avatar).
  world.teleportAvatar(avatar.id, p.x, p.y + hoehe, p.z);
  world.playSound('whoosh');
}
`,
  },
  {
    id: 'farbwechsler',
    title: 'Farbwechsler',
    description: 'Wechselt von selbst jede Sekunde die Farbe, ganz ohne Klick.',
    source: `// Farbwechsler: ein Timer schaltet reihum durch die Farben.
const farben = ['#d9453a', '#f2c230', '#33cc66', '#3a7bd9', '#d94fa0'];
let nummer = 0;

function onStart() {
  // setInterval funktioniert wie im Browser: alle 1000 ms ausführen.
  setInterval(function () {
    nummer = (nummer + 1) % farben.length;
    self.setColor(farben[nummer]);
  }, 1000);
}
`,
  },
  {
    id: 'konfetti',
    title: 'Konfetti-Knopf',
    description: 'Ein Klick lässt es 3 Sekunden lang Konfetti regnen.',
    source: `// Konfetti-Knopf: Partikel an, nach 3 Sekunden wieder aus.
let aktiv = false;

function onClick(avatar) {
  if (aktiv) return; // nicht doppelt starten
  aktiv = true;
  self.setParticles(true, 'confetti');
  world.playSound('pop');
  setTimeout(function () {
    self.setParticles(false, 'confetti');
    aktiv = false;
  }, 3000);
}
`,
  },
  {
    id: 'begruesser',
    title: 'Begrüßer',
    description: 'Ein Trigger-Bereich, der Besucher mit Namen begrüßt und verabschiedet. Physik des Objekts auf „Trigger" stellen.',
    source: `// Begrüßer: Physik-Modus des Objekts muss "Trigger" sein.
function onTriggerEnter(avatar) {
  self.say('Hallo ' + avatar.name + ', willkommen!');
  world.playSound('ding');
}

function onTriggerExit(avatar) {
  self.say('Tschüss ' + avatar.name + '!');
}
`,
  },
  {
    id: 'chatbot',
    title: 'Chat-Bot',
    description: 'Antwortet im Chat, wenn jemand „hallo" oder „hilfe" schreibt.',
    source: `// Chat-Bot: liest den Chat mit und antwortet auf Stichworte.
function onChat(text, avatar) {
  const t = String(text).toLowerCase();
  const name = avatar ? avatar.name : 'du';
  if (t.indexOf('hallo') >= 0) {
    // Die Antwort enthält das Stichwort nicht, sonst antwortet der Bot sich selbst.
    self.say('Hi ' + name + ', schön, dich zu sehen!');
  } else if (t.indexOf('hilfe') >= 0) {
    self.say('Klicke Objekte an - manche tun etwas.');
  }
}
`,
  },
  {
    id: 'diashow-fernbedienung',
    title: 'Diashow-Fernbedienung',
    description: 'Ein Klick schickt „weiter" an die Folien-Tafel mit dem Namen „Tafel".',
    source: `// Fernbedienung: blättert bei der Tafel namens "Tafel" eine Folie weiter.
function onClick(avatar) {
  world.send('Tafel', 'weiter');
  world.playSound('click');
}
`,
  },
  {
    id: 'diashow-tafel',
    title: 'Diashow-Tafel (Empfänger)',
    description: 'Gehört auf die Folien-Tafel: schaltet bei „weiter" bzw. „zurück" die Folie um.',
    source: `// Folien-Tafel: reagiert auf die Fernbedienung.
// Das Objekt braucht den Namen "Tafel" und eine Folien-Fläche (Medien: Folien).
function onMessage(message, data, fromId) {
  if (message === 'weiter') {
    self.nextSlide();
  } else if (message === 'zurück') {
    self.prevSlide();
  }
}
`,
  },
];
