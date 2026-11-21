/**
 * Erzeugt Vorschaubilder für alle Bausteine der Bau-Palette: public/previews/<key>.webp (128×128).
 *   node scripts/previews.cjs [--port 4098] [--only key1,key2]
 * Jeder Baustein wird allein auf hellem Hintergrund aus dem echten Spiel gerendert.
 */
const fs = require('node:fs');
const path = require('node:path');
const { launchGame, startVite } = require('./e2e-smoke.cjs');

const SIZE = 128;
const arg = (n, f) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : f);

async function main() {
  const out = path.resolve(__dirname, '..', 'public', 'previews');
  fs.mkdirSync(out, { recursive: true });
  const only = arg('only', '') ? arg('only', '').split(',') : null;
  const vite = await startVite(Number(arg('port', '4098')));
  const { browser, page } = await launchGame(vite.url + '?server=off', { width: 480, height: 480 });
  try {
    await page.evaluate(() => {
      localStorage.setItem('cloudparty.quality', 'medium');
      document.querySelectorAll('.cp-ui, .cp-modal, .cp-welcome').forEach((e) => e.remove());
    });
    const keys = await page.evaluate(async () => (await import('/src/build/catalog.ts')).CATALOG.map((i) => i.key));
    let n = 0;
    for (const key of keys) {
      if (only && !only.includes(key)) continue;
      const data = await page.evaluate(async (key) => {
        const { CATALOG, createFromItem } = await import('/src/build/catalog.ts');
        const cp = window.__cloudparty;
        const s = cp.store.getState();
        const item = CATALOG.find((i) => i.key === key);
        const e = createFromItem(item, [15, 0, 15], item.anchor === 'center' ? 0.5 * (item.scale[1]) : 0);
        s.addEntity(e, { source: 'local' });
        s.setMode('build');
        await new Promise((r) => setTimeout(r, 500));
        const sc = cp.scene;
        const mine = (m) => m.metadata && m.metadata.entityId === e.id;
        const meshes = sc.meshes.filter((m) => mine(m) && m.getTotalVertices() > 0);
        const hidden = [];
        for (const m of sc.meshes) if (!mine(m) && m.isEnabled() && m.isVisible) { hidden.push(m); m.isVisible = false; }
        if (meshes.length === 0) { for (const m of hidden) m.isVisible = true; s.removeEntity(e.id, { source: 'local' }); return null; }
        let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (const m of meshes) {
          const b = m.getBoundingInfo().boundingBox;
          for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], [b.minimumWorld.x, b.minimumWorld.y, b.minimumWorld.z][i]); max[i] = Math.max(max[i], [b.maximumWorld.x, b.maximumWorld.y, b.maximumWorld.z][i]); }
        }
        const center = min.map((v, i) => (v + max[i]) / 2);
        const diag = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
        const cam = sc.activeCamera;
        const prev = sc.clearColor.clone();
        sc.clearColor.set(0.87, 0.9, 0.96, 1);
        cam.lowerRadiusLimit = 0.1; cam.upperRadiusLimit = 1000;
        cam.setTarget(cam.target.clone().copyFromFloats(center[0], center[1], center[2]));
        cam.alpha = -Math.PI / 4; cam.beta = 1.15; cam.radius = Math.max(0.6, diag * 1.45);
        cam.minZ = 0.05;
        await new Promise((r) => setTimeout(r, 300));
        sc.render();
        const canvas = document.querySelector('canvas');
        const side = Math.min(canvas.width, canvas.height);
        const o = document.createElement('canvas');
        o.width = o.height = 128;
        const c = o.getContext('2d');
        c.fillStyle = '#dfe6f5'; c.fillRect(0, 0, 128, 128);
        c.drawImage(canvas, (canvas.width - side) / 2, (canvas.height - side) / 2, side, side, 0, 0, 128, 128);
        const url = o.toDataURL('image/webp', 0.85);
        sc.clearColor.copyFrom(prev);
        for (const m of hidden) m.isVisible = true;
        s.removeEntity(e.id, { source: 'local' });
        return url;
      }, key);
      if (!data) { console.log('übersprungen (nichts Sichtbares):', key); continue; }
      fs.writeFileSync(path.join(out, `${key}.webp`), Buffer.from(data.split(',')[1], 'base64'));
      n++;
    }
    console.log(`${n} Vorschaubilder in ${out}`);
  } finally {
    await browser.close();
    vite.stop();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
