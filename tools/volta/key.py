import numpy as np
from PIL import Image
from scipy import ndimage
im = np.asarray(Image.open('raw.png')).astype(np.float32) / 255
R, G, B = im[..., 0], im[..., 1], im[..., 2]
mx = np.maximum(R, B)
def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
# brightness-normalised green dominance
dom = (G - mx) / np.maximum(G, 1e-4)
alpha = 1 - smoothstep(0.10, 0.30, dom)
# reflective disc: alpha from fitted geometry, key only used for its bbox
disc = np.asarray(Image.open('raw_disc.png')) > 127
ys, xs = np.nonzero(disc)
print('disc bbox', xs.min(), xs.max(), ys.min(), ys.max())
alpha = np.where(disc, 1.0, alpha)
# despill: clamp G to max(R,B) wherever it leads
G2 = np.where(G > mx, mx, G)
rgb = np.stack([R, G2, B], -1)
# keep only the largest connected blob
lab, n = ndimage.label(alpha > 0.5)
sizes = ndimage.sum(np.ones_like(alpha), lab, range(1, n + 1))
keep = lab == (np.argmax(sizes) + 1)
keep = ndimage.binary_dilation(keep, iterations=3)
alpha = alpha * keep
print('blobs', n, 'kept', int(sizes.max()))
# downsample 2x (premultiplied)
def down(a):
    h, w = a.shape[:2]; h -= h % 2; w -= w % 2; a = a[:h, :w]
    return a.reshape(h // 2, 2, w // 2, 2, *a.shape[2:]).mean((1, 3))
pa = down(alpha); prgb = down(rgb * alpha[..., None])
rgb_d = prgb / np.maximum(pa[..., None], 1e-4)
# crop to the alpha bounding box
ys, xs = np.nonzero(pa > 0.02)
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
out = np.dstack([rgb_d, pa])[y0:y1, x0:x1]
img = Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
img.save('volta-t1.webp', quality=90, method=6)
img.save('volta-t1.png', optimize=True)
print('final', img.size)
# record where the platter spindle lands in the cropped image (for docs)
