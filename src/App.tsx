import './styles.css';

const highlights = [
  {
    title: 'WorldSpec-Modelle visualisieren',
    description:
      'Stelle Welten und Entities übersichtlich dar. Nutze Presets, um Skybox, Licht und Audio zu konfigurieren.',
  },
  {
    title: 'Interaktionen planen',
    description:
      'Verknüpfe Entities mit Aktionen und Bedingungen. So erkennst du sofort, welche Mechaniken fehlen.',
  },
  {
    title: 'Live-Prototyping',
    description:
      'Experimentiere mit Regeln und Fähigkeiten in einer React-basierten UI und exportiere sie als JSON.',
  },
];

function App() {
  return (
    <div className="page">
      <header className="hero">
        <div className="badge">Neu in Cloudparty 2.0</div>
        <h1>
          Baue Welten schneller mit einer <span className="accent">React</span>-Anwendung
        </h1>
        <p className="lede">
          Die neue Cloudparty-UI kombiniert WorldSpec-Validierung, visuelle Konfiguration und schnelle Iteration. Starte
          eine lokale Dev-Session und sieh deine Änderungen sofort.
        </p>
        <div className="actions">
          <a className="button primary" href="https://vitejs.dev/guide/" target="_blank" rel="noreferrer">
            Dev-Server starten
          </a>
          <a className="button ghost" href="https://react.dev/" target="_blank" rel="noreferrer">
            Mehr über React
          </a>
        </div>
      </header>

      <main className="grid">
        {highlights.map(({ title, description }) => (
          <article className="card" key={title}>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
        <article className="card secondary">
          <h2>Wie starte ich?</h2>
          <ol>
            <li>Abhängigkeiten installieren: <code>npm install</code></li>
            <li>Dev-Server starten: <code>npm run dev</code></li>
            <li>Im Browser öffnen: <code>http://localhost:5173</code></li>
          </ol>
          <p className="hint">Passe <code>src/App.tsx</code> an, um deine ersten UI-Komponenten zu bauen.</p>
        </article>
      </main>

      <footer className="footer">
        <div>
          <p className="muted">Cloudparty React Playground</p>
          <p className="muted small">Unterstützt Hot Module Replacement für schnelle Iterationen.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
