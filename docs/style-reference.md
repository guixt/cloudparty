# Stil- und Bedienleitfaden

Verbindlich für alles Sichtbare. Grundlage sind die Bilder in `docs/reference/`:

- `cloudparty-original.jpg` – das Original (Cloud Party, ca. 2013). **Maßgeblich für Welt und Avatare.**
- `media-klassenzimmer.jpg`, `media-konferenzraum.jpg` – andere Produkte; nur Vorbild für **Medien-Tafeln, Sitzplätze, Gesten und Leisten**, nicht für den Look.

## Leitidee

Kreative Freiheit. Wer Baurecht hat, kann alles bauen, umfärben, mit Physik versehen, programmieren und mit Medien bestücken. Im Zweifel mehr Möglichkeiten anbieten, nicht weniger.

## Welt

- Heller, klarer Tag als Standard: kräftig blauer Himmel (oben ca. `#3f8fe8`, am Horizont heller `#bfe0fb`), einzelne weiße Wolken, darunter ein Wolkenmeer. Kein Pastell, kein Dunkelmodus-Look.
- Schwebende Insel: Oberseite sattes Grasgrün (ca. `#4f9e3a`, leicht variiert), Rand und Unterseite Fels/Erde (`#8a6f52` bis `#5b4a3a`), unten spitz zulaufend. Oberseite bei y = 0, überwiegend flach und gut bebaubar, nur sanfte Hügel am Rand.
- Sonne mit weichen, deutlich sichtbaren Schatten; leichter Dunst in der Ferne.
- Objekte dürfen groß, bunt und verspielt sein (im Original: riesiger Schraubenschlüssel, Schädel, Heißluftballon). Kräftige, gesättigte Farben.

## Avatare

- Menschliche Proportionen (ca. 1,75 m, 7–7,5 Kopfhöhen), keine Blob- oder Klötzchenfiguren. Getrennte Glieder: Kopf mit Haaren, Hals, Rumpf, Ober-/Unterarme, Hände, Ober-/Unterschenkel, Füße.
- Alltagskleidung über Farben: T-Shirt (Rumpf + kurze Ärmel), Hose, Schuhe. Haut- und Haarfarbe wählbar.
- Namensschild über dem Kopf: kleine, weiße Schrift mit dunklem Schatten bzw. halbtransparentem dunklem Hintergrund, immer zur Kamera gedreht.
- Gesten: Winken, Zustimmen (Nicken), Melden (Hand heben), Tanzen. Hinsetzen auf Bänke und Stühle.

## Oberfläche

- Dunkle, halbtransparente Flächen mit abgerundeten Ecken über der 3D-Ansicht (CSS-Klassen `cp-*` aus `src/styles.css`); Akzentfarbe Blau `#4da3ff`. Alle Texte auf Deutsch.
- „Local Chat" unten links: Titelzeile, Verlauf mit `[Name]: Text`, Eingabezeile darunter.
- Werkzeugleiste unten Mitte: Modus Spielen/Bauen, Gesten, Hilfe, Menü.
- Build-Modus: links Palette der Bausteine, rechts Inspector des gewählten Objekts, Gizmos direkt am Objekt.
- Die Position steht in der Adresszeile (`#insel,x,y,z,blick`), damit man Orte verlinken kann.

## Medien-Tafeln

- Flache Tafel mit schmalem dunklem Rahmen auf zwei Standfüßen oder frei schwebend; Inhalt füllt die Fläche (Bild, Webseite, Video, Folien, Text).
- Folien-Tafel mit Vor/Zurück direkt an der Tafel bedienbar.
