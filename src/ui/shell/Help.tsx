import type { Props } from './types';

const HELP: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Bewegen',
    rows: [
      ['Bewegen', 'W A S D oder Pfeiltasten'],
      ['Rennen', 'Shift'],
      ['Springen', 'Leertaste'],
      ['Fliegen', 'F'],
      ['Ich-Perspektive ein/aus', 'V'],
      ['Kamera', 'Maus ziehen, Mausrad zum Zoomen'],
      ['Gesten', '1 – 4'],
      ['Chat', 'Enter'],
    ],
  },
  {
    title: 'Bauen',
    rows: [
      ['Baumodus', 'Tab'],
      ['Auswählen', 'Klick'],
      ['Verschieben / Drehen / Skalieren', '1 / 2 / 3'],
      ['Duplizieren', 'Strg + D'],
      ['Löschen', 'Entf'],
      ['Rückgängig', 'Strg + Z'],
      ['Skript bearbeiten', 'E'],
      ['Ansicht drehen', 'Mitteltaste ziehen (oder Rechtstaste, Alt + Linkstaste)'],
      ['Ansicht verschieben', 'Shift + Mitteltaste, oder W A S D / Q E'],
      ['Schneller bewegen', 'Shift gedrückt halten (zusammen mit W A S D / Q E)'],
      ['Zoomen', 'Mausrad oder Strg + Mitteltaste'],
      ['Standardansichten', 'Ziffernblock 1 / 3 / 7 (Strg: Gegenseite), 4 6 8 2 drehen'],
      ['Auf Auswahl zentrieren', 'F oder Ziffernblock-Punkt'],
    ],
  },
  {
    title: 'Allgemein',
    rows: [
      ['Hilfe', 'H oder F1'],
      ['Ort teilen', 'Adresse kopieren oder Menü › Diese Insel'],
    ],
  },
];

export function Help({ shell }: Props) {
  return (
    <div className="cp-modal-backdrop" data-testid="help-dialog" onMouseDown={(e) => e.target === e.currentTarget && shell.setHelp(false)}>
      <div className="cp-modal cps-help">
        <div className="cps-menu-head">
          <h2 className="cps-h2">Hilfe: Steuerung</h2>
          <button className="cp-button" data-testid="help-close" onClick={() => shell.setHelp(false)}>
            Schließen
          </button>
        </div>
        <div className="cps-help-grid">
          {HELP.map((group) => (
            <section key={group.title}>
              <h3 className="cp-heading">{group.title}</h3>
              <table className="cps-keys">
                <tbody>
                  {group.rows.map(([action, keys]) => (
                    <tr key={action}>
                      <td>{action}</td>
                      <td>
                        <kbd>{keys}</kbd>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
