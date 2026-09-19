// The outline regularizer, on synthetic outlines where the right answer is
// known exactly: a traced rectangle with rounded corners must come back as
// four corners ON the drafted line ends, a jog smaller than a real step must
// be absorbed, a real step must survive, and a curve must stay a curve.
import fs from 'node:fs';
import path from 'node:path';
const here = new URL('.', import.meta.url).pathname;
const html = fs.readFileSync(path.resolve(here, '..', 'reshore-calc.html'), 'utf8');

const grab = (startMark, endMark, label) => {
  const i = html.indexOf(startMark), j = html.indexOf(endMark, i);
  if (i < 0 || j < 0) throw new Error('could not find ' + label);
  return html.slice(i, j);
};
const regSrc = grab('// ════════════════════════════════════════════════════════════\n//  OUTLINE REGULARIZER',
                    '// One region from a click', 'regularizer');
const curveSrc = grab('function curveRunMask(poly){', '// How many image pixels a quarter', 'curveRunMask');

const state = { levels: [] };
const levelSheets = () => [];
const pixelToBuilding = (px, py, T) => ({ bx: T[0] * px + T[1] * py + T[4], by: T[2] * px + T[3] * py + T[5] });
const ctx = new Function('state', 'levelSheets', 'pixelToBuilding',
  curveSrc + '\n' + regSrc + '\nreturn {regularizeOutline,regSegsFromFlat,regSegsFromPolys,regMinJogPx,curveRunMask};')(state, levelSheets, pixelToBuilding);
const { regularizeOutline, regSegsFromPolys } = ctx;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const near = (a, b, t) => Math.abs(a - b) <= t;

// ── a traced outline: walk the true polygon, round every corner by r, push
// the trace out by `off` (the ink boundary sits outside the stroke) and add
// raster noise ──
function traceOf(corners, { r = 8, off = 2.5, step = 6, noise = 0.5 } = {}) {
  const out = [];
  const n = corners.length;
  const rnd = (() => { let s = 12345; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff - 0.5; }; })();
  for (let i = 0; i < n; i++) {
    const a = corners[(i - 1 + n) % n], b = corners[i], c = corners[(i + 1) % n];
    const u = { x: b.x - a.x, y: b.y - a.y }, v = { x: c.x - b.x, y: c.y - b.y };
    const lu = Math.hypot(u.x, u.y), lv = Math.hypot(v.x, v.y);
    u.x /= lu; u.y /= lu; v.x /= lv; v.y /= lv;
    // outward normal (polygon wound clockwise in screen coords)
    const nu = { x: u.y, y: -u.x }, nv = { x: v.y, y: -v.x };
    const from = { x: b.x - u.x * r + nu.x * off, y: b.y - u.y * r + nu.y * off };
    const to = { x: b.x + v.x * r + nv.x * off, y: b.y + v.y * r + nv.y * off };
    // the corner itself as the ARC a morphological opening leaves behind,
    // not a straight cut: that is what the detector actually produces
    const cen = { x: b.x - u.x * r + v.x * r, y: b.y - u.y * r + v.y * r };
    // straight part of the edge into this corner
    const prev = out.length ? out[out.length - 1] : null;
    if (prev) {
      const d = Math.hypot(from.x - prev.x, from.y - prev.y);
      const k = Math.max(1, Math.round(d / step));
      for (let s = 1; s < k; s++) out.push({ x: prev.x + (from.x - prev.x) * s / k + rnd() * noise, y: prev.y + (from.y - prev.y) * s / k + rnd() * noise });
    }
    out.push({ x: from.x + rnd() * noise, y: from.y + rnd() * noise });
    // the rounded corner itself, four points across the arc
    const a0 = Math.atan2(from.y - cen.y, from.x - cen.x), a1raw = Math.atan2(to.y - cen.y, to.x - cen.x);
    let da = a1raw - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const r0 = Math.hypot(from.x - cen.x, from.y - cen.y), r1 = Math.hypot(to.x - cen.x, to.y - cen.y);
    for (let s = 1; s <= 4; s++) {
      const t = s / 5, ang = a0 + da * t, rad = r0 + (r1 - r0) * t;
      out.push({ x: cen.x + rad * Math.cos(ang) + rnd() * noise, y: cen.y + rad * Math.sin(ang) + rnd() * noise });
    }
    out.push({ x: to.x + rnd() * noise, y: to.y + rnd() * noise });
  }
  return out;
}
const segsOf = corners => regSegsFromPolys([corners.map(p => [p.x, p.y])], 4, 2);

console.log('A. a traced rectangle comes back as four corners on the drafted ends');
{
  const C = [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 600 }, { x: 100, y: 600 }];
  const traced = traceOf(C);
  const r = regularizeOutline(traced, { segs: segsOf(C), minJog: 5 });
  ok(r.changed, 'rebuilt');
  ok(r.polygon.length === 4, `four corners, got ${r.polygon.length} (traced ${traced.length})`);
  if (r.polygon.length === 4) {
    for (const c of C) {
      const d = Math.min(...r.polygon.map(p => Math.hypot(p.x - c.x, p.y - c.y)));
      ok(d < 1.0, `corner ${c.x},${c.y} landed within 1 px (off by ${d.toFixed(2)})`);
    }
  }
  ok(r.stats.snapped === 4 && r.stats.unsnapped === 0, `all four edges snapped: ${JSON.stringify(r.stats)}`);
  ok(r.stats.onEndpoints === 4, `all four corners on a drafted endpoint: ${r.stats.onEndpoints}`);
}

console.log('B. with no drafted lines to snap to, the corners are still rebuilt');
{
  const C = [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 600 }, { x: 100, y: 600 }];
  const traced = traceOf(C, { off: 0 });
  const r = regularizeOutline(traced, { segs: [], minJog: 5 });
  ok(r.changed && r.polygon.length === 4, `four corners without snapping, got ${r.changed ? r.polygon.length : "unchanged: "+r.reason}`);
  ok(r.stats.snapped === 0 && r.stats.unsnapped === 4, 'counted as unsnapped');
}

console.log('C. a jog smaller than a real step is absorbed; a real one survives');
{
  //            ┌──────┐            a 3 px step in the left edge at y=300
  const C = [{ x: 103, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 600 }, { x: 100, y: 600 }, { x: 100, y: 300 }, { x: 103, y: 300 }];
  const traced = traceOf(C, { r: 3 });
  const small = regularizeOutline(traced, { segs: segsOf(C), minJog: 8 });
  ok(small.changed && small.polygon.length === 4, `3 px jog absorbed with an 8 px minimum: ${small.changed ? small.polygon.length : 'unchanged'} corners`);
  const big = regularizeOutline(traced, { segs: segsOf(C), minJog: 2 });
  ok(big.changed && big.polygon.length === 6, `same jog kept when the minimum is 2 px: ${big.changed ? big.polygon.length : 'unchanged'} corners`);
}
{
  // a 20 px step is construction, not rounding: it must survive the default
  const C = [{ x: 120, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 600 }, { x: 100, y: 600 }, { x: 100, y: 300 }, { x: 120, y: 300 }];
  const traced = traceOf(C, { r: 3 });
  const r = regularizeOutline(traced, { segs: segsOf(C), minJog: 8 });
  ok(r.changed && r.polygon.length === 6, `20 px step kept: ${r.changed ? r.polygon.length : "unchanged: "+r.reason} corners`);
}

console.log('D. a curved edge is left alone');
{
  const pts = [];
  for (let a = -Math.PI / 2; a <= 0; a += 0.02) pts.push({ x: 500 + 200 * Math.cos(a), y: 500 + 200 * Math.sin(a) });
  const C = [{ x: 300, y: 300 }, { x: 500, y: 300 }];
  const poly = [{ x: 300, y: 300 }, { x: 500, y: 300 }].concat(pts).concat([{ x: 700, y: 700 }, { x: 300, y: 700 }]);
  // densify the straight sides so the run finder has something to chew on
  const dense = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const d = Math.hypot(b.x - a.x, b.y - a.y), k = Math.max(1, Math.round(d / 6));
    for (let s = 0; s < k; s++) dense.push({ x: a.x + (b.x - a.x) * s / k, y: a.y + (b.y - a.y) * s / k });
  }
  const r = regularizeOutline(dense, { segs: [], minJog: 6 });
  const kept = r.changed ? r.polygon.length : dense.length;
  ok(kept > 40, `the arc keeps its points: ${kept} vertices out of ${dense.length}`);
  const area0 = Math.abs(dense.reduce((s, p, i) => { const q = dense[(i + 1) % dense.length]; return s + (p.x * q.y - q.x * p.y); }, 0) / 2);
  const poly1 = r.changed ? r.polygon : dense;
  const area1 = Math.abs(poly1.reduce((s, p, i) => { const q = poly1[(i + 1) % poly1.length]; return s + (p.x * q.y - q.x * p.y); }, 0) / 2);
  ok(Math.abs(area1 - area0) / area0 < 0.02, `area held within 2%: ${(100 * (area1 - area0) / area0).toFixed(2)}%`);
}

console.log('E. it refuses to apply a rebuild that moves the area');
{
  const C = [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 600 }, { x: 100, y: 600 }];
  const traced = traceOf(C);
  // drafted lines 40 px away from where the trace actually runs: parallel, but
  // not the same lines. Nothing should be dragged onto them.
  const far = [{ x: 60, y: 60 }, { x: 940, y: 60 }, { x: 940, y: 640 }, { x: 60, y: 640 }];
  const r = regularizeOutline(traced, { segs: segsOf(far), minJog: 5 });
  const area = p => Math.abs(p.reduce((s, q, i) => { const w = p[(i + 1) % p.length]; return s + (q.x * w.y - w.x * q.y); }, 0) / 2);
  const moved = Math.abs(area(r.polygon) - area(traced)) / area(traced);
  ok(moved < 0.02, `outline did not chase the far lines (area moved ${(moved * 100).toFixed(2)}%)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
