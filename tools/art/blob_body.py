# Guildie: the shared blob body (body, face, feet) that every person is dressed on (art-direction.md §9.3).
# Builds it in Blender and exports client/src/world/models/blob_body.glb. Run from the repo root:
#   blender -b -P tools/art/blob_body.py            (or paste into Blender's Text Editor and press Run)
# Blender is Z-up and the face looks toward -Y; the glTF export turns that into the game's Y-up, +Z forward.
# Units are metres, as in blobs.ts before BLOB_SCALE. The outline must stay the 0.10 capsule (radius 0.5,
# 0.01 to 1.43 m): robes are tubes of radius 0.51 fitted to it. Skin is painted magenta (SKIN_MARK) and the
# game swaps in each person's body color. The three options Marz chose from on 2026-10-30 are kept in OPTIONS;
# he picked 'expressive'.
import bpy, bmesh, math
from mathutils import Vector, Matrix, Euler

SKIN_MARK = '#FF00FF'   # painted on skin parts; the game swaps it for the player's body colour
INK = '#2B2A33'

def lin(hexs):
    h = hexs.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    f = lambda v: v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (f(c[0]), f(c[1]), f(c[2]), 1.0)

def new_obj(name, bm, color, coll):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    col = lin(color)
    for d in attr.data:
        d.color = col
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob

def lathe(profile, segs):
    """profile: [(z, r)] bottom to top; r == 0 at the ends makes poles."""
    bm = bmesh.new()
    rings = []
    for z, r in profile:
        if r < 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.sin(2 * math.pi * i / segs), -r * math.cos(2 * math.pi * i / segs), z)) for i in range(segs)])
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1:
            for i in range(segs): bm.faces.new((a[0], b[(i + 1) % segs], b[i]))
        elif len(b) == 1:
            for i in range(segs): bm.faces.new((a[i], a[(i + 1) % segs], b[0]))
        else:
            for i in range(segs): bm.faces.new((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]))
    bm.normal_update()
    return bm

def ellipsoid(r, segs=10, rings=6, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    m = Matrix.Translation(loc) @ Euler(rot, 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm

def tube(points, radius, sides=5):
    """A thin tube along points (for smiles and brows), capped by its own ends."""
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(points):
        p = Vector(p)
        t = (Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(i - 1, 0)])).normalized()
        n = t.cross(Vector((0, 0, 1)))
        if n.length < 1e-4: n = t.cross(Vector((1, 0, 0)))
        n.normalize(); b = t.cross(n)
        rr = radius * (0.6 if i in (0, len(points) - 1) else 1.0)
        rings.append([bm.verts.new(p + rr * (math.cos(2 * math.pi * k / sides) * n + math.sin(2 * math.pi * k / sides) * b)) for k in range(sides)])
    for a, b in zip(rings, rings[1:]):
        for k in range(sides): bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bm.normal_update()
    return bm

# ---- the body: today's capsule outline (clothes are tubes of radius 0.51 fitted to it), finer and smoother
R, Z0, ZB, ZT, ZTOP = 0.5, 0.01, 0.51, 0.93, 1.43
CROWN = 7     # rings in the crown (9 for the preview renders)
LOW = True    # fewer segments on the small parts (False for the preview renders)
def body_profile(bottom_flat=1.0, crown=1.0):
    pts = [(Z0 + (1 - bottom_flat) * 0.08, 0.0)]
    for k in range(1, 7):            # bottom
        a = math.pi / 2 * k / 7
        pts.append((ZB - R * math.cos(a) * bottom_flat, R * math.sin(a)))
    for z in (ZB, 0.65, 0.79, ZT):    # straight middle, where the robes sit
        pts.append((z, R))
    for k in range(1, CROWN):        # crown, denser for a smooth silhouette under hats
        a = math.pi / 2 * k / CROWN
        pts.append((ZT + R * math.sin(a) * crown, R * math.cos(a)))
    pts.append((ZT + R * crown, 0.0))
    return pts

def surf(z, ang, inset=0.0):
    """A point on the body surface at height z, angle ang from the front (positive = character's left)."""
    if z <= ZT: r = R
    else: r = math.sqrt(max(R * R - (z - ZT) ** 2, 0))
    r -= inset
    return (r * math.sin(ang), -r * math.cos(ang), z)

def facing(ang, tilt=0.0):
    """Rotation so a part's local -Y points out of the body at angle ang."""
    return (tilt, 0, ang)

def eye(coll, side, z, ang, w, h, shine, name):
    out = []
    a = side * ang
    loc = surf(z, a, inset=0.02)
    out.append(new_obj(name + '_eye', ellipsoid(1, 8 if LOW else 10, 5 if LOW else 6, loc, (w, 0.035, h), facing(a, -0.15)), INK, coll))
    if shine:
        s = surf(z + h * 0.35, a - side * 0.05, inset=-0.03)
        out.append(new_obj(name + '_shine', ellipsoid(shine, 5 if LOW else 6, 3 if LOW else 4, s, (1, 0.5, 1), facing(a)), '#FFFFFF', coll))
    return out

def build(option, coll, x=0.0):
    parts = []
    parts.append(new_obj('body', lathe(body_profile(**option.get('body', {})), option.get('segs', 24)), SKIN_MARK, coll))
    f = option['face']
    for side in (-1, 1):
        parts += eye(coll, side, f['eye_z'], f['eye_ang'], f['eye_w'], f['eye_h'], f.get('shine', 0), 'L' if side > 0 else 'R')
        bl = surf(f['blush_z'], side * f['blush_ang'], inset=0.015)
        parts.append(new_obj('blush', ellipsoid(1, 6 if LOW else 8, 4, bl, (f['blush_w'], 0.03, f['blush_w'] * 0.6), facing(side * f['blush_ang'])), '#E98A86', coll))
        if f.get('brow'):
            z, a0 = f['eye_z'] + f['eye_h'] + f.get('brow_gap', 0.06), side * f['eye_ang']
            pts = [surf(z - 0.01 + 0.02 * side * 0, a0 + side * d, inset=-0.01) for d in (-0.1, 0.0, 0.1)]
            pts = [(p[0], p[1], p[2] + (0.015 if i == 1 else 0)) for i, p in enumerate(pts)]
            parts.append(new_obj('brow', tube(pts, 0.018, 5), INK, coll))
    if f.get('smile'):
        w, z = f['smile'], f['eye_z'] - 0.13
        pts = [surf(z + 0.035 * (u * u), u * w, inset=-0.005) for u in (-1, -0.5, 0, 0.5, 1)]
        parts.append(new_obj('smile', tube(pts, 0.016, 5), INK, coll))
    if f.get('nose'):
        parts.append(new_obj('nose', ellipsoid(f['nose'], 8 if LOW else 10, 5 if LOW else 6, surf(f['eye_z'] - 0.06, 0, inset=0.03), (1, 0.8, 0.85)), SKIN_MARK, coll))
    ft = option['feet']
    for side in (-1, 1):
        loc = (side * 0.22, -0.1 - ft.get('fwd', 0), 0.05)
        parts.append(new_obj('foot', ellipsoid(ft['r'], 10 if LOW else 12, 6 if LOW else 7, loc, ft['scale'], (0, 0, side * ft.get('splay', 0))), ft['color'], coll))
        if ft.get('sole'):
            parts.append(new_obj('sole', ellipsoid(ft['r'] * 1.04, 10 if LOW else 12, 3 if LOW else 4, (loc[0], loc[1], 0.015), (ft['scale'][0], ft['scale'][1], 0.18), (0, 0, side * ft.get('splay', 0))), ft['sole'], coll))
    # join into one mesh
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = option['name']; ob.data.name = option['name']
    ob.location.x = x
    return ob

OPTIONS = {
    'tidy': {'name': 'blob_tidy',
             'face': dict(eye_z=1.07, eye_ang=0.33, eye_w=0.068, eye_h=0.075, shine=0.022, blush_z=0.95, blush_ang=0.62, blush_w=0.085),
             'feet': dict(r=0.17, scale=(1.0, 1.35, 0.55), color='#5A3A28', fwd=0.02)},
    'softtoy': {'name': 'blob_softtoy', 'body': dict(bottom_flat=0.92),
                'face': dict(eye_z=1.06, eye_ang=0.30, eye_w=0.075, eye_h=0.105, shine=0.03, blush_z=0.94, blush_ang=0.6, blush_w=0.11, smile=0.11),
                'feet': dict(r=0.19, scale=(1.05, 1.25, 0.62), color='#5A3A28', fwd=0.04, splay=0.25)},
    'expressive': {'name': 'blob_expressive',
                   'face': dict(eye_z=1.07, brow_gap=0.05, eye_ang=0.31, eye_w=0.07, eye_h=0.09, shine=0.024, blush_z=0.95, blush_ang=0.64, blush_w=0.085, smile=0.13, brow=True, nose=0.075),
                   'feet': dict(r=0.18, scale=(0.95, 1.55, 0.6), color='#6B3E2A', fwd=0.07, splay=0.18, sole='#2B2A33')},
}


def export(path):
    import os
    sc = bpy.context.scene
    coll = bpy.data.collections.get('Guildie_Export') or bpy.data.collections.new('Guildie_Export')
    if coll.name not in sc.collection.children: sc.collection.children.link(coll)
    for o in list(coll.objects): bpy.data.objects.remove(o)
    opt = dict(OPTIONS['expressive'], segs=20, name='blob_body')
    ob = build(opt, coll)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_materials='NONE',
        export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True, export_yup=True,
        export_normals=True, export_texcoords=False, export_apply=True, export_animations=False, export_skins=False, export_morph=False)
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)

if __name__ == '__main__':
    import os
    out = os.path.join(os.getcwd(), 'client', 'src', 'world', 'models', 'blob_body.glb')
    print('blob_body.glb:', export(out), 'triangles ->', out)
