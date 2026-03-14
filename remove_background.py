# bg_clean.py
from pathlib import Path
from PIL import Image, ImageFilter
from tqdm import tqdm
import numpy as np
from collections import deque

# -------------------- CONFIG --------------------
# Run this from: C:\Users\alex9\OneDrive\Desktop\Video
ROOT = Path("output")      # per-video folders live here
INPLACE = False            # False → write to subfolder below
CLEAN_SUBDIR = "clean"

# Background keying (Lab ΔE with interior protection)
BG_COLOR   = None          # None=auto from frame border, or (255,255,255)
LAB_T0     = 8.0           # tight background threshold
LAB_T1     = 22.0          # loose background threshold (T1>T0)
BORDER_PX  = 4             # px border sampled to auto-estimate background
EDGE_BAND_PX = 2           # interior band kept 100% opaque

# Post-processing on alpha
ERODE_PX   = 1             # extra trim after matte
FEATHER_PX = 1             # tiny blur for nicer edge (0-1 for pixel art)

# Optional ground-shadow removal
SHADOW_REMOVE    = True
SHADOW_BOT_FRAC  = 0.25    # bottom xx% of sprite bbox to check
SHADOW_DELTAE    = 12.0    # close-to-bg threshold
SHADOW_CHROMA    = 18.0    # low chroma threshold

# ------------------------------------------------


# -------------------- COLOR UTILS (Lab ΔE) --------------------
def _srgb_to_linear(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def _rgb_to_xyz(rgb):
    r, g, b = _srgb_to_linear(rgb[...,0]), _srgb_to_linear(rgb[...,1]), _srgb_to_linear(rgb[...,2])
    x = 0.4124564*r + 0.3575761*g + 0.1804375*b
    y = 0.2126729*r + 0.7151522*g + 0.0721750*b
    z = 0.0193339*r + 0.1191920*g + 0.9503041*b
    return np.stack([x, y, z], axis=-1)

def _xyz_to_lab(xyz):
    Xn, Yn, Zn = 0.95047, 1.0, 1.08883
    x, y, z = xyz[...,0]/Xn, xyz[...,1]/Yn, xyz[...,2]/Zn
    eps = 216/24389; kappa = 24389/27
    def f(t): return np.where(t > eps, np.cbrt(t), (kappa*t + 16)/116)
    fx, fy, fz = f(x), f(y), f(z)
    L = 116*fy - 16; a = 500*(fx - fy); b = 200*(fy - fz)
    return np.stack([L, a, b], axis=-1)

def rgb_to_lab(rgb_uint8): return _xyz_to_lab(_rgb_to_xyz(rgb_uint8.astype(np.float32)))
def delta_e_lab(lab1, lab2): diff = lab1 - lab2; return np.sqrt(np.sum(diff*diff, axis=-1))

# -------------------- HELPERS --------------------
def estimate_bg_color(img_rgb: Image.Image, border=BORDER_PX):
    arr = np.array(img_rgb.convert("RGB"))
    h, w, _ = arr.shape; m = max(1, int(border))
    mask = np.zeros((h, w), dtype=bool)
    mask[:m,:] = True; mask[-m:,:] = True; mask[:,:m] = True; mask[:,-m:] = True
    med = np.median(arr[mask], axis=0)
    return tuple(int(round(x)) for x in med)

def flood_fill_from_edges(bg_like: np.ndarray) -> np.ndarray:
    h, w = bg_like.shape
    vis = np.zeros((h, w), dtype=bool); q = deque()
    for x in range(w):
        if bg_like[0,x]: vis[0,x]=True; q.append((0,x))
        if bg_like[h-1,x]: vis[h-1,x]=True; q.append((h-1,x))
    for y in range(h):
        if bg_like[y,0]: vis[y,0]=True; q.append((y,0))
        if bg_like[y,w-1]: vis[y,w-1]=True; q.append((y,w-1))
    while q:
        cy, cx = q.popleft()
        for ny, nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
            if 0 <= ny < h and 0 <= nx < w and (not vis[ny,nx]) and bg_like[ny,nx]:
                vis[ny,nx] = True; q.append((ny,nx))
    return vis

def pil_erode(mask_img: Image.Image, n=1):
    for _ in range(n): mask_img = mask_img.filter(ImageFilter.MinFilter(3))
    return mask_img

def pil_dilate(mask_img: Image.Image, n=1):
    for _ in range(n): mask_img = mask_img.filter(ImageFilter.MaxFilter(3))
    return mask_img

# -------------------- CORE --------------------
def defringe_image(img: Image.Image) -> Image.Image:
    """Interior-safe matte + optional bottom shadow removal."""
    img = img.convert("RGBA")
    rgba = np.array(img)
    rgb = rgba[..., :3]

    # background color
    if isinstance(BG_COLOR, tuple) and len(BG_COLOR) == 3:
        bg_rgb = np.array(BG_COLOR, dtype=np.uint8)
    else:
        bg_rgb = np.array(estimate_bg_color(Image.fromarray(rgb, 'RGB'), border=BORDER_PX), dtype=np.uint8)

    # ΔE to bg
    lab = rgb_to_lab(rgb)
    bg_lab = rgb_to_lab(bg_rgb.reshape(1,1,3)).reshape(3)
    d = delta_e_lab(lab, bg_lab)

    # edge-connected bg (tight & loose)
    edge_tight = flood_fill_from_edges(d <= LAB_T0)
    edge_loose = flood_fill_from_edges(d <= LAB_T1)

    # candidate foreground from not-loose-bg
    cand = ~(edge_loose)
    cand_img = Image.fromarray((cand.astype(np.uint8)*255), "L")
    cand_img = pil_dilate(pil_erode(cand_img, 1), 1)  # small open/close
    cand = np.array(cand_img) > 0

    # sure foreground via erosion band
    sure = np.array(pil_erode(Image.fromarray((cand.astype(np.uint8)*255), "L"), EDGE_BAND_PX)) > 0
    ring = cand & (~sure)

    # alpha: bg=0, ring=soft ramp, interior=255
    A = np.zeros(d.shape, dtype=np.uint8)
    if np.any(ring):
        alpha_f = np.clip((d - LAB_T0) / max(LAB_T1 - LAB_T0, 1e-6), 0.0, 1.0)
        A[ring] = (alpha_f[ring] * 255.0).astype(np.uint8)
    A[sure] = 255
    A[edge_tight] = 0

    # optional bottom shadow removal
    if SHADOW_REMOVE and np.any(sure):
        ys, xs = np.where(sure)
        y_min, y_max = ys.min(), ys.max()
        h_bbox = y_max - y_min + 1
        strip_y0 = max(y_min, y_max - int(SHADOW_BOT_FRAC * h_bbox))
        in_bottom = np.zeros(A.shape, dtype=bool); in_bottom[strip_y0:y_max+1, :] = True
        chroma = np.sqrt(lab[...,1]**2 + lab[...,2]**2)
        shadow_mask = in_bottom & (d <= SHADOW_DELTAE) & (chroma <= SHADOW_CHROMA)
        A[shadow_mask & (~sure)] = 0

    # extra trim/feather
    A_img = Image.fromarray(A, "L")
    if ERODE_PX > 0: A_img = pil_erode(A_img, ERODE_PX)
    if FEATHER_PX > 0: A_img = A_img.filter(ImageFilter.GaussianBlur(FEATHER_PX))
    A = np.array(A_img, dtype=np.uint8)

    # un-matte spill
    a_f = (A.astype(np.float32) / 255.0)[..., None]
    bg_vec = bg_rgb.astype(np.float32)
    safe_a = np.maximum(a_f, 1e-6)
    unmatte = (rgb.astype(np.float32) - (1.0 - a_f) * bg_vec) / safe_a
    unmatte = np.clip(unmatte, 0, 255).astype(np.uint8)

    out = np.dstack([unmatte, A])
    return Image.fromarray(out, mode="RGBA")

# -------------------- DRIVER --------------------
def process_folder(folder: Path):
    frames = sorted(folder.glob("*.png"))
    if not frames: return
    save_dir = folder if INPLACE else (folder / CLEAN_SUBDIR)
    if not INPLACE: save_dir.mkdir(exist_ok=True)
    for p in tqdm(frames, desc=f"{folder.name} frames", unit="img", leave=False):
        img = Image.open(p).convert("RGBA")
        out = defringe_image(img)
        out.save(save_dir / p.name)

def main():
    root = ROOT.resolve()
    if not root.exists():
        print(f"[WARN] Root '{root}' not found.")
        return
    for sub in tqdm([d for d in sorted(root.iterdir()) if d.is_dir()], desc="Folders", unit="folder"):
        process_folder(sub)

if __name__ == "__main__":
    main()
