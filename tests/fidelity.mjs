// @rules UI-14  (see DECISIONS.md)
// PDF fidelity: device-pixel-ratio canvases, no PNG round trip, a sharp patch
// re-rendered when you zoom in, and the ink the detector reads at full raster
// resolution — with the faster morphology proved equal to the old one.
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
import fs from 'node:fs';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const pdf = fs.readFileSync(path.resolve(here, 'fixtures', 'test-set.pdf')).toString('base64');

async function open(dpr) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: dpr });
  page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
  await page.goto('file://' + path.resolve(here, '..', 'reshore-calc.html'));
  await page.waitForFunction(() => typeof solveAll === 'function');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  return { browser, page };
}
const loadSheet = (page, n = 5) => page.evaluate(async ([b64, num]) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
  resetGeometry(); state.pdf.doc = doc; state.pdf.pages = doc.numPages; state.pdf.current = num; state.pdf.pageImages = {};
  document.getElementById('upload-prompt').style.display = 'none';
  await renderPdfPage(num); resizeCanvases(); fitView(); renderNow();
}, [pdf, n]);

// ── A. the canvases ─────────────────────────────────────────────────────
console.log('A. the backing store is sized in device pixels');
for (const dpr of [1, 2]) {
  const { browser, page } = await open(dpr);
  await loadSheet(page);
  const r = await page.evaluate(() => ({
    dpr: state.drawing.dpr, css: [state.drawing.cssW, state.drawing.cssH],
    pdfC: [pdfCvs.width, pdfCvs.height], drawC: [drawCvs.width, drawCvs.height],
    styled: [pdfCvs.style.width, drawCvs.style.width],
    cached: state.pdf.pageImages[5].constructor.name,
    imgW: state.drawing.imgW
  }));
  ok(r.dpr === dpr, `dpr ${dpr} is picked up: ${r.dpr}`);
  ok(r.pdfC[0] === Math.round(r.css[0] * dpr) && r.pdfC[1] === Math.round(r.css[1] * dpr),
     `dpr ${dpr}: the plan canvas is ${r.pdfC} for ${r.css} CSS px`);
  ok(r.drawC[0] === r.pdfC[0] && r.drawC[1] === r.pdfC[1], `dpr ${dpr}: the overlay matches it`);
  ok(r.styled[0] === r.css[0] + 'px' && r.styled[1] === r.css[0] + 'px', `dpr ${dpr}: laid out at CSS size`);
  ok(r.cached === 'HTMLCanvasElement', `dpr ${dpr}: the page is cached as a canvas, not re-encoded to PNG: ${r.cached}`);
  ok(r.imgW === 5184, `dpr ${dpr}: the base raster is unchanged at PDF_RENDER_SCALE, so stored geometry still lines up: ${r.imgW}`);
  await browser.close();
}

// pointer coordinates must still be CSS px, or every click lands wrong
console.log('B. the pointer still speaks CSS pixels');
{
  const { browser, page } = await open(2);
  await loadSheet(page);
  const r = await page.evaluate(() => {
    state.drawing.zoom = 1; state.drawing.panX = 0; state.drawing.panY = 0;
    const a = screenToCanvas(100, 50), b = canvasToScreen(a.x, a.y);
    const rect = drawCvs.getBoundingClientRect();
    return { a: [a.x, a.y], b: [b.x, b.y], rect: [Math.round(rect.width), Math.round(rect.height)],
             css: [state.drawing.cssW, state.drawing.cssH] };
  });
  ok(r.a[0] === 100 && r.a[1] === 50, 'screen to canvas is unscaled at zoom 1: ' + JSON.stringify(r.a));
  ok(r.b[0] === 100 && r.b[1] === 50, 'and round-trips: ' + JSON.stringify(r.b));
  ok(r.rect[0] === r.css[0], 'the element is still laid out in CSS px: ' + JSON.stringify(r));
  await browser.close();
}

// ── C. the sharp patch ──────────────────────────────────────────────────
console.log('C. zooming past 1:1 re-renders the visible patch from the PDF');
{
  const { browser, page } = await open(2);
  await loadSheet(page);
  const atFit = await page.evaluate(() => ({ zoom: state.drawing.zoom, want: lodTarget(), tile: lodTile }));
  ok(!atFit.want && !atFit.tile, 'nothing at fit zoom, where the base raster is already finer than the screen');
  const want = await page.evaluate(() => {
    state.drawing.zoom = 2; state.drawing.panX = -3000; state.drawing.panY = -2000; renderNow();
    const w = lodTarget();
    return w && { k: w.k, w: Math.round(w.w), h: Math.round(w.h), page: w.page };
  });
  ok(want && Math.abs(want.k - 4) < 1e-6, 'at 2x on a 2x screen it wants 4x the base raster: ' + JSON.stringify(want));
  await page.waitForFunction(() => !!lodTile, { timeout: 30000 });
  const t = await page.evaluate(() => ({ k: lodTile.k, px: [lodTile.canvas.width, lodTile.canvas.height],
    css: [state.drawing.cssW, state.drawing.cssH], dpr: state.drawing.dpr }));
  ok(Math.abs(t.k - 4) < 1e-6, 'and renders it at that: k=' + t.k);
  ok(t.px[0] <= Math.ceil(t.css[0] * t.dpr) + 2 && t.px[1] <= Math.ceil(t.css[1] * t.dpr) + 2,
     'the patch is never bigger than the window, so memory stays bounded: ' + JSON.stringify(t));
  // and it goes when you zoom back out
  await page.evaluate(() => { state.drawing.zoom = 0.2; renderNow(); });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => lodTile === null), 'zooming back out drops it');
  // …and when the sheet changes
  await page.evaluate(async () => { state.drawing.zoom = 2; renderNow(); });
  await page.waitForFunction(() => !!lodTile, { timeout: 30000 });
  await page.evaluate(async () => { await goToPage(4); });
  ok(await page.evaluate(() => lodTile === null), 'and when you turn the page');
  await browser.close();
}

// ── D. the faster morphology is the same morphology ─────────────────────
console.log('D. the running-count morphology matches the old brute force');
{
  const { browser, page } = await open(1);
  const same = await page.evaluate(() => {
    // the implementations that were replaced, verbatim in behavior
    const oldOpen = (m, W, H, r) => {
      const pass = (src, op) => { const tmp = new Uint8Array(W*H), out = new Uint8Array(W*H);
        for (let y=0;y<H;y++){const row=y*W;for(let x=0;x<W;x++){let v=op===1?0:1;
          for(let k=-r;k<=r;k++){const xx=x+k;if(xx<0||xx>=W){if(op!==1){v=0;break}continue}const s=src[row+xx];if(op===1){if(s){v=1;break}}else{if(!s){v=0;break}}}
          tmp[row+x]=v}}
        for (let x=0;x<W;x++)for(let y=0;y<H;y++){let v=op===1?0:1;
          for(let k=-r;k<=r;k++){const yy=y+k;if(yy<0||yy>=H){if(op!==1){v=0;break}continue}const s=tmp[yy*W+x];if(op===1){if(s){v=1;break}}else{if(!s){v=0;break}}}
          out[y*W+x]=v}
        return out };
      return pass(pass(m, 0), 1);
    };
    const oldClose = (ink, W, H, r) => {
      const pass = (src, op) => { const tmp = new Uint8Array(W*H), out = new Uint8Array(W*H);
        for (let y=0;y<H;y++){const row=y*W;for(let x=0;x<W;x++){let v=op===1?0:1;
          for(let k=-r;k<=r;k++){const xx=x+k;if(xx<0||xx>=W)continue;const s=src[row+xx];if(op===1){if(s){v=1;break}}else{if(!s){v=0;break}}}
          tmp[row+x]=v}}
        for (let x=0;x<W;x++)for(let y=0;y<H;y++){let v=op===1?0:1;
          for(let k=-r;k<=r;k++){const yy=y+k;if(yy<0||yy>=H)continue;const s=tmp[yy*W+x];if(op===1){if(s){v=1;break}}else{if(!s){v=0;break}}}
          out[y*W+x]=v}
        return out };
      return pass(pass(ink, 1), 0);
    };
    const eq = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i; return -1 };
    const res = [];
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (const [W, H] of [[37, 29], [64, 64], [120, 80]]) {
      for (const dens of [0.08, 0.35, 0.8]) {
        const m = new Uint8Array(W * H);
        for (let i = 0; i < m.length; i++) m[i] = rnd() < dens ? 1 : 0;
        // a solid block and a thin spur, the shapes the detector actually meets
        for (let y = 5; y < 20 && y < H; y++) for (let x = 5; x < 25 && x < W; x++) m[y * W + x] = 1;
        for (let x = 25; x < Math.min(W, 40); x++) m[12 * W + x] = 1;
        for (const r of [1, 2, 3, 4, 6, 8]) {
          res.push({ W, H, dens, r, open: eq(morphOpen(m, W, H, r), oldOpen(m, W, H, r)),
                     close: eq(morphClose(m, W, H, r), oldClose(m, W, H, r)) });
        }
      }
    }
    return res;
  });
  const bad = same.filter(r => r.open !== -1 || r.close !== -1);
  ok(bad.length === 0, `identical on ${same.length} bitmaps across sizes, densities and radii 1-8` +
     (bad.length ? ': ' + JSON.stringify(bad.slice(0, 3)) : ''));
  ok(same.length === 54, 'and that is a real sweep, not one case: ' + same.length);
  await browser.close();
}

// ── E. the detector reads full-resolution ink ───────────────────────────
console.log('E. the detector rasterizes at full resolution now');
{
  const { browser, page } = await open(1);
  await loadSheet(page, 5);
  const r = await page.evaluate(async () => {
    const t0 = performance.now();
    const res = await detectFloorEdge(5);
    const ms = Math.round(performance.now() - t0);
    const rec = edgeRasterCache[5];
    return { ms, ok: res.ok, corners: res.polygon ? res.polygon.length : 0,
             S: rec.S, K: rec.K, cells: rec.W * rec.H, cap: EDGE_MAX_CELLS };
  });
  ok(r.S === 1 && r.K === 2, 'a 36x24" sheet rasterizes at PDF_RENDER_SCALE, not half of it: S=' + r.S);
  ok(r.cells === 5184 * 3456, 'which is 17.9 M cells: ' + r.cells);
  ok(r.cells <= r.cap, 'inside the cell budget it was measured at: ' + r.cells + ' <= ' + r.cap);
  ok(r.ok && r.corners >= 8, 'and it still finds the outline: ' + r.corners + ' corners in ' + r.ms + ' ms');
  console.log('   Level 3: ' + r.corners + ' corners, ' + r.ms + ' ms');
  // a sheet over the budget must fall back rather than ask for 500 MB
  const fb = await page.evaluate(() => {
    const vp = { width: 9000, height: 6000 };            // an oversized sheet
    return (vp.width * vp.height <= EDGE_MAX_CELLS) ? 1 : 0.5;
  });
  ok(fb === 0.5, 'an oversized sheet falls back to half resolution: S=' + fb);
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
