# Claude Desktop und MCP

## Claude Desktop baut live in der App (MCP)

Ein kleiner lokaler MCP-Server (`mcp/server.ts`) verbindet Claude Desktop mit der geöffneten App. Claude ruft dieselben Werkzeuge auf wie der KI-Chat (`add_wall`, `fill_bricks`, `fit_to_opening`, `verify`, `look` …) und bekommt auch Screenshots zurück. Die Werkzeuge laufen in der App mit denselben Prüfungen, Limits und Überschneidungsmeldungen; jeder verändernde Aufruf ist ein eigener Undo-Schritt.

**Einrichten (einmalig)**
1. Im Projektordner `npm install`, dann `npm run mcp:token` – zeigt Token und Port (Standard 8765). Das Token liegt in `~/.cloudparty-mcp/token`.
2. Claude Desktop › Einstellungen › Entwickler › „Konfiguration bearbeiten“ und eintragen (Pfad anpassen, unter Windows `C:/…` mit Schrägstrichen):
   ```json
   {
     "mcpServers": {
       "cloudparty": {
         "command": "npx",
         "args": ["--prefix", "/PFAD/ZU/cloudparty", "tsx", "/PFAD/ZU/cloudparty/mcp/server.ts"]
       }
     }
   }
   ```
   Claude Desktop danach neu starten (Node.js muss installiert sein).
3. In der App: KI-Einstellungen › „Externe Steuerung (MCP)“ einschalten, Token einfügen (Port nur ändern, wenn nötig). Status zeigt „Verbunden“.
4. In Claude Desktop z. B.: „Rufe cloudparty_guide auf und baue ein Haus mit Fenster und einem Bild im Fenster.“

**Sicherheit:** Der Server hört nur auf `127.0.0.1` und verlangt das Token; die Steuerung ist standardmäßig aus und nur mit Baurecht wirksam. Rückfragen bei großen Bauten erscheinen als Bestätigungsdialog im Browser (oder entfallen im Freigabe-Modus „alles erlaubt“). Screenshots gehen an Claude Desktop. Inhalte aus der Welt bleiben Daten. Der Port lässt sich mit `CLOUDPARTY_MCP_PORT`, das Token mit `CLOUDPARTY_MCP_TOKEN` überschreiben. Die App und Claude Desktop müssen auf demselben Rechner laufen.

**Mehrere Instanzen:** Startet Claude Desktop den MCP-Server mehrfach (oder blieb ein Prozess vom letzten Start übrig), besitzt die erste Instanz den Port; jede weitere hängt sich an sie und ruft über sie in der App auf. Endet die erste, übernimmt die nächste beim nächsten Aufruf, und die App verbindet sich von selbst neu. Meldung „Port belegt und der Server dort passt nicht“: ein anderes Programm nutzt den Port oder ein Prozess mit anderem Token läuft; im Task-Manager die `node`-Prozesse beenden oder `CLOUDPARTY_MCP_PORT` setzen.

