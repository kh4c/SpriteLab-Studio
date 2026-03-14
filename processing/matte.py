import numpy as np
from PIL import Image, ImageFilter
from collections import deque

def rgb_to_lab(rgb_uint8):
    """Quick sRGB to CIELAB conversion using NumPy."""
    # Scale to 0-1
    rgb = rgb_uint8.astype(np.float32) / 255.0
    # Linearize
    rgb = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    # XYZ
    matrix = np.array([
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041]
    ])
    xyz = rgb @ matrix.T
    # Lab
    Xn, Yn, Zn = 0.95047, 1.0, 1.08883
    xyz = xyz / [Xn, Yn, Zn]
    
    def f(t):
        return np.where(t > 0.008856, np.cbrt(t), 7.787 * t + 16/116)
    
    fx, fy, fz = f(xyz[..., 0]), f(xyz[..., 1]), f(xyz[..., 2])
    L = 116 * fy - 16
    a = 500 * (fx - fy)
    b = 200 * (fy - fz)
    return np.stack([L, a, b], axis=-1)

def estimate_bg_color(img_rgb: Image.Image, border=5):
    arr = np.array(img_rgb)
    h, w, _ = arr.shape
    mask = np.zeros((h, w), dtype=bool)
    mask[:border, :] = True
    mask[-border:, :] = True
    mask[:, :border] = True
    mask[:, -border:] = True
    median = np.median(arr[mask], axis=0)
    return median.astype(np.uint8)

def apply_palette(img_rgba: Image.Image, palette_name: str):
    """Applies a specific color palette using perceptual distance."""
    palettes = {
        "pico8": ["#000000", "#1D2B53", "#7E2553", "#008751", "#AB5236", "#5F574F", "#C2C3C7", "#FFF1E8", "#FF004D", "#FFA300", "#FFEC27", "#00E436", "#29ADFF", "#83769C", "#FF77A8", "#FFCCAA"],
        "gameboy": ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
        "nes": ["#7C7C7C", "#0000FC", "#0000BC", "#4428BC", "#940084", "#A80020", "#A81000", "#881400", "#503000", "#007800", "#006800", "#005800", "#004058"]
    }
    
    if palette_name not in palettes:
        return img_rgba
        
    # Convert hex to RGB array
    colors = []
    for h in palettes[palette_name]:
        h = h.lstrip('#')
        colors.append(tuple(int(h[i:i+2], 16) for i in (0, 2, 4)))
    
    palette_arr = np.array(colors, dtype=np.uint8)
    
    # Process RGB part
    img_rgb = img_rgba.convert("RGB")
    data = np.array(img_rgb)
    
    # Simple perceptual mapping (Euclidean in RGB for now, can be Lab for better)
    # Using KD-Tree for faster lookup if performance becomes an issue
    # But for small images (pixel art), a broadcasted distance is okay.
    
    h, w, _ = data.shape
    pixel_flat = data.reshape(-1, 3).astype(np.int32)
    palette_flat = palette_arr.astype(np.int32)
    
    # Broadcast distance: (Pixels, 1, 3) - (1, Colors, 3) -> (Pixels, Colors, 3)
    dists = np.sqrt(np.sum((pixel_flat[:, np.newaxis, :] - palette_flat[np.newaxis, :, :])**2, axis=2))
    best_match_indices = np.argmin(dists, axis=1)
    
    data_quantized = palette_arr[best_match_indices].reshape(h, w, 3)
    
    # Restore Alpha
    _, _, _, alpha = img_rgba.split()
    quantized_rgba = Image.fromarray(data_quantized, "RGB")
    quantized_rgba.putalpha(alpha)
    
    return quantized_rgba

def remove_background(img_path, t0=10.0, t1=25.0, resolution=None):
    """Removes background and optionally downscales."""
    img = Image.open(img_path).convert("RGB")
    
    if resolution:
        img = img.resize(resolution, Image.NEAREST)
        
    arr = np.array(img)
    bg_color = estimate_bg_color(img)
    
    lab = rgb_to_lab(arr)
    bg_lab = rgb_to_lab(bg_color.reshape(1, 1, 3)).reshape(3)
    
    # Distance in Lab space
    diff = lab - bg_lab
    dist = np.sqrt(np.sum(diff**2, axis=-1))
    
    # Flood fill from edges
    h, w = dist.shape
    is_bg = dist <= t1
    vis = np.zeros_like(is_bg)
    q = deque()
    
    for y in range(h):
        if is_bg[y, 0]: q.append((y, 0)); vis[y, 0] = True
        if is_bg[y, w-1]: q.append((y, w-1)); vis[y, w-1] = True
    for x in range(w):
        if is_bg[0, x]: q.append((0, x)); vis[0, x] = True
        if is_bg[h-1, x]: q.append((h-1, x)); vis[h-1, x] = True
        
    while q:
        cy, cx = q.popleft()
        for dy, dx in [(0,1), (0,-1), (1,0), (-1,0)]:
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and not vis[ny, nx] and is_bg[ny, nx]:
                vis[ny, nx] = True
                q.append((ny, nx))
    
    alpha = np.where(vis, 0, 255).astype(np.uint8)
    blend_mask = (~vis) & (dist < t1)
    if np.any(blend_mask):
        alpha[blend_mask] = np.clip((dist[blend_mask] - t0) / (t1 - t0) * 255, 0, 255).astype(np.uint8)
    
    rgba = np.dstack([arr, alpha])
    return Image.fromarray(rgba, "RGBA")
