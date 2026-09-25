# Top view of the rotating part (platter + record) and a static specular layer.
import numpy as np, math
from PIL import Image
S = 2400; OUT = 1200            # 2x supersampled
R_PL = 156.0                    # platter radius mm (image edge)
mm = (np.arange(S) + 0.5) / S * 2 * R_PL - R_PL
X, Y = np.meshgrid(mm, mm)
r = np.hypot(X, Y); th = np.arctan2(Y, X)
lum = np.zeros_like(r); a = (r <= R_PL).astype(float)
# machined aluminium rim, lathe rings
rim = (r > 150.5) & (r <= R_PL)
lum[rim] = 0.66 + 0.05 * np.sin(r[rim] * 40)
# 180 strobe dots on the rim (33 1/3 @ 50 Hz marking), drawn as dark pits
k = 180; ang = (th % (2 * math.pi)) / (2 * math.pi) * k
dot = rim & (np.abs(ang - np.round(ang)) * (2 * math.pi * 153 / k) < 0.95) & (np.abs(r - 153.3) < 1.3)
lum[dot] = 0.18
# chamfer shading on the rim edge
lum[(r > R_PL - 1.0) & (r <= R_PL)] *= 0.7
gap = (r > 150) & (r <= 150.5); lum[gap] = 0.12
# record
rec = r <= 150
lum[rec] = 0.035
grooves = rec & (r > 60) & (r < 146.5)
lum[grooves] += 0.012 * (0.5 + 0.5 * np.sin(r[grooves] * 2 * math.pi / 0.9))
# track bands (5 gaps)
for g in (122, 101, 86, 73):
    lum[rec & (np.abs(r - g) < 0.7)] = 0.06
lum[rec & (r > 146.5)] = 0.05; lum[rec & (r < 60) & (r > 50)] = 0.045
# label
lab = r <= 50; lum[lab] = 0.80
# printed marks on the label so rotation reads: a bar, a thin ring, index ticks
lum[lab & (np.abs(r - 44) < 0.35)] = 0.15
lum[lab & (np.abs(Y) < 1.6) & (X > 14) & (X < 40)] = 0.12   # index bar
lum[lab & (np.abs(Y + 22) < 3.2) & (np.abs(X) < 18)] = 0.12  # text block
lum[lab & (np.abs(Y + 30) < 1.0) & (np.abs(X) < 11)] = 0.3
tick = lab & (r > 45.2) & (r < 48.5) & (np.abs((th / (2 * math.pi) * 36) - np.round(th / (2 * math.pi) * 36)) < 0.08)
lum[tick] = 0.2
# accent dot is not used here: the product stays neutral
# spindle
lum[r < 3.6] = 0.85; lum[(r >= 3.6) & (r < 4.4)] = 0.3
img = np.clip(lum, 0, 1) ** (1 / 1.2)
def down(q): return q.reshape(OUT, 2, OUT, 2).mean((1, 3))
g = down(img * a) / np.maximum(down(a), 1e-4); A = down(a)
Image.fromarray((np.dstack([g, g, g, A]) * 255 + .5).astype(np.uint8), 'RGBA').save('platter.webp', quality=92, method=6)
# static specular: light from the upper-left crosses the grooves as a soft band
phi = th - math.radians(-135)
band = np.exp(-(np.sin(phi) ** 2) / 0.012) * np.clip((r - 58) / 20, 0, 1) * (r < 147)
band += 0.6 * np.exp(-(np.sin(th - math.radians(45)) ** 2) / 0.02) * np.clip((r - 58) / 20, 0, 1) * (r < 147)
rimspec = np.exp(-((r - 152.5) ** 2) / 4) * (0.5 + 0.5 * np.cos(th + math.radians(135))) * rim
spec = np.clip(0.20 * band + 0.55 * rimspec, 0, 1) * a
Image.fromarray((np.dstack([np.ones_like(spec)] * 3 + [spec]) * 255 + .5).astype(np.uint8), 'RGBA').resize((OUT, OUT), Image.LANCZOS).save('sheen.webp', quality=90, method=6)
print('ok')
