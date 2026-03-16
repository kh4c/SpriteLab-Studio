import os
import shutil
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_cors import CORS
from processing.video import extract_keyframes, get_video_meta
from processing.matte import remove_background
from processing.sprite import pack_spritesheet, slice_spritesheet
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

@app.route("/api/demo-sprite", methods=["POST"])
def demo_sprite():
    # Pre-loaded test sheet
    img_path = Path("spritesheet.png")
    if not img_path.exists():
        return jsonify({"error": "Demo spritesheet not found"}), 404
        
    out_dir = UPLOAD_FOLDER / img_path.stem
    if out_dir.exists():
        import shutil
        shutil.rmtree(out_dir)
    out_dir.mkdir(exist_ok=True)
    
    # Just copy it to output for consistent URI access
    target_path = out_dir / img_path.name
    import shutil
    shutil.copy(img_path, target_path)
    
    return jsonify({
        "path": str(target_path.absolute()),
        "url": f"/output/{img_path.stem}/{img_path.name}",
        "name": img_path.stem
    })

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

@app.route("/output/<path:filename>")
def serve_output(filename):
    return send_from_directory(UPLOAD_FOLDER.absolute(), filename)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
