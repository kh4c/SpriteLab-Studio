import cv2
import numpy as np
from pathlib import Path
from PIL import Image

def get_video_meta(path: Path):
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        return 0, 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    cap.release()
    return total, fps

def extract_keyframes(video_path: Path, out_dir: Path, count=12, stride=5):
    """Extracts keyframes based on color histogram changes."""
    video_path = Path(video_path)
    out_dir.mkdir(parents=True, exist_ok=True)
    
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return []
        
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    sampled_indices = list(range(0, total, max(1, stride)))
    
    prev_hist = None
    scores = []
    
    for idx in sampled_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, frame = cap.read()
        if not ok:
            scores.append(0.0)
            continue
            
        # Compute HSV histogram for scene change detection
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1, 2], None, [8, 8, 8], [0, 180, 0, 256, 0, 256])
        cv2.normalize(hist, hist)
        hist = hist.flatten()
        
        if prev_hist is None:
            scores.append(0.0)
        else:
            score = cv2.compareHist(prev_hist, hist, cv2.HISTCMP_CHISQR)
            scores.append(score)
        prev_hist = hist
        
    # Pick top 'count' frames by score, sorted by index
    indexed_scores = list(zip(sampled_indices, scores))
    indexed_scores.sort(key=lambda x: x[1], reverse=True)
    
    # Simple NMS-like selection to avoid adjacent frames
    final_indices = []
    for idx, score in indexed_scores:
        if len(final_indices) >= count:
            break
        if all(abs(idx - existing) > stride * 2 for existing in final_indices):
            final_indices.append(idx)
            
    # Supplement if not enough
    if len(final_indices) < count:
        for idx in np.linspace(0, total - 1, count).astype(int):
            if idx not in final_indices and len(final_indices) < count:
                final_indices.append(idx)
    
    final_indices.sort()
    
    frames_info = []
    for i, idx in enumerate(final_indices):
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, frame = cap.read()
        if ok:
            img_path = out_dir / f"frame_{i:03d}_{idx}.png"
            cv2.imwrite(str(img_path), frame)
            frames_info.append({
                "index": i,
                "video_idx": int(idx),
                "path": str(img_path)
            })
            
    cap.release()
    return frames_info
