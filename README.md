# SpriteLab - AI-Powered Game Asset Suite

![SpriteLab Banner](INSERT_BANNER_IMAGE_HERE)

**SpriteLab** is a premium, all-in-one suite designed for indie developers and sprite artists to transform media into high-quality game assets. From video-to-sprite extraction to AI-generated sound effects, SpriteLab streamlines the technical hurdles of asset creation.

---

## Demo
![Project Demo Video](INSERT_DEMO_VIDEO_HERE)

> [!TIP]
> Use the **premium dark mode** for the best eyes-on experience during long editing sessions!

---

## Core Modules

### Sprite Maker
Transform any video clip into a game-ready spritesheet.
- **Auto-Extraction**: Intelligent keyframe selection from `mp4`, `avi`, or `mov`.
- **Background Removal**: Uses perceptual **CIELAB** distance logic to isolate characters with high precision.
- **Sheet Packing**: Automatically packs isolated frames into a single, optimized spritesheet.

### Image Editor
A specialized workspace for single-image refinement.
- **Cleanup Tools**: High-precision brush, eraser, and eyedropper.
- **Palette Quantization**: Instantly convert images to iconic styles like **PICO-8**, **GameBoy**, or **NES**.
- **Flood-Fill Isolation**: Isolate complex backgrounds using connected-component analysis.

### Sprite Editor
Import and modify existing spritesheets.
- **Smart Slicing**: Slice sheets by grid or fixed cell size.
- **Batch Editing**: Apply transparency or palette filters to all frames simultaneously.

### Sound Lab
AI-driven SFX creation powered by **AudioGen**.
- **Text-to-SFX**: Generate sounds like "Laser blast", "Sword clang", or "Ambient rain" from simple prompts.
- **Post-Processing**: Fine-tune volume, pitch (resampling), and trim start/end points.

### Animation Lab (In Development)
Bridge the gap between static frames using AI.
- **Keyframe Interpolation**: Uses the **ComfyUI Bridge** (currently in active development) to generate smooth transitions between two images.
- **Prompt Guided**: Use positive and negative prompts to influence the motion and style of the animation.

---

## Installation

### Prerequisites
- **Python**: 3.12 or higher.
- **CUDA**: Optional but highly recommended for Sound and Animation modules.
- **FFmpeg**: Required for advanced video processing.

### Setup
1. **Clone the repository**:
   ```bash
   git clone https://github.com/kh4c/SpriteLab.git
   cd SpriteLab
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **ComfyUI Setup (Optional)**:
   For Animation Lab, ensure a ComfyUI instance is running locally (default: `http://127.0.0.1:8188`).

---

## Usage

1. **Start the server**:
   ```bash
   python server.py
   ```
2. **Open the App**:
   Navigate to `http://127.0.0.1:5000` in your browser.

---

## Technical Details

| Feature | Tech Used |
| :--- | :--- |
| **Backend** | Flask (Python) |
| **Frontend** | Vanilla JS, CSS (Premium Dark Theme) |
| **Img Processing** | OpenCV, Pillow, NumPy |
| **Audio AI** | Facebook AudioGen (AudioCraft) |
| **Animation AI** | ComfyUI Bridge (Wan2.1 / SVD) |
| **Color Space** | Perceptual CIELAB for bg-removal |

---

## Contributing
Feel free to open issues or submit pull requests. Let's make game asset creation accessible to everyone!

---

*Developed with the goal of making game development faster and more creative.*
