// Screenshot a mock-up page in headless Chromium, desktop (light) and phone (dark).
//
// Usage: node screenshot.cjs <page.html> <out_dir> [three_dir]
//   three_dir: folder that contains node_modules/three (default: current folder).
//
// Any cdn.jsdelivr.net/npm/three@<v>/... request is served from the local copy,
// because sandboxes often block the CDN. Google Fonts are blocked on purpose so
// you also see the fallback fonts. Prints horizontal overflow and script errors.
// Saves <out_dir>/stage-desktop.png, stage-phone.png, full-desktop.png, full-phone.png.
// For interactions, copy this file and add clicks; wait on page state, not sleeps
// (software WebGL is slow, so in-scene timers run slower than real time).
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('Playwright not found: npm install playwright (or use the preinstalled one).'); process.exit(2); }

const [page, outDir, threeDir = process.cwd()] = process.argv.slice(2);
if (!page || !outDir) { console.error('Usage: node screenshot.cjs <page.html> <out_dir> [three_dir]'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let failed = false;
  for (const [name, viewport, scheme] of [['desktop', { width: 1280, height: 860 }, 'light'], ['phone', { width: 400, height: 860 }, 'dark']]) {
    const p = await browser.newPage({ viewport, colorScheme: scheme });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errors.push(m.text()); });
    await p.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.+)$/, (route) => {
      const rel = route.request().url().match(/three@[^/]+\/(.+)$/)[1];
      const file = path.join(threeDir, 'node_modules/three', rel);
      if (!fs.existsSync(file)) return route.abort();
      route.fulfill({ body: fs.readFileSync(file), contentType: 'application/javascript' });
    });
    await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await p.goto('file://' + path.resolve(page));
    await p.waitForTimeout(2500);
    const stage = p.locator('.stage, canvas').first();
    if (await stage.count()) await stage.screenshot({ path: path.join(outDir, `stage-${name}.png`) });
    await p.screenshot({ path: path.join(outDir, `full-${name}.png`), fullPage: true });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    console.log(`${name}: horizontal overflow ${overflow}px, errors ${errors.length ? JSON.stringify(errors) : 'none'}`);
    if (overflow > 0 || errors.length) failed = true;
    await p.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
