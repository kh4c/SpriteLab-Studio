const state = {
    videoName: null,
    frames: [],
    targetCount: 12,
    activeFrameIdx: 0,
    brushSize: 20,
    brushColor: '#ffffff',
    activeTool: 'brush', // 'brush', 'eraser', 'eyedropper'
    loopInterval: null,
    loopFrameIdx: 0,
    defaultThreshold: 8,
    miniLoopInterval: null,
    miniLoopFrameIdx: 0,
    targetResolution: 0
};

const app = {
    init() {
        console.log("SpriteLab Hub v2.0 (Discord Theme) Initializing...");
        console.log("Sidebar element:", document.querySelector('.sidebar'));
        this.loadSettings();
        this.initTheme();
        this.bindEvents();
        this.updateFrameCountDisplay();
        this.navigate('hub');
    },

    bindEvents() {
        document.getElementById('frame-count').oninput = (e) => {
            state.targetCount = e.target.value;
            this.updateFrameCountDisplay();
        };

        const videoInput = document.getElementById('video-input');
        const btnSelect = document.getElementById('btn-select-video');
        
        // Fix double-prompt: only the button triggers the input
        btnSelect.onclick = (e) => {
            e.stopPropagation();
            videoInput.click();
        }

        videoInput.onchange = (e) => {
            if (e.target.files.length) this.handleFileSelection(e.target.files[0]);
        };

        document.getElementById('proceed-btn').onclick = () => this.startCleanup();
        document.getElementById('export-btn').onclick = () => this.exportSheet();

        document.getElementById('tool-eraser').onclick = () => this.setTool('eraser');
        document.getElementById('tool-brush').onclick = () => this.setTool('brush');
        document.getElementById('tool-eyedropper').onclick = () => this.setTool('eyedropper');
        document.getElementById('tool-bucket').onclick = () => this.setTool('bucket');
        document.getElementById('brush-color').oninput = (e) => {
            state.brushColor = e.target.value;
            this.setTool('brush');
        };
        document.getElementById('brush-size').oninput = (e) => this.updateBrushSize(e.target.value);
        
        // Navigation buttons
        const prevBtn = document.querySelector('[onclick="app.prevFrame()"]');
        const nextBtn = document.querySelector('[onclick="app.nextFrame()"]');
        if (prevBtn) prevBtn.onclick = () => this.prevFrame();
        if (nextBtn) nextBtn.onclick = () => this.nextFrame();

        // Global shortcuts for undo/redo and navigation
        window.addEventListener('keydown', (e) => {
            const screen = document.querySelector('section.active')?.id;
            
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z') {
                    e.preventDefault();
                    canvasEditor.undo();
                } else if (e.key === 'y') {
                    e.preventDefault();
                    canvasEditor.redo();
                }
            } else if (screen === 'drawing-screen' || screen === 'editor-screen') {
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    this.prevFrame();
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    this.nextFrame();
                }
            }
        });
    },

    updateFrameCountDisplay() {
        document.getElementById('frame-count-val').innerText = state.targetCount;
    },

    loadSettings() {
        const saved = localStorage.getItem('spritelab_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            state.defaultThreshold = parsed.defaultThreshold || 8;
        }
    },

    navigate(screenId) {
        console.log("Navigating to:", screenId);
        console.log("Current state.frames count:", state.frames.length);
        // Update breadcrumb
        const titles = {
            'hub': 'Home',
            'welcome': 'Sprite Maker / Ingest',
            'selection': 'Sprite Maker / Refine',
            'editor': 'Sprite Maker / Cleanup',
            'drawing': 'Sprite Maker / Fine Edit',
            'export': 'Sprite Maker / Result'
        };
        document.getElementById('breadcrumb').innerText = titles[screenId] || 'SpriteLab';

        document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId + '-screen').classList.add('active');
        
        // Update sidebar active state
        document.querySelectorAll('.nav-item').forEach(item => {
            if (item.innerText.toLowerCase().includes(screenId === 'hub' ? 'home' : 'sprite maker')) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        if (screenId === 'selection') {
            document.getElementById('proceed-btn').innerText = "Proceed to Cleanup";
            document.getElementById('proceed-btn').disabled = false;
            this.renderReel('frame-reel');
            state.loopFrameIdx = 0; // Reset index to show first frame
            this.startLoop();
            // Start mini loop here too if we want it "at all time"
            canvasEditor.startMiniLoop(); 
        } else if (screenId === 'editor' || screenId === 'drawing') {
            this.stopLoop();
            
            // Refresh the specific reel for this screen
            if (screenId === 'editor') this.renderEditorReel();
            else if (screenId === 'drawing') this.renderDrawingReel();

            // Re-target canvas and re-bind listeners
            const canvasId = screenId === 'editor' ? 'editor-canvas' : 'drawing-canvas';
            const targetCanvas = document.getElementById(canvasId);
            if (targetCanvas) {
                canvasEditor.canvas = targetCanvas;
                canvasEditor.ctx = targetCanvas.getContext('2d');
                canvasEditor.attachListeners();
                
                // Safety: only load if we actually have frames and a current frame record
                const active = state.frames.filter(f => f.active);
                if (active.length > 0) {
                    let idx = active.indexOf(canvasEditor.currentFrame);
                    if (idx < 0) idx = 0;
                    
                    // Only load if the frame actually has processed data
                    if (active[idx].base64) {
                        canvasEditor.loadFrame(idx, false);
                    }
                }
            }
            
            canvasEditor.startMiniLoop();
        } else {
            this.stopLoop();
            canvasEditor.stopMiniLoop();
        }
    },

    toggleTheme() {
        const body = document.body;
        const current = body.getAttribute('data-theme');
        const next = current === 'light' ? 'dark' : 'light';
        body.setAttribute('data-theme', next);
        localStorage.setItem('spritelab-theme', next);
    },

    initTheme() {
        const saved = localStorage.getItem('spritelab-theme') || 'dark';
        document.body.setAttribute('data-theme', saved);
    },

    loadSettings() {
        const saved = localStorage.getItem('spritelab-threshold');
        if (saved) state.defaultThreshold = parseInt(saved);
        document.getElementById('setting-default-threshold').value = state.defaultThreshold;
    },

    saveSettings() {
        state.defaultThreshold = parseInt(document.getElementById('setting-default-threshold').value);
        localStorage.setItem('spritelab-threshold', state.defaultThreshold);
        this.navigate('hub');
    },

    handleFileSelection(file) {
        state.selectedFile = file;
        
        // Show Video Preview
        const video = document.getElementById('upload-preview');
        const url = URL.createObjectURL(file);
        video.src = url;
        video.play().catch(e => console.warn("Auto-play blocked:", e));
        
        document.getElementById('upload-prompt').classList.add('hidden');
        document.getElementById('video-preview-container').classList.remove('hidden');
        document.getElementById('processing-complete').classList.remove('hidden');
    },

    resetUpload(e) {
        if (e) e.stopPropagation();
        state.selectedFile = null;
        document.getElementById('video-input').value = '';
        
        document.getElementById('upload-prompt').classList.remove('hidden');
        document.getElementById('video-preview-container').classList.add('hidden');
        document.getElementById('processing-complete').classList.add('hidden');
        document.getElementById('upload-progress').classList.add('hidden');
    },

    async startUpload() {
        if (!state.selectedFile) return;

        document.getElementById('processing-complete').classList.add('hidden');
        document.getElementById('upload-progress').classList.remove('hidden');
        const fill = document.getElementById('upload-fill');
        fill.style.width = '20%';

        const formData = new FormData();
        formData.append('video', state.selectedFile);
        formData.append('target_count', state.targetCount);

        try {
            const resp = await fetch('/api/upload', { method: 'POST', body: formData });
            fill.style.width = '80%';
            const data = await resp.json();
            
            state.frames = data.frames.map(f => ({ ...f, active: true }));
            state.videoName = data.video_name;
            
            fill.style.width = '100%';
            setTimeout(() => this.navigate('selection'), 300);
        } catch (err) {
            console.error("Upload failed", err);
            alert("Upload failed. Please try again.");
            this.resetUpload();
        }
    },

    async startDemo() {
        const formData = new FormData();
        formData.append('target_count', state.targetCount);

        try {
            const resp = await fetch('/api/demo', { method: 'POST', body: formData });
            const data = await resp.json();
            state.frames = data.frames.map(f => ({ ...f, active: true }));
            state.videoName = data.video_name;
            this.navigate('selection');
        } catch (err) {
            console.error("Demo failed", err);
            alert("Demo failed.");
        }
    },

    renderReel(containerId) {
        const reel = document.getElementById(containerId);
        reel.innerHTML = '';
        state.frames.forEach((f, i) => {
            const item = document.createElement('div');
            item.className = `frame-item ${f.active ? 'active' : 'disabled'}`;
            
            // Normalize path for consistent URL generation
            let path = f.path.replace(/\\/g, '/');
            const relPath = path.includes('output/') ? path.split('output/').pop() : path;
            
            item.style.backgroundImage = `url(/output/${relPath})`;
            item.onclick = () => this.toggleFrame(i, item);
            reel.appendChild(item);
        });
    },

    toggleFrame(idx, el) {
        state.frames[idx].active = !state.frames[idx].active;
        el.classList.toggle('active', state.frames[idx].active);
        el.classList.toggle('disabled', !state.frames[idx].active);
    },

    startLoop() {
        if (state.loopInterval) clearInterval(state.loopInterval);
        
        const updatePreview = () => {
            const activeFrames = state.frames.filter(f => f.active);
            if (!activeFrames.length) return;
            
            const frame = activeFrames[state.loopFrameIdx];
            let rel = frame.path.replace(/\\/g, '/');
            if (rel.includes('output/')) rel = rel.split('output/').pop();
            
            const imgEl = document.getElementById('loop-preview');
            if (imgEl) imgEl.src = `/output/${rel}`;
            
            state.loopFrameIdx = (state.loopFrameIdx + 1) % activeFrames.length;
        };

        updatePreview();
        state.loopInterval = setInterval(updatePreview, 120);
    },

    stopLoop() {
        clearInterval(state.loopInterval);
    },

    async startCleanup() {
        const active = state.frames.filter(f => f.active);
        if (!active.length) return alert("Select at least one frame!");
        
        this.navigate('editor');
        
        // Initialize editor with first frame
        canvasEditor.init(active[0]);
        
        // Apply target resolution and default threshold to all immediately
        await canvasEditor.applyThresholdToAll();
    },

    startDrawing() {
        this.navigate('drawing');
        const active = state.frames.filter(f => f.active);
        
        // Update locked resolution display
        const resText = state.targetResolution === 0 ? "Original Size" : `${state.targetResolution} x ${state.targetResolution}`;
        const resLabel = document.getElementById('locked-resolution-val');
        if (resLabel) resLabel.innerText = resText;

        canvasEditor.init(active[0], 'drawing-canvas');
        this.renderDrawingReel();
    },

    renderDrawingReel() {
        const active = state.frames.filter(f => f.active);
        const reel = document.getElementById('drawing-reel');
        if (!reel) return;
        reel.innerHTML = '';
        active.forEach((f, i) => {
            const item = document.createElement('div');
            item.className = `frame-item ${canvasEditor.currentFrame === f ? 'active-frame' : ''}`;
            
            if (f.base64) {
                item.style.backgroundImage = `url(data:image/png;base64,${f.base64})`;
            } else {
                let path = (f.clean_path || f.path).replace(/\\/g, '/');
                const relPath = path.includes('output/') ? path.split('output/').pop() : path;
                const t = new Date().getTime();
                item.style.backgroundImage = `url(/output/${relPath}?t=${t})`;
            }
            
            item.onclick = () => canvasEditor.loadFrame(i);
            reel.appendChild(item);
        });
    },

    renderEditorReel() {
        const active = state.frames.filter(f => f.active);
        const reel = document.getElementById('editor-reel');
        if (!reel) return;
        reel.innerHTML = '';
        active.forEach((f, i) => {
            const item = document.createElement('div');
            item.className = `frame-item ${canvasEditor.currentFrame === f ? 'active-frame' : ''}`;
            
            if (f.base64) {
                item.style.backgroundImage = `url(data:image/png;base64,${f.base64})`;
            } else {
                let path = (f.clean_path || f.path).replace(/\\/g, '/');
                const relPath = path.includes('output/') ? path.split('output/').pop() : path;
                const t = new Date().getTime();
                item.style.backgroundImage = `url(/output/${relPath}?t=${t})`;
            }
            
            item.onclick = () => canvasEditor.loadFrame(i);
            reel.appendChild(item);
        });
    },

    prevFrame() {
        const active = state.frames.filter(f => f.active);
        if (!active.length) return;
        let idx = active.indexOf(canvasEditor.currentFrame);
        if (idx === -1) idx = 0;
        const nextIdx = (idx - 1 + active.length) % active.length;
        canvasEditor.loadFrame(nextIdx);
    },

    nextFrame() {
        const active = state.frames.filter(f => f.active);
        if (!active.length) return;
        let idx = active.indexOf(canvasEditor.currentFrame);
        if (idx === -1) idx = 0;
        const nextIdx = (idx + 1) % active.length;
        canvasEditor.loadFrame(nextIdx);
    },

    setTool(tool) {
        state.activeTool = tool;
        document.querySelectorAll('.tool-btn-small').forEach(btn => btn.classList.remove('active'));
        
        const btn = document.getElementById(`tool-${tool}`);
        if (btn) btn.classList.add('active');
        
        // Visual cursor feedback
        const canvas = document.getElementById('drawing-canvas');
        if (canvas) {
            canvas.style.cursor = tool === 'eyedropper' ? 'crosshair' : 'none';
        }
    },

    updateBrushSize(size) {
        state.brushSize = size;
        document.getElementById('brush-size-val').innerText = size;
    },

    async exportSheet() {
        // Save current frame first
        await canvasEditor.saveCurrent();
        
        const active = state.frames.filter(f => f.active);
        const resp = await fetch('/api/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                paths: active.map(f => f.clean_path || f.path),
                video_name: state.videoName
            })
        });
        const data = await resp.json();
        
        document.getElementById('final-sheet').src = data.sheet_url;
        document.getElementById('download-link').href = data.sheet_url;
        this.navigate('export');
    }
};

const canvasEditor = {
    canvas: null,
    ctx: null,
    cursorCanvas: null,
    cursorCtx: null,
    currentFrame: null,
    history: [],
    historyIdx: -1,
    isDrawing: false,
    zoom: 1.0,

    init(frame, canvasId = 'editor-canvas') {
        const active = state.frames.filter(f => f.active);
        const idx = active.indexOf(frame);
        
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // Secondary canvas for cursor highlights
        const cursorId = canvasId === 'editor-canvas' ? 'cursor-canvas-editor' : 'cursor-canvas';
        this.cursorCanvas = document.getElementById(cursorId);
        if (this.cursorCanvas) {
            this.cursorCtx = this.cursorCanvas.getContext('2d');
        }

        this.attachListeners();
        this.loadFrame(idx >= 0 ? idx : 0);

        if (canvasId === 'editor-canvas') this.initResize('mini-preview-panel');
        if (canvasId === 'drawing-canvas') this.initResize('mini-preview-panel-drawing');
    },

    attachListeners() {
        this.canvas.onmousedown = (e) => this.startDraw(e);
        this._boundDraw = (e) => this.draw(e);
        this._boundStop = () => this.stopDraw();
        
        window.addEventListener('mousemove', this._boundDraw);
        window.addEventListener('mouseup', this._boundStop);
    },

    initResize(panelId = 'mini-preview-panel') {
        const panel = document.getElementById(panelId);
        if (!panel || panel._resizeInitialized) return; 
        
        const handle = panel.querySelector('.resize-handle');
        let isResizing = false;

        handle.onmousedown = (e) => {
            isResizing = true;
            e.preventDefault();
        };

        window.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const rect = panel.getBoundingClientRect();
            const newW = e.clientX - rect.left;
            const newH = e.clientY - rect.top;
            panel.style.width = Math.max(80, newW) + 'px';
            panel.style.height = Math.max(80, newH) + 'px';
        });

        window.addEventListener('mouseup', () => {
            isResizing = false;
        });
        panel._resizeInitialized = true;
    },

    startMiniLoop() {
        if (state.miniLoopInterval) clearInterval(state.miniLoopInterval);
        
        const updateMini = () => {
            const activeFrames = state.frames.filter(f => f.active);
            if (!activeFrames.length) return;
            
            const frame = activeFrames[state.miniLoopFrameIdx];
            
            // Sync multiple preview targets
            const targets = ['mini-loop-img', 'mini-loop-img-drawing'];
            targets.forEach(id => {
                const imgEl = document.getElementById(id);
                if (imgEl && frame.base64) {
                    imgEl.src = 'data:image/png;base64,' + frame.base64;
                }
            });
            
            state.miniLoopFrameIdx = (state.miniLoopFrameIdx + 1) % activeFrames.length;
        };

        updateMini();
        state.miniLoopInterval = setInterval(updateMini, 120);
    },

    stopMiniLoop() {
        clearInterval(state.miniLoopInterval);
    },

    loadFrame(idx, resetDrawing = true) {
        const active = state.frames.filter(f => f.active);
        if (!active.length || idx < 0 || idx >= active.length) {
            console.warn("Invalid frame index requested:", idx);
            return;
        }
        
        this.currentFrame = active[idx];
        if (!this.currentFrame || !this.currentFrame.base64) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }
        
        const img = new Image();
        img.onload = () => {
            this.canvas.width = img.width;
            this.canvas.height = img.height;
            
            if (this.cursorCanvas) {
                this.cursorCanvas.width = img.width;
                this.cursorCanvas.height = img.height;
            }
            
            // PIXEL PERFECT SETUP
            this.ctx.imageSmoothingEnabled = false;
            this.ctx.mozImageSmoothingEnabled = false;
            this.ctx.webkitImageSmoothingEnabled = false;
            this.ctx.msImageSmoothingEnabled = false;

            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);

            // AUTO-ZOOM for small sprites
            if (img.width > 0 && img.width <= 128) {
                // Measure the actual visible area (canvas-panel)
                const panel = this.canvas.closest('.canvas-panel');
                const panelWidth = panel.clientWidth;
                const panelHeight = panel.clientHeight;
                
                // Zoom to fit ~70% of the smallest dimension
                const targetZoom = Math.min(
                    (panelWidth * 0.7) / img.width,
                    (panelHeight * 0.7) / img.height
                );
                this.zoom = Math.max(1, Math.min(10, targetZoom));
                this.updateZoomDisplay();
            } else if (resetDrawing) {
                this.resetZoom();
            } else {
                // If not auto-zooming, still ensure scaling is applied to the new img
                this.updateZoomDisplay();
            }

            if (resetDrawing) {
                this.history = [];
                this.historyIdx = -1;
                this.saveHistory();
            } else {
                // If not resetting, we should at least check if history needs update
                // but usually we reset when moving between Phase 1 and 2
            }
        };
        img.src = 'data:image/png;base64,' + this.currentFrame.base64;
        
        // UI feedback for active frame in reel
        app.renderDrawingReel();
        app.renderEditorReel();
    },

    startDraw(e) {
        if (!this.currentFrame) return;
        
        const pos = this.getPixelPos(e);
        this.lastPixel = pos;
        
        if (state.activeTool === 'eyedropper') {
            this.pickColor(e);
            return;
        }

        if (state.activeTool === 'bucket') {
            this.floodFill(pos.x, pos.y, state.brushColor);
            this.saveHistory();
            
            // Bucket Persistence Fix: Sync to frame immediately
            if (this.currentFrame) {
                const dataUrl = this.canvas.toDataURL();
                this.currentFrame.base64 = dataUrl.split(',')[1];
                // Refresh both reels to be safe
                app.renderDrawingReel();
                app.renderEditorReel();
            }
            return;
        }

        this.isDrawing = true;
        this.paintPixel(pos.x, pos.y);
    },

    getPixelPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: Math.floor((e.clientX - rect.left) * scaleX),
            y: Math.floor((e.clientY - rect.top) * scaleY)
        };
    },

    draw(e) {
        const pos = this.getPixelPos(e);
        this.updateBrushCursor(e, pos);

        if (!this.isDrawing) return;
        
        if (state.activeTool === 'eyedropper') {
            this.pickColor(e);
            return;
        }

        // Bresenham's to connect pixels
        if (this.lastPixel) {
            this.line(this.lastPixel.x, this.lastPixel.y, pos.x, pos.y);
        }
        this.lastPixel = pos;
    },

    line(x0, y0, x1, y1) {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = (x0 < x1) ? 1 : -1;
        const sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;

        while (true) {
            this.paintPixel(x0, y0);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    },

    paintPixel(x, y) {
        this.ctx.globalCompositeOperation = state.activeTool === 'eraser' ? 'destination-out' : 'source-over';
        this.ctx.fillStyle = state.brushColor;
        
        const size = Math.floor((state.brushSize - 0.1) / 10) + 1;
        if (size === 1) {
            this.ctx.fillRect(x, y, 1, 1);
        } else {
            const offset = Math.floor(size / 2);
            this.ctx.fillRect(x - offset, y - offset, size, size);
        }
    },

    floodFill(startX, startY, fillColor) {
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const pixels = imageData.data;
        
        const startIdx = (startY * this.canvas.width + startX) * 4;
        const startR = pixels[startIdx];
        const startG = pixels[startIdx + 1];
        const startB = pixels[startIdx + 2];
        const startA = pixels[startIdx + 3];

        // Parse fill color
        let r, g, b, a = 255;
        if (fillColor.startsWith('#')) {
            const hex = fillColor.slice(1);
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        }

        if (r === startR && g === startG && b === startB && a === startA) return;

        const stack = [[startX, startY]];
        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const idx = (y * this.canvas.width + x) * 4;

            if (x < 0 || x >= this.canvas.width || y < 0 || y >= this.canvas.height) continue;
            if (pixels[idx] !== startR || pixels[idx+1] !== startG || pixels[idx+2] !== startB || pixels[idx+3] !== startA) continue;

            pixels[idx] = r;
            pixels[idx+1] = g;
            pixels[idx+2] = b;
            pixels[idx+3] = a;

            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        this.ctx.putImageData(imageData, 0, 0);
    },

    updateBrushCursor(e, pixelPos) {
        if (!this.cursorCtx) return;
        
        // Clear previous highlight
        this.cursorCtx.clearRect(0, 0, this.cursorCanvas.width, this.cursorCanvas.height);

        const rect = this.canvas.getBoundingClientRect();
        const isInCanvas = (
            e.clientX >= rect.left && 
            e.clientX <= rect.right && 
            e.clientY >= rect.top && 
            e.clientY <= rect.bottom
        );

        if (isInCanvas && state.activeTool !== 'eyedropper') {
            const size = Math.floor((state.brushSize - 0.1) / 10) + 1;
            
            this.cursorCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            
            if (size === 1) {
                this.cursorCtx.fillRect(pixelPos.x, pixelPos.y, 1, 1);
            } else {
                const offset = Math.floor(size / 2);
                this.cursorCtx.fillRect(pixelPos.x - offset, pixelPos.y - offset, size, size);
            }
        }
    },

    pickColor(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = Math.floor((e.clientX - rect.left) * scaleX);
        const y = Math.floor((e.clientY - rect.top) * scaleY);

        const pixel = this.ctx.getImageData(x, y, 1, 1).data;
        if (pixel[3] === 0) return; // Transparent

        const hex = '#' + Array.from(pixel.slice(0, 3))
            .map(x => x.toString(16).padStart(2, '0'))
            .join('');
        
        state.brushColor = hex;
        document.getElementById('brush-color').value = hex;
        this.setTool('brush');
    },

    stopDraw() {
        if (this.isDrawing) {
            this.saveHistory();
            // Real-time update for mini loop: sync canvas data back to frame state
            if (this.currentFrame) {
                const dataUrl = this.canvas.toDataURL();
                this.currentFrame.base64 = dataUrl.split(',')[1];
                // Refresh reels instantly
                const screen = document.querySelector('section.active')?.id;
                if (screen === 'drawing-screen') app.renderDrawingReel();
                if (screen === 'editor-screen') app.renderEditorReel();
            }
        }
        this.isDrawing = false;
    },

    saveHistory() {
        // Clear redo states if we act from middle
        this.history = this.history.slice(0, this.historyIdx + 1);
        
        // Push new state
        this.history.push(this.canvas.toDataURL());
        this.historyIdx++;

        // LIMIT to 20 steps
        if (this.history.length > 20) {
            this.history.shift();
            this.historyIdx--;
        }
    },

    undo() {
        if (this.historyIdx > 0) {
            this.historyIdx--;
            this.restoreHistory();
        }
    },

    redo() {
        if (this.historyIdx < this.history.length - 1) {
            this.historyIdx++;
            this.restoreHistory();
        }
    },

    restoreHistory() {
        const img = new Image();
        img.onload = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);
        };
        img.src = this.history[this.historyIdx];
    },

    async saveCurrent() {
        if (!this.currentFrame) return;
        const base64 = this.canvas.toDataURL();
        await fetch('/api/save-frame', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                base64: base64,
                path: this.currentFrame.clean_path
            })
        });
    },

    zoom: 1,
    zoomCanvas(delta) {
        this.zoom = Math.max(0.1, Math.min(5, this.zoom + delta));
        this.updateZoomDisplay();
    },

    resetZoom() {
        this.zoom = 1;
        this.updateZoomDisplay();
    },

    updateZoomDisplay() {
        const wrapper = this.canvas.parentElement; // Scoped to active canvas
        wrapper.style.transform = `scale(${this.zoom})`;
        
        // Update all visible zoom indicators
        document.querySelectorAll('.zoom-level, #zoom-level').forEach(el => {
            el.innerText = Math.round(this.zoom * 100) + '%';
        });
    },

    async reprocessBackground() {
        const threshold = document.getElementById('threshold-slider').value;
        await this.processFrame(this.currentFrame, threshold);
        app.renderEditorReel(); // Refresh the reel thumbnails
        this.loadFrame(state.frames.filter(f => f.active).indexOf(this.currentFrame), false);
    },

    async applyThresholdToAll() {
        const threshold = document.getElementById('threshold-slider').value;
        const active = state.frames.filter(f => f.active);
        
        // Show loading state on the CURRENT screen's button
        const nextBtn = document.getElementById('next-btn');
        const thresholdBtn = document.getElementById('apply-threshold-btn');
        const originalText = nextBtn.innerText;
        
        nextBtn.innerText = "Processing...";
        nextBtn.disabled = true;
        thresholdBtn.innerText = "Processing...";
        thresholdBtn.disabled = true;

        for (const frame of active) {
            await this.processFrame(frame, threshold);
        }

        // Restore UI
        app.renderEditorReel();
        this.loadFrame(state.frames.filter(f => f.active).indexOf(this.currentFrame), false);
        nextBtn.innerText = originalText;
        nextBtn.disabled = false;
        document.getElementById('apply-threshold-btn').innerText = "Apply All";
        document.getElementById('apply-threshold-btn').disabled = false;
    },

    async syncResolution(val) {
        state.targetResolution = parseInt(val);
        
        // Only the main selector exists now
        const ui1 = document.getElementById('resolution-selector');
        if (ui1) ui1.value = val;
        
        await this.applyResolutionToAll();
    },

    async applyResolutionToAll() {
        const threshold = document.getElementById('threshold-slider').value;
        const active = state.frames.filter(f => f.active);
        
        const nextBtn = document.getElementById('next-btn');
        const selector = document.getElementById('resolution-selector');
        
        const originalNextText = nextBtn.innerText;
        nextBtn.innerText = "Processing Assets...";
        nextBtn.disabled = true;
        if (selector) selector.disabled = true;

        for (const frame of active) {
            await this.processFrame(frame, threshold);
        }

        // Restore UI
        app.renderEditorReel();
        this.loadFrame(state.frames.filter(f => f.active).indexOf(this.currentFrame), false);
        
        nextBtn.innerText = originalNextText;
        nextBtn.disabled = false;
        if (selector) selector.disabled = false;
    },

    async processFrame(frame, threshold) {
        document.getElementById('threshold-val').innerText = threshold;
        const resp = await fetch('/api/remove-bg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                path: frame.path,
                threshold: threshold,
                resolution: state.targetResolution
            })
        });
        const data = await resp.json();
        frame.base64 = data.base64;
        frame.clean_path = data.clean_path;
    }
};

app.init();
