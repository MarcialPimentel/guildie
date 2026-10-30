# Portovela town kit: Italian Renaissance (1400s) buildings for the 3D harbor and the Piazza, built in Blender
# from code so every change is reviewable. Run headless:
#
#   blender -b -P tools/art/town_kit.py -- --scheme ligurian --glb client/src/world/models/town_kit.glb
#   blender -b -P tools/art/town_kit.py -- --scheme florentine --preview out/preview   (renders PNGs)
#
# What makes it read Italian rather than Greek (docs/art-direction.md §9.4): round (semicircular) arches on
# slender Corinthian columns in grey pietra serena (Brunelleschi's loggias), heavy rusticated stone ground
# floors and big overhanging cornices (the Florentine palazzo), low-pitched terracotta hip roofs with eaves,
# quoins at the corners, green shutters, warm earth plasters, a ribbed brick dome with a lantern, a brick
# campanile, and the green-and-white marble of a Tuscan church front. No flat white roofs, no blue domes.
#
# Coordinates are the game's (x right, y up, z toward the sea, in metres); the exporter turns them into
# glTF. Every piece is one vertex-colored mesh, plus "<piece>_glass" (window panes the game lights at night).
# Walls painted MARK (magenta) are recolored per building by the game, so one house model comes in many colors.
import bpy, math, sys, os, random
from mathutils import Vector, Matrix

MARK = '#FF00FF'

SCHEMES = {
    # warm painted plaster over stone: cheerful, keeps the harbor's colors (recommended)
    'ligurian': dict(
        wall='#EBC79A', stone='#E6D5B3', stoneDark='#CDB68D', rustic='#D9C29A', joint='#A89070',
        serena='#8C9A98', serenaDark='#6F7C7B', roof='#C4623A', roofDark='#A9492A', eave='#7A4A32',
        shutter='#4F7A4A', door='#5A3A26', dark='#33302C', brick='#B86A4B', cream='#F4EBD8', white='#F7F3EA',
        majolica='#2A4C9A', gold='#D9A84A', marble='#3F6B57', iron='#4B5257', guild='#E8B98E', church='#F2E8D2',
        plaster=['#E9B872', '#E39B6B', '#EAA796', '#F1DCB0', '#F3CF78', '#D98C5F', '#F2C29A', '#E2B9A1'],
        stone_all=False,
    ),
    # honey stone and sober plaster: heavier, more like Florence itself
    'florentine': dict(
        wall='#CDB287', stone='#DCC7A0', stoneDark='#BFA47A', rustic='#C3A676', joint='#8E7552',
        serena='#7F8B89', serenaDark='#636E6C', roof='#B85A36', roofDark='#9C4429', eave='#6A4030',
        shutter='#6B4A30', door='#4E3220', dark='#2E2A26', brick='#A85C40', cream='#EADFC8', white='#F1EBDF',
        majolica='#2A4C9A', gold='#C99A3A', marble='#3F6B57', iron='#4B5257', guild='#D8BC92', church='#EFE6D2',
        plaster=['#E6CFA3', '#D9B98A', '#E3C48F', '#CDB79A', '#E8D7B5', '#D6A97A', '#DDBF94', '#CFAE86'],
        stone_all=True,
    ),
}
S = SCHEMES['ligurian']


def lin(hexs):
    h = hexs.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


class Builder:
    """Faces in game coordinates, each with a flat color; solids are wound outward automatically."""

    def __init__(self):
        self.v, self.f, self.c = [], [], []
        self.tf = Matrix.Identity(4)
        self.stack = []
        self.twin = None   # the glass builder follows this one's transforms

    # -- transforms
    def push(self, x=0, y=0, z=0, rot=0.0):
        self.stack.append(self.tf)
        self.tf = self.tf @ Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, 'Y')
        if self.twin:
            self.twin.push(x, y, z, rot)

    def pop(self):
        self.tf = self.stack.pop()
        if self.twin:
            self.twin.pop()

    def P(self, p):
        return self.tf @ Vector(p)

    # -- raw faces
    def _add(self, pts, col):
        i = len(self.v)
        self.v.extend(pts)
        self.f.append(list(range(i, i + len(pts))))
        self.c.append(col)

    @staticmethod
    def _normal(pts):
        n = Vector((0, 0, 0))
        for a, b in zip(pts, pts[1:] + pts[:1]):
            n.x += (a.y - b.y) * (a.z + b.z)
            n.y += (a.z - b.z) * (a.x + b.x)
            n.z += (a.x - b.x) * (a.y + b.y)
        return n

    def decal(self, pts, col, facing=(0, 0, 1)):
        """A flat face (local points), wound to face `facing` (a local direction)."""
        w = [self.P(p) for p in pts]
        d = (self.tf.to_3x3() @ Vector(facing))
        if self._normal(w).dot(d) < 0:
            w.reverse()
        self._add(w, col)

    def solid(self, pts, faces, col, skip_bottom=False):
        w = [self.P(p) for p in pts]
        cen = sum(w, Vector()) / len(w)
        for fi in faces:
            fp = [w[i] for i in fi]
            fc = sum(fp, Vector()) / len(fp)
            n = self._normal(fp)
            if n.length < 1e-9:
                continue
            if skip_bottom and n.normalized().y < -0.99:
                continue
            if n.dot(fc - cen) < 0:
                fp.reverse()
            self._add(fp, col)

    # -- primitives
    HEX = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]

    def hexa(self, pts, col, skip_bottom=False):
        self.solid(pts, self.HEX, col, skip_bottom)

    def box(self, x0, x1, y0, y1, z0, z1, col, bottom=False):
        p = [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), (x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)]
        self.hexa(p, col, skip_bottom=not bottom)

    def cyl(self, cx, cz, y0, y1, rb, rt, n, col, rot=None, bottom=False):
        rot = math.pi / n if rot is None else rot
        ring = lambda y, r: [(cx + r * math.cos(rot + 2 * math.pi * k / n), y, cz + r * math.sin(rot + 2 * math.pi * k / n)) for k in range(n)]
        if rt <= 1e-6:
            pts = ring(y0, rb) + [(cx, y1, cz)]
            faces = [list(range(n))] + [[k, (k + 1) % n, n] for k in range(n)]
        else:
            pts = ring(y0, rb) + ring(y1, rt)
            faces = [list(range(n)), list(range(n, 2 * n))] + [[k, (k + 1) % n, n + (k + 1) % n, n + k] for k in range(n)]
        self.solid(pts, faces, col, skip_bottom=not bottom)

    def disc(self, cx, cy, z, r, n, col, depth=0.06):
        """A round plaque on a wall facing +z (a cylinder lying on its axis)."""
        pts = [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n), z) for k in range(n)]
        pts += [(x, y, z + depth) for x, y, _ in pts]
        faces = [list(range(n)), list(range(n, 2 * n))] + [[k, (k + 1) % n, n + (k + 1) % n, n + k] for k in range(n)]
        self.solid(pts, faces, col)

    def lathe(self, cx, cz, prof, n, col, rot=None):
        """Revolve (r, y) profile points (bottom to top) into an n-sided solid; a final r of 0 makes a tip."""
        rot = math.pi / n if rot is None else rot
        rings = []
        for r, y in prof:
            rings.append([(cx + r * math.cos(rot + 2 * math.pi * k / n), y, cz + r * math.sin(rot + 2 * math.pi * k / n)) for k in range(n)])
        for a, b in zip(rings, rings[1:]):
            for k in range(n):
                q = [a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]]
                # wind outward: compare with the axis
                w = [self.P(p) for p in q]
                fc = sum(w, Vector()) / 4
                axis = self.P((cx, fc.y, cz))
                if self._normal(w).length < 1e-9:
                    w = [w[0], w[1], w[2]] if (w[2] - w[3]).length < 1e-9 else w
                if self._normal(w).dot(fc - axis) < 0:
                    w.reverse()
                self._add(w, col)
        top = rings[-1]
        if prof[-1][0] > 1e-6:
            self.decal(top, col, (0, 1, 0))
        return rings

    def hip_roof(self, x0, x1, z0, z1, y, h, col):
        w, d = x1 - x0, z1 - z0
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        if abs(w - d) < 1e-6:
            pts = [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1), (cx, y + h, cz)]
            self.solid(pts, [[0, 1, 2, 3], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]], col, skip_bottom=True)
        elif w > d:
            a, b = (x0 + d / 2, y + h, cz), (x1 - d / 2, y + h, cz)
            pts = [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1), a, b]
            self.solid(pts, [[0, 1, 2, 3], [0, 1, 5, 4], [3, 2, 5, 4], [0, 3, 4], [1, 2, 5]], col, skip_bottom=True)
        else:
            a, b = (cx, y + h, z0 + w / 2), (cx, y + h, z1 - w / 2)
            pts = [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1), a, b]
            self.solid(pts, [[0, 1, 2, 3], [0, 3, 5, 4], [1, 2, 5, 4], [0, 1, 4], [3, 2, 5]], col, skip_bottom=True)

    def gable_roof(self, x0, x1, z0, z1, y, h, col):
        """Ridge along z (a church nave)."""
        cx = (x0 + x1) / 2
        pts = [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1), (cx, y + h, z0), (cx, y + h, z1)]
        self.solid(pts, [[0, 1, 2, 3], [0, 3, 5, 4], [1, 2, 5, 4], [0, 1, 4], [3, 2, 5]], col, skip_bottom=True)

    def tri(self, a, b, c, col, facing):
        self.decal([a, b, c], col, facing)


# ---------------------------------------------------------------- architectural pieces (walls face +z at z)

def arch_pts(cx, y0, ys, r, n=6):
    """An arch-topped opening outline: straight sides from y0 up to the spring ys, a semicircle of radius r."""
    pts = [(cx - r, y0), (cx + r, y0)]
    for k in range(n + 1):
        a = math.pi * k / n
        pts.append((cx + r * math.cos(a), ys + r * math.sin(a)))
    # remove duplicate of the right spring point if y0 == ys
    out = []
    for p in pts:
        if not out or (abs(out[-1][0] - p[0]) > 1e-6 or abs(out[-1][1] - p[1]) > 1e-6):
            out.append(p)
    return out


def arch_band(b, cx, ys, r0, r1, z0, z1, col, n=6, alt=None):
    for k in range(n):
        a0, a1 = math.pi * k / n, math.pi * (k + 1) / n
        ring = [(cx + r0 * math.cos(a0), ys + r0 * math.sin(a0)), (cx + r0 * math.cos(a1), ys + r0 * math.sin(a1)),
                (cx + r1 * math.cos(a1), ys + r1 * math.sin(a1)), (cx + r1 * math.cos(a0), ys + r1 * math.sin(a0))]
        pts = [(x, y, z0) for x, y in ring] + [(x, y, z1) for x, y in ring]
        b.hexa(pts, alt if (alt and k % 2) else col)


def opening(b, g, cx, y0, w, h, z, arched=True, glass=True, col=None):
    """A dark or glazed opening flush on the wall."""
    r = w / 2
    if arched:
        pts = arch_pts(cx, y0, y0 + h - r, r)
    else:
        pts = [(cx - r, y0), (cx + r, y0), (cx + r, y0 + h), (cx - r, y0 + h)]
    target = g if glass else b
    target.decal([(x, y, z + 0.012) for x, y in pts], col or S['dark'], (0, 0, 1))


def window(b, g, cx, y0, w, h, z, arched=True, shutters=True, frame=None, lintel=False, sill=True, glass=True):
    frame = frame or S['stone']
    r = w / 2
    t, dz = 0.1, 0.07
    opening(b, g, cx, y0, w, h, z, arched, glass)
    top = y0 + h - r if arched else y0 + h
    b.box(cx - r - t, cx - r, y0, top, z, z + dz, frame)
    b.box(cx + r, cx + r + t, y0, top, z, z + dz, frame)
    if arched:
        arch_band(b, cx, top, r, r + t, z, z + dz, frame, n=6)
    else:
        b.box(cx - r - t, cx + r + t, top, top + t, z, z + dz, frame)
        if lintel:
            b.box(cx - r - t - 0.06, cx + r + t + 0.06, top + t, top + t + 0.08, z, z + 0.14, frame)
    if sill:
        b.box(cx - r - t - 0.05, cx + r + t + 0.05, y0 - 0.08, y0, z, z + 0.14, frame)
    if shutters:
        sw = w * 0.5
        b.box(cx - r - t - sw, cx - r - t, y0, top, z, z + 0.05, S['shutter'])
        b.box(cx + r + t, cx + r + t + sw, y0, top, z, z + 0.05, S['shutter'])


def bifora(b, g, cx, y0, w, h, z, frame=None):
    """The Florentine palazzo window: one round arch holding two arched lights and a small column."""
    frame = frame or S['stone']
    r = w / 2
    ys = y0 + h - r
    t = 0.12
    b.decal([(x, y, z + 0.006) for x, y in arch_pts(cx, y0, ys, r)], S['joint'] if S['stone_all'] else S['stoneDark'], (0, 0, 1))
    lw = w * 0.38
    for dx in (-w * 0.24, w * 0.24):
        opening(b, g, cx + dx, y0, lw, h * 0.72, z + 0.004)
    b.cyl(cx, z + 0.06, y0, y0 + h * 0.72 - lw / 2, 0.05, 0.05, 6, frame)
    b.disc(cx, ys + r * 0.45, z + 0.01, r * 0.18, 8, S['dark'], 0.02)
    b.box(cx - r - t, cx - r, y0, ys, z, z + 0.08, frame)
    b.box(cx + r, cx + r + t, y0, ys, z, z + 0.08, frame)
    arch_band(b, cx, ys, r, r + t, z, z + 0.08, frame, n=7)
    b.box(cx - r - t - 0.08, cx + r + t + 0.08, y0 - 0.12, y0, z, z + 0.18, frame)


def rustication(b, x0, x1, y0, y1, z, bh=0.45, bw=0.9, holes=(), col=None, rnd=None, heavy=True):
    """Rows of protruding stone blocks with dark joints; `holes` are (xa, xb, ytop) left open."""
    col = col or S['rustic']
    rnd = rnd or random.Random(1)
    b.decal([(x0, y0, z + 0.004), (x1, y0, z + 0.004), (x1, y1, z + 0.004), (x0, y1, z + 0.004)], S['joint'])
    gap = 0.045
    y, row = y0, 0
    while y < y1 - 1e-6:
        yt = min(y + bh, y1)
        x = x0 - (bw / 2 if row % 2 else 0)
        while x < x1 - 1e-6:
            xa, xb = max(x, x0), min(x + bw, x1)
            x += bw
            if xb - xa < 0.15:
                continue
            if any(xb > ha - 0.05 and xa < hb + 0.05 and y < ht for ha, hb, ht in holes):
                continue
            d = (0.1 + rnd.random() * 0.05) if heavy else 0.04
            b.box(xa + gap / 2, xb - gap / 2, y + gap / 2, yt - gap / 2, z, z + d, col)
        y = yt
        row += 1


def quoins(b, x, z, y0, y1, sx, sz, step=0.42, col=None):
    """Corner stones up a vertical edge at (x, z); sx, sz = -1/+1, which way the walls run from the corner."""
    col = col or S['stone']
    k, y = 0, y0
    while y < y1 - 0.05:
        yt = min(y + step - 0.05, y1)
        a, c = (0.55, 0.3) if k % 2 == 0 else (0.3, 0.55)
        xa, xb = sorted((x + 0.04 * -sx, x + sx * -a + 0 * sx))
        # blocks lie along both faces from the corner inward
        xa, xb = sorted((x - sx * a, x + sx * 0.04))
        za, zb = sorted((z - sz * c, z + sz * 0.04))
        b.box(xa, xb, y, yt, za, zb, col)
        y += step
        k += 1


def cornice(b, x0, x1, z0, z1, y, layers, col=None, col2=None):
    """Stepped moulded cornice: layers of (height, overhang)."""
    col = col or S['stone']
    for i, (h, o) in enumerate(layers):
        b.box(x0 - o, x1 + o, y, y + h, z0 - o, z1 + o, col2 if (col2 and i == len(layers) - 1) else col)
        y += h
    return y


def column(b, x, z, y0, y1, r=0.22, col=None, cap=None):
    """A slender Corinthian column: square base, tapered shaft, flared capital and abacus."""
    col = col or S['serena']
    cap = cap or col
    b.box(x - r * 1.5, x + r * 1.5, y0, y0 + 0.16, z - r * 1.5, z + r * 1.5, col)
    b.cyl(x, z, y0 + 0.16, y0 + 0.26, r * 1.25, r * 1.05, 8, col)
    b.cyl(x, z, y0 + 0.26, y1 - 0.38, r, r * 0.88, 8, col)
    b.cyl(x, z, y1 - 0.38, y1 - 0.12, r * 0.88, r * 1.45, 8, cap)
    for a in range(4):   # the corner volutes of a Corinthian capital
        ang = math.pi / 4 + a * math.pi / 2
        vx, vz = x + math.cos(ang) * r * 1.35, z + math.sin(ang) * r * 1.35
        b.box(vx - 0.06, vx + 0.06, y1 - 0.24, y1 - 0.1, vz - 0.06, vz + 0.06, cap)
    b.box(x - r * 1.75, x + r * 1.75, y1 - 0.12, y1, z - r * 1.75, z + r * 1.75, col)


def arcade_wall(b, centers, a, r, ys, ytop, z0, z1, col, n=8):
    """A wall with round-arched openings: for each bay centered at cx (half width a), the solid above the arch."""
    th_c = math.atan2(ytop - ys, a)
    angs = sorted(set([math.pi * k / n for k in range(n + 1)] + [th_c, math.pi - th_c]))
    for cx in centers:
        def R(t):
            c, s = math.cos(t), math.sin(t)
            tt = min(a / abs(c) if abs(c) > 1e-9 else 1e9, (ytop - ys) / s if s > 1e-9 else 1e9)
            return (cx + c * tt, ys + s * tt)
        for t0, t1 in zip(angs, angs[1:]):
            ring = [(cx + r * math.cos(t0), ys + r * math.sin(t0)), (cx + r * math.cos(t1), ys + r * math.sin(t1)), R(t1), R(t0)]
            pts = [(x, y, z0) for x, y in ring] + [(x, y, z1) for x, y in ring]
            b.hexa(pts, col)


def belfry(b, s, y0, h_pier, col, arch_col, pier=0.7):
    """An open bell chamber on four corner piers, one round arch per side, s = half width."""
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.box(min(sx * s, sx * (s - pier)), max(sx * s, sx * (s - pier)), y0, y0 + h_pier,
                  min(sz * s, sz * (s - pier)), max(sz * s, sz * (s - pier)), col)
    a = s - pier
    ys = y0 + h_pier
    top = ys + a + 0.35
    for k in range(4):
        b.push(rot=k * math.pi / 2)
        arcade_wall(b, [0], a, a, ys, top, s - pier, s, col, n=6)
        arch_band(b, 0, ys, a - 0.02, a + 0.14, s, s + 0.06, arch_col, n=6)
        b.pop()
    return top


# ---------------------------------------------------------------- the pieces

def house_a(b, g):
    """Casa-bottega: two floors, a shop arch on the ground floor."""
    W, D, H = 1.8, 2.0, 5.2
    b.box(-W, W, 0, H, -D, D, MARK)
    b.box(-W - 0.05, W + 0.05, 0, 0.35, -D - 0.05, D + 0.05, S['stoneDark'])
    b.box(-W - 0.06, W + 0.06, 2.7, 2.84, -D - 0.06, D + 0.06, S['stone'])
    for sx in (-1, 1):
        quoins(b, sx * W, D, 0.35, H, sx, 1)
    opening(b, g, -0.55, 0.35, 1.5, 2.15, D, glass=False, col=S['door'])
    b.box(-1.3 - 0.1, -1.3, 0.35, 1.75, D, D + 0.08, S['stone'])
    b.box(0.2, 0.3, 0.35, 1.75, D, D + 0.08, S['stone'])
    arch_band(b, -0.55, 1.75, 0.75, 0.88, D, D + 0.08, S['stone'], n=6, alt=S['stoneDark'])
    window(b, g, 1.15, 1.0, 0.55, 0.85, D, arched=False, shutters=False)
    for cx in (-0.85, 0.85):
        window(b, g, cx, 3.25, 0.68, 1.3, D)
    y = cornice(b, -W, W, -D, D, H, [(0.12, 0.08), (0.12, 0.22), (0.1, 0.34)], col2=S['eave'])
    b.hip_roof(-W - 0.4, W + 0.4, -D - 0.4, D + 0.4, y, 1.0, S['roof'])
    b.box(0.8, 1.2, y, y + 1.4, -1.1, -0.7, MARK)
    b.box(0.7, 1.3, y + 1.4, y + 1.55, -1.2, -0.6, S['roofDark'])


def house_b(b, g):
    """Tall and narrow: three floors, framed windows with green shutters, a small iron balcony."""
    W, D, H = 1.5, 2.0, 7.6
    b.box(-W, W, 0, H, -D, D, MARK)
    b.box(-W - 0.05, W + 0.05, 0, 0.5, -D - 0.05, D + 0.05, S['stoneDark'])
    for y in (2.6, 5.0):
        b.box(-W - 0.05, W + 0.05, y, y + 0.12, -D - 0.05, D + 0.05, S['stone'])
    for sx in (-1, 1):
        quoins(b, sx * W, D, 0.5, H, sx, 1)
    opening(b, g, 0.55, 0.5, 0.95, 1.95, D, glass=False, col=S['door'])
    arch_band(b, 0.55, 0.5 + 1.95 - 0.475, 0.475, 0.6, D, D + 0.08, S['stone'], n=6)
    b.box(0.55 - 0.6, 0.55 - 0.475, 0.5, 1.975, D, D + 0.08, S['stone'])
    b.box(0.55 + 0.475, 0.55 + 0.6, 0.5, 1.975, D, D + 0.08, S['stone'])
    window(b, g, -0.75, 1.05, 0.5, 0.75, D, arched=False, shutters=False)
    for k in range(3):
        b.box(-0.95 + k * 0.2, -0.92 + k * 0.2, 1.05, 1.8, D + 0.02, D + 0.06, S['iron'])
    for y0 in (2.95, 5.35):
        for cx in (-0.68, 0.68):
            window(b, g, cx, y0, 0.58, 1.15, D, arched=False, lintel=True)
    b.box(-1.25, -0.1, 2.82, 2.92, D, D + 0.5, S['stone'])
    b.box(-1.25, -0.1, 3.4, 3.45, D + 0.44, D + 0.5, S['iron'])
    for k in range(6):
        b.box(-1.22 + k * 0.22, -1.19 + k * 0.22, 2.92, 3.4, D + 0.45, D + 0.49, S['iron'])
    y = cornice(b, -W, W, -D, D, H, [(0.12, 0.08), (0.14, 0.24), (0.1, 0.38)], col2=S['eave'])
    b.hip_roof(-W - 0.42, W + 0.42, -D - 0.42, D + 0.42, y, 0.9, S['roofDark'])


def house_c(b, g):
    """Palazzetto: rusticated ground floor, two biforate windows, a heavy cornice."""
    W, D, H = 2.3, 2.2, 8.2
    wall = S['wall'] if S['stone_all'] else MARK
    b.box(-W, W, 0, H, -D, D, wall)
    rustication(b, -W, W, 0, 3.0, D, holes=[(-0.7, 0.7, 2.6), (-1.75, -1.3, 1.95), (1.3, 1.75, 1.95)], rnd=random.Random(3))
    for sx in (-1, 1):   # the side walls' ground floor too
        b.push(rot=sx * math.pi / 2)
        rustication(b, -D, D, 0, 3.0, W, rnd=random.Random(4 + sx), heavy=False)
        b.pop()
    opening(b, g, 0, 0.0, 1.4, 2.5, D + 0.1, glass=False, col=S['door'])
    arch_band(b, 0, 1.8, 0.7, 0.98, D + 0.04, D + 0.2, S['rustic'], n=7)
    for cx in (-1.52, 1.52):
        opening(b, g, cx, 1.45, 0.42, 0.42, D + 0.1, arched=False)
    b.box(-W - 0.06, W + 0.06, 3.0, 3.2, -D - 0.06, D + 0.06, S['stone'])
    b.box(-W - 0.04, W + 0.04, 5.75, 5.87, -D - 0.04, D + 0.04, S['stone'])
    if S['stone_all']:
        for y in [3.8, 4.4, 5.0, 6.4, 7.0, 7.6]:
            b.box(-W, W, y, y + 0.03, D, D + 0.01, S['joint'])
    for cx in (-1.15, 1.15):
        bifora(b, g, cx, 3.55, 1.3, 1.95, D)
    for cx in (-1.45, 0, 1.45):
        window(b, g, cx, 6.1, 0.5, 0.95, D, shutters=False)
    y = cornice(b, -W, W, -D, D, H, [(0.14, 0.1), (0.1, 0.22), (0.16, 0.42), (0.14, 0.62)], col2=S['eave'])
    b.hip_roof(-W - 0.6, W + 0.6, -D - 0.6, D + 0.6, y, 1.0, S['roof'])


def house_d(b, g):
    """Two floors and a roof loggia of three arches on columns (an altana), two shop arches below."""
    W, D, H = 2.0, 2.0, 6.4
    b.box(-W, W, 0, H, -D, D, MARK)
    b.box(-W - 0.05, W + 0.05, 0, 0.3, -D - 0.05, D + 0.05, S['stoneDark'])
    for y in (2.35, 4.5):
        b.box(-W - 0.06, W + 0.06, y, y + 0.14, -D - 0.06, D + 0.06, S['stone'])
    for sx in (-1, 1):
        quoins(b, sx * W, D, 0.3, 4.5, sx, 1)
    for cx in (-0.95, 0.95):
        opening(b, g, cx, 0.3, 1.25, 1.95, D, glass=False, col=S['door'])
        arch_band(b, cx, 0.3 + 1.95 - 0.625, 0.625, 0.75, D, D + 0.08, S['stone'], n=6)
    for cx in (-1.25, 0, 1.25):
        window(b, g, cx, 2.75, 0.55, 1.1, D, arched=False, lintel=True)
    # the loggia: dark arches with columns in front and a parapet
    for cx in (-1.3, 0, 1.3):
        b.decal([(x, y, D + 0.012) for x, y in arch_pts(cx, 4.64, 5.65, 0.56)], '#5E4636', (0, 0, 1))
        arch_band(b, cx, 5.65, 0.56, 0.68, D, D + 0.1, S['stone'], n=6)
    for cx in (-1.95, -0.65, 0.65, 1.95):
        column(b, cx, D + 0.14, 4.64, 5.65, r=0.09, col=S['stone'])
    b.box(-W, W, 4.64, 5.0, D + 0.02, D + 0.3, S['stone'])
    y = cornice(b, -W, W, -D, D, H, [(0.12, 0.08), (0.12, 0.24), (0.1, 0.4)], col2=S['eave'])
    b.hip_roof(-W - 0.45, W + 0.45, -D - 0.45, D + 0.45, y, 0.95, S['roof'])


def chiesa(b, g):
    """A Renaissance church: a two-tier front in green and white marble with volutes and an oculus, a ribbed
    terracotta dome with a lantern on an octagonal drum, and a brick campanile beside it. Front at z = 0."""
    cr, mb = S['church'], S['marble']
    b.box(-3, 3, 0, 5.0, -7.2, 0, cr)                       # aisles
    b.box(-3.05, 3.05, 5.0, 5.15, -7.25, 0.05, S['roofDark'])
    b.box(-1.8, 1.8, 5.0, 7.6, -7.2, 0, cr)                  # the nave
    b.gable_roof(-2.1, 2.1, -7.4, 0.1, 7.6, 1.1, S['roof'])
    # the front, lower tier: pilasters, banding, the portal
    b.box(-3.05, 3.05, 0, 0.45, -0.05, 0.12, mb)
    for x in (-2.9, -1.55, 1.55, 2.9):
        b.box(x - 0.17, x + 0.17, 0.45, 4.2, 0, 0.14, mb)
    b.box(-3.1, 3.1, 4.2, 4.42, -0.05, 0.16, cr)
    b.box(-3.1, 3.1, 4.42, 4.6, -0.05, 0.18, mb)
    b.box(-3.15, 3.15, 4.6, 4.75, -0.05, 0.22, cr)
    opening(b, g, 0, 0.45, 1.5, 2.9, 0.02, glass=False, col=S['door'])
    arch_band(b, 0, 0.45 + 2.9 - 0.75, 0.75, 1.0, 0, 0.14, cr, n=8, alt=mb)
    b.box(-1.0, -0.75, 0.45, 2.6, 0, 0.14, cr)
    b.box(0.75, 1.0, 0.45, 2.6, 0, 0.14, cr)
    for x in (-2.22, 2.22):
        b.decal([(x - 0.3, 1.2, 0.012), (x + 0.3, 1.2, 0.012), (x + 0.3, 3.4, 0.012), (x - 0.3, 3.4, 0.012)], mb)
        b.disc(x, 3.75, 0.0, 0.18, 8, mb, 0.04)
    # upper tier
    b.box(-1.9, 1.9, 4.75, 7.6, 0, 0.18, cr)
    for x in (-1.75, 1.75):
        b.box(x - 0.15, x + 0.15, 4.75, 7.6, 0.1, 0.26, mb)
    b.box(-1.95, 1.95, 7.45, 7.62, 0.0, 0.3, mb)
    pts = [(-2.05, 7.62, 0.0), (2.05, 7.62, 0.0), (0, 8.85, 0.0), (-2.05, 7.62, 0.28), (2.05, 7.62, 0.28), (0, 8.85, 0.28)]
    b.solid(pts, [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]], cr)
    b.tri((-1.4, 7.8, 0.29), (1.4, 7.8, 0.29), (0, 8.55, 0.29), mb, (0, 0, 1))
    b.disc(0, 6.2, 0.18, 0.62, 12, mb, 0.06)
    b.disc(0, 6.2, 0.24, 0.48, 12, cr, 0.03)
    g.decal([(0.4 * math.cos(2 * math.pi * k / 10), 6.2 + 0.4 * math.sin(2 * math.pi * k / 10), 0.28) for k in range(10)], S['dark'])
    for sx in (-1, 1):   # volutes: quarter circles from the aisle roof up to the upper tier
        prof = [(sx * 1.9, 4.75)] + [(sx * (1.9 + 1.15 * math.cos(math.pi / 2 * k / 5)), 4.75 + 1.15 * math.sin(math.pi / 2 * k / 5)) for k in range(6)]
        for (x0, y0), (x1, y1) in zip(prof[1:], prof[2:]):
            pts = [(sx * 1.9, 4.75, 0.0), (x0, y0, 0.0), (x1, y1, 0.0), (sx * 1.9, 4.75, 0.2), (x0, y0, 0.2), (x1, y1, 0.2)]
            b.solid(pts, [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]], cr)
        b.disc(sx * 2.85, 4.95, 0.2, 0.2, 8, mb, 0.05)
    # side windows (arched, glazed)
    for z in (-2.0, -4.5):
        for sx in (-1, 1):
            b.push(x=0, z=z, rot=sx * math.pi / 2)
            window(b, g, 0, 1.6, 0.6, 1.6, 3.0, shutters=False, frame=cr)
            b.pop()
    # the drum and the dome over the crossing
    zc = -4.9
    b.cyl(0, zc, 7.4, 9.3, 2.25, 2.25, 8, cr, rot=0)
    for k in range(8):
        a = 2 * math.pi * k / 8 + math.pi / 8
        b.push(x=0, y=0, z=zc, rot=math.pi / 2 - a)
        b.disc(0, 8.35, 2.08, 0.28, 8, mb, 0.04)
        g.decal([(0.2 * math.cos(2 * math.pi * j / 8), 8.35 + 0.2 * math.sin(2 * math.pi * j / 8), 2.13) for j in range(8)], S['dark'])
        b.pop()
    b.cyl(0, zc, 9.3, 9.55, 2.45, 2.45, 8, S['white'], rot=0)
    prof = [(2.3, 9.55), (2.22, 10.35), (1.95, 11.15), (1.5, 11.85), (0.88, 12.4), (0.5, 12.6)]
    b.lathe(0, zc, prof, 8, S['roof'], rot=0)
    for k in range(8):   # white marble ribs on the dome's eight corners
        a = 2 * math.pi * k / 8
        ca, sa = math.cos(a), math.sin(a)
        tx, tz = -sa, ca
        for (r0, y0), (r1, y1) in zip(prof, prof[1:]):
            q = []
            for rr, yy in ((r0, y0), (r1, y1)):
                for side in (-1, 1):
                    q.append((rr * ca + 0.09 * side * tx, yy, zc + rr * sa + 0.09 * side * tz))
            inner = [q[0], q[1], q[3], q[2]]
            outer = [(x + ca * 0.1, y + 0.02, z + sa * 0.1) for x, y, z in inner]
            b.hexa(inner + outer, S['white'])
    b.cyl(0, zc, 12.6, 13.45, 0.52, 0.52, 8, S['white'], rot=0)
    for k in range(8):
        a = 2 * math.pi * k / 8
        b.box(math.cos(a) * 0.52 - 0.07, math.cos(a) * 0.52 + 0.07, 12.6, 13.45, zc + math.sin(a) * 0.52 - 0.07, zc + math.sin(a) * 0.52 + 0.07, S['white'])
    b.cyl(0, zc, 13.45, 14.25, 0.62, 0.0, 8, S['white'], rot=0)
    b.cyl(0, zc, 14.2, 14.5, 0.16, 0.0, 6, S['gold'])
    b.cyl(0, zc, 14.0, 14.2, 0.0001, 0.16, 6, S['gold'])
    # the campanile, east of the front
    b.push(x=4.45, z=-2.2)
    s = 1.1
    b.box(-s, s, 0, 9.0, -s, s, S['brick'])
    for sx in (-1, 1):
        for sz in (-1, 1):
            quoins(b, sx * s, sz * s, 0, 9.0, sx, sz, step=0.55)
    for y in (3.4, 6.4):
        b.box(-s - 0.06, s + 0.06, y, y + 0.14, -s - 0.06, s + 0.06, S['stone'])
    window(b, g, 0, 4.2, 0.36, 1.0, s, shutters=False, sill=False)
    window(b, g, 0, 7.0, 0.36, 1.0, s, shutters=False, sill=False)
    y = cornice(b, -s, s, -s, s, 9.0, [(0.18, 0.08)])
    b.cyl(0, 0, y + 0.3, y + 1.0, 0.0001, 0.38, 6, S['gold'])
    b.cyl(0, 0, y + 1.0, y + 1.15, 0.38, 0.0, 6, S['gold'])
    top = belfry(b, s, y, 1.25, S['brick'], S['stone'], pier=0.38)
    y = cornice(b, -s, s, -s, s, top, [(0.14, 0.1), (0.12, 0.2)])
    b.hip_roof(-s - 0.3, s + 0.3, -s - 0.3, s + 0.3, y, 1.9, S['roofDark'])
    b.cyl(0, 0, y + 1.85, y + 2.2, 0.12, 0.0, 6, S['gold'])
    b.pop()


def palazzo(b, g):
    """The Palazzo del Comune: three floors over a Brunelleschi loggia (seven round arches on Corinthian columns
    in pietra serena, majolica roundels in the spandrels), a rusticated ground floor, biforate windows and a
    heavy cornice. Origin: the body's centre on the ground; the loggia stands in front (z 3.5 to 7)."""
    W, D = 11.0, 3.5
    wall = S['wall']
    b.box(-W, W, 0, 11.4, -D, D, wall)
    # rusticated ground floor: the sides, the front ends beside the loggia, and behind the loggia
    rnd = random.Random(11)
    for sx in (-1, 1):
        b.push(rot=sx * math.pi / 2)
        rustication(b, -D, D, 0, 6.0, W, bh=0.6, bw=1.2, rnd=rnd)
        b.pop()
    # behind the loggia (in its shade) the stone courses are just drawn: cheaper, and it reads the same
    for xa, xb in ((-W, -1.6), (1.6, W)):
        b.decal([(xa, 0, D + 0.004), (xb, 0, D + 0.004), (xb, 4.55, D + 0.004), (xa, 4.55, D + 0.004)], S['rustic'])
        for k in range(1, 10):
            b.box(xa, xb, k * 0.45, k * 0.45 + 0.05, D, D + 0.012, S['joint'])
    rustication(b, -W, W, 4.55, 6.0, D, bh=0.5, bw=1.4, holes=[(-1.6, 1.6, 6.0)], rnd=rnd, heavy=False)
    b.box(-W - 0.12, W + 0.12, 6.0, 6.28, -D - 0.12, D + 0.12, S['stone'])
    b.box(-W - 0.08, W + 0.08, 9.5, 9.66, -D - 0.08, D + 0.08, S['stone'])
    if S['stone_all']:
        for y in [6.9, 7.6, 8.3, 9.0, 10.3, 10.9]:
            for sx in (-1, 1):
                b.push(rot=sx * math.pi / 2)
                b.box(-D, D, y, y + 0.04, W, W + 0.01, S['joint'])
                b.pop()
            b.box(-W, W, y, y + 0.04, D, D + 0.01, S['joint'])
    else:
        for sx in (-1, 1):
            quoins(b, sx * W, D, 6.28, 11.4, sx, 1, step=0.5)
    # piano nobile: biforate windows (the middle bay holds the Factotum's portrait, added by the game)
    for i in range(7):
        if i == 3:
            continue
        bifora(b, g, -8.4 + i * 2.8, 6.65, 1.5, 2.45, D)
        window(b, g, -8.4 + i * 2.8, 9.95, 0.6, 0.7, D, arched=False, shutters=False)
    window(b, g, 0, 9.95, 0.6, 0.7, D, arched=False, shutters=False)
    for sx in (-1, 1):
        b.push(rot=sx * math.pi / 2)
        for z in (-1.4, 1.4):
            bifora(b, g, z, 6.65, 1.5, 2.45, W)
        b.pop()
    y = cornice(b, -W, W, -D, D, 11.4, [(0.18, 0.12), (0.14, 0.3), (0.12, 0.45), (0.24, 0.72), (0.14, 0.86)], col2=S['eave'])
    for k in range(28):   # brackets (modiglioni) under the cornice, front
        x = -W + 0.3 + k * (2 * W - 0.6) / 27
        b.box(x - 0.08, x + 0.08, 11.58, 11.84, D, D + 0.5, S['stone'])
    b.hip_roof(-W - 0.95, W + 0.95, -D - 0.95, D + 0.95, y, 1.8, S['roof'])
    # the loggia
    b.box(-10.6, 10.6, 0, 0.3, D, 7.1, S['stone'])
    b.box(-10.6, 10.6, 0, 0.15, 7.1, 7.5, S['stoneDark'])
    cols = [-9.8 + i * 2.8 for i in range(8)]
    for x in cols:
        column(b, x, 6.3, 0.3, 3.12, r=0.21)
    centers = [-8.4 + i * 2.8 for i in range(7)]
    arcade_wall(b, centers, 1.4, 1.18, 3.12, 4.7, 6.02, 6.58, S['white'])
    for cx in centers:
        arch_band(b, cx, 3.12, 1.18, 1.36, 6.56, 6.64, S['serena'], n=8)
    for x in cols[1:-1]:
        b.disc(x, 4.08, 6.58, 0.36, 10, S['white'], 0.04)
        b.disc(x, 4.08, 6.6, 0.29, 10, S['majolica'], 0.05)
    for sx in (-1, 1):   # end piers and the side walls of the loggia
        b.box(min(sx * 9.8, sx * 10.6), max(sx * 9.8, sx * 10.6), 0.3, 4.7, D, 6.58, S['white'])
        b.push(rot=sx * math.pi / 2)
        b.decal([(x, y, 10.612) for x, y in arch_pts(-4.85, 0.3, 3.12, 1.0)], S['dark'], (0, 0, 1))
        b.pop()
    b.box(-10.6, 10.6, 4.7, 4.9, 6.0, 6.66, S['serena'])
    b.box(-10.6, 10.6, 4.9, 5.42, 6.0, 6.6, S['white'])
    b.box(-10.75, 10.75, 5.42, 5.6, 5.95, 6.8, S['serena'])
    b.box(-10.6, 10.6, 4.55, 4.7, D, 6.02, S['cream'])   # the loggia ceiling
    pts = [(-10.9, 5.6, 7.0), (10.9, 5.6, 7.0), (10.9, 6.25, D), (-10.9, 6.25, D),
           (-10.9, 5.75, 7.0), (10.9, 5.75, 7.0), (10.9, 6.4, D), (-10.9, 6.4, D)]
    b.hexa(pts, S['roof'])


def campanile(b, g):
    """The Palazzo's bell tower: brick with stone quoins, an open belfry of round arches, a pyramid roof.
    Origin: the base centre. The game adds the clock on the front at y 14.4."""
    s = 2.2
    b.box(-s, s, 0, 18.4, -s, s, S['brick'] if not S['stone_all'] else S['wall'])
    for sx in (-1, 1):
        for sz in (-1, 1):
            quoins(b, sx * s, sz * s, 0, 18.4, sx, sz, step=0.7)
    for y in (6.0, 12.0):
        b.box(-s - 0.1, s + 0.1, y, y + 0.22, -s - 0.1, s + 0.1, S['stone'])
    for y0 in (2.4, 8.2):
        for k in range(4):
            b.push(rot=k * math.pi / 2)
            window(b, g, 0, y0, 0.5, 1.5, s, shutters=False, sill=False)
            b.pop()
    b.box(-1.55, 1.55, 12.85, 15.95, s, s + 0.03, S['stone'])   # behind the game's clock face
    y = cornice(b, -s, s, -s, s, 18.4, [(0.25, 0.12), (0.2, 0.26)])
    b.cyl(0, 0, y + 0.6, y + 1.5, 0.0001, 0.75, 8, S['gold'])
    b.cyl(0, 0, y + 1.5, y + 1.75, 0.75, 0.0, 8, S['gold'])
    top = belfry(b, s, y, 1.4, S['brick'] if not S['stone_all'] else S['wall'], S['stone'], pier=0.75)
    y = cornice(b, -s, s, -s, s, top, [(0.22, 0.14), (0.18, 0.32)])
    b.hip_roof(-s - 0.45, s + 0.45, -s - 0.45, s + 0.45, y, 3.4, S['roofDark'])
    b.cyl(0, 0, y + 3.3, y + 3.8, 0.2, 0.0, 6, S['gold'])


def dogana(b, g):
    """The customs house on the quay: a loggia of four round arches on columns, like a small Loggia dei Lanzi.
    Origin: the platform's centre on the ground (the platform is 10 × 6). The front columns stand at z 2.6."""
    b.box(-5, 5, 0, 0.3, -3, 3, S['stoneDark'])
    b.box(-5, 5, 0.3, 5.5, -2.95, -2.5, S['wall'])
    rustication(b, -5, 5, 0.3, 2.0, -2.5, rnd=random.Random(21), heavy=False)
    for sx in (-1, 1):   # side walls with a blind arch
        b.box(min(sx * 4.4, sx * 5.0), max(sx * 4.4, sx * 5.0), 0.3, 4.7, -2.95, 2.9, S['white'])
        b.push(rot=sx * math.pi / 2)
        b.decal([(x, y, 5.012) for x, y in arch_pts(-0.1, 0.3, 2.8, 1.3)], S['dark'], (0, 0, 1))
        arch_band(b, -0.1, 2.8, 1.3, 1.5, 5.0, 5.08, S['serena'], n=7)
        b.pop()
    for x in (-2.2, 0, 2.2):
        column(b, x, 2.6, 0.3, 3.5, r=0.2)
    centers = [-3.3, -1.1, 1.1, 3.3]
    arcade_wall(b, centers, 1.1, 0.86, 3.5, 4.7, 2.33, 2.87, S['white'])
    for cx in centers:
        arch_band(b, cx, 3.5, 0.86, 1.02, 2.85, 2.93, S['serena'], n=8)
    for x in (-2.2, 0, 2.2):
        b.disc(x, 4.25, 2.87, 0.22, 10, S['majolica'], 0.04)
    b.box(-5.05, 5.05, 4.7, 4.9, -3.0, 2.95, S['serena'])
    b.box(-5.05, 5.05, 4.9, 5.4, -3.0, 2.9, S['white'])
    y = cornice(b, -5.05, 5.05, -3.0, 2.9, 5.4, [(0.16, 0.12), (0.12, 0.26)], col=S['serena'], col2=S['eave'])
    b.box(-4.4, 4.4, 4.55, 4.7, -2.5, 2.33, S['cream'])
    b.hip_roof(-5.55, 5.55, -3.45, 3.35, y, 1.3, S['roof'])


def guildhall(b, g):
    """The guild hall on the quay: a small palazzo with a rusticated ground floor, an arched portal and a
    tower with a roof loggia. Origin: the body's centre on the ground (8 × 5)."""
    W, D, H = 4.0, 2.5, 6.4
    b.box(-W, W, 0, H, -D, D, S['guild'] if not S['stone_all'] else S['wall'])
    rustication(b, -W, W, 0, 2.9, D, holes=[(-1.2, 1.2, 3.0), (-3.0, -2.2, 2.1), (2.2, 3.0, 2.1)], rnd=random.Random(31))
    for sx in (-1, 1):
        b.push(rot=sx * math.pi / 2)
        rustication(b, -D, D, 0, 2.9, W, rnd=random.Random(32 + sx), heavy=False)
        b.pop()
    opening(b, g, 0, 0, 2.0, 3.3, D + 0.1, glass=False, col=S['door'])
    arch_band(b, 0, 2.3, 1.0, 1.3, D + 0.04, D + 0.22, S['rustic'], n=8)
    for cx in (-2.6, 2.6):
        window(b, g, cx, 1.25, 0.6, 0.75, D + 0.1, arched=False, shutters=False)
    b.box(-W - 0.08, W + 0.08, 2.9, 3.12, -D - 0.08, D + 0.08, S['stone'])
    for cx in (-2.6, 2.6):
        window(b, g, cx, 3.55, 0.95, 1.9, D)
    window(b, g, 0, 4.55, 0.7, 1.2, D, shutters=False)
    if not S['stone_all']:
        for sx in (-1, 1):
            quoins(b, sx * W, D, 3.12, H, sx, 1, step=0.48)
    y = cornice(b, -W, W, -D, D, H, [(0.14, 0.1), (0.12, 0.26), (0.14, 0.46)], col2=S['eave'])
    b.hip_roof(-W - 0.55, W + 0.55, -D - 0.55, D + 0.55, y, 1.4, S['roof'])
    # the tower
    b.push(x=2.2, z=-0.8)
    s = 1.3
    b.box(-s, s, H, H + 3.4, -s, s, S['guild'] if not S['stone_all'] else S['wall'])
    for sx in (-1, 1):
        quoins(b, sx * s, s, H + 0.6, H + 3.4, sx, 1, step=0.5)
    window(b, g, 0, H + 1.4, 0.5, 1.1, s, shutters=False)
    y = cornice(b, -s, s, -s, s, H + 3.4, [(0.14, 0.08)])
    top = belfry(b, s, y, 0.7, S['guild'] if not S['stone_all'] else S['wall'], S['stone'], pier=0.36)
    y = cornice(b, -s, s, -s, s, top, [(0.12, 0.1), (0.12, 0.24)])
    b.hip_roof(-s - 0.35, s + 0.35, -s - 0.35, s + 0.35, y, 1.4, S['roofDark'])
    b.pop()


PIECES = [house_a, house_b, house_c, house_d, chiesa, palazzo, campanile, dogana, guildhall]


# ---------------------------------------------------------------- Blender side

def to_blender(v):
    return (v.x, -v.z, v.y)


def make_object(name, bld, coll, plaster=None):
    if not bld.f:
        return None
    me = bpy.data.meshes.new(name)
    me.from_pydata([to_blender(v) for v in bld.v], [], bld.f)
    me.update()
    attr = me.color_attributes.new('Color', 'FLOAT_COLOR', 'CORNER')
    cols = []
    for fi, face in enumerate(bld.f):
        c = bld.c[fi]
        if c == MARK and plaster:
            c = plaster
        cols.extend(lin(c) * len(face))
    attr.data.foreach_set('color', cols)
    me.color_attributes.active_color = attr
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def build_all():
    out = {}
    for fn in PIECES:
        b, g = Builder(), Builder()
        b.twin = g
        fn(b, g)
        out[fn.__name__] = (b, g)
    return out


def tris(bld):
    return sum(len(f) - 2 for f in bld.f)


def export_glb(path, built):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    coll = bpy.context.scene.collection
    for name, (b, g) in built.items():
        make_object(name, b, coll)
        go = make_object(name + '_glass', g, coll)
        if go:   # glass carries no color: the game gives it the window material
            pass
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    kw = dict(filepath=os.path.abspath(path), export_format='GLB', use_selection=False, export_materials='NONE',
              export_normals=False, export_texcoords=False, export_yup=True, export_apply=False)
    try:
        bpy.ops.export_scene.gltf(**kw, export_vertex_color='ACTIVE', export_all_vertex_colors=False)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    print('exported', path, os.path.getsize(path), 'bytes')


def preview(prefix, built):
    """Render two views: the harbor street (houses, church, Dogana, guild hall) and the Piazza (Palazzo, tower)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    coll = sc.collection
    mat = bpy.data.materials.new('vc')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    ca = nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'Color'
    nt.links.new(ca.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.9
    glass = bpy.data.materials.new('glass')
    glass.use_nodes = True
    glass.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = lin('#27444C')

    def put(name, x, y, z, rot=0.0, plaster=None, scale=1.0):
        b, g = built[name]
        ob = make_object(name, b, coll, plaster)
        ob.data.materials.append(mat)
        ob.location = (x, -z, y)
        ob.rotation_euler = (0, 0, rot)
        ob.scale = (scale,) * 3
        go = make_object(name + '_g', g, coll)
        if go:
            go.data.materials.append(glass)
            go.location, go.rotation_euler, go.scale = ob.location, ob.rotation_euler, ob.scale
        return ob

    def ground(x0, x1, z0, z1, y, col):
        gb = Builder()
        gb.box(x0, x1, y - 3, y, z0, z1, col, bottom=True)
        ob = make_object('ground', gb, coll)
        ob.data.materials.append(mat)

    world = bpy.data.worlds.new('w')
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = lin('#BFE6EA')
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 3.6
    sun.color = (1.0, 0.95, 0.85)
    sun.angle = 0.08
    so = bpy.data.objects.new('sun', sun)
    so.rotation_euler = (math.radians(50), 0, math.radians(-35))
    coll.objects.link(so)
    cam = bpy.data.cameras.new('cam')
    cam.lens = 50
    co = bpy.data.objects.new('cam', cam)
    coll.objects.link(co)
    sc.camera = co
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT', 'CYCLES'):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            continue
    if sc.render.engine == 'CYCLES':
        sc.cycles.samples = 32
    sc.render.resolution_x, sc.render.resolution_y = 1600, 900
    try:
        sc.view_settings.view_transform = 'Standard'
    except TypeError:
        pass

    def aim(target, yaw, pitch, dist):
        tx, ty, tz = target
        cx = tx + dist * math.cos(pitch) * math.sin(yaw)
        cy = ty + dist * math.sin(pitch)
        cz = tz + dist * math.cos(pitch) * math.cos(yaw)
        co.location = (cx, -cz, cy)
        d = Vector((tx - cx, -(tz - cz), ty - cy))
        co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

    pl = S['plaster']
    # the street: two terraces of houses, the church, the Dogana and the guild hall on the quay
    ground(-30, 30, -6, 6, 0, '#E7D7B9')
    ground(-30, 30, -16, -6, 3, '#D9C29A')
    ground(-30, 30, -30, -16, 6, '#C9AE86')
    put('dogana', -18, 0, -1)
    put('guildhall', 14, 0, -2)
    row = ['house_a', 'house_b', 'house_d', 'house_c', 'house_a', 'house_d', 'house_b', 'house_a']
    widths = {'house_a': 3.6, 'house_b': 3.0, 'house_c': 4.6, 'house_d': 4.0}
    x = -11
    for i, n in enumerate(row):
        put(n, x + widths[n] / 2, 3, -8.6, plaster=pl[i % len(pl)])
        x += widths[n] + 0.15
    x = -24
    for i, n in enumerate(['house_c', 'house_a', 'house_b', 'house_d', 'house_a']):
        put(n, x + widths[n] / 2, 6, -18.5, plaster=pl[(i + 3) % len(pl)])
        x += widths[n] + 0.15
    put('chiesa', 2.5, 6, -17.4)
    for i, n in enumerate(['house_b', 'house_a', 'house_d']):
        put(n, 12 + i * 4.2, 6, -18.5, plaster=pl[(i + 5) % len(pl)])
    aim((-2, 6, -10), 0.22, 0.42, 74)
    sc.render.filepath = os.path.abspath(prefix + '_street.png')
    bpy.ops.render.render(write_still=True)
    aim((3, 9, -16), 0.35, 0.28, 30)
    sc.render.filepath = os.path.abspath(prefix + '_houses.png')
    bpy.ops.render.render(write_still=True)
    # the piazza
    for ob in list(coll.objects):
        if ob.type == 'MESH':
            bpy.data.objects.remove(ob)
    ground(-30, 30, -30, 20, 0, '#E9D3AE')
    put('palazzo', 0, 0, -18.5)
    put('campanile', 14, 0, -19)
    for i, x in enumerate([-24, -19.5, 19.5, 24]):
        put(['house_c', 'house_b', 'house_d', 'house_a'][i], x, 0, -27, plaster=pl[i])
    aim((2, 9, -16), 0.3, 0.3, 62)
    sc.render.filepath = os.path.abspath(prefix + '_piazza.png')
    bpy.ops.render.render(write_still=True)


def main():
    global S
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = dict(zip(argv[::2], argv[1::2]))
    S = SCHEMES[args.get('--scheme', 'ligurian')]
    built = build_all()
    for name, (b, g) in built.items():
        print(f'{name:10s} {tris(b) + tris(g):6d} triangles')
    if '--glb' in args:
        export_glb(args['--glb'], built)
    if '--preview' in args:
        preview(args['--preview'], built)


main()
