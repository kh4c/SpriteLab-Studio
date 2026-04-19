import os
import shutil
from pathlib import Path
import sys

# Increase limit for large integer to string conversions (important for some scientific libraries)
if hasattr(sys, 'set_int_max_str_digits'):
    sys.set_int_max_str_digits(0)
from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_cors import CORS
from processing.video import extract_keyframes, get_video_meta
from processing.matte import remove_background
from processing.sprite import pack_spritesheet, slice_spritesheet
from PIL import Image
import base64
import io
import threading
import requests

# Lazy import for AudioGen to avoid startup crash if still installing
_audio_gen = None
def get_audio_gen():
    global _audio_gen
    if _audio_gen is None:
        from processing.audio import AudioGenerator
        _audio_gen = AudioGenerator()
    return _audio_gen

from processing.animation import ComfyBridge
comfy_bridge = ComfyBridge()

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = Path("output")
UPLOAD_FOLDER.mkdir(exist_ok=True)

# Helper to convert PIL to base64
def pil_to_base64(img):
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/upload", methods=["POST"])
def upload_video():
    if "video" not in request.files:
        return jsonify({"error": "No video file"}), 400
    
    video = request.files["video"]
    target_count = int(request.form.get("target_count", 12))
    
    video_path = UPLOAD_FOLDER / video.filename
    video.save(video_path)
    
    out_dir = UPLOAD_FOLDER / video_path.stem
    if out_dir.exists():
        shutil.rmtree(out_dir)
    
    frames = extract_keyframes(video_path, out_dir, count=target_count)
    return jsonify({"frames": frames, "video_name": video_path.stem})

@app.route("/api/upload-image", methods=["POST"])
def upload_image():
    if "image" not in request.files:
        return jsonify({"error": "No image file"}), 400
    
    img_file = request.files["image"]
    img_path = UPLOAD_FOLDER / img_file.filename
    img_file.save(img_path)
    
    out_dir = UPLOAD_FOLDER / img_path.stem
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(exist_ok=True)
    
    try:
        with Image.open(img_path) as img:
            frame_path = out_dir / "frame-001.png"
            img.save(frame_path)
            
            frames = [{
                "index": 1,
                "path": str(frame_path),
                "url": f"/output/{img_path.stem}/frame-001.png"
            }]
            return jsonify({"frames": frames, "video_name": img_path.stem})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/slice", methods=["POST"])
def slice_endpoint():
    data = request.json
    img_path = data.get("path")
    if not img_path:
        return jsonify({"error": "No image path"}), 400
        
    mode = data.get("mode", "grid")
    cols = data.get("cols", 1)
    rows = data.get("rows", 1)
    width = data.get("width")
    height = data.get("height")
    
    p = Path(img_path)
    out_dir = UPLOAD_FOLDER / p.stem
    
    try:
        frames = slice_spritesheet(
            img_path, 
            out_dir, 
            mode=mode, 
            cols=cols, 
            rows=rows, 
            width=width, 
            height=height
        )
        return jsonify({"frames": frames, "video_name": p.stem})
    except Exception as e:
        return jsonify({"error": str(e)}), 400



@app.route("/api/remove-bg", methods=["POST"])
def remove_bg():
    data = request.json
    frame_path = data.get("path")
    if not frame_path:
        return jsonify({"error": "No path"}), 400
        
    threshold = data.get("threshold", 25.0)
    res_val = data.get("resolution", 0)
    resolution = None
    if res_val > 0:
        resolution = (int(res_val), int(res_val))
    
    clean_pil = remove_background(frame_path, t1=float(threshold), resolution=resolution)
    # Save clean version
    p = Path(frame_path)
    clean_dir = p.parent / "clean"
    clean_dir.mkdir(exist_ok=True)
    clean_path = clean_dir / p.name
    clean_pil.save(clean_path)
    
    return jsonify({
        "clean_path": str(clean_path),
        "base64": pil_to_base64(clean_pil)
    })

@app.route("/api/save-frame", methods=["POST"])
def save_frame():
    data = request.json
    base64_data = data.get("base64")
    target_path = data.get("path")
    
    if not base64_data or not target_path:
        return jsonify({"error": "Missing data"}), 400
    
    img_data = base64.b64decode(base64_data.split(",")[1])
    img = Image.open(io.BytesIO(img_data))
    img.save(target_path)
    
    return jsonify({"success": True})

@app.route("/api/export", methods=["POST"])
def export_sheet():
    data = request.json
    frame_paths = data.get("paths")
    video_name = data.get("video_name")
    cols = int(data.get("cols", 4))
    rows = data.get("rows")
    if rows is not None:
        rows = int(rows)
        if rows <= 0: rows = None # 0 means auto
    
    sheet_name = data.get("sheetName") or "spritesheet"
    if not sheet_name.endswith(".png"):
        sheet_name += ".png"
    
    if not frame_paths:
        return jsonify({"error": "No frames"}), 400
    
    out_path = UPLOAD_FOLDER / video_name / sheet_name
    pack_spritesheet(frame_paths, out_path, cols=cols, rows=rows)
    
    return jsonify({"sheet_url": f"/output/{video_name}/{sheet_name}"})

@app.route("/api/generate-sfx", methods=["POST"])
def generate_sfx_endpoint():
    data = request.json
    prompt = data.get("prompt")
    duration = float(data.get("duration", 2))
    video_name = data.get("video_name") or "global"
    
    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400
        
    try:
        gen = get_audio_gen()
        # Generate filename based on prompt hash or just timestamp
        import time
        ts = int(time.time())
        filename = f"sfx_{ts}"
        
        output_dir = UPLOAD_FOLDER / video_name / "sfx"
        guidance_scale = float(data.get("guidance_scale", 4.0))
        full_path = gen.generate(prompt, duration=duration, guidance_scale=guidance_scale, output_dir=output_dir, filename=filename)
        
        # AudioGen/audio_write returns the path with .wav
        rel_path = f"/output/{video_name}/sfx/{Path(full_path).name}"
        
        return jsonify({
            "success": True,
            "url": rel_path,
            "filename": Path(full_path).name
        })
    except Exception as e:
        print(f"SFX Generation Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/process-sfx', methods=['POST'])
def process_sfx():
    try:
        data = request.json
        # Convert URL path to local filesystem path
        url_path = data.get('url')
        if not url_path:
            return jsonify({"error": "No URL provided"}), 400
            
        # Example: http://127.0.0.1:5000/output/global/sfx/sfx_123.wav -> output/global/sfx/sfx_123.wav
        from urllib.parse import urlparse
        parsed = urlparse(url_path)
        rel_path = parsed.path.lstrip('/')
        abs_path = os.path.abspath(rel_path)
        
        if not os.path.exists(abs_path):
            return jsonify({"error": f"File not found: {abs_path}"}), 404
            
        # Process
        gen = get_audio_gen()
        new_path = gen.process_sfx(
            abs_path,
            volume=data.get('volume', 1.0),
            pitch=data.get('pitch', 1.0),
            trim_start=data.get('trim_start', 0.0)
        )
        
        # Return URL
        new_rel = os.path.relpath(new_path, os.getcwd()).replace('\\', '/')
        new_url = f"{request.host_url}{new_rel}"
        
        return jsonify({
            "success": True,
            "url": new_url,
            "filename": os.path.basename(new_path)
        })

    except Exception as e:
        print(f"SFX Processing Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/comfy-status")
def comfy_status():
    try:
        response = requests.get(f"{comfy_bridge.base_url}/system_stats", timeout=1)
        return jsonify({"connected": response.status_code == 200, "stats": response.json()})
    except Exception as e:
        print(f"ComfyUI Status Error: {e}")
        return jsonify({"connected": False, "error": str(e)})

@app.route('/api/generate-animation', methods=['POST'])
def generate_animation():
    data = request.json
    start_img = data.get('start_image')
    end_img = data.get('end_image')
    positive = data.get('positive', "")
    negative = data.get('negative', "")

    if not start_img or not end_img:
        return jsonify({"error": "Start and end images are required"}), 400

    try:
        # Resolve paths correctly (handle both /output/ and relative paths)
        # Note: server.py root is SpriteLab, so 'output/...' is correct locally.
        start_path_str = start_img.lstrip('/')
        end_path_str = end_img.lstrip('/')
        
        start_path = Path(start_path_str)
        end_path = Path(end_path_str)

        print(f"Generating animation: {start_path} -> {end_path}")
        
        prompt_id = comfy_bridge.generate(start_path, end_path, positive, negative)
        video_info = comfy_bridge.wait_for_result(prompt_id)
        video_path = comfy_bridge.download_video(video_info)

        return jsonify({
            "success": True,
            "video_url": f"/{video_path.as_posix()}"
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/output/<path:filename>")
def serve_output(filename):
    return send_from_directory(UPLOAD_FOLDER.absolute(), filename)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
