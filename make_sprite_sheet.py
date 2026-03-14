# make_sheet.py
from pathlib import Path
from PIL import Image
from tqdm import tqdm
import math

# -------------------- CONFIG --------------------
ROOT = Path("output")        # same root as cleaner
SRC_SUBDIR = "clean"         # read frames from this subfolder; set to None to read the folder itself
SHEET_COLS = 3
SHEET_PADDING = 0
SHEET_CELL = None            # e.g. 512 → force square cells; None → auto max frame size
SHEET_BG = (0, 0, 0, 0)      # transparent
SHEET_NAME = "spritesheet_3x4.png"
CENTER = True
# ------------------------------------------------

def numeric_sort_key(p: Path):
    try: return int(p.stem)
    except ValueError: return p.stem

def make_spritesheet(frame_paths, out_path: Path, cols=3, cell_w=None, cell_h=None, padding=0, bg=(0,0,0,0), center=True):
    frames = [Image.open(p).convert("RGBA") for p in frame_paths]
    if not frames: return
    if cell_w is None or cell_h is None:
        max_w = max(im.width for im in frames)
        max_h = max(im.height for im in frames)
        cell_w = cell_w or max_w
        cell_h = cell_h or max_h

    rows = math.ceil(len(frames) / cols)
    sheet_w = cols * cell_w + (cols - 1) * padding
    sheet_h = rows * cell_h + (rows - 1) * padding
    sheet = Image.new("RGBA", (sheet_w, sheet_h), bg)

    for i, im in enumerate(frames):
        r = i // cols
        c = i % cols
        x = c * (cell_w + padding)
        y = r * (cell_h + padding)
        if center:
            off_x = x + (cell_w - im.width) // 2
            off_y = y + (cell_h - im.height) // 2
        else:
            off_x, off_y = x, y
        sheet.paste(im, (off_x, off_y), im)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path)

def process_folder(folder: Path):
    src = folder / SRC_SUBDIR if SRC_SUBDIR else folder
    frames = sorted(src.glob("*.png"), key=numeric_sort_key)
    if not frames: return
    cell_sz = None if SHEET_CELL is None else int(SHEET_CELL)
    cell_w = cell_h = cell_sz
    out_path = folder / SHEET_NAME
    make_spritesheet(frames, out_path, cols=SHEET_COLS, cell_w=cell_w, cell_h=cell_h,
                     padding=SHEET_PADDING, bg=SHEET_BG, center=CENTER)

def main():
    root = ROOT.resolve()
    if not root.exists():
        print(f"[WARN] Root '{root}' not found.")
        return
    for sub in tqdm([d for d in sorted(root.iterdir()) if d.is_dir()], desc="Folders", unit="folder"):
        process_folder(sub)

if __name__ == "__main__":
    main()
