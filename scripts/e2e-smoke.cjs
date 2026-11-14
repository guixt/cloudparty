/**
 * Smoke-Test: startet Vite, öffnet die Seite in Chromium, wartet auf
 * window.__cloudparty.ready, prüft Konsolenfehler und speichert einen Screenshot.
 *
 *   node scripts/e2e-smoke.cjs [--port 4099] [--shot pfad.png] [--url http://…] [--keep]
 *
 * Als Bibliothek: const { launchGame } = require('./scripts/e2e-smoke.cjs')
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const CHROMIUM_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function waitForHttp(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* noch nicht bereit */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server unter ${url} antwortet nicht`);
}

/** Startet Vite auf dem Port (falls keine url übergeben) und liefert { url, stop }. */
async function startVite(port) {
  const root = path.resolve(__dirname, '..');
  const child = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore', detached: true });
  const url = `http://127.0.0.1:${port}/`;
  await waitForHttp(url);
  return {
    url,
    stop() {
      try {
        process.kill(-child.pid);
      } catch {
        /* schon beendet */
      }
    },
  };
}

/**
 * Öffnet das Spiel und wartet, bis es bereit ist.
 * Rückgabe: { browser, page, errors } – errors sammelt Konsolen- und Seitenfehler.
 */
async function launchGame(url, { width = 1280, height = 720, browser: existing } = {}) {
  const { chromium } = require('playwright');
  const browser = existing ?? (await chromium.launch({ args: CHROMIUM_ARGS }));
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(url);
  await page.waitForFunction(() => window.__cloudparty && (window.__cloudparty.ready || window.__cloudparty.error), null, { timeout: 90000 });
  const startError = await page.evaluate(() => window.__cloudparty.error);
  if (startError) errors.push(`Startfehler: ${startError}`);
  return { browser, page, errors };
}

async function main() {
  const port = Number(arg('port', '4099'));
  const shot = arg('shot', path.resolve(__dirname, '..', '.temp', 'smoke.png'));
  const givenUrl = arg('url', null);
  const vite = givenUrl ? null : await startVite(port);
  // Smoke-Test läuft ohne Server, damit er überall gleich ist.
  const url = givenUrl ?? `${vite.url}?server=off`;
  let browser;
  try {
    const game = await launchGame(url);
    browser = game.browser;
    await game.page.waitForTimeout(1500);
    const info = await game.page.evaluate(() => {
      const { store, scene, ctx } = window.__cloudparty;
      return {
        entities: Object.keys(store.getState().entities).length,
        nodes: ctx.entityNodes.size,
        meshes: scene.meshes.length,
        camera: !!scene.activeCamera,
        mode: store.getState().mode,
      };
    });
    require('node:fs').mkdirSync(path.dirname(shot), { recursive: true });
    await game.page.screenshot({ path: shot });
    console.log(JSON.stringify({ ...info, errors: game.errors, shot }, null, 2));
    const ok = game.errors.length === 0 && info.entities > 0 && info.nodes > 0 && info.camera;
    if (!ok) process.exitCode = 1;
    else console.log('SMOKE OK');
  } finally {
    await browser?.close();
    vite?.stop();
  }
}

module.exports = { launchGame, startVite, waitForHttp, CHROMIUM_ARGS };
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
