const state = {
    videoName: null,
    frames: [],
    targetCount: 12,
    activeFrameIdx: 0,
    brushSize: 20,
    isEraser: true,
    loopInterval: null,
    loopFrameIdx: 0
};

const app = {
    init() {
        console.log("SpriteLab Hub v2.0 (Discord Theme) Initializing...");
        console.log("Sidebar element:", document.querySelector('.sidebar'));
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
        document.getElementById('brush-size').oninput = (e) => this.updateBrushSize(e.target.value);
    },

    updateFrameCountDisplay() {
        document.getElementById('frame-count-val').innerText = state.targetCount;
    },

    navigate(screenId) {
        // Update breadcrumb
        const titles = {
            'hub': 'Home',
            'welcome': 'Sprite Maker / Ingest',
            'selection': 'Sprite Maker / Refine',
            'editor': 'Sprite Maker / Cleanup',
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
            this.renderReel('frame-reel');
            this.startLoop();
        } else {
            this.stopLoop();
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

    handleFileSelection(file) {
        state.selectedFile = file;
        
        // Show Video Preview
        const video = document.getElementById('upload-preview');
        const url = URL.createObjectURL(file);
        video.src = url;
        
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

    renderReel(containerId) {
        const reel = document.getElementById(containerId);
        reel.innerHTML = '';
        state.frames.forEach((f, i) => {
            const item = document.createElement('div');
            item.className = `frame-item ${f.active ? 'active' : 'disabled'}`;
            
            // Normalize path for consistent URL generation
            let path = f.path.replace(/\\/g, '/');
            if (path.startsWith('output/')) {
                path = path.slice(7);
            }
            
            item.style.backgroundImage = `url(/output/${path})`;
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
            state.loopFrameIdx = (state.loopFrameIdx + 1) % activeFrames.length;
            let rel = activeFrames[state.loopFrameIdx].path.replace(/\\/g, '/');
            if (rel.includes('output/')) rel = rel.split('output/').pop();
            document.getElementById('loop-preview').src = `/output/${rel}`;
        };

        updatePreview();
        state.loopInterval = setInterval(updatePreview, 120);
    },

    stopLoop() {
        clearInterval(state.loopInterval);
    },

    async startCleanup() {
        this.navigate('editor');
        const active = state.frames.filter(f => f.active);
        
        // Batch process BG removal
        for (let i = 0; i < active.length; i++) {
            const resp = await fetch('/api/remove-bg', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: active[i].path })
            });
            const data = await resp.json();
            active[i].clean_path = data.clean_path;
            active[i].base64 = data.base64;
            
            if (i === 0) canvasEditor.init(active[0]);
        }
        
        this.renderEditorReel();
    },

    renderEditorReel() {
        const active = state.frames.filter(f => f.active);
        const reel = document.getElementById('editor-reel');
        reel.innerHTML = '';
        active.forEach((f, i) => {
            const item = document.createElement('div');
            item.className = 'frame-item';
            item.style.backgroundImage = `url(/output/${f.path.split('output/')[1]})`;
            item.onclick = () => canvasEditor.loadFrame(i);
            reel.appendChild(item);
        });
    },

    setTool(tool) {
        state.isEraser = (tool === 'eraser');
        document.getElementById('tool-eraser').classList.toggle('active', state.isEraser);
        document.getElementById('tool-brush').classList.toggle('active', !state.isEraser);
    },

    updateBrushSize(val) {
        state.brushSize = val;
        document.getElementById('brush-size-val').innerText = val;
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
    currentFrame: null,
    history: [],
    historyIdx: -1,
    isDrawing: false,

    init(frame) {
        this.canvas = document.getElementById('editor-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.loadFrame(0);

        this.canvas.onmousedown = (e) => this.startDraw(e);
        window.onmousemove = (e) => this.draw(e);
        window.onmouseup = () => this.stopDraw();
    },

    loadFrame(idx, resetDrawing = true) {
        const active = state.frames.filter(f => f.active);
        this.currentFrame = active[idx];
        
        const img = new Image();
        img.onload = () => {
            this.canvas.width = img.width;
            this.canvas.height = img.height;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);
            if (resetDrawing) {
                this.history = [];
                this.historyIdx = -1;
                this.saveHistory();
            }
        };
        img.src = 'data:image/png;base64,' + this.currentFrame.base64;
    },

    startDraw(e) {
        this.isDrawing = true;
        this.draw(e);
    },

    draw(e) {
        if (!this.isDrawing) return;
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        this.ctx.globalCompositeOperation = state.isEraser ? 'destination-out' : 'source-over';
        this.ctx.beginPath();
        this.ctx.arc(x, y, state.brushSize / 2, 0, Math.PI * 2);
        this.ctx.fill();
    },

    stopDraw() {
        if (this.isDrawing) this.saveHistory();
        this.isDrawing = false;
    },

    saveHistory() {
        this.history = this.history.slice(0, this.historyIdx + 1);
        this.history.push(this.canvas.toDataURL());
        this.historyIdx++;
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
        const wrapper = document.querySelector('.canvas-wrapper');
        wrapper.style.transform = `scale(${this.zoom})`;
        document.getElementById('zoom-level').innerText = Math.round(this.zoom * 100) + '%';
    },

    async reprocessBackground() {
        const threshold = document.getElementById('threshold-slider').value;
        document.getElementById('threshold-val').innerText = threshold;
        
        const resp = await fetch('/api/remove-bg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                path: this.currentFrame.path,
                threshold: threshold
            })
        });
        const data = await resp.json();
        this.currentFrame.base64 = data.base64;
        this.loadFrame(state.frames.filter(f => f.active).indexOf(this.currentFrame), false);
    }
};

app.init();
