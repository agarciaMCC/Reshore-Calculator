#!/usr/bin/env python3
"""
ifc2reshore — turn a McClone scope model (Revit → IFC4) into a McClone Reshore
Calculator job: one plan sheet per level in a PDF, plus a .reshore.json job
file with the levels, floor edges, openings, slab areas, slab on grade, beams
and project grid already placed.  Loading marks are NOT exported — they are
drawn in the calculator over this geometry (Adolfo, Sep 18 2026).

    python3 ifc2reshore.py MODEL.ifc --out OUTDIR [--rotate auto|DEG] [--scale FT_PER_INCH]

Conventions (agreed Sep 18 2026):
  * Floors whose type name contains FILL, PAD, CURB, PEDESTAL, PLINTH or TOS SLOPE are never slab.
  * Anything named BM or BEAM is a beam, whatever its Revit category.
  * Beams are modeled full depth from top of slab; depthIn is the full depth from the beam's own T.O.S.
  * Rotation to project north is an option, not automatic (--rotate auto makes the number gridlines vertical).
  * One floor element per placement is left as a later option; here a level is one pour.
"""
import argparse, collections, json, math, os, re, sys, time, hashlib

# ────────────────────────────────────────────────────────────────────────────
# Stage 1: extraction (cached beside the IFC, since it takes ~2 min)
# ────────────────────────────────────────────────────────────────────────────
FT_PER_M = 1 / 0.3048

def extract(ifc_path, cache_dir):
    import ifcopenshell, ifcopenshell.geom, ifcopenshell.util.element as ue, ifcopenshell.util.placement as up
    import numpy as np
    from shapely.geometry import Polygon, MultiPolygon
    from shapely.ops import unary_union

    st = os.stat(ifc_path)
    key = hashlib.md5(f"{os.path.abspath(ifc_path)}|{st.st_size}|{int(st.st_mtime)}|v3".encode()).hexdigest()[:12]
    cache = os.path.join(cache_dir, f"extract-{key}.json")
    if os.path.exists(cache):
        log(f"using cached extraction {os.path.basename(cache)}")
        return json.load(open(cache))

    log(f"opening {ifc_path}")
    f = ifcopenshell.open(ifc_path)
    s = ifcopenshell.geom.settings(); s.set(s.USE_WORLD_COORDS, True)
    # the file's own length unit → feet factor (geometry from ifcopenshell.geom is always metres)
    def storey_of(e):
        for rel in getattr(e, 'ContainedInStructure', []) or []:
            if rel.RelatingStructure.is_a('IfcBuildingStorey'): return rel.RelatingStructure
        return None

    def footprint(shape):
        v = np.array(shape.geometry.verts).reshape(-1, 3) * FT_PER_M
        fc = np.array(shape.geometry.faces).reshape(-1, 3)
        tris = v[fc]
        n = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
        nz = n[:, 2] / (np.linalg.norm(n, axis=1) + 1e-12)
        top = tris[nz > 0.7]
        if len(top) == 0: top = tris
        polys = [Polygon(t[:, :2]) for t in top]
        polys = [p for p in polys if p.is_valid and p.area > 1e-6]
        u = unary_union(polys)
        try: u = u.buffer(0.005).buffer(-0.005)
        except Exception: pass
        return u, float(v[:, 2].min()), float(v[:, 2].max()), float(np.median(top[:, :, 2]))

    def gj(g):
        if g.is_empty: return []
        polys = [g] if isinstance(g, Polygon) else [p for p in getattr(g, 'geoms', []) if isinstance(p, Polygon)]
        return [{'ext': [[round(x, 4), round(y, 4)] for x, y in p.exterior.coords],
                 'holes': [[[round(x, 4), round(y, 4)] for x, y in r.coords] for r in p.interiors]} for p in polys]

    out = {'file': os.path.basename(ifc_path), 'project': None, 'storeys': [], 'slabs': [], 'beams': [], 'openings': [], 'columns': [], 'walls': [], 'grid_lines': []}
    pr = f.by_type('IfcProject'); out['project'] = pr[0].Name if pr else None
    for sty in sorted(f.by_type('IfcBuildingStorey'), key=lambda x: x.Elevation or 0):
        out['storeys'].append({'name': sty.Name, 'elev': sty.Elevation})

    for cls, key_ in [('IfcSlab', 'slabs'), ('IfcBeam', 'beams'), ('IfcOpeningElement', 'openings'), ('IfcColumn', 'columns'), ('IfcWall', 'walls')]:
        els = f.by_type(cls); t0 = time.time()
        for e in els:
            t = ue.get_type(e); tname = t.Name if t else None
            try: sh = ifcopenshell.geom.create_shape(s, e)
            except Exception: continue
            g, zmin, zmax, ztop = footprint(sh)
            rec = {'gid': e.GlobalId, 'name': e.Name, 'type': tname, 'zmin': round(zmin, 4), 'zmax': round(zmax, 4), 'ztop': round(ztop, 4),
                   'area': round(g.area, 2), 'fp': gj(g)}
            if cls == 'IfcOpeningElement':
                host = e.VoidsElements[0].RelatingBuildingElement if e.VoidsElements else None
                rec['host'] = host.GlobalId if host else None; rec['host_cls'] = host.is_a() if host else None
                sty = storey_of(host) if host else None
            else:
                sty = storey_of(e)
            rec['storey'] = sty.Name if sty else None
            if cls == 'IfcBeam':
                ps = ue.get_psets(e).get('Reference Level', {})
                rec['pset'] = {k: ps.get(k) for k in ('Beam Width (b)', 'Beam Depth (h)', 'Beam Slab Reduction (ts)', 'Mark Structural') if k in ps}
            out[key_].append(rec)
        log(f"  {cls}: {len(out[key_])} in {time.time()-t0:.0f}s")

    # grid lines in file units (feet here); check the unit
    unit_ft = 1.0
    for u in f.by_type('IfcUnitAssignment')[0].Units:
        if getattr(u, 'UnitType', None) == 'LENGTHUNIT':
            if u.is_a('IfcConversionBasedUnit'): unit_ft = u.ConversionFactor.ValueComponent.wrappedValue * FT_PER_M
            elif u.is_a('IfcSIUnit'): unit_ft = {'MILLI': 0.001, None: 1.0}.get(u.Prefix, 1.0) * FT_PER_M
    for g in f.by_type('IfcGrid'):
        m = up.get_local_placement(g.ObjectPlacement)
        sty = storey_of(g)
        for coll in (g.UAxes or [], g.VAxes or [], g.WAxes or []):
            for ax in coll:
                c = ax.AxisCurve
                if c.is_a('IfcIndexedPolyCurve'): pts = [(p[0], p[1]) for p in c.Points.CoordList]
                elif c.is_a('IfcPolyline'): pts = [tuple(p.Coordinates[:2]) for p in c.Points]
                else: continue
                w = [((m @ np.array([x, y, 0, 1]))[:2] * unit_ft).tolist() for x, y in pts]
                out['grid_lines'].append({'tag': ax.AxisTag, 'storey': sty.Name if sty else None, 'p0': [round(v, 3) for v in w[0]], 'p1': [round(v, 3) for v in w[-1]]})
    json.dump(out, open(cache, 'w'))
    log(f"cached extraction → {cache}")
    return out

# ────────────────────────────────────────────────────────────────────────────
# Classification rules
# ────────────────────────────────────────────────────────────────────────────
EXCLUDE_FLOOR = re.compile(r'FILL|PAD\b|CURB|PEDESTAL|PLINTH|TOS SLOPE|RAMP TRANSITION|RAMP SOG EDGE', re.I)
FOUNDATION = re.compile(r'^(Pile|Pile Cap|Foundation Slab|Wall Foundation|Monolithic Landing)', re.I)
BEAM_NAME = re.compile(r'\bBM\b|\bBEAM\b', re.I)
SOG = re.compile(r'\bSOG\b|SLAB ON GRADE', re.I)
GRADE_BEAM = re.compile(r'GRADE BEAM|\bGB\b', re.I)
# gridlines worth drawing: uppercase letters, digits and dots only. Anything with an apostrophe,
# a lowercase letter or a mechanical M### number is a working line, not a design gridline (Adolfo, Sep 18 2026)
CLEAN_TAG = re.compile(r'^(?!M\d{3,}$)[A-Z0-9.]+$')
def clean_tag(tag): return bool(CLEAN_TAG.match(tag or ''))
STEEL = re.compile(r'^(L-Angles|W Shapes|HSS|C Channel|Steel)', re.I)
FRAC = r'(\d+(?:\s+\d+/\d+)?(?:\.\d+)?|\d+/\d+)'
SIZE_RE = re.compile(FRAC + r'\s*x\s*' + FRAC, re.I)
THK_RE = re.compile(r'(' + FRAC + r')\s*"')

def frac(s):
    s = s.strip(); tot = 0.0
    for part in s.split():
        if '/' in part: a, b = part.split('/'); tot += float(a) / float(b)
        else: tot += float(part)
    return tot

def type_tail(tname):
    return (tname or '').split(':', 1)[-1].strip()

def size_from_name(tname):
    m = SIZE_RE.search(type_tail(tname))
    return (frac(m.group(1)), frac(m.group(2))) if m else (None, None)

def thickness_from_name(tname):
    m = THK_RE.search(type_tail(tname))
    return frac(m.group(1)) if m else None

def is_floor_slab(rec):
    t = rec['type'] or ''
    if not t.startswith('Floor:') and not t.startswith('Floors') and 'Thickened' not in t: return False
    if EXCLUDE_FLOOR.search(t) or BEAM_NAME.search(t) or FOUNDATION.search(t): return False
    return True

def is_floor_beam(rec):
    t = rec['type'] or ''
    return t.startswith('Floor:') and bool(BEAM_NAME.search(t))

def is_structural_beam(rec):
    t = rec['type'] or ''
    if STEEL.search(t) or GRADE_BEAM.search(t): return False
    return True

# ────────────────────────────────────────────────────────────────────────────
# Geometry helpers
# ────────────────────────────────────────────────────────────────────────────
def shapely_from_fp(fp):
    from shapely.geometry import Polygon, MultiPolygon
    from shapely.ops import unary_union
    polys = []
    for p in fp or []:
        try:
            pg = Polygon(p['ext'], p['holes'])
            if not pg.is_valid: pg = pg.buffer(0)
            if not pg.is_empty: polys.append(pg)
        except Exception: pass
    return unary_union(polys) if polys else Polygon()

def rot_xy(x, y, th, cx, cy):
    c, s_ = math.cos(th), math.sin(th)
    dx, dy = x - cx, y - cy
    return cx + dx * c - dy * s_, cy + dx * s_ + dy * c

def ring_to_building(ring, th, cx, cy):
    # model (x east, y north) → rotate → building frame with y DOWN (page convention)
    return [(lambda X, Y: (X, -Y))(*rot_xy(x, y, th, cx, cy)) for x, y in ring]

def poly_pts(poly_ft, xf):
    """building-ft ring → [{x,y}] page px via inverse of alignment transform [a,0,0,d,e,f]."""
    a, d, e, f = xf
    pts = [{'x': round((x - e) / a, 2), 'y': round((y - f) / d, 2)} for x, y in poly_ft]
    if len(pts) > 1 and pts[0] == pts[-1]: pts.pop()
    return pts

def simplify_ring(coords, tol=0.02):
    from shapely.geometry import LinearRing
    try:
        r = LinearRing(coords).simplify(tol, preserve_topology=True)
        return list(r.coords)
    except Exception:
        return coords

def fmt_ftin(ft):
    sign = '-' if ft < 0 else ''; ft = abs(ft)
    f_ = int(ft); i = round((ft - f_) * 12 * 4) / 4
    if i >= 12: f_ += 1; i -= 12
    inch = ('%g' % i)
    return f"{sign}{f_}'-{inch}\""

def jsnum(v):
    """a number as JSON.stringify would print it (integral floats without the .0)"""
    if isinstance(v, float) and v.is_integer(): return int(v)
    return v

def sid(seed):
    return hashlib.md5(seed.encode()).hexdigest()[:8]

LOG = []
def log(msg):
    LOG.append(msg); print(msg, file=sys.stderr)

# ────────────────────────────────────────────────────────────────────────────
# Stage 2: build the job
# ────────────────────────────────────────────────────────────────────────────
# the calculator's full default catalog (DEFAULT_SHORES in reshore-calc.html). Opening a job
# replaces the app's catalog with the file's list, so the file must carry the whole thing —
# a shorter list here silently wipes the post shores and HV shores from the app.
SHORE_CATALOG = [
    {"id": "80mqvujh", "name": "6-6 Ellis", "minH": 8, "maxH": 10, "timber": True, "builtinLT": True},
    {"id": "3ca3eclw", "name": "6-8 Ellis", "minH": 8, "maxH": 12, "timber": True, "builtinLT": True},
    {"id": "y6rhby91", "name": "6-10 Ellis", "minH": 8, "maxH": 14, "timber": True, "builtinLT": True},
    {"id": "p2ocybl0", "name": "6-12 Ellis", "minH": 8, "maxH": 15, "timber": True, "builtinLT": True},
    {"id": "68w875a9", "name": "#1 Post", "minH": 4.08, "maxH": 6.58, "builtinLT": True},
    {"id": "yxzl4n55", "name": "#2 Post", "minH": 6.58, "maxH": 10.67, "builtinLT": True},
    {"id": "lx19r5t3", "name": "#3 Post", "minH": 7.83, "maxH": 11.58, "builtinLT": True},
    {"id": "ccnwtd5d", "name": "#4 Post", "minH": 9.67, "maxH": 14.33, "builtinLT": True},
    {"id": "rao750ys", "name": "#5 HV", "minH": 10.83, "maxH": 18.83, "builtinLT": True},
    {"id": "puiblh8g", "name": "XL 625", "minH": 15.17, "maxH": 27.83, "builtinLT": True},
]

def build(ex, args):
    from shapely.geometry import Polygon, MultiPolygon, Point
    from shapely.ops import unary_union

    storeys = ex['storeys']
    elev = {s['name']: s['elev'] for s in storeys}
    order = [s['name'] for s in storeys]

    # ── classify per storey ─────────────────────────────────────────────────
    per = collections.OrderedDict((n, {'slabs': [], 'beams': [], 'cols': [], 'walls': []}) for n in order)
    for r in ex['slabs']:
        if r['storey'] not in per or not r['fp']: continue
        if is_floor_slab(r): per[r['storey']]['slabs'].append(r)
        elif is_floor_beam(r): per[r['storey']]['beams'].append(dict(r, src='floor'))
    for r in ex['beams']:
        if r['storey'] in per and r['fp'] and is_structural_beam(r): per[r['storey']]['beams'].append(dict(r, src='beam'))
    for r in ex['columns']:
        if r['storey'] in per and r['fp']: per[r['storey']]['cols'].append(r)
    for r in ex['walls']:
        if r['storey'] in per and r['fp'] and re.search(r'CIP|CONC', r['type'] or '', re.I): per[r['storey']]['walls'].append(r)

    levels_used = [n for n in order if per[n]['slabs']]
    if args.levels:
        want = set(x.strip() for x in args.levels.split(','))
        levels_used = [n for n in levels_used if n in want or n.replace('LEVEL-', '') in want]
    if not levels_used: sys.exit('no floor slabs found')

    # ── rotation ────────────────────────────────────────────────────────────
    all_slab = unary_union([shapely_from_fp(r['fp']) for n in levels_used for r in per[n]['slabs']])
    cx, cy = all_slab.centroid.x, all_slab.centroid.y
    th = 0.0
    if args.rotate == 'auto':
        angs = []
        for gl in ex['grid_lines']:
            tag = gl['tag'] or ''
            if re.match(r'^\d+[\'"]*$', tag):       # plain number gridlines
                a = math.degrees(math.atan2(gl['p1'][1] - gl['p0'][1], gl['p1'][0] - gl['p0'][0])) % 180
                angs.append(a)
        if angs:
            # dominant direction (mode at 1° bins), make it vertical
            c = collections.Counter(round(a) for a in angs); dom = c.most_common(1)[0][0]
            fine = [a for a in angs if abs(a - dom) <= 1.5]
            mean = sum(fine) / len(fine)
            th = math.radians(90 - mean)
            log(f"rotate auto: number gridlines run at {mean:.2f}°, rotating {math.degrees(th):.2f}° so they are vertical")
    elif args.rotate:
        th = math.radians(float(args.rotate)); log(f"rotating {float(args.rotate):.2f}°")

    B = lambda ring: ring_to_building(ring, th, cx, cy)
    def poly_b(geom):
        """shapely model-coords polygon(s) → list of (exterior_ring_ft, [hole_rings]) in building frame"""
        polys = [geom] if isinstance(geom, Polygon) else [p for p in getattr(geom, 'geoms', []) if isinstance(p, Polygon)]
        out = []
        for p in polys:
            if p.is_empty: continue
            out.append((B(simplify_ring(list(p.exterior.coords), args.simplify)), [B(simplify_ring(list(r.coords), args.simplify)) for r in p.interiors]))
        return out

    # ── page window: one frame for every level so floors stack ─────────────
    xs, ys = [], []
    for n in levels_used:
        for r in per[n]['slabs']:
            for p in r['fp']:
                for x, y in B(p['ext']): xs.append(x); ys.append(y)
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    W_in, H_in = args.sheet
    margin = 12.0  # ft
    need_w, need_h = (maxx - minx) + 2 * margin, (maxy - miny) + 2 * margin
    scale = args.scale  # ft per inch
    if scale is None:
        for cand in (8, 10.6667, 12, 16, 20, 24, 32, 40, 48, 64):
            if need_w <= cand * (W_in - 4) and need_h <= cand * (H_in - 3): scale = cand; break
        else: scale = 64
    fpp = scale / 144.0                 # ft per page pixel at PDF_RENDER_SCALE=2 (72 pt/in × 2)
    Wpx, Hpx = W_in * 144, H_in * 144
    # centre the building in the drawable area (leave 2.5 in at the bottom for the title strip)
    draw_h_px = Hpx - 2.5 * 144
    e_ = (minx + maxx) / 2 - (Wpx / 2) * fpp
    f_ = (miny + maxy) / 2 - (draw_h_px / 2) * fpp
    xf = (fpp, fpp, e_, f_)             # a, d, e, f   (b=c=0)
    transform = [fpp, 0, 0, fpp, e_, f_]
    sc_txt = ('1/%d" = 1\'-0"' % round(12 / scale)) if float(12 / scale).is_integer() else f'{scale:g} ft per inch'
    log(f"sheet {W_in:g}x{H_in:g} in, scale {sc_txt}, {fpp:.5f} ft/px; building extents {maxx-minx:,.0f} x {maxy-miny:,.0f} ft")

    # ── grid ────────────────────────────────────────────────────────────────
    gx, gy, angled = {}, {}, collections.Counter()
    for gl in ex['grid_lines']:
        (x0, y0), (x1, y1) = B([tuple(gl['p0']), tuple(gl['p1'])])
        ang = math.degrees(math.atan2(y1 - y0, x1 - x0)) % 180
        tag = gl['tag'] or '?'
        L = math.hypot(x1 - x0, y1 - y0)
        if abs(ang - 90) < 1.0:
            pos = (x0 + x1) / 2
            if tag not in gx or gx[tag][1] < L: gx[tag] = (pos, L)
        elif ang < 1.0 or ang > 179.0:
            pos = (y0 + y1) / 2
            if tag not in gy or gy[tag][1] < L: gy[tag] = (pos, L)
        else:
            angled[tag] += 1
    grid = {'x': sorted([{'label': t, 'pos': round(p, 3)} for t, (p, L) in gx.items()], key=lambda g: g['pos']),
            'y': sorted([{'label': t, 'pos': round(p, 3)} for t, (p, L) in gy.items()], key=lambda g: g['pos'])}
    # the project grid names the bays, so keep it to the primary lines: plain numbers and plain
    # letters (1, 2, A, BB). Primed / suffixed / mechanical lines (1', 6w, L5-8a, M559) stay drawn
    # on the sheets but out of the bay names, unless --grid all is asked for
    if args.grid == 'primary':
        prim = re.compile(r'^(\d+|[A-Z]{1,2})(\.\d+)?$')
        grid['x'] = [g for g in grid['x'] if prim.match(g['label'])]
        grid['y'] = [g for g in grid['y'] if prim.match(g['label'])]
    else:
        grid['x'] = [g for g in grid['x'] if clean_tag(g['label'])]
        grid['y'] = [g for g in grid['y'] if clean_tag(g['label'])]
    angled = collections.Counter(t for t in angled if clean_tag(t))
    if angled: log(f"grid: {len(grid['x'])} vertical + {len(grid['y'])} horizontal lines kept; {len(angled)} tags not orthogonal after rotation (drawn, not in the project grid): {', '.join(sorted(angled)[:20])}{'…' if len(angled)>20 else ''}")

    # ── shared-coordinate z → project elevation ─────────────────────────────
    # geometry z is in shared coordinates; the storey elevations are project values. The
    # typical slab of each level sits at its level in most cases, so the median offset
    # between the two is the datum shift; a level whose slab top then differs from its
    # Revit level is a real step (L5 on Kalae: slab top 2" under the level) and is reported.
    diffs = []
    for n in levels_used:
        gs = [(r, shapely_from_fp(r['fp'])) for r in per[n]['slabs']]
        gs = [(r, g) for r, g in gs if not g.is_empty]
        if gs: diffs.append(elev[n] - max(gs, key=lambda rg: rg[1].area)[0]['zmax'])
    diffs.sort(); z_off = diffs[len(diffs) // 2]
    log(f"shared→project elevation datum: +{z_off:.3f} ft")

    # ── levels ──────────────────────────────────────────────────────────────
    job_levels, pages, report = [], [], []
    page_no = 0
    for n in levels_used:
        page_no += 1
        P = per[n]
        slabs = P['slabs']
        geoms = [(r, shapely_from_fp(r['fp'])) for r in slabs]
        geoms = [(r, g) for r, g in geoms if not g.is_empty]
        # the level's typical slab: the largest floor element
        main = max(geoms, key=lambda rg: rg[1].area)
        m_rec = main[0]
        typ_thk = thickness_from_name(m_rec['type']) or round((m_rec['zmax'] - m_rec['zmin']) * 12, 2)
        base_top = m_rec['zmax']                       # ft, shared-coords z of the typical slab top
        # Revit level elevation vs slab top: report the difference, use slab top as T.O.S.
        # (geometry z is shared coordinates; the storey elevation is project; align them through the typical slab)
        lvl_elev = round(round((base_top + z_off) * 96) / 96, 4)      # snap to 1/8" (the IFC carries 100'-0" as 99.99993)
        step_note = ''
        if abs(lvl_elev - elev[n]) >= 1 / 24:
            step_note = f"  (slab top {fmt_ftin(lvl_elev - elev[n])} vs Revit level {fmt_ftin(elev[n])})"
        sog_area = sum(g.area for r, g in geoms if SOG.search(r['type'] or ''))
        tot_area = sum(g.area for r, g in geoms)
        on_grade = sog_area >= 0.9 * tot_area
        # Revit floors joined with framing come through with a slot cut where every
        # beam runs, so the slab extent is floors ∪ beams (beams at slab level only)
        beam_geoms = [shapely_from_fp(b['fp']) for b in P['beams'] if abs(b['zmax'] - base_top) < 1.5]
        struct = unary_union([g for r, g in geoms] + [bg for bg in beam_geoms if not bg.is_empty])
        try: struct = struct.buffer(0.05).buffer(-0.05)      # close hairline gaps between joined elements
        except Exception: pass
        # each floor element, with its beam slots closed (closing radius 4 ft, clipped to real structure)
        def closed(g):
            try:
                c = g.buffer(4).buffer(-4).intersection(struct)
                return c if not c.is_empty else g
            except Exception: return g
        geoms = [(r, closed(g)) for r, g in geoms]
        union = struct
        pieces = poly_b(union)
        pieces.sort(key=lambda pr: -Polygon(pr[0]).area)
        edge_ring, edge_holes = pieces[0]
        short = re.sub(r'^LEVEL-', '', n)
        lv = {'id': sid('lv|' + n), 'name': short, 'elevation': round(lvl_elev, 4), 'floorToFloor': None,
              'slabThickness': typ_thk, 'defaultCapacity': 0, 'rangeFrom': None, 'rangeTo': None,
              'pdfPage': page_no, 'zones': [], 'slabZones': [], 'sheetZones': {},
              'alignment': {'points': [], 'transform': transform, 'scale': fpp, 'ftPerInch': scale, 'rotationDeg': 0, 'mirror': False,
                            'rmsFt': 0, 'worstFt': 0, 'nPoints': 0, 'sheetScaleFtPerInch': scale, 'page': page_no, 'confirmed': True, 'source': 'revit-ifc'}}
        if on_grade: lv['onGrade'] = True
        SZ = lv['slabZones']
        # floor edge
        SZ.append({'id': sid('edge|' + n), 'polygon': poly_pts(edge_ring, xf), 'kind': 'edge', 'thicknessIn': None, 'offsetIn': 0,
                   'label': '', 'detected': True, 'confirmed': True, 'page': page_no, 'source': 'revit'})
        # openings = holes of the union (the Revit openings are already cut from the floor geometry)
        n_open = 0
        for holes in [edge_holes] + [h for _, h in pieces[1:]]:
            for h in holes:
                a = abs(Polygon(h).area)
                if a < args.min_opening: continue
                n_open += 1
                SZ.append({'id': sid(f'open|{n}|{n_open}'), 'polygon': poly_pts(h, xf), 'kind': 'opening', 'thicknessIn': None, 'offsetIn': 0,
                           'label': '', 'page': page_no, 'source': 'revit', 'fromSheet': False})
        # detached pieces of slab beyond the main outline count as slab areas
        n_slab = 0
        for ring, holes in pieces[1:]:
            if abs(Polygon(ring).area) < args.min_area: continue
            n_slab += 1
            SZ.append({'id': sid(f'piece|{n}|{n_slab}'), 'polygon': poly_pts(ring, xf), 'kind': 'grade' if on_grade else 'slab', 'thicknessIn': typ_thk,
                       'offsetIn': 0, 'label': '', 'page': page_no, 'source': 'revit'})
        # slab areas: every floor element that differs from the typical (thickness or top), and SOG areas on a suspended level
        n_area = 0
        for r, g in geoms:
            if r is m_rec: continue
            thk = thickness_from_name(r['type'])
            if thk is None: thk = round((r['zmax'] - r['zmin']) * 12, 2)
            off = round((r['zmax'] - base_top) * 12 * 4) / 4
            is_sog = bool(SOG.search(r['type'] or ''))
            if on_grade and is_sog: continue                     # the whole level is on grade already
            if not is_sog and abs(thk - typ_thk) < 0.125 and abs(off) < 0.25: continue   # same as the typical: covered by the edge
            if g.area < args.min_area: continue
            for ring, holes in poly_b(g):
                n_area += 1
                SZ.append({'id': sid(f'slab|{n}|{n_area}'), 'polygon': poly_pts(ring, xf), 'kind': 'grade' if is_sog else 'slab',
                           'thicknessIn': thk, 'offsetIn': off if not is_sog else 0, 'label': type_tail(r['type']), 'page': page_no, 'source': 'revit'})
        # beams
        n_beam = 0; beam_notes = collections.Counter()
        slab_lookup = [(g, r) for r, g in geoms]
        for b in P['beams']:
            g = shapely_from_fp(b['fp'])
            if g.is_empty or g.area < 1.0: continue
            w_in, d_in = size_from_name(b['type'])
            tail = type_tail(b['type'])
            if b.get('src') == 'floor':
                # "90x12 3/4 BM" → w×d ; '24" PT BM' → depth only, width from geometry
                if d_in is None:
                    d_in = thickness_from_name(b['type'])
                    w_in = None
            if d_in is None: d_in = round((b['zmax'] - b['zmin']) * 12 * 4) / 4; beam_notes['depth from geometry'] += 1
            if w_in is None:
                mrr = g.minimum_rotated_rectangle
                xs_, ys_ = mrr.exterior.coords.xy
                sides = sorted({round(math.hypot(xs_[i+1]-xs_[i], ys_[i+1]-ys_[i]), 3) for i in range(4)})
                w_in = round(sides[0] * 12 * 4) / 4; beam_notes['width from geometry'] += 1
            # T.O.S. offset: beam top vs the slab element under its centroid (else the typical)
            c = g.centroid; local_top = base_top
            for sg, sr in slab_lookup:
                if sg.contains(c): local_top = sr['zmax']; break
            off_in = round((b['zmax'] - local_top) * 12 * 4) / 4
            if b['zmax'] > base_top + 0.5 and off_in > 6:
                beam_notes['upturned / above slab (skipped)'] += 1; continue
            n_beam += 1
            for ring, holes in poly_b(g):
                SZ.append({'id': sid(f'beam|{n}|{b["gid"]}|{n_beam}'), 'polygon': poly_pts(ring, xf), 'kind': 'beam', 'thicknessIn': None,
                           'widthIn': w_in, 'depthIn': d_in, 'offsetIn': (None if abs(off_in) < 0.25 else off_in),
                           'label': tail, 'page': page_no, 'source': 'revit', 'mark': (b.get('pset') or {}).get('Mark Structural')})
        job_levels.append(lv)
        pages.append({'level': n, 'short': short, 'page': page_no, 'elev': lvl_elev, 'slab_top': base_top, 'typ_thk': typ_thk, 'on_grade': on_grade,
                      'pieces': pieces, 'slabs': geoms, 'beams': P['beams'], 'cols': P['cols'], 'walls': P['walls'], 'grid': ex['grid_lines']})
        report.append(f"{short:>6}  T.O.S. {fmt_ftin(lvl_elev):>10}  typ {typ_thk:g}\"  edge {Polygon(edge_ring).area:,.0f} SF  "
                       f"openings {n_open}  slab areas {n_area + n_slab}  beams {n_beam}{'  ON GRADE' if on_grade else ''}"
                       + (f"  [{'; '.join(f'{k}: {v}' for k, v in beam_notes.items())}]" if beam_notes else '') + step_note)

    # the app keeps levels top-down and builds its confirmation key in that order
    job_levels.sort(key=lambda l: -l['elevation'])
    job = {'project': {'name': args.name or ex['project'] or 'Revit job', 'grid': grid, 'constructionDL': 30, 'timberMaxH': 12,
                       'loadingConditions': [], 'llSchedule': [], 'sdlSchedule': [], 'skippedPages': [], 'sheetUnsure': [], 'zones': [],
                       # must equal the app's levelsKey(): JSON.stringify([name, elevation, slabThickness, !!onGrade, rangeFrom, rangeTo]) — JS prints 100.0 as 100
                       'levelsConfirmed': json.dumps([[l['name'], jsnum(l['elevation']), jsnum(l['slabThickness']), bool(l.get('onGrade')), None, None] for l in job_levels], separators=(',', ':')),
                       'shoreChoices': {}, 'regionLabels': {}, 'throughOk': {}, 'assumedScale': None,
                       'revit': {'source': ex['file'], 'exportedAt': time.strftime('%Y-%m-%dT%H:%M:%S'), 'rotationDeg': round(math.degrees(th), 3),
                                 'sheetScaleFtPerInch': scale, 'coordinateNote': 'building frame = model xy rotated about the slab centroid, y down; polygons are page px at 2 px/pt'}},
           'levels': job_levels, 'shores': SHORE_CATALOG, '_app': 'reshore-calc', '_version': 1, '_savedAt': time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())}
    return job, pages, xf, (W_in, H_in), scale, report, B

# ────────────────────────────────────────────────────────────────────────────
# Stage 3: the PDF drawing set
# ────────────────────────────────────────────────────────────────────────────
def render_pdf(pages, xf, sheet, scale, out_pdf, B, ex, args):
    import matplotlib; matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages
    from matplotlib.patches import PathPatch, Circle
    from matplotlib.path import Path
    from shapely.geometry import Polygon
    a, d, e, f = xf
    W_in, H_in = sheet
    Wpx, Hpx = W_in * 144, H_in * 144

    def px(ring): return [((x - e) / a, (y - f) / d) for x, y in ring]
    def patch(ax, ring, holes=(), **kw):
        verts = px(ring); codes = [Path.MOVETO] + [Path.LINETO] * (len(verts) - 1)
        for h in holes:
            hv = px(h); verts += hv; codes += [Path.MOVETO] + [Path.LINETO] * (len(hv) - 1)
        ax.add_patch(PathPatch(Path(verts, codes), **kw))

    xs_all, ys_all = [], []
    for pg in pages:
        for ring, holes in pg['pieces']:
            for x, y in px(ring): xs_all.append(x); ys_all.append(y)
    ext_px = (min(xs_all), min(ys_all), max(xs_all), max(ys_all))
    with PdfPages(out_pdf) as pdf:
        for pg in pages:
            fig = plt.figure(figsize=(W_in, H_in)); ax = fig.add_axes([0, 0, 1, 1])
            ax.set_xlim(0, Wpx); ax.set_ylim(Hpx, 0); ax.axis('off')
            # border + title strip
            ax.plot([36, Wpx-36, Wpx-36, 36, 36], [36, 36, Hpx-36, Hpx-36, 36], color='k', lw=1.2)
            strip_y = Hpx - 2.5 * 144
            ax.plot([36, Wpx-36], [strip_y, strip_y], color='k', lw=0.8)
            # slab pieces
            for ring, holes in pg['pieces']:
                patch(ax, ring, holes, facecolor='#e8f0e8' if not pg['on_grade'] else '#dfe9f3', edgecolor='k', lw=1.4)
            # slab areas that differ (draw outline + label)
            for r, g in pg['slabs']:
                thk = thickness_from_name(r['type'])
                if thk is None: thk = round((r['zmax'] - r['zmin']) * 12, 2)
                off = round((r['zmax'] - pg['slab_top']) * 12 * 4) / 4
                is_sog = bool(SOG.search(r['type'] or ''))
                if abs(thk - pg['typ_thk']) < 0.125 and abs(off) < 0.25 and not is_sog: continue
                if g.area < args.min_area: continue
                polys = [g] if isinstance(g, Polygon) else list(getattr(g, 'geoms', []))
                for p in polys:
                    ring = B(list(p.exterior.coords)); patch(ax, ring, [B(list(rr.coords)) for rr in p.interiors], facecolor='#cfe3cf' if not is_sog else '#c9dcef', edgecolor='k', lw=0.8, ls='--')
                    c = p.centroid; cx_, cy_ = px(B([(c.x, c.y)]))[0]
                    lbl = type_tail(r['type']) + (f"  T.O.S. {off:+g}\"" if abs(off) >= 0.25 else '')
                    ax.text(cx_, cy_, lbl, fontsize=7, ha='center', va='center', color='#333')
            # holes drawn as X'd openings
            for ring, holes in pg['pieces']:
                for h in holes:
                    if abs(Polygon(h).area) < args.min_opening: continue
                    hp = px(h); xs_ = [p[0] for p in hp]; ys_ = [p[1] for p in hp]
                    ax.plot([min(xs_), max(xs_)], [min(ys_), max(ys_)], color='k', lw=0.6); ax.plot([min(xs_), max(xs_)], [max(ys_), min(ys_)], color='k', lw=0.6)
            # beams
            for b in pg['beams']:
                g = shapely_from_fp(b['fp'])
                if g.is_empty: continue
                polys = [g] if isinstance(g, Polygon) else list(getattr(g, 'geoms', []))
                for p in polys:
                    patch(ax, B(list(p.exterior.coords)), facecolor='#bdbdbd', edgecolor='#555', lw=0.5, alpha=0.9)
                c = g.centroid; cx_, cy_ = px(B([(c.x, c.y)]))[0]
                mrr = g.minimum_rotated_rectangle; xs_, ys_ = mrr.exterior.coords.xy
                # label along the long side
                i = max(range(4), key=lambda k: math.hypot(xs_[k+1]-xs_[k], ys_[k+1]-ys_[k]))
                (x0, y0), (x1, y1) = px(B([(xs_[i], ys_[i])]))[0], px(B([(xs_[i+1], ys_[i+1])]))[0]
                ang = -math.degrees(math.atan2(y1 - y0, x1 - x0)); ang = (ang + 90) % 180 - 90
                if g.area > 25: ax.text(cx_, cy_, type_tail(b['type']).replace(' BM', ''), fontsize=5.5, ha='center', va='center', rotation=ang, color='#222')
            # columns and CIP walls
            for c in pg['cols']:
                for p in c['fp']: patch(ax, B(p['ext']), facecolor='k', edgecolor='none')
            for w in pg['walls']:
                for p in w['fp']: patch(ax, B(p['ext']), [B(h) for h in p['holes']], facecolor='#777', edgecolor='none')
            # gridlines: clean tags only, run across the building extents (all levels, so every
            # sheet reads the same) and the bubble sits just OUTSIDE those extents, never over the
            # slab, so it cannot get in the way of drawing areas (Adolfo, Sep 18 2026)
            from shapely.geometry import LineString, box as sbox
            bx0, by0, bx1, by1 = ext_px
            frame = sbox(bx0 - 30, by0 - 30, bx1 + 30, by1 + 30)
            seen = set()
            for gl in pg['grid']:
                if gl['storey'] != pg['level'] or gl['tag'] in seen or not clean_tag(gl['tag']): continue
                seen.add(gl['tag'])
                (x0, y0), (x1, y1) = px(B([tuple(gl['p0']), tuple(gl['p1'])]))
                L = math.hypot(x1 - x0, y1 - y0)
                if L < 1: continue
                ux, uy = (x1 - x0) / L, (y1 - y0) / L
                far = 1e5
                seg = LineString([(x0 - ux * far, y0 - uy * far), (x0 + ux * far, y0 + uy * far)]).intersection(frame)
                if seg.is_empty or seg.geom_type != 'LineString': continue
                (ax0, ay0), (ax1, ay1) = seg.coords[0], seg.coords[-1]
                ax.plot([ax0, ax1], [ay0, ay1], color='#9a9a9a', lw=0.5, ls=(0, (8, 4)))
                # bubble beyond the top end for near-vertical lines, beyond the left end otherwise
                if abs(ux) < 0.5: end, other = ((ax0, ay0), (ax1, ay1)) if ay0 < ay1 else ((ax1, ay1), (ax0, ay0))
                else:            end, other = ((ax0, ay0), (ax1, ay1)) if ax0 < ax1 else ((ax1, ay1), (ax0, ay0))
                dL = math.hypot(end[0] - other[0], end[1] - other[1]) or 1
                dx, dy = (end[0] - other[0]) / dL, (end[1] - other[1]) / dL
                bx_, by_ = end[0] + dx * 44, end[1] + dy * 44
                ax.plot([end[0], bx_ - dx * 30], [end[1], by_ - dy * 30], color='#9a9a9a', lw=0.5)
                ax.add_patch(Circle((bx_, by_), 30, facecolor='white', edgecolor='#444', lw=0.8))
                ax.text(bx_, by_, gl['tag'], fontsize=7, ha='center', va='center', color='#222')
            # title block text
            sc = '1/%d" = 1\'-0"' % round(12/scale) if (12/scale).is_integer() else f'1" = {scale:g}\''
            ax.text(72, strip_y + 60, f"{args.name or ex['project']}", fontsize=22, weight='bold', va='top')
            ax.text(72, strip_y + 135, f"LEVEL {pg['short']} FLOOR PLAN", fontsize=30, weight='bold', va='top')
            ax.text(72, strip_y + 225, f"T.O.S. {fmt_ftin(pg['elev'])}   ·   typical slab {pg['typ_thk']:g}\"   ·   scale {sc}"
                    + ("   ·   SLAB ON GRADE" if pg['on_grade'] else ''), fontsize=13, va='top')
            ax.text(72, strip_y + 280, f"Generated from {ex['file']} (Revit scope model) for the McClone Reshore Calculator — geometry only; loading marks are drawn in the calculator.",
                    fontsize=9, va='top', color='#444')
            ax.text(Wpx - 72, strip_y + 135, f"S{pg['page']:02d}", fontsize=40, weight='bold', ha='right', va='top')
            ax.text(Wpx - 72, strip_y + 250, f"sheet {pg['page']} of {len(pages)}", fontsize=11, ha='right', va='top')
            pdf.savefig(fig); plt.close(fig)
    log(f"wrote {out_pdf} ({len(pages)} pages)")

# ────────────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('ifc')
    ap.add_argument('--out', default='.', help='output folder')
    ap.add_argument('--name', default=None, help='job name (default: the IFC project name)')
    ap.add_argument('--rotate', default=None, help="'auto' (number gridlines vertical) or degrees counter-clockwise; default none")
    ap.add_argument('--scale', type=float, default=None, help='sheet scale in feet per inch (16 = 1/16"=1\'). Default: smallest standard scale that fits')
    ap.add_argument('--sheet', default='36x24', help='sheet size in inches, WxH (default 36x24)')
    ap.add_argument('--levels', default=None, help='comma list of level names to export (default all with floor slabs)')
    ap.add_argument('--min-opening', type=float, default=10.0, help='ignore openings under this many SF (default 10)')
    ap.add_argument('--min-area', type=float, default=15.0, help='ignore slab pieces under this many SF (default 15)')
    ap.add_argument('--simplify', type=float, default=0.02, help='polygon simplification tolerance in ft (default 0.02)')
    ap.add_argument('--shores-from', default=None, help='an existing .reshore.json whose shore catalog (including any custom shores) the job should carry instead of the default')
    ap.add_argument('--grid', choices=['primary', 'all'], default='primary', help="project grid: 'primary' keeps plain numbers/letters only (default), 'all' keeps every orthogonal line")
    args = ap.parse_args()
    args.sheet = tuple(float(v) for v in args.sheet.lower().split('x'))
    os.makedirs(args.out, exist_ok=True)
    ex = extract(args.ifc, args.out)
    job, pages, xf, sheet, scale, report, B = build(ex, args)
    if args.shores_from:
        src = json.load(open(args.shores_from))
        if isinstance(src.get('shores'), list) and src['shores']:
            job['shores'] = src['shores']; log(f"shore catalog taken from {args.shores_from} ({len(src['shores'])} shores)")
    base = re.sub(r'[^A-Za-z0-9_-]+', '_', args.name or ex['project'] or 'job').strip('_')
    pdf_path = os.path.join(args.out, f"{base}-revit-plans.pdf")
    job_path = os.path.join(args.out, f"{base}-revit.reshore.json")
    render_pdf(pages, xf, sheet, scale, pdf_path, B, ex, args)
    json.dump(job, open(job_path, 'w'), separators=(',', ':'))
    log(f"wrote {job_path}")
    print('\n' + '\n'.join(report))
    with open(os.path.join(args.out, f"{base}-revit-export-log.txt"), 'w') as fh:
        fh.write('\n'.join(LOG) + '\n\n' + '\n'.join(report) + '\n')

if __name__ == '__main__':
    main()
