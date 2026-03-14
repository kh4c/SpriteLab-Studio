import math
from pathlib import Path
from PIL import Image

def pack_spritesheet(frame_paths, out_path, cols=4, padding=0):
    frames = [Image.open(p) for p in frame_paths]
    if not frames:
        return None
        
    max_w = max(f.width for f in frames)
    max_h = max(f.height for f in frames)
    
    count = len(frames)
    rows = math.ceil(count / cols)
    
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
        
        sheet.paste(frame, (x, y), frame)
        
    sheet.save(out_path)
    return out_path
