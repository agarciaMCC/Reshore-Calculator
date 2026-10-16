// THE MODEL AS ANSWER KEY (RVT-15) — the scorer, run inside the calculator's
// page (it uses the app's helpers and its polygon-clipping). Given the raw
// extraction from Revit (`Revit export/answer-key.py`) it builds what each
// floor's drawings should read back, in the project grid's frame, and grades
// the job open in the page against it.
//
//   window.modelAnswerKey(raw)            → { fit, levels: [...] }
//   window.modelScore(key)                → per level and job-wide scores
//
// Feet throughout; areas in SF. Nothing here writes to the job.
(function () {
  const PC = () => window.polygonClipping;
  const ringArea = r => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };
  const close = r => { const a = r[0], b = r[r.length - 1]; return a[0] === b[0] && a[1] === b[1] ? r : r.concat([a]); };
  const open = r => { const a = r[0], b = r[r.length - 1]; return a[0] === b[0] && a[1] === b[1] ? r.slice(0, -1) : r; };
  const mpArea = mp => (mp || []).reduce((t, poly) => t + ringArea(open(poly[0])) - poly.slice(1).reduce((h, x) => h + ringArea(open(x)), 0), 0);
  const safe = (fn, d) => { try { return fn(); } catch (e) { console.warn('model-score geometry', e); return d; } };
  const U = list => list.length ? safe(() => PC().union(...list), []) : [];
  const I = (a, b) => (a.length && b.length) ? safe(() => PC().intersection(a, b), []) : [];
  const D = (a, b) => !a.length ? [] : !b.length ? a : safe(() => PC().difference(a, b), a);
  const iou = (a, b) => { const i = mpArea(I(a, b)), u = mpArea(U([a, b].filter(x => x.length))); return u > 0 ? i / u : (mpArea(a) || mpArea(b) ? 0 : 1); };
  const rect = (cx, cy, w, h, rot) => {
    const c = Math.cos(rot || 0), s = Math.sin(rot || 0), out = [];
    for (const [dx, dy] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) out.push([cx + dx * c - dy * s, cy + dx * s + dy * c]);
    return out;
  };
  const sizeOf = t => { const m = /(\d+(?:\s+\d+\/\d+)?|\d+\.\d+)\s*[xX]\s*(\d+(?:\s+\d+\/\d+)?|\d+\.\d+)/.exec(String(t || '')); if (!m) return null;
    const v = s => { const f = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s.trim()); return f ? +f[1] + f[2] / f[3] : +s; }; return { w: v(m[1]), d: v(m[2]) }; };

  // ── the model, in the project grid's frame ──
  // bx runs along the numbered grids from grid 1, by along the lettered ones
  // from grid A — the sign of each axis is read from which way the labels run
  function gridFit(raw) {
    const g = state.project && state.project.grid || { x: [], y: [] };
    const byName = new Map(raw.grids.map(q => [q.name, q]));
    const axis = (list, vertical) => {
      const pairs = [];
      for (const gl of list || []) {
        const m = byName.get(gl.label); if (!m) continue;
        const dx = m.p1[0] - m.p0[0], dy = m.p1[1] - m.p0[1];
        if (vertical ? Math.abs(dx) > 1e-3 : Math.abs(dy) > 1e-3) continue;     // only square gridlines place the frame
        pairs.push([vertical ? m.p0[0] : m.p0[1], gl.pos]);
      }
      if (pairs.length < 2) return null;
      const [a, b] = [pairs[0], pairs[pairs.length - 1]];
      const sgn = Math.sign((b[0] - a[0]) / (b[1] - a[1] || 1)) || 1;
      const o = pairs.reduce((t, p) => t + (p[0] - sgn * p[1]), 0) / pairs.length;
      const res = Math.max(...pairs.map(p => Math.abs(p[0] - sgn * p[1] - o)));
      return { sgn, o, n: pairs.length, res };
    };
    const ax = axis(g.x, true), ay = axis(g.y, false);
    if (!ax || !ay) return null;
    return { ax, ay, worstFt: Math.max(ax.res, ay.res), to: p => [(p[0] - ax.o) * ax.sgn, (p[1] - ay.o) * ay.sgn] };
  }

  function modelAnswerKey(raw) {
    const fit = gridFit(raw);
    if (!fit) return { error: 'the job has no project grid sharing labels with the model' };
    const T = r => r.map(fit.to);
    const levels = [];
    const elevOf = new Map(raw.levels.map(l => [l.name, l.elev]));
    for (const L of raw.levels) {
      const floors = raw.floors.filter(f => f.level === L.name && !/\bFTG\b|FOOTING|PILE|CAP\b/i.test(f.type) && (f.areaSF || 0) >= 1 && f.loops && f.loops.length);
      if (!floors.length) continue;
      // a sketch is even-odd: several islands, each with its holes
      const shape = f => { const rs = f.loops.map(T).filter(r => r.length >= 3); return rs.length ? safe(() => PC().xor(...rs.map(r => [[close(r)]])), []) : []; };
      const parts = floors.map(f => ({ f, mp: shape(f), sog: /\bSOG\b|ON GRADE/i.test(f.type) }));
      const all = U(parts.map(p => p.mp).filter(m => m.length));
      // the typical: the suspended slab type covering the most
      const susp = parts.filter(p => !p.sog);
      const byType = new Map();
      for (const p of susp) { const k = p.f.thicknessIn + '|' + p.f.offsetIn; byType.set(k, (byType.get(k) || 0) + (p.f.areaSF || 0)); }
      const top = [...byType.entries()].sort((a, b) => b[1] - a[1])[0];
      const typ = top ? { t: +top[0].split('|')[0], off: +top[0].split('|')[1] } : null;
      const gradeMp = U(parts.filter(p => p.sog).map(p => p.mp).filter(m => m.length));
      const sogShare = mpArea(all) > 0 ? mpArea(gradeMp) / mpArea(all) : 0;
      // walls and columns standing on the floor below fill their slab holes (RVT-07)
      const below = raw.levels.filter(x => x.elev < L.elev - 0.1).sort((a, b) => b.elev - a.elev)[0];
      const fill = [];
      for (const c of raw.columns) {
        if (!c.at || !below || c.base !== below.name && !(elevOf.get(c.base) < L.elev && elevOf.get(c.top) >= L.elev)) continue;
        const s = sizeOf(c.type) || { w: 24, d: 24 };
        const p = fit.to(c.at); fill.push([[close(rect(p[0], p[1], s.w / 12 + 0.2, s.d / 12 + 0.2, (fit.ax.sgn * fit.ay.sgn > 0 ? 1 : -1) * (c.rot || 0)))]]);
      }
      for (const w of raw.walls) {
        if (!w.line || w.line.length < 2 || !below || w.base !== below.name) continue;
        const half = (w.widthIn || 8) / 24 + 0.1;
        for (let i = 0; i < w.line.length - 1; i++) {
          const a = fit.to(w.line[i]), b = fit.to(w.line[i + 1]);
          const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy); if (len < 0.01) continue;
          const nx = -dy / len * half, ny = dx / len * half;
          fill.push([[close([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]])]]);
        }
      }
      const solid = U([all].concat(fill).filter(m => m.length));
      const edge = solid.map(poly => [poly[0]]);                // the outline, holes ignored
      const openings = [];
      for (const poly of solid) for (const h of poly.slice(1)) { const a = ringArea(open(h)); if (a >= 10) openings.push({ mp: [[h]], sf: a }); }
      // slab zones: a floor whose thickness or top differs from the typical
      const zones = typ ? susp.filter(p => Math.abs(p.f.thicknessIn - typ.t) > 0.06 || Math.abs((p.f.offsetIn || 0) - typ.off) > 0.06)
        .filter(p => (p.f.areaSF || 0) >= 1).map(p => ({ type: p.f.type, tIn: p.f.thicknessIn, offIn: (p.f.offsetIn || 0) - typ.off, mp: p.mp, sf: mpArea(p.mp) })) : [];
      const beams = raw.beams.filter(b => b.level === L.name && b.p0 && b.p1).map(b => {
        const s = sizeOf(b.type) || {}; const a = fit.to(b.p0), c = fit.to(b.p1);
        return { type: b.type, w: s.w, d: s.d, a, b: c, len: Math.hypot(c[0] - a[0], c[1] - a[1]) };
      });
      levels.push({ name: L.name, elev: L.elev, typ, onGrade: sogShare >= 0.9, edge, edgeSF: mpArea(edge), slabSF: mpArea(all),
        grade: sogShare >= 0.9 ? [] : gradeMp, gradeSF: sogShare >= 0.9 ? 0 : mpArea(gradeMp), openings, zones, beams });
    }
    return { fit: { worstFt: fit.worstFt, nx: fit.ax.n, ny: fit.ay.n }, levels };
  }

  // ── the job open in the page, in the same frame ──
  function jobLevel(lv) {
    const zs = zonesOf(lv, 'slab').filter(z => z.polygon && z.polygon.length >= 3);
    const bp = z => { const a = zoneAlignment(lv, z); return a && a.transform ? transformPolyToBuilding(z.polygon, a.transform).map(p => [p.x, p.y]) : null; };
    const mpOf = z => { const r = bp(z); return r && r.length >= 3 ? [[close(r)]] : []; };
    const kind = k => zs.filter(z => slabKind(z) === k);
    const edge = U(kind('edge').map(mpOf).filter(m => m.length));
    const grade = levelOnGrade(lv) ? edge : U(kind('grade').map(mpOf).filter(m => m.length));
    return {
      edge, grade, onGrade: levelOnGrade(lv),
      openings: kind('opening').map(z => ({ mp: mpOf(z) })).filter(o => o.mp.length),
      zones: kind('slab').map(z => ({ tIn: slabThicknessOf(lv, z), offIn: slabOffsetOf(z), mp: mpOf(z) })).filter(o => o.mp.length),
      beams: zs.filter(isBeam).map(z => ({ w: z.widthIn, d: z.depthIn, mp: mpOf(z) })).filter(o => o.mp.length),
    };
  }

  function modelScore(key) {
    const out = { levels: [], fit: key.fit };
    const pct = (a, b) => b > 0 ? Math.round(1000 * a / b) / 10 : null;
    for (const K of key.levels) {
      const lv = state.levels.find(l => hasElev(l) && Math.abs(l.elevation - K.elev) < 0.25);
      if (!lv) { out.levels.push({ name: K.name, missing: true }); continue; }
      const J = jobLevel(lv);
      const S = { name: K.name, job: lv.name };
      // floor edge
      S.edge = { keySF: Math.round(K.edgeSF), jobSF: Math.round(mpArea(J.edge)), iou: +iou(K.edge, J.edge).toFixed(3) };
      // on grade
      if (K.onGrade || J.onGrade) S.grade = { key: K.onGrade ? 'whole' : Math.round(K.gradeSF), job: J.onGrade ? 'whole' : Math.round(mpArea(J.grade)), ok: K.onGrade === J.onGrade };
      else if (K.gradeSF > 0 || mpArea(J.grade) > 0) S.grade = { keySF: Math.round(K.gradeSF), jobSF: Math.round(mpArea(J.grade)), iou: +iou(K.grade, J.grade).toFixed(3) };
      // openings: one matches when they overlap by half the smaller
      const used = new Set();
      let found = 0, foundSF = 0;
      const oMiss = [];
      for (const o of K.openings) {
        let hit = -1;
        J.openings.forEach((j, i) => { if (hit < 0 && !used.has(i)) { const a = mpArea(I(o.mp, j.mp)); if (a >= 0.5 * Math.min(o.sf, mpArea(j.mp))) hit = i; } });
        if (hit >= 0) { used.add(hit); found++; foundSF += o.sf; } else oMiss.push(Math.round(o.sf));
      }
      S.openings = { key: K.openings.length, job: J.openings.length, found, extra: J.openings.length - used.size,
        recallSF: pct(foundSF, K.openings.reduce((t, o) => t + o.sf, 0)), missedSF: oMiss };
      // slab zones: covered, and with the right thickness and top
      const zs = [];
      for (const z of K.zones) {
        const cov = J.zones.map(j => ({ j, a: mpArea(I(z.mp, j.mp)) })).filter(x => x.a > 0).sort((a, b) => b.a - a.a);
        const share = z.sf > 0 ? cov.reduce((t, x) => t + x.a, 0) / z.sf : 0;
        const best = cov[0] && cov[0].j;
        zs.push({ type: z.type, sf: Math.round(z.sf), tIn: z.tIn, offIn: z.offIn, covered: +share.toFixed(2),
          jobT: best ? best.tIn : null, jobOff: best ? best.offIn : null,
          right: !!best && share >= 0.5 && Math.abs(best.tIn - z.tIn) < 0.13 && Math.abs(best.offIn - z.offIn) < 0.26 });
      }
      const keyZ = U(K.zones.map(z => z.mp).filter(m => m.length));
      const extra = J.zones.map(j => ({ tIn: j.tIn, sf: Math.round(mpArea(j.mp)), outside: Math.round(mpArea(D(j.mp, keyZ))) })).filter(x => x.outside > 0.5 * x.sf);
      S.zones = { key: K.zones.length, right: zs.filter(z => z.right).length, rightSF: Math.round(zs.filter(z => z.right).reduce((t, z) => t + z.sf, 0)),
        keySF: Math.round(zs.reduce((t, z) => t + z.sf, 0)), list: zs, extra };
      // beams: found where a job beam holds most of the centerline; sized right when width and depth agree
      const bl = [];
      const bUsed = new Set();
      for (const b of K.beams) {
        const n = Math.max(4, Math.ceil(b.len / 2));
        const pts = []; for (let i = 0; i <= n; i++) { const t = (i + 0.5) / (n + 1); pts.push({ x: b.a[0] + (b.b[0] - b.a[0]) * t, y: b.a[1] + (b.b[1] - b.a[1]) * t }); }
        const hits = J.beams.map((j, i) => ({ i, j, k: pts.filter(p => pointInPoly(p, j.mp[0][0].map(q => ({ x: q[0], y: q[1] })))).length })).filter(x => x.k > 0).sort((a, c) => c.k - a.k);
        const share = hits.reduce((t, x) => t + x.k, 0) / pts.length;
        hits.forEach(h => bUsed.add(h.i));
        const best = hits[0] && hits[0].j;
        bl.push({ type: b.type, len: Math.round(b.len), covered: +Math.min(1, share).toFixed(2), job: best ? `${best.w}x${best.d}` : null,
          found: share >= 0.6, sized: share >= 0.6 && !!best && Math.abs(best.w - b.w) < 0.6 && Math.abs(best.d - b.d) < 0.6 });
      }
      const totLen = bl.reduce((t, b) => t + b.len, 0);
      S.beams = { key: K.beams.length, job: J.beams.length, foundLen: pct(bl.filter(b => b.found).reduce((t, b) => t + b.len, 0), totLen),
        sizedLen: pct(bl.filter(b => b.sized).reduce((t, b) => t + b.len, 0), totLen), extra: J.beams.length - bUsed.size, list: bl };
      out.levels.push(S);
    }
    return out;
  }
  window.modelAnswerKey = modelAnswerKey;
  window.modelScore = modelScore;
})();
