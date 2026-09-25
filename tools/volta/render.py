"""SDF ray-marcher: VOLTA T-1 turntable, 3/4 studio view on flat chroma green.
Units: mm. y is up, +z faces the camera side (front)."""
import sys, math
import numpy as np
from PIL import Image

W = int(sys.argv[1]) if len(sys.argv) > 1 else 900
H = int(W * 0.56)
OUT = sys.argv[2] if len(sys.argv) > 2 else 'raw.png'
f32 = np.float32

# ---------- geometry ----------
PL_HALF = np.array([230, 35, 180], f32)   # plinth half extents
PL_C = np.array([0, 53, 0], f32)          # plinth centre (bottom y=18, top y=88)
PL_R = 9.0
SPINDLE = np.array([-58, 0, 6], f32)
PLATTER_R, PLATTER_Y0, PLATTER_Y1 = 150.0, 91.0, 119.0
REC_Y1 = 121.0
D_PIVOT = 222.0
ang = math.radians(-38)                    # pivot sits right/back of spindle
PIVOT = SPINDLE + np.array([D_PIVOT * math.cos(ang), 0, D_PIVOT * math.sin(ang)], f32)
ARM_Y = 150.0
# arm at rest: pointing forward-left from pivot, just outside the record
rest = math.radians(98)
ARM_END = PIVOT + np.array([239.3 * math.cos(rest) * 0.93, 0, 239.3 * math.sin(rest) * 0.93], f32)
CW_END = PIVOT - (ARM_END - PIVOT) / np.linalg.norm(ARM_END - PIVOT) * 62

def length(v): return np.sqrt((v * v).sum(-1))

def sd_rbox(p, c, h, r):
    q = np.abs(p - c) - (h - r)
    return length(np.maximum(q, 0)) + np.minimum(q.max(-1), 0) - r

def sd_cyl(p, c, r, y0, y1, rr=0.0):
    d = p - c
    dr = np.sqrt(d[..., 0] ** 2 + d[..., 2] ** 2) - (r - rr)
    hy = (y1 - y0) / 2
    dy = np.abs(p[..., 1] - (y0 + hy)) - (hy - rr)
    q = np.stack([dr, dy], -1)
    return length(np.maximum(q, 0)) + np.minimum(np.maximum(dr, dy), 0) - rr

def sd_cap(p, a, b, r):
    pa, ba = p - a, b - a
    h = np.clip((pa * ba).sum(-1) / (ba * ba).sum(), 0, 1)
    return length(pa - ba * h[..., None]) - r

FEET = [np.array([x, 0, z], f32) for x in (-190, 190) for z in (-140, 140)]
ARM_A = np.array([PIVOT[0], ARM_Y, PIVOT[2]], f32)
ARM_B = np.array([ARM_END[0], ARM_Y - 22, ARM_END[2]], f32)
CW_B = np.array([CW_END[0], ARM_Y + 2, CW_END[2]], f32)
REST_POST = np.array([ARM_END[0] + 16, 0, ARM_END[2] - 40], f32)
KNOB = np.array([-185, 0, 135], f32)

# material ids: 1 plinth 2 platter edge 3 record 4 label 5 metal bright 6 dark metal (feet)
def scene(p):
    ds = [
        (sd_rbox(p, PL_C, PL_HALF, PL_R), 1),
        (sd_cyl(p, SPINDLE, PLATTER_R, PLATTER_Y0, PLATTER_Y1, 1.5), 2),
        (sd_cyl(p, SPINDLE, 149.0, PLATTER_Y1 - 1, REC_Y1, 0.8), 3),
        (sd_cyl(p, SPINDLE, 50.0, REC_Y1 - 1, REC_Y1 + 0.35, 0.2), 4),
        (sd_cyl(p, SPINDLE, 3.6, REC_Y1, REC_Y1 + 16, 1.2), 5),
        (sd_cyl(p, PIVOT, 26.0, 87, 128, 2.0), 6),
        (sd_cyl(p, PIVOT, 13.0, 127, ARM_Y + 8, 2.0), 5),
        (sd_cap(p, ARM_A, ARM_B, 4.2), 5),
        (sd_cap(p, ARM_B, ARM_B + np.array([-14, -6, 22], f32), 7.5), 6),
        (sd_cap(p, ARM_A, CW_B, 5.0), 5),
        (sd_cap(p, CW_B + (CW_B - ARM_A) * 0.05, CW_B + (CW_B - ARM_A) * 0.42, 17.0), 6),
        (sd_cyl(p, REST_POST, 5.0, 87, ARM_Y - 26, 1.5), 5),
        (sd_cyl(p, KNOB, 15.0, 87, 97, 1.5), 5),
    ]
    for f in FEET:
        ds.append((sd_cyl(p, f, 24.0, 0, 20, 3.0), 6))
    d = ds[0][0]; m = np.full(d.shape, ds[0][1], np.int8)
    for di, mi in ds[1:]:
        sel = di < d
        d = np.where(sel, di, d); m = np.where(sel, mi, m)
    return d, m

def sdf(p): return scene(p)[0]

def normal(p):
    e = 0.15
    ex = np.array([e, 0, 0], f32); ey = np.array([0, e, 0], f32); ez = np.array([0, 0, e], f32)
    n = np.stack([sdf(p + ex) - sdf(p - ex), sdf(p + ey) - sdf(p - ey), sdf(p + ez) - sdf(p - ez)], -1)
    return n / (length(n)[..., None] + 1e-9)

# ---------- camera ----------
TGT = np.array([-8, 70, -6], f32)
CAM = TGT + np.array([-245, 400, 1300], f32)
FOV = math.radians(27)
fw = TGT - CAM; fw /= np.linalg.norm(fw)
rt = np.cross(fw, [0, 1, 0]); rt /= np.linalg.norm(rt)
up = np.cross(rt, fw)
LIGHT = np.array([-0.62, 0.72, 0.30], f32); LIGHT /= np.linalg.norm(LIGHT)

def march(ro, rd, steps=160, far=2600):
    t = np.zeros(ro.shape[0], f32); hit = np.zeros(ro.shape[0], bool)
    act = np.ones(ro.shape[0], bool)
    for _ in range(steps):
        idx = np.nonzero(act)[0]
        if idx.size == 0: break
        d = sdf(ro[idx] + rd[idx] * t[idx, None])
        t[idx] += d * 0.9
        h = d < 0.02; hit[idx[h]] = True
        act[idx[h | (t[idx] > far)]] = False
    return t, hit

def soft_shadow(p, l, k=9.0):
    res = np.ones(p.shape[0], f32); t = np.full(p.shape[0], 1.0, f32)
    for _ in range(60):
        d = sdf(p + l * t[:, None])
        res = np.minimum(res, np.clip(k * d / t, 0, 1))
        t += np.clip(d, 0.8, 40)
    return np.clip(res, 0, 1) ** 1.3

def ao(p, n):
    occ = np.zeros(p.shape[0], f32)
    for i in range(1, 6):
        h = 3.0 * i
        occ += (h - sdf(p + n * h)) / (2 ** i)
    return np.clip(1 - 0.06 * occ, 0, 1)

def shade(p, rd, n, m):
    l = LIGHT
    ndl = np.clip((n * l).sum(-1), 0, 1)
    sh = soft_shadow(p + n * 0.6, np.broadcast_to(l, p.shape).astype(f32))
    a = ao(p, n)
    hvec = l - rd; hvec /= length(hvec)[:, None]
    ndh = np.clip((n * hvec).sum(-1), 0, 1)
    sky = 0.5 + 0.5 * n[:, 1]                       # hemisphere fill
    fres = 0.04 + 0.96 * (1 - np.clip(-(n * rd).sum(-1), 0, 1)) ** 5
    r = np.sqrt((p[:, 0] - SPINDLE[0]) ** 2 + (p[:, 2] - SPINDLE[2]) ** 2)
    # tonal gradient across the plinth: brighter to the upper-left, falling off right
    grad = np.clip(1.05 - (p[:, 0] + 230) / 460 * 0.22 - (p[:, 2] + 180) / 360 * 0.06, 0.75, 1.1)
    base = np.zeros(p.shape[0], f32); spec = np.zeros(p.shape[0], f32)
    col = np.zeros((p.shape[0],), f32)
    for mid, alb, s1, e1, s2, e2 in [
        (1, 0.60, 0.20, 30, 1.25, 900),   # satin anodised plinth + sharp edge line
        (2, 0.70, 0.45, 60, 1.40, 700),   # machined platter rim
        (3, 0.018, 0.28, 90, 0.0, 1),     # vinyl
        (4, 0.78, 0.04, 10, 0.0, 1),      # label paper
        (5, 0.74, 0.60, 120, 1.0, 900),   # polished metal
        (6, 0.16, 0.25, 40, 0.3, 300),    # dark anodised
    ]:
        s = m == mid
        if not s.any(): continue
        diff = alb * (0.78 * ndl[s] * sh[s] + 0.30 * sky[s] * a[s])
        sp = s1 * ndh[s] ** e1 * sh[s] + s2 * ndh[s] ** e2 * sh[s]
        if mid == 1: diff *= grad[s]
        if mid == 3:
            groove = 0.5 + 0.5 * np.sin(r[s] * 7.0)
            band = ((r[s] > 58) & (r[s] < 146)).astype(f32)
            sp = sp * (0.6 + 0.8 * groove * band) + 0.10 * fres[s] * sky[s]
        if mid == 2:
            ring = 0.92 + 0.08 * np.sin(p[s, 1] * 3.0)
            diff *= ring
        col[s] = diff + sp + 0.05 * fres[s] * a[s]
    return col

def render():
    ys, xs = np.mgrid[0:H, 0:W].astype(f32)
    u = (xs + 0.5) / W * 2 - 1; v = 1 - (ys + 0.5) / H * 2
    th = math.tan(FOV / 2)
    rd = fw + rt * (u * th)[..., None] + up * (v * th * H / W)[..., None]
    rd = (rd / length(rd)[..., None]).reshape(-1, 3).astype(f32)
    ro = np.broadcast_to(CAM, rd.shape).astype(f32)
    N = rd.shape[0]
    lum = np.zeros(N, f32); mat = np.zeros(N, np.int8)
    CH = 400_000
    for i in range(0, N, CH):
        sl = slice(i, i + CH)
        t, hit = march(ro[sl], rd[sl])
        idx = np.nonzero(hit)[0]
        p = ro[sl][idx] + rd[sl][idx] * t[idx, None]
        n = normal(p); m = scene(p)[1]
        c = shade(p, rd[sl][idx], n, m)
        lv = lum[sl]; lv[idx] = c; mv = mat[sl]; mv[idx] = m
        print(f'{i/N*100:.0f}%', flush=True)
    lum = lum.reshape(H, W); mat = mat.reshape(H, W)
    # neutral object, tone-mapped
    obj = 1 - np.exp(-lum * 1.35)
    obj = obj ** (1 / 2.2)
    # flat saturated chroma green, slightly shaded towards the corners
    yy, xx = np.mgrid[0:H, 0:W] / np.array([H, W])[:, None, None]
    vig = 1 - 0.25 * ((xx - 0.45) ** 2 + (yy - 0.4) ** 2)
    bg = np.stack([0.05 * vig, 0.78 * vig, 0.16 * vig], -1)
    # the glossy vinyl + platter rim pick up a little of the green surround (real spill)
    spill = np.where(np.isin(mat, [2, 3]), 0.022, 0.006)[..., None] * np.array([0, 1, 0.1])
    img = np.where((mat > 0)[..., None], obj[..., None] + spill, bg)
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(OUT)
    # geometric mask for the platter/record (used as its alpha instead of the key)
    Image.fromarray((np.isin(mat, [2, 3, 4, 5]) * 255).astype(np.uint8)).save(OUT.replace('.png', '_disc.png'))

render()
