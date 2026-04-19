# SpriteLab Studio - Pixel Art Asset Pipeline

[![SpriteLab Studio Banner](Image/MainPage.png)](https://www.youtube.com/watch?v=6WWTcY8P2rg)

**SpriteLab Studio** is a personal pixel-art pipeline designed to help indie developers transform video and AI-generated content into optimized game assets. It focuses on maintaining pixel-perfect fidelity, precise alignment, and authentic retro aesthetics.

---

## 📽️ Full Demo
<video src="./Image/demo/demo_mini.mp4" controls width="100%"></video>
*Watch the high-fidelity demo of SpriteLab Studio in action.*

### Quick Previews (Auto-Playing)
Check out these instant previews of the specialized pixel-art tools:

**AI Animation Result:**
![AI Animation Preview](./Image/results/animation_result.gif)

**Pixel-Perfect Sprite Perfection:**
![Sprite Perfection Preview](./Image/results/sprite_result.gif)

---

---


## ✨ Key Strengths

- **Pixel-Art Focused**: Every tool is calibrated for low-resolution, high-fidelity asset creation.
- **AI Artifact Cleaning**: Specialized filters to remove noise and hallucinations from AI-generated outputs.
- **Mathematical Alignment**: Eliminates "pixel jitter" in animations through precision frame centering.

---

## 🔬 The Pixel-Perfect Engine

SpriteLab Studio uses a specialized processing stack to ensure your assets remain game-ready:

- **Perceptual CIELAB Matte**: Our background removal uses the **CIELAB color space**, which measures "perceptual distance" rather than simple RGB values. This ensures that even subtle pixel art outlines are preserved perfectly during isolation.
- **NEAREST-Neighbor Fidelity**: All scaling operations use **NEAREST** interpolation. This guarantees that your pixel edges stay sharp and never become blurred by traditional biliner/bicubic filters.
- **Alpha-Composite Centering**: Frames are mathematically centered within their cells using integer-based offsets and alpha-composition, ensuring uniform dimensions for easier integration into game engines like Godot, Unity, or GameMaker.
- **Authentic Palette Quantization**: Match your AI outputs to iconic retro palettes instantly, supporting **PICO-8**, **GameBoy**, and **NES** limitations.

---

| Raw AI Output (Problem) | SpriteLab Refined (Solution) |
| :---: | :---: |
| ![AI Problem](Image/ai%20problem.png) | ![](Image/result%20(3).mp4) |
| *Visible noise and blurred edges* | *Clean, auto-playing pixel perfection* |

---

---

---

## Core Modules

### Sprite Maker
Transform any video clip into a game-ready spritesheet with our multi-stage pipeline.

#### Visual Workflow

| Step | description | Preview |
| :--- | :--- | :--- |
| **1. Ingest** | Upload your `mp4` or `mov` video clips to begin the extraction process. | ![Ingest](Image/spritemaker1.png) |
| **2. Refine** | Pick the exact frames you want to include in your animation loop. | ![Refine](Image/Screenshot%202026-04-19%20183216.png) |
| **3. Cleanup** | Automatically remove backgrounds using high-precision CIELAB masking. | ![Cleanup](Image/Screenshot%202026-04-19%20183538.png) |
| **4. Fine Edit** | Adjust brightness, contrast, and apply custom palette remapping. | ![Fine Edit](Image/Screenshot%202026-04-19%20183845.png) |
| **5. Export** | Pack your refined frames mathematically into a pixel-perfect spritesheet. | ![Export](Image/spritesheet.png) |

### Image Editor
A specialized workspace for single-image refinement.
- **Cleanup Tools**: High-precision brush, eraser, and eyedropper.
- **Palette Quantization**: Instantly convert images to iconic styles like **PICO-8**, **GameBoy**, or **NES**.
- **Flood-Fill Isolation**: Isolate complex backgrounds using connected-component analysis.

### Sprite Editor
Import and modify existing spritesheets.
- **Smart Slicing**: Slice sheets by grid or fixed cell size.
- **Batch Editing**: Apply transparency or palette filters to all frames simultaneously.

![Sprite Editor Slicing](Image/slicing.png)

### Sound Lab
AI-driven SFX creation powered by **AudioGen**.
- **Text-to-SFX**: Generate sounds like "Laser blast", "Sword clang", or "Ambient rain" from simple prompts.
- **Post-Processing**: Fine-tune volume, pitch (resampling), and trim start/end points.

![Sound Lab Interface](Image/soundlab.png)

### Animation Lab (In Development)
Bridge the gap between static frames using AI.
- **Keyframe Interpolation**: Uses the **ComfyUI Bridge** (Wan 2.2 / SVD) to generate smooth motion.
- **Workflow Driven**: Integrated with ComfyUI for advanced control.

![Animation Lab Interface](Image/animationlab.png)

#### Animation Pipeline (Wan 2.2)
![Animation Lab Workflow](Image/wan2.2%20workflow.png)

---

## Installation

### Prerequisites
- **Python**: 3.12 or higher.
- **CUDA**: Optional but highly recommended for Sound and Animation modules.
- **FFmpeg**: Required for advanced video processing.

### Setup
1. **Clone the repository**:
   ```bash
   git clone https://github.com/kh4c/SpriteLab-Studio.git
   cd SpriteLab-Studio
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
| **Frontend** | Vanilla JS, CSS (Dark Theme) |
| **Img Processing** | OpenCV, Pillow, NumPy |
| **Audio AI** | Facebook AudioGen (AudioCraft) |
| **Animation AI** | ComfyUI Bridge (Wan2.2 / SVD) |
| **Color Space** | Perceptual CIELAB for bg-removal |

---

## Contributing
Feel free to open issues or submit pull requests. Let's make game asset creation accessible to everyone!

---

*Developed with the goal of making game development faster and more creative.*
