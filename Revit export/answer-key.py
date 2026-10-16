# -*- coding: utf-8 -*-
# THE MODEL AS ANSWER KEY (RVT-15)
# Runs INSIDE Revit (pyRevit, or the Revit MCP's execute_revit_code), on the
# open model, and writes what a drawing set printed from it should read back:
# levels, gridlines, floors (type, thickness, top offset, outline loops),
# beams, walls and columns, in the model's own feet. Read-only: no
# transaction is opened. The scorer (tests/tools/model-score.mjs) puts it in
# the project grid's frame and grades a calculator job against it.
#
#   OUT = r"C:\...\tests\fixtures\bothell-model.json"; exec(open(r"...\answer-key.py").read())
#
# IronPython 2.7: no f-strings.
import json, re
from Autodesk.Revit import DB

try:
    OUT
except NameError:
    OUT = None

def eid(e):
    # Revit 2024+ has ElementId.Value; older versions IntegerValue
    i = e.Id
    return int(getattr(i, 'Value', None) if hasattr(i, 'Value') else i.IntegerValue)

def tname(e):
    t = doc.GetElement(e.GetTypeId())
    if t is None:
        return ''
    p = t.get_Parameter(DB.BuiltInParameter.SYMBOL_NAME_PARAM)
    return p.AsString() if p else ''

def fam(e):
    t = doc.GetElement(e.GetTypeId())
    return getattr(t, 'FamilyName', '') if t is not None else ''

def num(e, bip, k=1.0):
    p = e.get_Parameter(bip)
    return round(p.AsDouble() * k, 4) if p is not None and p.HasValue else None

def pts(curve):
    # arcs and splines come back as their tessellation
    return [[round(q.X, 4), round(q.Y, 4)] for q in curve.Tessellate()]

def loop_pts(arr):
    out = []
    for c in arr:
        p = pts(c)
        if out and p and abs(out[-1][0] - p[0][0]) < 1e-6 and abs(out[-1][1] - p[0][1]) < 1e-6:
            p = p[1:]
        out.extend(p)
    if len(out) > 1 and abs(out[0][0] - out[-1][0]) < 1e-6 and abs(out[0][1] - out[-1][1]) < 1e-6:
        out = out[:-1]
    return out

levels = sorted(DB.FilteredElementCollector(doc).OfClass(DB.Level).ToElements(), key=lambda l: l.Elevation)
key = {'model': doc.Title, 'units': 'ft', 'levels': [], 'grids': [], 'floors': [], 'beams': [], 'walls': [], 'columns': []}
for l in levels:
    key['levels'].append({'name': l.Name, 'elev': round(l.Elevation, 4), 'id': eid(l)})

for g in DB.FilteredElementCollector(doc).OfClass(DB.Grid).ToElements():
    c = g.Curve
    key['grids'].append({'name': g.Name, 'p0': [round(c.GetEndPoint(0).X, 4), round(c.GetEndPoint(0).Y, 4)],
                         'p1': [round(c.GetEndPoint(1).X, 4), round(c.GetEndPoint(1).Y, 4)]})

lvname = lambda i: (doc.GetElement(i).Name if doc.GetElement(i) is not None else '')
for f in DB.FilteredElementCollector(doc).OfCategory(DB.BuiltInCategory.OST_Floors).WhereElementIsNotElementType().ToElements():
    sk = doc.GetElement(f.SketchId) if hasattr(f, 'SketchId') else None
    loops = [loop_pts(a) for a in sk.Profile] if sk is not None else []
    key['floors'].append({'id': eid(f), 'level': lvname(f.LevelId), 'type': tname(f),
        'thicknessIn': num(f, DB.BuiltInParameter.FLOOR_ATTR_THICKNESS_PARAM, 12),
        'offsetIn': num(f, DB.BuiltInParameter.FLOOR_HEIGHTABOVELEVEL_PARAM, 12),
        'areaSF': num(f, DB.BuiltInParameter.HOST_AREA_COMPUTED),
        'structural': bool(f.get_Parameter(DB.BuiltInParameter.FLOOR_PARAM_IS_STRUCTURAL).AsInteger()) if f.get_Parameter(DB.BuiltInParameter.FLOOR_PARAM_IS_STRUCTURAL) else None,
        'loops': loops})

for b in DB.FilteredElementCollector(doc).OfCategory(DB.BuiltInCategory.OST_StructuralFraming).WhereElementIsNotElementType().ToElements():
    lc = b.Location
    c = lc.Curve if hasattr(lc, 'Curve') else None
    lv = b.get_Parameter(DB.BuiltInParameter.INSTANCE_REFERENCE_LEVEL_PARAM)
    key['beams'].append({'id': eid(b), 'level': lv.AsValueString() if lv else '', 'type': tname(b), 'family': fam(b),
        'p0': [round(c.GetEndPoint(0).X, 4), round(c.GetEndPoint(0).Y, 4), round(c.GetEndPoint(0).Z, 4)] if c else None,
        'p1': [round(c.GetEndPoint(1).X, 4), round(c.GetEndPoint(1).Y, 4), round(c.GetEndPoint(1).Z, 4)] if c else None,
        'zOffsetIn': num(b, DB.BuiltInParameter.Z_OFFSET_VALUE, 12)})

for w in DB.FilteredElementCollector(doc).OfCategory(DB.BuiltInCategory.OST_Walls).WhereElementIsNotElementType().ToElements():
    lc = w.Location
    c = lc.Curve if hasattr(lc, 'Curve') else None
    key['walls'].append({'id': eid(w), 'type': tname(w), 'base': lvname(w.LevelId),
        'top': (w.get_Parameter(DB.BuiltInParameter.WALL_HEIGHT_TYPE).AsValueString() if w.get_Parameter(DB.BuiltInParameter.WALL_HEIGHT_TYPE) else ''),
        'widthIn': round(w.Width * 12, 3) if hasattr(w, 'Width') else None, 'line': pts(c) if c else None})

for c in DB.FilteredElementCollector(doc).OfCategory(DB.BuiltInCategory.OST_StructuralColumns).WhereElementIsNotElementType().ToElements():
    lp = c.Location
    p = lp.Point if hasattr(lp, 'Point') else None
    key['columns'].append({'id': eid(c), 'type': tname(c),
        'base': lvname(c.get_Parameter(DB.BuiltInParameter.FAMILY_BASE_LEVEL_PARAM).AsElementId()),
        'top': lvname(c.get_Parameter(DB.BuiltInParameter.FAMILY_TOP_LEVEL_PARAM).AsElementId()),
        'at': [round(p.X, 4), round(p.Y, 4)] if p else None,
        'rot': round(lp.Rotation, 5) if p is not None and hasattr(lp, 'Rotation') else 0})

txt = json.dumps(key, indent=1, sort_keys=True)
if OUT:
    import io
    with io.open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(unicode(txt))
print('levels %d grids %d floors %d beams %d walls %d columns %d' % (len(key['levels']), len(key['grids']), len(key['floors']), len(key['beams']), len(key['walls']), len(key['columns'])))
