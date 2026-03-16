import math
from pathlib import Path
from PIL import Image

def pack_spritesheet(frame_paths, out_path, cols=4, rows=None, padding=0):
    frames = [Image.open(p) for p in frame_paths]
    if not frames:
        return None
        
    max_w = max(f.width for f in frames)
    max_h = max(f.height for f in frames)
    
    count = len(frames)
    if rows is None:
        rows = math.ceil(count / cols)
    
    # We only pack up to rows * cols frames
    capacity = rows * cols
    if count > capacity:
        frames = frames[:capacity]
    
    sheet_w = cols * max_w + (cols - 1) * padding
    sheet_h = rows * max_h + (rows - 1) * padding
    
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))
    
    for i, frame in enumerate(frames):
        # Ensure frame is RGBA for correct masking
        if frame.mode != "RGBA":
            frame = frame.convert("RGBA")
            
        r = i // cols
        c = i % cols
        
        # Center frame in cell
        x = c * (max_w + padding) + (max_w - frame.width) // 2
        y = r * (max_h + padding) + (max_h - frame.height) // 2
        
        # Use alpha_composite for pixel-perfect preservation of semi-transparent areas
        sheet.alpha_composite(frame, (x, y))
        
    sheet.save(out_path)
    return out_path

def slice_spritesheet(img_path, out_dir, mode='grid', cols=1, rows=1, width=None, height=None):
    img = Image.open(img_path)
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    
    out_dir = Path(out_dir)
    out_dir.mkdir(exist_ok=True, parents=True)
    
    sheet_w, sheet_h = img.size
    
    if mode == 'grid':
        cols = max(1, int(cols))
        rows = max(1, int(rows))
        frame_w = sheet_w // cols
        frame_h = sheet_h // rows
    else:
        # Fixed size mode
        frame_w = max(1, int(width or sheet_w))
        frame_h = max(1, int(height or sheet_h))
        cols = sheet_w // frame_w
        rows = sheet_h // frame_h

    frames = []
    count = 0
    for r in range(rows):
        for c in range(cols):
            left = c * frame_w
            top = r * frame_h
            right = left + frame_w
            bottom = top + frame_h
            
            # Boundary check
            if right > sheet_w or bottom > sheet_h:
                continue
                
            frame = img.crop((left, top, right, bottom))
            
            # Check if frame is empty/fully transparent (optional but good)
            # if not frame.getbbox(): continue
            
            count += 1
            filename = f"slice-{count:03d}.png"
            frame_path = out_dir / filename
            frame.save(frame_path)
            
            frames.append({
                "index": count,
                "path": str(frame_path),
                "url": f"/output/{out_dir.name}/{filename}"
            })
            
    return frames
