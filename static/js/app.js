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
    targetResolution: 0,
    exportZoom: 1,
    currentMode: 'sprite', // 'sprite' or 'image'
    palette: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'],
    defaultPreviewColor: '#71D364',
    filterPresets: {},
    sliceMode: 'grid', // 'grid' or 'fixed'
    sliceWidth: 32,
    sliceHeight: 32
};

const app = {
    init() {
        console.log("SpriteLab Hub v2.0 (Discord Theme) Initializing...");
        this.loadSettings();
        this.initTheme();
        this.bindEvents();
        this.updateFrameCountDisplay();
        this.renderPalette();
        this.navigate('hub');
        
        // Final apply of settings after DOM is stable
        setTimeout(() => this.applyGlobalPreviewColor(), 500);
    },

    loadSettings() {
        const saved = localStorage.getItem('spritelab_settings_v2');
        if (saved) {
            const parsed = JSON.parse(saved);
            state.defaultThreshold = parsed.defaultThreshold || 8;
            state.defaultPreviewColor = parsed.defaultPreviewColor || '#71D364';
            if (parsed.palette) state.palette = parsed.palette;
            if (parsed.filterPresets) state.filterPresets = parsed.filterPresets;
        } else {
            state.defaultThreshold = 8;
            state.defaultPreviewColor = '#71D364';
            state.filterPresets = {};
        }
        
        // Sync to UI
        const thresholdInput = document.getElementById('setting-default-threshold');
        const colorInput = document.getElementById('setting-default-preview-color');
        if (thresholdInput) thresholdInput.value = state.defaultThreshold;
        if (colorInput) colorInput.value = state.defaultPreviewColor;

        // Apply background color to all preview containers
        document.querySelectorAll('.mini-loop-container, .loop-container').forEach(container => {
            container.style.backgroundImage = 'none';
            container.style.backgroundColor = state.defaultPreviewColor;
        });
        document.querySelectorAll('.preview-bg-picker').forEach(p => p.value = state.defaultPreviewColor);
    },

    persistSettings() {
        const settings = {
            defaultThreshold: state.defaultThreshold,
            defaultPreviewColor: state.defaultPreviewColor,
            palette: state.palette,
            filterPresets: state.filterPresets
        };
        localStorage.setItem('spritelab_settings_v2', JSON.stringify(settings));
    },

    saveSettings() {
        state.defaultThreshold = parseInt(document.getElementById('setting-default-threshold').value);
        state.defaultPreviewColor = document.getElementById('setting-default-preview-color').value;
        
        this.persistSettings();
        this.applyGlobalPreviewColor();

        const btn = document.querySelector('#settings-screen .btn-primary');
        const oldText = btn?.innerText;
        if (btn) {
            btn.innerText = "Settings Saved!";
            setTimeout(() => {
                btn.innerText = oldText;
                this.navigate('hub');
            }, 1000);
        }
    },

    applyGlobalPreviewColor() {
        const color = state.defaultPreviewColor;
        document.querySelectorAll('.mini-loop-container, .loop-container').forEach(container => {
            container.style.backgroundImage = 'none';
            container.style.backgroundColor = color;
        });
        document.querySelectorAll('.preview-bg-picker').forEach(p => p.value = color);
    },

    renderPalette() {
        const grid = document.getElementById('palette-grid');
        if (!grid) return;
        grid.innerHTML = '';
        state.palette.forEach((color, i) => {
            const swatch = document.createElement('div');
            swatch.className = 'palette-swatch';
            swatch.style.cssText = `
                width: 100%;
                aspect-ratio: 1/1;
                background-color: ${color};
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 4px;
                cursor: pointer;
            `;
            swatch.onclick = () => {
                state.brushColor = color;
                document.getElementById('brush-color').value = color;
                document.getElementById('outline-color').value = color;
                // Don't auto-switch if we are in picking mode? 
                // Actually, if they click a swatch, they probably want to use it.
                this.setTool('brush');
            };
            grid.appendChild(swatch);
        });
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

        document.getElementById('slice-cols').oninput = () => this.updateSlicePreview();
        document.getElementById('slice-rows').oninput = () => this.updateSlicePreview();
        document.getElementById('slice-width').oninput = (e) => {
            state.sliceWidth = e.target.value;
            this.updateSlicePreview();
        };
        document.getElementById('slice-height').oninput = (e) => {
            state.sliceHeight = e.target.value;
            this.updateSlicePreview();
        };

        videoInput.onchange = (e) => {
            if (e.target.files.length) this.handleFileSelection(e.target.files[0]);
        };

        document.getElementById('proceed-btn').onclick = () => this.startCleanup();
        document.getElementById('export-btn').onclick = () => this.exportSheet();

        document.getElementById('tool-eraser').onclick = () => this.setTool('eraser');
        document.getElementById('tool-brush').onclick = () => this.setTool('brush');
        document.getElementById('tool-eyedropper').onclick = () => this.setTool('eyedropper');
        document.getElementById('tool-palette-pick').onclick = () => this.setTool('palette-pick');
        const bucket = document.getElementById('tool-bucket');
        if (bucket) bucket.onclick = () => this.setTool('bucket');
        
        const rect = document.getElementById('tool-rect-select');
        if (rect) rect.onclick = () => this.setTool('rect-select');
        
        const lasso = document.getElementById('tool-lasso-select');
        if (lasso) lasso.onclick = () => this.setTool('lasso-select');
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
                } else if (e.key === 'Enter') {
                    if (canvasEditor.selectionActive) {
                        e.preventDefault();
                        canvasEditor.commitTransformation();
                    }
                } else if (e.key === 'Escape') {
                    if (canvasEditor.selectionActive) {
                        e.preventDefault();
                        canvasEditor.clearSelection();
                    }
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

        // Preview Background Picker
        document.querySelectorAll('.preview-bg-picker').forEach(picker => {
            picker.oninput = (e) => {
                const color = e.target.value;
                document.querySelectorAll('.mini-loop-container, .loop-container').forEach(container => {
                    container.style.backgroundImage = 'none';
                    container.style.backgroundColor = color;
                });
                // Sync all pickers
                document.querySelectorAll('.preview-bg-picker').forEach(p => p.value = color);
            };
        });
    },

    updateFrameCountDisplay() {
        document.getElementById('frame-count-val').innerText = state.targetCount;
    },


    navigate(screenId, mode) {
        if (mode) state.currentMode = mode;

        console.log("Navigating to:", screenId, "Mode:", state.currentMode);
        console.log("Current state.frames count:", state.frames.length);

        // Update breadcrumb
        const titles = {
            'hub': 'Home',
            'welcome': state.currentMode === 'image' ? 'Image Editor / Ingest' : 'Sprite Maker / Ingest',
            'selection': state.currentMode === 'image' ? 'Image Editor / Refine' : (state.currentMode === 'sheet' ? 'Sprite Editor / Refine' : 'Sprite Maker / Refine'),
            'editor': state.currentMode === 'image' ? 'Image Editor / Cleanup' : (state.currentMode === 'sheet' ? 'Sprite Editor / Cleanup' : 'Sprite Maker / Cleanup'),
            'drawing': state.currentMode === 'image' ? 'Image Editor / Fine Edit' : (state.currentMode === 'sheet' ? 'Sprite Editor / Fine Edit' : 'Sprite Maker / Fine Edit'),
            'slicing': 'Sprite Editor / Slicing',
            'export': state.currentMode === 'image' ? 'Image Editor / Result' : (state.currentMode === 'sheet' ? 'Sprite Editor / Result' : 'Sprite Maker / Result')
        };
        document.getElementById('breadcrumb').innerText = titles[screenId] || 'SpriteLab';

        document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
        const activeSection = document.getElementById(screenId + '-screen');
        if (activeSection) activeSection.classList.add('active');

        // Apply global styles like preview background color
        this.applyGlobalPreviewColor();
        
        // Update sidebar active state
        document.querySelectorAll('.nav-item').forEach(item => {
            const text = item.innerText.toLowerCase();
            if (screenId === 'hub' && text === 'home') {
                item.classList.add('active');
            } else if (state.currentMode === 'image' && text === 'image editor') {
                item.classList.add('active');
            } else if (state.currentMode === 'sheet' && text === 'sprite-editor') {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        if (screenId === 'welcome') {
            const isImage = state.currentMode === 'image';
            const isSheet = state.currentMode === 'sheet';
            
            document.getElementById('hero-title').innerHTML = isImage ? 'Image<span>Editor</span>' : (isSheet ? 'Sprite<span>Editor</span>' : 'Sprite<span>Lab</span>');
            document.getElementById('hero-subtitle').innerText = isImage ? 'Cleanup and edit single images with ease.' : (isSheet ? 'Slice and edit existing spritesheet files.' : 'Transform video clips into professional game assets.');
            
            const promptP = document.getElementById('upload-prompt').querySelector('p');
            if (isImage) promptP.innerText = 'Drag & Drop Image or Click to Browse';
            else if (isSheet) promptP.innerText = 'Drag & Drop Spritesheet or Click to Browse';
            else promptP.innerText = 'Drag & Drop Video or Click to Browse';
            
            const selectBtn = document.getElementById('btn-select-video');
            if (isImage) selectBtn.innerText = 'Select Image';
            else if (isSheet) selectBtn.innerText = 'Select Spritesheet';
            else selectBtn.innerText = 'Select Video';
            
            const configRow = document.getElementById('slicing-config');
            if (configRow) configRow.style.display = (isImage || isSheet) ? 'none' : 'flex';
            
            const slicingConfig = document.getElementById('slicing-config');
            if (slicingConfig) slicingConfig.classList.add('hidden');
            this.resetUpload();
        }

        if (screenId === 'selection') {
            document.getElementById('proceed-btn').innerText = "Proceed to Cleanup";
            document.getElementById('proceed-btn').disabled = false;
            this.renderReel('frame-reel');
            state.loopFrameIdx = 0; // Reset index to show first frame
            this.startLoop();
            // Start mini loop here too if we want it "at all time"
            canvasEditor.startMiniLoop(); 
        } else if (screenId === 'export') {
            this.stopLoop();
            
            // Auto-calc rows when columns change
            const colsInput = document.getElementById('export-cols');
            const rowsInput = document.getElementById('export-rows');
            const updateRows = () => {
                const activeCount = state.frames.filter(f => f.active).length;
                const cols = parseInt(colsInput.value) || 1;
                rowsInput.value = Math.ceil(activeCount / cols);
            };
            
            colsInput.oninput = updateRows;
            updateRows(); // Initial sync

            canvasEditor.startMiniLoop();
            canvasEditor.initResize('mini-preview-panel-export');
        } else if (screenId === 'editor' || screenId === 'drawing') {
            this.stopLoop();
            
            // Refresh the specific reel for this screen
            if (screenId === 'editor') {
                this.renderEditorReel();
                // Load default threshold if editor just started
                const slider = document.getElementById('threshold-slider');
                if (slider) {
                    slider.value = state.defaultThreshold;
                    const valLabel = document.getElementById('threshold-val');
                    if (valLabel) valLabel.innerText = state.defaultThreshold;
                }
            }
            else if (screenId === 'drawing') this.renderDrawingReel();
            
            // Hide redundant components in image mode
            const isImage = state.currentMode === 'image';
            
            // Toggle sidebar/dashboard items (already handled by navigate active class)
            
            // Hide animation-specific panels
            const toToggle = [
                'exclude-frame-btn', 'exclude-frame-drawing-btn',
                'mini-preview-panel', 'mini-preview-panel-drawing',
                'editor-reel-panel', 'drawing-reel-panel',
                'frame-count', 'frame-reel'
            ];
            toToggle.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    // Search for parent glass-card/panel if it's the reel
                    const target = id.includes('reel-panel') ? el : el;
                    if (target) target.style.display = isImage ? 'none' : '';
                }
            });

            // Adjust layout if reel is hidden
            const layouts = document.querySelectorAll('.editor-layout');
            layouts.forEach(l => {
                l.style.gridTemplateRows = isImage ? '1fr' : '1fr auto';
            });

            // Re-target canvas and re-bind listeners
            const canvasId = screenId === 'editor' ? 'editor-canvas' : (screenId === 'drawing' ? 'drawing-canvas' : null);
            if (canvasId) {
                const targetCanvas = document.getElementById(canvasId);
                const cursorId = screenId === 'editor' ? 'cursor-canvas-editor' : (screenId === 'drawing' ? 'cursor-canvas' : null);
                if (targetCanvas) {
                    canvasEditor.canvas = targetCanvas;
                    canvasEditor.ctx = targetCanvas.getContext('2d');
                    canvasEditor.cursorCanvas = document.getElementById(cursorId);
                    if (canvasEditor.cursorCanvas) {
                        canvasEditor.cursorCtx = canvasEditor.cursorCanvas.getContext('2d');
                    }
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

    async startSlicingFlow() {
        // Prepare slicing screen
        const img = document.getElementById('slice-preview-img');
        const mainImg = document.getElementById('image-upload-preview');
        
        // Ensure image is loaded into preview
        if (state.sheetPath) {
            img.src = `/output/${state.videoName}/${state.videoName}.png`; // fallback approx
        } else if (state.selectedFile) {
            img.src = URL.createObjectURL(state.selectedFile);
        }
        
        this.navigate('slicing');
        img.onload = () => this.updateSlicePreview();
    },

    handleFileSelection(file) {
        state.selectedFile = file;
        const isImageMode = state.currentMode === 'image';
        
        // Show Preview
        const video = document.getElementById('upload-preview');
        const img = document.getElementById('image-upload-preview');
        const url = URL.createObjectURL(file);
        
        if (isImageMode || state.currentMode === 'sheet') {
            img.src = url;
            img.classList.remove('hidden');
            video.classList.add('hidden');
            
            if (state.currentMode === 'sheet') {
                document.getElementById('slicing-config').classList.remove('hidden');
                document.getElementById('slice-preview-img').src = url;
                img.classList.add('hidden'); // Hide the main preview, use slicing one
                
                img.onload = () => {
                    this.updateSlicePreview();
                };
            }
        } else {
            video.src = url;
            video.play().catch(e => console.warn("Auto-play blocked:", e));
            video.classList.remove('hidden');
            img.classList.add('hidden');
        }
        
        document.getElementById('upload-prompt').classList.add('hidden');
        document.getElementById('video-preview-container').classList.remove('hidden');
        document.getElementById('processing-complete').classList.remove('hidden');
        
        // Update status text
        const statusEl = document.getElementById('processing-complete').querySelector('.status-badge');
        const proceedBtn = document.getElementById('processing-complete').querySelector('.btn-primary');
        
        if (state.currentMode === 'sheet') {
            statusEl.innerText = "Spritesheet Ready for Slicing!";
            proceedBtn.innerText = "Begin Slicing";
            proceedBtn.onclick = () => this.navigate('slicing');
        } else {
            statusEl.innerText = isImageMode ? "Image Loaded Successfully!" : "Video Loaded Successfully!";
            proceedBtn.innerText = isImageMode ? "Begin Editing" : "Begin Extraction";
            proceedBtn.onclick = () => this.startUpload();
        }
    },

    toggleSliceMode(mode) {
        state.sliceMode = mode;
        const gridInputs = document.getElementById('slice-grid-inputs');
        const fixedInputs = document.getElementById('slice-fixed-inputs');
        
        if (mode === 'grid') {
            gridInputs.classList.remove('hidden');
            fixedInputs.classList.add('hidden');
        } else {
            gridInputs.classList.add('hidden');
            fixedInputs.classList.remove('hidden');
        }
        this.updateSlicePreview();
    },

    async startSlicing() {
        if (!state.selectedFile && !state.sheetPath) return;

        // Show loading
        const statusEl = document.getElementById('upload-status');
        const progressEl = document.getElementById('upload-progress');
        const fill = document.getElementById('upload-fill');

        if (progressEl) progressEl.classList.remove('hidden');
        if (statusEl) statusEl.innerText = "Slicing spritesheet...";
        if (fill) fill.style.width = '20%';

        // First, we need to upload the file to get a path if we don't have one
        let imgPath = state.sheetPath;
        if (!imgPath) {
            const formData = new FormData();
            formData.append('image', state.selectedFile);
            
            try {
                const resp = await fetch('/api/upload-image', { method: 'POST', body: formData });
                const data = await resp.json();
                imgPath = data.frames[0].path;
                state.sheetPath = imgPath;
                fill.style.width = '50%';
            } catch (err) {
                console.error("Upload failed", err);
                alert("Upload failed.");
                return;
            }
        }

        const cols = parseInt(document.getElementById('slice-cols').value) || 1;
        const rows = parseInt(document.getElementById('slice-rows').value) || 1;
        const width = parseInt(document.getElementById('slice-width').value) || 32;
        const height = parseInt(document.getElementById('slice-height').value) || 32;

        try {
            const resp = await fetch('/api/slice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: imgPath,
                    mode: state.sliceMode,
                    cols: cols,
                    rows: rows,
                    width: width,
                    height: height
                })
            });
            
            fill.style.width = '90%';
            const data = await resp.json();
            
            if (data.error) throw new Error(data.error);

            state.frames = data.frames.map(f => ({ ...f, active: true }));
            state.videoName = data.video_name;
            
            fill.style.width = '100%';
            setTimeout(() => {
                this.navigate('selection');
            }, 300);
        } catch (err) {
            console.error("Slicing failed", err);
            alert("Slicing failed: " + err.message);
        }
    },

    updateSlicePreview() {
        const img = document.getElementById('slice-preview-img');
        const canvas = document.getElementById('slice-preview-canvas');
        if (!img || !canvas || !img.complete) return;
        
        canvas.width = img.clientWidth;
        canvas.height = img.clientHeight;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const cols = parseInt(document.getElementById('slice-cols').value) || 1;
        const rows = parseInt(document.getElementById('slice-rows').value) || 1;
        
        ctx.strokeStyle = '#43b581';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 2;
        
        let cellW, cellH;
        let numCols = cols;
        let numRows = rows;

        if (state.sliceMode === 'grid') {
            cellW = canvas.width / cols;
            cellH = canvas.height / rows;
        } else {
            // Fixed size preview (scale based on client dimensions)
            const scaleX = canvas.width / img.naturalWidth;
            const scaleY = canvas.height / img.naturalHeight;
            cellW = (parseInt(document.getElementById('slice-width').value) || 32) * scaleX;
            cellH = (parseInt(document.getElementById('slice-height').value) || 32) * scaleY;
            numCols = Math.floor(canvas.width / cellW);
            numRows = Math.floor(canvas.height / cellH);
        }
        
        for (let i = 1; i <= numCols; i++) {
            ctx.beginPath();
            ctx.moveTo(i * cellW, 0);
            ctx.lineTo(i * cellW, canvas.height);
            ctx.stroke();
        }
        for (let i = 1; i <= numRows; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * cellH);
            ctx.lineTo(canvas.width, i * cellH);
            ctx.stroke();
        }
    },

    resetUpload(e) {
        if (e) e.stopPropagation();
        state.selectedFile = null;
        state.sheetPath = null;
        document.getElementById('video-input').value = '';
        
        document.getElementById('upload-prompt').classList.remove('hidden');
        document.getElementById('video-preview-container').classList.add('hidden');
        document.getElementById('processing-complete').classList.add('hidden');
        document.getElementById('upload-progress').classList.add('hidden');
        
        document.getElementById('upload-preview').classList.add('hidden');
        document.getElementById('image-upload-preview').classList.add('hidden');
        document.getElementById('slicing-config').classList.add('hidden');
        
        // Reset sheet-specific slice inputs
        const colsInput = document.getElementById('slice-cols');
        const rowsInput = document.getElementById('slice-rows');
        if (colsInput) colsInput.value = 1;
        if (rowsInput) rowsInput.value = 1;
    },

    async startUpload() {
        if (!state.selectedFile) return;

        const isImage = state.currentMode === 'image';
        const endpoint = isImage ? '/api/upload-image' : '/api/upload';
        const fileField = isImage ? 'image' : 'video';

        document.getElementById('processing-complete').classList.add('hidden');
        document.getElementById('upload-progress').classList.remove('hidden');
        document.getElementById('upload-status').innerText = isImage ? "Processing image..." : "Extracting keyframes...";
        
        const fill = document.getElementById('upload-fill');
        fill.style.width = '20%';

        const formData = new FormData();
        formData.append(fileField, state.selectedFile);
        if (!isImage) formData.append('target_count', state.targetCount);

        try {
            const resp = await fetch(endpoint, { method: 'POST', body: formData });
            fill.style.width = '80%';
            const data = await resp.json();
            
            state.frames = data.frames.map(f => ({ ...f, active: true }));
            state.videoName = data.video_name;
            
            fill.style.width = '100%';
            
            setTimeout(() => {
                if (isImage) {
                    this.startCleanup();
                } else {
                    this.navigate('selection');
                }
            }, 300);
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

    async startDemoSprite() {
        try {
            const resp = await fetch('/api/demo-sprite', { method: 'POST' });
            const data = await resp.json();
            
            if (data.error) throw new Error(data.error);
            
            state.sheetPath = data.path;
            state.videoName = data.name;
            
            // Navigate to welcome screen first, then manually trigger slicing view
            this.navigate('welcome', 'sheet');
            
            // Populate the preview manually
            const img = document.getElementById('slice-preview-img');
            const mainImg = document.getElementById('image-upload-preview');
            img.src = data.url;
            mainImg.src = data.url;
            
            document.getElementById('upload-prompt').classList.add('hidden');
            document.getElementById('video-preview-container').classList.remove('hidden');
            document.getElementById('processing-complete').classList.remove('hidden');
            document.getElementById('slicing-config').classList.remove('hidden');
            
            const statusEl = document.getElementById('processing-complete').querySelector('.status-badge');
            const proceedBtn = document.getElementById('processing-complete').querySelector('.btn-primary');
            statusEl.innerText = "Demo Spritesheet Loaded!";
            proceedBtn.innerText = "Begin Slicing";
            proceedBtn.onclick = () => this.navigate('slicing');

            img.onload = () => this.updateSlicePreview();
        } catch (err) {
            console.error("Demo Sprite failed", err);
            alert("Demo Sprite failed: " + err.message);
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
        
        // Before starting, sync UI slider to the Default Threshold
        const slider = document.getElementById('threshold-slider');
        const valText = document.getElementById('threshold-val');
        if (slider) slider.value = state.defaultThreshold;
        if (valText) valText.innerText = state.defaultThreshold;

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
            item.className = `frame-item ${canvasEditor.currentFrame === f ? 'active-frame' : ''} ${f.excluded ? 'excluded' : ''}`;
            
            if (f.base64) {
                item.style.backgroundImage = `url(data:image/png;base64,${f.base64})`;
            } else {
                let path = (f.clean_path || f.path).replace(/\\/g, '/');
                const relPath = path.includes('output/') ? path.split('output/').pop() : path;
                const t = new Date().getTime();
                item.style.backgroundImage = `url(/output/${relPath}?t=${t})`;
            }

            // Apply filters to preview
            const br = f.brightness !== undefined ? f.brightness : 100;
            const co = f.contrast !== undefined ? f.contrast : 100;
            const sa = f.saturation !== undefined ? f.saturation : 100;
            const hu = f.hue !== undefined ? f.hue : 0;
            item.style.filter = `brightness(${br}%) contrast(${co}%) saturate(${sa}%) hue-rotate(${hu}deg)`;
            
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
            item.className = `frame-item ${canvasEditor.currentFrame === f ? 'active-frame' : ''} ${f.excluded ? 'excluded' : ''}`;
            
            if (f.base64) {
                item.style.backgroundImage = `url(data:image/png;base64,${f.base64})`;
            } else {
                let path = (f.clean_path || f.path).replace(/\\/g, '/');
                const relPath = path.includes('output/') ? path.split('output/').pop() : path;
                const t = new Date().getTime();
                item.style.backgroundImage = `url(/output/${relPath}?t=${t})`;
            }

            // Apply filters to preview
            const br = f.brightness !== undefined ? f.brightness : 100;
            const co = f.contrast !== undefined ? f.contrast : 100;
            const sa = f.saturation !== undefined ? f.saturation : 100;
            const hu = f.hue !== undefined ? f.hue : 0;
            item.style.filter = `brightness(${br}%) contrast(${co}%) saturate(${sa}%) hue-rotate(${hu}deg)`;
            
            item.onclick = () => canvasEditor.loadFrame(i);
            reel.appendChild(item);
        });
    },

    toggleFrameExclusion() {
        if (!canvasEditor.currentFrame) return;
        canvasEditor.currentFrame.excluded = !canvasEditor.currentFrame.excluded;
        
        // Update UI
        this.renderEditorReel();
        this.renderDrawingReel();
        this.updateExclusionButtons();
        
        // Mini loop skip handled by startMiniLoop's interval
    },

    updateExclusionButtons() {
        const frame = canvasEditor.currentFrame;
        const btn1 = document.getElementById('exclude-frame-btn');
        const btn2 = document.getElementById('exclude-frame-drawing-btn');
        const labels = frame?.excluded ? "Include Frame" : "Exclude Frame";
        if (btn1) btn1.innerText = labels;
        if (btn2) btn2.innerText = labels;
    },

    prevFrame() {
        const active = state.frames.filter(f => f.active);
        if (!active.length) return;
        let idx = active.indexOf(canvasEditor.currentFrame);
        if (idx === -1) idx = 0;
        const nextIdx = (idx - 1 + active.length) % active.length;
        canvasEditor.loadFrame(nextIdx);
        this.updateExclusionButtons();
    },

    nextFrame() {
        const active = state.frames.filter(f => f.active);
        if (!active.length) return;
        let idx = active.indexOf(canvasEditor.currentFrame);
        if (idx === -1) idx = 0;
        const nextIdx = (idx + 1) % active.length;
        canvasEditor.loadFrame(nextIdx);
        this.updateExclusionButtons();
    },

    setTool(tool) {
        // If switching AWAY from selection tools while a selection is active, commit it?
        if (state.activeTool.includes('select') && !tool.includes('select') && canvasEditor.selectionActive) {
            canvasEditor.clearSelection();
        }

        state.activeTool = tool;
        // Highlight across all instances of the same tool
        document.querySelectorAll('.tool-btn-small, .tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.id === `tool-${tool}`);
        });
        
        // Visual cursor feedback
        const canvases = [document.getElementById('drawing-canvas'), document.getElementById('editor-canvas')];
        canvases.forEach(canvas => {
            if (canvas) {
                if (tool.includes('select')) {
                    canvas.style.cursor = 'cell';
                } else {
                    canvas.style.cursor = tool === 'eyedropper' ? 'crosshair' : 'none';
                }
            }
        });
    },

    updateBrushSize(size) {
        state.brushSize = size;
        document.getElementById('brush-size-val').innerText = size;
    },

    async exportSheet() {
        // Save current frame first if we're coming from editor/drawing
        if (canvasEditor.canvas) {
            await canvasEditor.saveCurrent();
        }
        
        this.navigate('export');
        // Show loading state or at least indicate work is happening
        const finalImg = document.getElementById('final-sheet');
        if (finalImg) finalImg.style.opacity = '0.5';
        
        await this.refreshExport(); 
        
        if (finalImg) finalImg.style.opacity = '1';
        canvasEditor.initResize('mini-preview-panel-export');
    },

    async bakeFrame(frame) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                
                // PIXEL PERFECT
                ctx.imageSmoothingEnabled = false;

                // Apply filters
                const br = frame.brightness !== undefined ? frame.brightness : 100;
                const co = frame.contrast !== undefined ? frame.contrast : 100;
                const sa = frame.saturation !== undefined ? frame.saturation : 100;
                const hu = frame.hue !== undefined ? frame.hue : 0;
                
                ctx.filter = `brightness(${br}%) contrast(${co}%) saturate(${sa}%) hue-rotate(${hu}deg)`;
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            };
            // Use current base64 which has outlines/palettes already baked
            img.src = 'data:image/png;base64,' + (frame.base64 || '');
        });
    },

    async refreshExport() {
        const active = state.frames.filter(f => f.active && !f.excluded);
        if (!active.length) return;

        const name = document.getElementById('export-sheet-name').value || 'spritesheet';
        const cols = 4;
        const rows = null;

        // BAKE ALL FILTERS BEFORE EXPORT
        console.log("Baking adjustments for export...");
        const bakedPaths = [];
        
        for (const f of active) {
            const bakedDataUrl = await this.bakeFrame(f);
            
            // Generate a baked path
            let originalPath = f.clean_path || f.path;
            let bakedPath = originalPath.replace('.png', '_baked.png');
            
            // Save to server
            await fetch('/api/save-frame', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    base64: bakedDataUrl,
                    path: bakedPath
                })
            });
            bakedPaths.push(bakedPath);
        }

        console.log("Generating spritesheet with baked frames...");
        const resp = await fetch('/api/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                paths: bakedPaths, // Use the NEW baked paths
                video_name: state.videoName,
                sheetName: name,
                cols: parseInt(cols),
                rows: rows > 0 ? parseInt(rows) : null
            })
        });
        const data = await resp.json();
        
        const finalImg = document.getElementById('final-sheet');
        const t = new Date().getTime(); // Anti-cache
        finalImg.src = data.sheet_url + "?t=" + t;
        document.getElementById('download-link').href = data.sheet_url;
        document.getElementById('download-link').download = name.endsWith('.png') ? name : name + '.png';
    },


    zoomExport(delta) {
        state.exportZoom = Math.max(0.1, Math.min(10, state.exportZoom + delta));
        this.updateExportZoom();
    },

    resetExportZoom() {
        state.exportZoom = 1;
        this.updateExportZoom();
    },

    updateExportZoom() {
        const el = document.getElementById('final-sheet');
        if (el) el.style.transform = `scale(${state.exportZoom})`;
        const zoomLv = document.getElementById('export-zoom-level');
        if (zoomLv) zoomLv.innerText = Math.round(state.exportZoom * 100) + '%';
    }
};

const PALETTES = {
    pico8: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
    gameboy: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
    nes: ['#7c7c7c', '#0000fc', '#0000bc', '#4428bc', '#940084', '#a80020', '#a81000', '#881400', '#503000', '#007800', '#006800', '#005800', '#004058', '#000000', '#bcbcbc', '#0078f8', '#0058f8', '#6844fc', '#d800cc', '#e40058', '#f83800', '#e45c10', '#ac7c00', '#00b800', '#00a800', '#00a844', '#008888'],
    c64: ['#000000', '#ffffff', '#68372b', '#70a4b2', '#6f3d86', '#588d43', '#352879', '#b8c76f', '#6f4f25', '#433900', '#9a6759', '#444444', '#6c6c6c', '#9ad284', '#6c5eb5', '#959595'],
    bubblegum: ['#16171a', '#7f0622', '#d62411', '#ff8426', '#ffd100', '#faff5c', '#00bd3d', '#2ebdff', '#0030ad', '#341052', '#8a11b0', '#f064ff']
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
    
    // Selection State
    selectionActive: false,
    selectionType: null, // 'rect', 'lasso'
    selectionPoints: [],
    selectionBounds: null,
    selectedImage: null,
    selectionOffset: { x: 0, y: 0 },
    selectionRotation: 0,
    isTransforming: false,
    activeHandle: null, // 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate'
    handleSize: 6,
    selectionScale: { x: 1, y: 1 },

    init(frame, canvasId = 'editor-canvas') {
        const active = state.frames.filter(f => f.active);
        const idx = active.indexOf(frame);
        
        this.canvas = document.getElementById(canvasId);
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
        }
        
        // Secondary canvas for cursor highlights
        const cursorId = canvasId === 'editor-canvas' ? 'cursor-canvas-editor' : 'cursor-canvas';
        this.cursorCanvas = document.getElementById(cursorId);
        if (this.cursorCanvas) {
            this.cursorCtx = this.cursorCanvas.getContext('2d');
        }

        if (this.canvas) {
            this.attachListeners();
            this.loadFrame(idx >= 0 ? idx : 0);
        }

        if (canvasId === 'editor-canvas') this.initResize('mini-preview-panel');
        if (canvasId === 'drawing-canvas') {
            this.initResize('mini-preview-panel-drawing');
            this.renderPresets();
        }
    },

    attachListeners() {
        if (!this.canvas) return;
        this.canvas.onmousedown = (e) => this.startDraw(e);
        this._boundDraw = (e) => this.draw(e);
        this._boundStop = () => this.stopDraw();
        
        window.removeEventListener('mousemove', this._boundDraw);
        window.removeEventListener('mouseup', this._boundStop);
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
            const activeFrames = state.frames.filter(f => f.active && !f.excluded);
            if (!activeFrames.length) return;
            
            state.miniLoopFrameIdx = state.miniLoopFrameIdx % activeFrames.length;
            const frame = activeFrames[state.miniLoopFrameIdx];
            
            // Sync multiple preview targets
            const targets = ['mini-loop-img', 'mini-loop-img-drawing', 'mini-loop-img-export'];
            targets.forEach(id => {
                const imgEl = document.getElementById(id);
                if (imgEl) {
                    if (frame.base64) {
                        imgEl.src = 'data:image/png;base64,' + frame.base64;
                    } else if (frame.path) {
                        let rel = frame.path.replace(/\\/g, '/');
                        if (rel.includes('output/')) rel = rel.split('output/').pop();
                        imgEl.src = `/output/${rel}`;
                    }
                }

                // Sync filter settings to loop image
                if (imgEl) {
                    const br = frame.brightness !== undefined ? frame.brightness : 100;
                    const co = frame.contrast !== undefined ? frame.contrast : 100;
                    const sa = frame.saturation !== undefined ? frame.saturation : 100;
                    const hu = frame.hue !== undefined ? frame.hue : 0;
                    imgEl.style.filter = `brightness(${br}%) contrast(${co}%) saturate(${sa}%) hue-rotate(${hu}deg)`;
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
                this.cursorCtx = this.cursorCanvas.getContext('2d');
            }
            
            // PIXEL PERFECT SETUP
            this.ctx.imageSmoothingEnabled = false;
            this.ctx.mozImageSmoothingEnabled = false;
            this.ctx.webkitImageSmoothingEnabled = false;
            this.ctx.msImageSmoothingEnabled = false;

            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);

            // Update button text for exclusion
            app.updateExclusionButtons();

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
                // Initialize per-frame history if needed
                if (!this.currentFrame.history) {
                    this.currentFrame.history = [];
                    this.currentFrame.historyIdx = -1;
                }
                
                // If it's the first time, save the current state
                if (this.currentFrame.history.length === 0) {
                    this.saveHistory();
                }
            }
        };
        img.src = 'data:image/png;base64,' + this.currentFrame.base64;
        
        // Initialize filters if missing
        if (this.currentFrame.brightness === undefined) this.currentFrame.brightness = 100;
        if (this.currentFrame.contrast === undefined) this.currentFrame.contrast = 100;
        if (this.currentFrame.saturation === undefined) this.currentFrame.saturation = 100;
        if (this.currentFrame.hue === undefined) this.currentFrame.hue = 0;

        // Sync Sliders
        this.updateFilterUI();
        this.applyFilters();

        // UI feedback for active frame in reel
        app.renderDrawingReel();
        app.renderEditorReel();
    },

    startDraw(e) {
        if (!this.currentFrame) return;
        
        const pos = this.getPixelPos(e);
        this.lastPixel = pos;
        
        if (state.activeTool === 'eyedropper' || state.activeTool === 'palette-pick') {
            this.pickColor(e);
            return;
        }

        if (state.activeTool.includes('select')) {
            const handle = this.getHandleAt(pos);
            if (handle) {
                this.isTransforming = true;
                this.activeHandle = handle;
                this.lastPixel = pos;
            } else if (this.selectionActive && this.isMouseInSelection(pos)) {
                this.isTransforming = true;
                this.activeHandle = 'move';
                this.lastPixel = pos;
            } else {
                this.clearSelection();
                this.isSelecting = true;
                this.selectionType = state.activeTool === 'rect-select' ? 'rect' : 'lasso';
                this.selectionPoints = [pos];
            }
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

        if (this.isSelecting) {
            this.selectionPoints.push(pos);
            this.drawSelectionPreview();
            return;
        }

        if (this.isTransforming) {
            const dx = pos.x - this.lastPixel.x;
            const dy = pos.y - this.lastPixel.y;
            this.lastPixel = pos;

            const b = this.selectionBounds;
            const center = { x: b.x + b.w/2 + this.selectionOffset.x, y: b.y + b.h/2 + this.selectionOffset.y };

            if (this.activeHandle === 'move') {
                this.selectionOffset.x += dx;
                this.selectionOffset.y += dy;
            } else if (this.activeHandle === 'rotate') {
                const angle = Math.atan2(pos.y - center.y, pos.x - center.x);
                this.selectionRotation = (angle * 180 / Math.PI) + 90;
                // Update UI slider if it exists
                const slider = document.getElementById('rotate-slider');
                if (slider) slider.value = Math.round(this.selectionRotation);
                const label = document.getElementById('rotate-val');
                if (label) label.innerText = Math.round(this.selectionRotation);
            } else {
                // Scaling logic
                // For simplicity, we'll do non-uniform scaling relative to opposite corner
                // This is a complex geometric transform when rotated, but we'll start with axis-aligned first
                // or just simple delta-based scaling
                if (this.activeHandle.includes('e')) this.selectionScale.x *= (b.w * this.selectionScale.x + dx) / (b.w * this.selectionScale.x);
                if (this.activeHandle.includes('w')) {
                    const oldW = b.w * this.selectionScale.x;
                    const newW = oldW - dx;
                    this.selectionScale.x = newW / b.w;
                    this.selectionOffset.x += dx;
                }
                if (this.activeHandle.includes('s')) this.selectionScale.y *= (b.h * this.selectionScale.y + dy) / (b.h * this.selectionScale.y);
                if (this.activeHandle.includes('n') && this.activeHandle !== 'nw' && this.activeHandle !== 'ne') {
                     // specific 'n' handle
                }
                // Handle corner combinations ... 
                // To keep it robust, let's just implement 'se' for now as a primary scaling handle
                if (this.activeHandle === 'se') {
                    this.selectionScale.x = Math.max(0.1, (b.w * this.selectionScale.x + dx) / b.w);
                    this.selectionScale.y = Math.max(0.1, (b.h * this.selectionScale.y + dy) / b.h);
                }
            }

            this.drawSelectionPreview();
            return;
        }

        if (!this.isDrawing) return;
        
        if (state.activeTool === 'eyedropper' || state.activeTool === 'palette-pick') {
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
        
        // Ensure selection handles are always redrawn if active
        if (this.selectionActive || this.isSelecting) {
            this.drawSelectionPreview();
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
        
        if (state.activeTool === 'palette-pick') {
            if (!state.palette.includes(hex)) {
                state.palette.push(hex);
                // Limit to 24 colors
                if (state.palette.length > 24) state.palette.shift();
                app.renderPalette();
                app.persistSettings();
            }
            app.setTool('brush');
        } else {
            state.brushColor = hex;
            document.getElementById('brush-color').value = hex;
            this.setTool('brush');
        }
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
        
        if (this.isSelecting) {
            this.isSelecting = false;
            this.finalizeSelection();
        }

        this.isDrawing = false;
        this.isSelecting = false;
        this.isTransforming = false;
        this.activeHandle = null;
        this.lastPixel = null;
        this.drawSelectionPreview();
    },

    saveHistory() {
        if (!this.currentFrame) return;
        
        if (!this.currentFrame.history) {
            this.currentFrame.history = [];
            this.currentFrame.historyIdx = -1;
        }

        const data = this.canvas.toDataURL();
        
        // If same as last entry, skip (avoids redundant states)
        if (this.currentFrame.historyIdx >= 0 && this.currentFrame.history[this.currentFrame.historyIdx] === data) return;

        // Truncate redo history and push new state
        this.currentFrame.history = this.currentFrame.history.slice(0, this.currentFrame.historyIdx + 1);
        this.currentFrame.history.push(data);
        this.currentFrame.historyIdx++;
        
        // Cap history to 50 steps per frame
        if (this.currentFrame.history.length > 50) {
            this.currentFrame.history.shift();
            this.currentFrame.historyIdx--;
        }
    },

    undo() {
        if (!this.currentFrame || !this.currentFrame.history) return;
        if (this.currentFrame.historyIdx > 0) {
            this.currentFrame.historyIdx--;
            this.restoreHistory();
        }
    },

    redo() {
        if (!this.currentFrame || !this.currentFrame.history) return;
        if (this.currentFrame.historyIdx < this.currentFrame.history.length - 1) {
            this.currentFrame.historyIdx++;
            this.restoreHistory();
        }
    },

    restoreHistory() {
        if (!this.currentFrame || !this.currentFrame.history) return;
        const img = new Image();
        img.onload = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.imageSmoothingEnabled = false;
            this.ctx.drawImage(img, 0, 0);
            
            // Sync to frame data immediately for thumbnails
            this.currentFrame.base64 = this.canvas.toDataURL().split(',')[1];
            app.renderDrawingReel();
            app.renderEditorReel();
        };
        img.src = this.currentFrame.history[this.currentFrame.historyIdx];
    },

    async saveCurrent() {
        if (!this.currentFrame) return;
        
        // Bake filters if they are not at default
        let base64;
        const b = this.currentFrame.brightness || 100;
        const c = this.currentFrame.contrast || 100;
        const s = this.currentFrame.saturation || 100;
        const h = this.currentFrame.hue || 0;

        if (b !== 100 || c !== 100 || s !== 100 || h !== 0) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.canvas.width;
            tempCanvas.height = this.canvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            
            tempCtx.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%) hue-rotate(${h}deg)`;
            tempCtx.drawImage(this.canvas, 0, 0);
            
            base64 = tempCanvas.toDataURL();
            
            // Once baked, reset frame filter values
            this.currentFrame.brightness = 100;
            this.currentFrame.contrast = 100;
            this.currentFrame.saturation = 100;
            this.currentFrame.hue = 0;
            this.updateFilterUI();
            this.applyFilters();
        } else {
            base64 = this.canvas.toDataURL();
        }

        await fetch('/api/save-frame', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                base64: base64,
                path: this.currentFrame.clean_path || this.currentFrame.path
            })
        });

        // Update local base64 for thumbnails
        this.currentFrame.base64 = base64.split(',')[1];
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

    // --- SELECTION & TRANSFORMATIONS ---

    getHandleAt(pos) {
        if (!this.selectionActive || !this.selectionBounds) return null;
        const b = this.selectionBounds;
        const s = this.selectionScale;
        const sw = b.w * s.x;
        const sh = b.h * s.y;
        const ox = this.selectionOffset.x;
        const oy = this.selectionOffset.y;
        const angle = this.selectionRotation * Math.PI / 180;

        const handles = [
            { id: 'nw', x: -sw/2, y: -sh/2 },
            { id: 'ne', x: sw/2, y: -sh/2 },
            { id: 'se', x: sw/2, y: sh/2 },
            { id: 'sw', x: -sw/2, y: sh/2 },
            { id: 'rotate', x: 0, y: -sh/2 - (15 / this.zoom) }
        ];

        const cx = b.x + b.w/2 + ox;
        const cy = b.y + b.h/2 + oy;

        const hitRadius = 10 / this.zoom;
        for (const h of handles) {
            // Rotate handle point
            const rx = h.x * Math.cos(angle) - h.y * Math.sin(angle) + cx;
            const ry = h.x * Math.sin(angle) + h.y * Math.cos(angle) + cy;
            
            const dist = Math.sqrt((pos.x - rx)**2 + (pos.y - ry)**2);
            if (dist < hitRadius) return h.id;
        }
        return null;
    },

    isMouseInSelection(pos) {
        if (!this.selectionActive || !this.selectionBounds) return false;
        const b = this.selectionBounds;
        const s = this.selectionScale;
        const sw = b.w * s.x;
        const sh = b.h * s.y;
        const ox = this.selectionOffset.x;
        const oy = this.selectionOffset.y;
        const angle = -this.selectionRotation * Math.PI / 180; // Inverse rotate to check in axis-aligned local space

        const cx = b.x + b.w/2 + ox;
        const cy = b.y + b.h/2 + oy;
        
        // Translate pos to center-origin
        const tx = pos.x - cx;
        const ty = pos.y - cy;
        
        // Rotate pos back
        const rx = tx * Math.cos(angle) - ty * Math.sin(angle);
        const ry = tx * Math.sin(angle) + ty * Math.cos(angle);

        return rx >= -sw/2 && rx <= sw/2 && ry >= -sh/2 && ry <= sh/2;
    },

    drawSelectionPreview() {
        if (!this.cursorCtx) return;
        this.cursorCtx.clearRect(0, 0, this.cursorCanvas.width, this.cursorCanvas.height);
        
        this.cursorCtx.save();
        this.cursorCtx.imageSmoothingEnabled = false;

        if (this.isSelecting) {
            this.cursorCtx.setLineDash([4 / this.zoom, 4 / this.zoom]);
            this.cursorCtx.strokeStyle = '#fff';
            this.cursorCtx.lineWidth = 1 / this.zoom;
            if (this.selectionType === 'rect') {
                const p0 = this.selectionPoints[0];
                const pN = this.selectionPoints[this.selectionPoints.length - 1];
                this.cursorCtx.strokeRect(p0.x, p0.y, pN.x - p0.x, pN.y - p0.y);
            } else if (this.selectionType === 'lasso') {
                this.cursorCtx.beginPath();
                this.cursorCtx.moveTo(this.selectionPoints[0].x, this.selectionPoints[0].y);
                this.selectionPoints.forEach(p => this.cursorCtx.lineTo(p.x, p.y));
                this.cursorCtx.closePath();
                this.cursorCtx.stroke();
            }
        } else if (this.selectionActive) {
            // Draw floating selection
            const b = this.selectionBounds;
            const s = this.selectionScale;
            const ox = this.selectionOffset.x;
            const oy = this.selectionOffset.y;
            const angle = this.selectionRotation * Math.PI / 180;
            const sw = b.w * s.x;
            const sh = b.h * s.y;
            
            this.cursorCtx.save();
            this.cursorCtx.translate(b.x + b.w/2 + ox, b.y + b.h/2 + oy);
            this.cursorCtx.rotate(angle);
            
            // Draw the selection image with scaling
            this.cursorCtx.drawImage(this.selectedImage, -sw/2, -sh/2, sw, sh);
            
            // Draw border
            this.cursorCtx.strokeStyle = 'rgba(0, 242, 255, 0.8)';
            this.cursorCtx.setLineDash([4 / this.zoom, 4 / this.zoom]);
            this.cursorCtx.lineWidth = 1 / this.zoom;
            this.cursorCtx.strokeRect(-sw/2, -sh/2, sw, sh);

            // Draw handles
            this.cursorCtx.setLineDash([]);
            this.cursorCtx.fillStyle = '#fff';
            this.cursorCtx.strokeStyle = '#00f2ff';
            this.cursorCtx.lineWidth = 1 / this.zoom;
            
            const hR = 2.5 / this.zoom; // Smaller handles
            const handlePoints = [
                {x: -sw/2, y: -sh/2}, {x: sw/2, y: -sh/2},
                {x: sw/2, y: sh/2}, {x: -sw/2, y: sh/2}
            ];
            
            for (const p of handlePoints) {
                this.cursorCtx.beginPath();
                this.cursorCtx.arc(p.x, p.y, hR, 0, Math.PI * 2);
                this.cursorCtx.fill();
                this.cursorCtx.stroke();
            }
            
            // Rotation handle dot
            const rHOffset = 15 / this.zoom; // Shorter stick
            this.cursorCtx.beginPath();
            this.cursorCtx.moveTo(0, -sh/2);
            this.cursorCtx.lineTo(0, -sh/2 - rHOffset);
            this.cursorCtx.stroke();
            
            this.cursorCtx.beginPath();
            this.cursorCtx.arc(0, -sh/2 - rHOffset, 3 / this.zoom, 0, Math.PI * 2);
            this.cursorCtx.fillStyle = '#00f2ff';
            this.cursorCtx.fill();
            this.cursorCtx.stroke();

            this.cursorCtx.restore();
        }

        this.cursorCtx.restore();
    },

    finalizeSelection() {
        if (this.selectionPoints.length < 2) return;
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.selectionPoints.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });

        const w = Math.ceil(maxX - minX + 1);
        const h = Math.ceil(maxY - minY + 1);
        if (w <= 0 || h <= 0) return;

        this.selectionBounds = { x: minX, y: minY, w: w, h: h };
        
        // Capture pixels
        const selCanvas = document.createElement('canvas');
        selCanvas.width = w;
        selCanvas.height = h;
        const selCtx = selCanvas.getContext('2d');
        
        if (this.selectionType === 'lasso') {
            selCtx.beginPath();
            selCtx.moveTo(this.selectionPoints[0].x - minX, this.selectionPoints[0].y - minY);
            this.selectionPoints.forEach(p => selCtx.lineTo(p.x - minX, p.y - minY));
            selCtx.closePath();
            selCtx.clip();
        }

        selCtx.drawImage(this.canvas, minX, minY, w, h, 0, 0, w, h);
        this.selectedImage = selCanvas;

        // Cut from main canvas
        this.ctx.save();
        if (this.selectionType === 'lasso') {
            this.ctx.beginPath();
            this.ctx.moveTo(this.selectionPoints[0].x, this.selectionPoints[0].y);
            this.selectionPoints.forEach(p => this.ctx.lineTo(p.x, p.y));
            this.ctx.closePath();
            this.ctx.clip();
        }
        this.ctx.clearRect(minX, minY, w, h);
        this.ctx.restore();

        this.selectionActive = true;
        this.selectionOffset = { x: 0, y: 0 };
        this.selectionRotation = 0;
        this.selectionScale = { x: 1, y: 1 };
        
        this.drawSelectionPreview();
    },

    updateRotation(val) {
        this.selectionRotation = parseInt(val);
        this.drawSelectionPreview();
    },

    clearSelection() {
        if (this.selectionActive) {
            this.commitTransformation();
        }
        this.selectionActive = false;
        this.isSelecting = false;
        this.selectedImage = null;
        this.selectionBounds = null;
        this.selectionPoints = [];
        
        if (this.cursorCtx) this.cursorCtx.clearRect(0, 0, this.cursorCanvas.width, this.cursorCanvas.height);
    },

    commitTransformation() {
        if (!this.selectionActive) return;
        
        const b = this.selectionBounds;
        const s = this.selectionScale;
        const ox = this.selectionOffset.x;
        const oy = this.selectionOffset.y;
        const angle = this.selectionRotation * Math.PI / 180;
        const sw = b.w * s.x;
        const sh = b.h * s.y;

        this.ctx.save();
        this.ctx.translate(b.x + b.w/2 + ox, b.y + b.h/2 + oy);
        this.ctx.rotate(angle);
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(this.selectedImage, -sw/2, -sh/2, sw, sh);
        this.ctx.restore();

        this.selectionActive = false;
        this.selectedImage = null;
        
        if (this.cursorCtx) this.cursorCtx.clearRect(0, 0, this.cursorCanvas.width, this.cursorCanvas.height);
        
        this.saveHistory();
        // Sync back to frame state
        if (this.currentFrame) {
            const dataUrl = this.canvas.toDataURL();
            this.currentFrame.base64 = dataUrl.split(',')[1];
            app.renderDrawingReel();
            app.renderEditorReel();
        }
    },



    async applySettingsToAll() {
        if (!this.currentFrame) return;
        
        const b = this.currentFrame.brightness;
        const c = this.currentFrame.contrast;
        const s = this.currentFrame.saturation;
        const h = this.currentFrame.hue;

        const active = state.frames.filter(f => f.active);
        const btn = document.getElementById('apply-filters-all-btn');
        const oldText = btn ? btn.innerText : "Apply to All";
        if (btn) btn.innerText = "Applying...";

        for (const f of active) {
            // Apply Filters (State only)
            f.brightness = b;
            f.contrast = c;
            f.saturation = s;
            f.hue = h;
        }

        if (btn) {
            btn.innerText = "Applied!";
            btn.classList.add('btn-success');
            setTimeout(() => {
                btn.innerText = oldText;
                btn.classList.remove('btn-success');
            }, 1000);
        }

        app.renderDrawingReel();
        app.renderEditorReel();
        
        // Refresh current frame view
        const idx = active.indexOf(this.currentFrame);
        if (idx !== -1) this.loadFrame(idx, false);
    },

    async applyOutlineToAll(mode = 'add') {
        if (!this.currentFrame) return;
        const color = document.getElementById('outline-color').value;
        const active = state.frames.filter(f => f.active);

        const btn = document.activeElement;
        const oldText = btn ? btn.innerText : (mode === 'add' ? "Batch +" : "Batch -");
        if (btn) btn.innerText = "...";

        for (const f of active) {
            await this.bakeOutlineToFrame(f, color, 1, mode);
        }

        if (btn) {
            btn.innerText = "Done!";
            setTimeout(() => btn.innerText = oldText, 1000);
        }

        app.renderDrawingReel();
        app.renderEditorReel();
        const idx = active.indexOf(this.currentFrame);
        if (idx !== -1) this.loadFrame(idx, false);
    },

    addOutline(delta) {
        if (!this.currentFrame) return;
        this.saveHistory();
        
        const color = document.getElementById('outline-color').value;
        const mode = delta > 0 ? 'add' : 'remove';
        
        this.internalApplyOutline(color, 1, mode);
        
        this.currentFrame.base64 = this.canvas.toDataURL().split(',')[1];
        app.renderDrawingReel();
        app.renderEditorReel();
    },

    async addSmartOutline() {
        if (!this.currentFrame) return;
        const active = state.frames.filter(f => f.active);
        
        const btn = document.activeElement;
        const oldText = btn ? btn.innerText : "Trace Edge";
        if (btn) btn.innerText = "...";

        for (const f of active) {
            await this.bakeOutlineToFrame(f, 'smart', 1, 'smart');
        }

        if (btn) {
            btn.innerText = "Done!";
            setTimeout(() => btn.innerText = oldText, 1000);
        }

        app.renderDrawingReel();
        app.renderEditorReel();
        const idx = active.indexOf(this.currentFrame);
        if (idx !== -1) this.loadFrame(idx, false);
    },

    async bakeOutlineToFrame(frame, color, thickness, mode = 'add') {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(img, 0, 0);
                
                const d = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                const pixels = d.data;
                const w = tempCanvas.width;
                const h = tempCanvas.height;
                const resultPixels = new Uint8ClampedArray(pixels);
                
                let r, g, b;
                if (color !== 'smart') {
                    r = parseInt(color.slice(1, 3), 16);
                    g = parseInt(color.slice(3, 5), 16);
                    b = parseInt(color.slice(5, 7), 16);
                }

                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const idx = (y * w + x) * 4;
                        if (mode === 'add' || mode === 'smart') {
                            if (pixels[idx + 3] < 10) { 
                                // Find neighbor
                                for (let dy = -1; dy <= 1; dy++) {
                                    for (let dx = -1; dx <= 1; dx++) {
                                        const nx = x + dx;
                                        const ny = y + dy;
                                        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                                            const nIdx = (ny * w + nx) * 4;
                                            if (pixels[nIdx + 3] > 10) {
                                                if (mode === 'smart') {
                                                    resultPixels[idx] = pixels[nIdx] * 0.4;
                                                    resultPixels[idx+1] = pixels[nIdx+1] * 0.4;
                                                    resultPixels[idx+2] = pixels[nIdx+2] * 0.4;
                                                } else {
                                                    resultPixels[idx] = r;
                                                    resultPixels[idx+1] = g;
                                                    resultPixels[idx+2] = b;
                                                }
                                                resultPixels[idx+3] = 255;
                                                dx = 2; dy = 2; // Break color search
                                            }
                                        }
                                    }
                                }
                            }
                        } else if (mode === 'remove') {
                            if (pixels[idx + 3] > 10) {
                                for (let dy = -1; dy <= 1; dy++) {
                                    for (let dx = -1; dx <= 1; dx++) {
                                        const nx = x + dx;
                                        const ny = y + dy;
                                        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                                            const nIdx = (ny * w + nx) * 4;
                                            if (pixels[nIdx + 3] < 10) {
                                                resultPixels[idx + 3] = 0;
                                                dx = 2; dy = 2;
                                            }
                                        } else {
                                            resultPixels[idx+3] = 0;
                                            dx = 2; dy = 2;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                tempCtx.putImageData(new ImageData(resultPixels, w, h), 0, 0);
                frame.base64 = tempCanvas.toDataURL().split(',')[1];
                resolve();
            };
            img.src = 'data:image/png;base64,' + frame.base64;
        });
    },


    refreshModifiers() {
        if (!this.currentFrame) return;

        // Sync from DOM to state (Filters only)
        this.currentFrame.brightness = parseInt(document.getElementById('brightness-slider').value);
        this.currentFrame.contrast = parseInt(document.getElementById('contrast-slider').value);
        this.currentFrame.saturation = parseInt(document.getElementById('saturation-slider').value);
        this.currentFrame.hue = parseInt(document.getElementById('hue-slider').value);

        this.applyFilters();
        this.updateFilterUI();
        
        // No longer refreshing the canvas reactively for the outline
        // The CSS filters handle visual updates for the active frame
    },

    internalApplyOutline(color, thickness, mode = 'add') {
        const d = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const pixels = d.data;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const resultPixels = new Uint8ClampedArray(pixels);
        
        let r, g, b;
        if (color !== 'smart' && mode !== 'remove') {
            r = parseInt(color.slice(1, 3), 16);
            g = parseInt(color.slice(3, 5), 16);
            b = parseInt(color.slice(5, 7), 16);
        }

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                if (mode === 'add' || mode === 'smart') {
                    if (pixels[idx + 3] < 10) { 
                        // Find neighbor
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                if (dx === 0 && dy === 0) continue;
                                const nx = x + dx;
                                const ny = y + dy;
                                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                                    const nIdx = (ny * w + nx) * 4;
                                    if (pixels[nIdx + 3] > 10) {
                                        if (mode === 'smart') {
                                            resultPixels[idx] = Math.max(0, pixels[nIdx] * 0.4);
                                            resultPixels[idx+1] = Math.max(0, pixels[nIdx+1] * 0.4);
                                            resultPixels[idx+2] = Math.max(0, pixels[nIdx+2] * 0.4);
                                        } else {
                                            resultPixels[idx] = r;
                                            resultPixels[idx+1] = g;
                                            resultPixels[idx+2] = b;
                                        }
                                        resultPixels[idx + 3] = 255;
                                        dx = 2; dy = 2; // Break
                                    }
                                }
                            }
                        }
                    }
                } else if (mode === 'remove') {
                    if (pixels[idx + 3] > 10) {
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                const nx = x + dx;
                                const ny = y + dy;
                                if (nx < 0 || nx >= w || ny < 0 || ny >= h || pixels[(ny * w + nx) * 4 + 3] < 10) {
                                    resultPixels[idx + 3] = 0;
                                    dx = 2; dy = 2;
                                }
                            }
                        }
                    }
                }
            }
        }
        this.ctx.putImageData(new ImageData(resultPixels, w, h), 0, 0);
    },

    updateFilterUI() {
        if (!this.currentFrame) return;
        const b = this.currentFrame.brightness || 100;
        const c = this.currentFrame.contrast || 100;
        const s = this.currentFrame.saturation || 100;
        const h = this.currentFrame.hue || 0;

        const sliders = {
            'brightness-slider': [b, 'brightness-val'],
            'contrast-slider': [c, 'contrast-val'],
            'saturation-slider': [s, 'saturation-val'],
            'hue-slider': [h, 'hue-val']
        };

        for (const [id, [val, labelId]] of Object.entries(sliders)) {
            const slider = document.getElementById(id);
            if (slider) {
                slider.value = val;
                document.getElementById(labelId).innerText = val;
            }
        }
    },

    applyFilters() {
        if (!this.canvas || !this.currentFrame) return;
        const filter = `brightness(${this.currentFrame.brightness}%) contrast(${this.currentFrame.contrast}%) saturate(${this.currentFrame.saturation}%) hue-rotate(${this.currentFrame.hue}deg)`;
        this.canvas.style.filter = filter;
    },

    // --- PALETTE & OUTLINE ---
    applyPalette() {
        const pKey = document.getElementById('palette-selector').value;
        if (pKey === 'none') return;
        
        const palette = PALETTES[pKey];
        if (!palette) return;

        // Bake CSS filters first before remapping
        const b = this.currentFrame.brightness || 100;
        const c = this.currentFrame.contrast || 100;
        const s = this.currentFrame.saturation || 100;
        const h = this.currentFrame.hue || 0;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.canvas.width;
        tempCanvas.height = this.canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%) hue-rotate(${h}deg)`;
        tempCtx.drawImage(this.canvas, 0, 0);

        const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const pixels = imgData.data;

        // Convert hex palette to RGB
        const paletteRGB = palette.map(hex => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return { r, g, b };
        });

        for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i+3] === 0) continue; // Skip transparency

            const r = pixels[i];
            const g = pixels[i+1];
            const b = pixels[i+2];

            let bestMatch = paletteRGB[0];
            let minDist = Infinity;

            for (const color of paletteRGB) {
                const dist = Math.sqrt(
                    Math.pow(r - color.r, 2) +
                    Math.pow(g - color.g, 2) +
                    Math.pow(b - color.b, 2)
                );
                if (dist < minDist) {
                    minDist = dist;
                    bestMatch = color;
                }
            }

            pixels[i] = bestMatch.r;
            pixels[i+1] = bestMatch.g;
            pixels[i+2] = bestMatch.b;
        }

        this.ctx.putImageData(imgData, 0, 0);
        
        // Reset filters since they are baked
        this.currentFrame.brightness = 100;
        this.currentFrame.contrast = 100;
        this.currentFrame.saturation = 100;
        this.currentFrame.hue = 0;
        this.updateFilterUI();
        this.applyFilters();

        this.saveHistory();
        this.currentFrame.base64 = this.canvas.toDataURL().split(',')[1];
        app.renderDrawingReel();
        app.renderEditorReel();
    },

    // --- PRESETS ---
    savePreset(event) {
        const name = prompt("Enter a name for this preset:");
        if (!name) return;
        
        state.filterPresets[name] = {
            brightness: document.getElementById('brightness-slider').value,
            contrast: document.getElementById('contrast-slider').value,
            saturation: document.getElementById('saturation-slider').value,
            hue: document.getElementById('hue-slider').value
        };
        app.persistSettings();
        this.renderPresets();
        
        if (event && event.target) {
            const btn = event.target;
            const oldText = btn.innerText;
            btn.innerText = "Saved!";
            btn.style.backgroundColor = "var(--success-color)";
            setTimeout(() => {
                btn.innerText = oldText;
                btn.style.backgroundColor = "";
            }, 1000);
        }
    },

    loadPreset(name) {
        if (!name) return;
        const p = state.filterPresets[name];
        if (!p) return;
        
        const bInput = document.getElementById('brightness-slider');
        const cInput = document.getElementById('contrast-slider');
        const sInput = document.getElementById('saturation-slider');
        const hInput = document.getElementById('hue-slider');
        
        if (bInput) bInput.value = p.brightness;
        if (cInput) cInput.value = p.contrast;
        if (sInput) sInput.value = p.saturation;
        if (hInput) hInput.value = p.hue;
        
        this.refreshModifiers();
    },

    renderPresets() {
        const selector = document.getElementById('preset-selector');
        if (!selector) return;
        selector.innerHTML = '<option value="">Select Preset...</option>';
        for (const name in state.filterPresets) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.innerText = name;
            selector.appendChild(opt);
        }
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
