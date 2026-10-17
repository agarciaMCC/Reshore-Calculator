// @rules RVT-16, RVT-17  (see DECISIONS.md)
// REVIT -> CALCULATOR, two misses found on the Horizon House model (Oct 17 2026).
//  RVT-16: B7 is a 10" topping on 4', 6' and 10' MAT SLAB foundation elements.
//    Mats were ignored, so B7 came out as 8,356 SF of suspended topping. A
//    level whose footprint mostly bears on mats (or is SOG) is on grade over
//    the whole footprint, mats included.
//  RVT-17: beams under a raised slab were dropped as "upturned". The check
//    used the slab under the beam's centroid, which is usually none (floors
//    are slotted where beams run), so it fell back to the level's typical top.
//    Now every slab touching the beam is looked at.
// A small made-up model is run straight through build(); no IFC is needed.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const here = fileURLToPath(new URL('.', import.meta.url));
const rvt = path.join(path.resolve(here, '..'), 'Revit export');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };

const py = (code) => {
  for (const exe of ['python3', 'python']) {
    const r = spawnSync(exe, ['-c', code], { cwd: rvt, encoding: 'utf8' });
    if (!r.error && !/Python was not found/.test(r.stderr || '')) return r;
  }
  return null;
};

const R = py(`
import sys, json, types; sys.path.insert(0, '.')
import ifc2reshore as m
m.log = lambda *a, **k: None
def box(x0, y0, x1, y1): return [{'ext': [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], 'holes': []}]
n = [0]
def el(storey, t, b, z0, z1):
    n[0] += 1
    return {'gid': 'g%d' % n[0], 'name': t, 'type': t, 'storey': storey, 'zmin': z0, 'zmax': z1, 'ztop': z1, 'fp': b, 'area': 0}
T = 10 / 12
slabs = [
  # MAT: a 10" topping on two thirds of the footprint, mats under all of it
  el('MAT', 'Floor:10" TOPPING SLAB', box(0, 0, 100, 60), -T, 0),
  el('MAT', "Foundation Slab:4' MAT SLAB", box(0, 0, 100, 60), -T - 4, -T),
  el('MAT', "Foundation Slab:10' MAT SLAB", box(0, 60, 100, 100), -10, -0.5),
  # DEEP: a suspended slab with a pit mat far below it is not on grade
  el('DEEP', 'Floor:10" MS SLAB', box(0, 0, 100, 100), 20 - T, 20),
  el('DEEP', "Foundation Slab:4' MAT SLAB", box(10, 10, 30, 30), 8, 12),
  # RAISED: the typical 10" slab, a piece raised +10", slotted at x 60..65 for a 60X20 beam
  el('RAISED', 'Floor:10" MS SLAB', box(0, 0, 60, 100), 40 - T, 40),
  el('RAISED', 'Floor:10" MS SLAB', box(65, 0, 100, 40), 40, 40 + T),
  el('RAISED', 'Floor:10" MS SLAB', box(65, 40, 100, 100), 40 - T, 40),
]
beams = [
  # under the raised piece, top +10": kept, flush with that slab
  el('RAISED', 'RECTANGULAR BEAMS:60X20 BM', box(60, 0, 65, 40), 40 + T - 20 / 12, 40 + T),
  # between two typical pieces, flush: kept
  el('RAISED', 'RECTANGULAR BEAMS:60X20 BM', box(60, 40, 65, 100), 40 - 20 / 12, 40),
  # sitting 2 ft above every slab it touches: upturned, skipped
  el('RAISED', 'RECTANGULAR BEAMS:24X24 BM', box(20, 20, 22, 60), 42, 44),
]
ex = {'file': 'test.ifc', 'project': 'T', 'projDatum': 0.0, 'grid_lines': [], 'openings': [], 'columns': [], 'walls': [],
      'storeys': [{'name': 'MAT', 'elev': 0.0}, {'name': 'DEEP', 'elev': 20.0}, {'name': 'RAISED', 'elev': 40.0}],
      'slabs': slabs, 'beams': beams}
args = types.SimpleNamespace(levels=None, rotate=None, sheet=(36.0, 24.0), scale=None, min_opening=10.0, min_area=15.0,
                             simplify=0.02, drawings='field', grid='primary', shores_from=None, name=None)
job = m.build(ex, args)[0]
out = {}
for l in job['levels']:
    zs = l['modelZones']
    edge = next(z for z in zs if z['kind'] == 'edge')
    from shapely.geometry import Polygon
    out[l['name']] = {'onGrade': bool(l.get('onGrade')), 'edgeSF': round(Polygon(edge['polygonFt']).area),
                      'kinds': sorted(z['kind'] for z in zs),
                      'beams': [[z['label'], z['offsetIn']] for z in zs if z['kind'] == 'beam']}
print(json.dumps(out))
`);
ok(R && R.status === 0, 'build() runs on the made-up model: ' + (R ? (R.stderr || '').trim().slice(-300) : 'no python'));
if (R && R.status === 0) {
  const o = JSON.parse(R.stdout.trim().split('\n').pop());
  console.log('RVT-16. a topping on mats is on grade, over the mats too');
  ok(o.MAT.onGrade, 'the level on mats is on grade: ' + JSON.stringify(o.MAT));
  ok(Math.abs(o.MAT.edgeSF - 10000) < 50, 'its edge is the whole footprint, mats included (10,000 SF), not just the topping (6,000): ' + o.MAT.edgeSF);
  ok(!o.MAT.kinds.includes('slab'), 'and the topping is not left as a suspended slab area: ' + o.MAT.kinds.join(','));
  ok(!o.DEEP.onGrade && Math.abs(o.DEEP.edgeSF - 10000) < 50, 'a suspended slab over a pit mat far below it is not on grade: ' + JSON.stringify(o.DEEP));
  console.log('RVT-17. a beam is judged against the slabs it touches');
  const b = o.RAISED.beams;
  ok(b.filter(x => /60X20/.test(x[0])).length === 2, 'both 60X20 beams are kept, the one under the raised piece too: ' + JSON.stringify(b));
  ok(b.every(x => x[1] === null), 'each is flush with the slab beside it, so no T.O.S. offset: ' + JSON.stringify(b));
  ok(!b.some(x => /24X24/.test(x[0])), 'a beam 2 ft above every slab it touches is still skipped as upturned');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
