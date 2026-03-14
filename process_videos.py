from pathlib import Path
import argparse
import glob
import cv2
import numpy as np
from PIL import Image
from tqdm import tqdm

# ---------------- helpers ----------------

def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)

def get_video_meta(path):
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open: {path}")
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    cap.release()
    return total, fps

def read_frame_safe(path, frame_index, tried, search_radius=12):
    """
    Try to read the exact frame; if it fails, search outward +/- up to search_radius.
    Returns an RGB image (numpy) or None if nothing readable nearby.
    """
    def try_read(idx):
        if idx < 0:
            return None
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            return None
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ok, frame = cap.read()
        cap.release()
        if not ok or frame is None:
            return None
        return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    # exact
    if frame_index not in tried:
        img = try_read(frame_index)
        if img is not None:
            return frame_index, img

    # outward search
    for d in range(1, search_radius + 1):
        for cand in (frame_index - d, frame_index + d):
            if cand in tried:
                continue
            img = try_read(cand)
            if img is not None:
                return cand, img
    return None, None

# ---------------- keyframe picking ----------------

def compute_hist(frame_bgr, bins=(32, 32, 32)):
    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1, 2], None, bins, [0, 180, 0, 256, 0, 256])
    cv2.normalize(hist, hist)
    return hist.flatten().astype(np.float32)

def scene_change_scores(video_path, stride=10):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open: {video_path}")
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    sampled = list(range(0, total, max(1, stride)))
    prev = None
    scores = []
    for idx in sampled:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ok, frame = cap.read()
        if not ok or frame is None:
            scores.append(0.0)
            continue
        h = compute_hist(frame)
        if prev is None:
            scores.append(0.0)
        else:
            scores.append(float(cv2.compareHist(prev, h, cv2.HISTCMP_CHISQR)))
        prev = h
    cap.release()
    return sampled, np.array(scores, dtype=np.float32), total

def pick_keyframes(sampled_indices, scores, total_frames, k=6, nms_radius=5):
    """
    1) pick top peaks with NMS on the sampled grid
    2) if fewer than k, supplement with evenly spaced frames across the FULL video
    3) guarantee uniqueness; clamp to available total_frames
    """
    target = min(k, max(1, total_frames))
    # 1) peaks
    cand = list(zip(range(len(sampled_indices)), scores.tolist()))
    cand.sort(key=lambda x: x[1], reverse=True)
    taken = np.zeros(len(sampled_indices), dtype=bool)
    picked_frames = []

    for i, _ in cand:
        if len(picked_frames) >= target:
            break
        if taken[i]:
            continue
        picked_frames.append(sampled_indices[i])
        left = max(0, i - nms_radius)
        right = min(len(sampled_indices) - 1, i + nms_radius)
        taken[left:right+1] = True

    # 2) supplement if needed (evenly spaced across total)
    if len(picked_frames) < target:
        supplement = np.linspace(0, total_frames - 1, target).astype(int).tolist()
        picked_frames = list(dict.fromkeys(picked_frames + supplement))  # preserve order + unique

    # 3) final clamp and sort, ensure exactly 'target' unique indices
    picked_frames = sorted(set([max(0, min(total_frames - 1, x)) for x in picked_frames]))
    # if still too many/too few, adjust by spacing
    if len(picked_frames) < target:
        # fill by simple stepping
        extra = np.linspace(0, total_frames - 1, target).astype(int).tolist()
        for e in extra:
            if e not in picked_frames:
                picked_frames.append(e)
            if len(picked_frames) >= target:
                break
    if len(picked_frames) > target:
        # downsample to target evenly
        idxs = np.linspace(0, len(picked_frames) - 1, target).astype(int)
        picked_frames = [picked_frames[i] for i in idxs]

    return sorted(picked_frames)

# ---------------- main processing ----------------

def process_video(video_path, out_root="output", count=6, stride=10):
    video_path = Path(video_path)
    out_dir = Path(out_root) / video_path.stem
    ensure_dir(out_dir)

    sampled, scores, total = scene_change_scores(video_path, stride=stride)
    targets = pick_keyframes(sampled, scores, total_frames=total, k=count)

    saved = 0
    tried = set()
    used_frames = set()
    for tgt in targets:
        idx, img = read_frame_safe(video_path, tgt, tried)
        if img is None:
            continue
        if idx in used_frames:
            continue
        Image.fromarray(img).save(out_dir / f"{saved + 1}.png")
        used_frames.add(idx)
        tried.add(idx)
        saved += 1
        if saved >= min(count, total):
            break

    # If still under count, fill with evenly spaced frames not yet used
    while saved < min(count, total):
        for idx in np.linspace(0, total - 1, count).astype(int).tolist():
            if idx in used_frames:
                continue
            j, img = read_frame_safe(video_path, idx, tried)
            if img is None or j in used_frames:
                continue
            Image.fromarray(img).save(out_dir / f"{saved + 1}.png")
            used_frames.add(j); tried.add(j)
            saved += 1
            if saved >= min(count, total):
                break

def main():
    parser = argparse.ArgumentParser(description="Extract exactly 6 key frames from MP4s (when possible).")
    parser.add_argument("--input", required=True, help='Glob for input videos, e.g. "*.mp4" or a single file')
    parser.add_argument("--out", default="output", help="Output root directory")
    parser.add_argument("--count", type=int, default=12, help="How many frames to extract (default 6)")
    parser.add_argument("--stride", type=int, default=10, help="Stride for scene detection sampling")
    args = parser.parse_args()

    paths = sorted(glob.glob(args.input))
    if not paths:
        print("No videos matched the pattern.")
        return

    for p in tqdm(paths, desc="Processing videos"):
        try:
            process_video(p, args.out, count=args.count, stride=args.stride)
        except Exception as e:
            print(f"[WARN] {p}: {e}")

if __name__ == "__main__":
    main()
