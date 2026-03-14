import os
import shutil
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_cors import CORS
from processing.video import extract_keyframes, get_video_meta
from processing.matte import remove_background
from processing.sprite import pack_spritesheet
from PIL import Image
import base64
import io

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

@app.route("/api/demo", methods=["POST"])
def demo_mode():
    # Hardcoded test path
    video_path = Path(r"C:\Users\user\Desktop\live2d project\SpriteLab\test2.mp4")
    if not video_path.exists():
        return jsonify({"error": "Demo video not found"}), 404
        
    target_count = int(request.form.get("target_count", 12))
    out_dir = UPLOAD_FOLDER / video_path.stem
    if out_dir.exists():
        shutil.rmtree(out_dir)
    
    frames = extract_keyframes(video_path, out_dir, count=target_count)
    return jsonify({"frames": frames, "video_name": video_path.stem})

@app.route("/api/remove-bg", methods=["POST"])
def remove_bg():
    data = request.json
    frame_path = data.get("path")
    if not frame_path:
        return jsonify({"error": "No path"}), 400
        
    threshold = data.get("threshold", 25.0)
    
    clean_pil = remove_background(frame_path, t1=float(threshold))
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
    
    if not frame_paths:
        return jsonify({"error": "No frames"}), 400
    
    out_path = UPLOAD_FOLDER / video_name / "spritesheet.png"
    pack_spritesheet(frame_paths, out_path)
    
    return jsonify({"sheet_url": f"/output/{video_name}/spritesheet.png"})

@app.route("/output/<path:filename>")
def serve_output(filename):
    return send_from_directory(UPLOAD_FOLDER.absolute(), filename)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
