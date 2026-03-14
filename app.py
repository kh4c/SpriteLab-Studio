import flet as ft
import os
import shutil
import asyncio
import time
import io
import base64
import numpy as np
from pathlib import Path
from threading import Thread
from PIL import Image, ImageDraw
from processing.video import extract_keyframes, get_video_meta
from processing.matte import remove_background
from processing.sprite import pack_spritesheet

# Simple App State
class AppState:
    def __init__(self):
        self.video_path = None
        self.output_dir = Path("output")
        self.frames = [] # {path, active, video_idx, clean_img (PIL)}
        self.loop_active = False
        self.current_loop_frame = 0
        self.target_count = 12
        self.selected_edit_idx = 0
        self.brush_size = 20
        self.is_eraser = False
        self.undo_stack = [] # List of PIL images for the current frame
        self.redo_stack = []

state = AppState()

def pil_to_base64(img):
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode()

def main(page: ft.Page):
    page.title = "SpriteLab Interactive"
    page.theme_mode = ft.ThemeMode.DARK
    page.window_width = 1200
    page.window_height = 900
    page.padding = 20
    page.spacing = 20

    file_picker = ft.FilePicker()
    page.overlay.append(file_picker)

    def navigate_to(view_name):
        page.clean()
        if view_name == "welcome":
            render_welcome()
        elif view_name == "selection":
            render_selection()
        elif view_name == "editor":
            render_editor()
        elif view_name == "export":
            render_export()
        page.update()

    # --- SCREEN 1: WELCOME ---
    def render_welcome():
        def on_video_picked(e):
            if e.files:
                state.video_path = Path(e.files[0].path)
                navigate_to("selection")

        welcome_content = ft.Column([
            ft.Text("SpriteLab", size=64, weight=ft.FontWeight.BOLD, color=ft.Colors.CYAN_400),
            ft.Text("Studio-grade 2D asset creation for everyone.", size=18, color=ft.Colors.GREY_400),
            ft.Container(height=60),
            ft.Container(
                content=ft.Column([
                    ft.Icon(ft.icons.UPLOAD_FILE, size=80, color=ft.Colors.CYAN_700),
                    ft.Text("Drag & Drop Video or Click to Browse", size=16),
                    ft.ElevatedButton("Select Video", on_click=lambda _: file_picker.pick_files()),
                ], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                border=ft.border.all(2, ft.Colors.GREY_800), border_radius=20, padding=40,
                on_click=lambda _: file_picker.pick_files()
            ),
            ft.Row([
                ft.Text("Target Frame Count: "),
                ft.Slider(min=4, max=24, divisions=20, label="{value}", value=12, 
                          on_change=lambda e: setattr(state, "target_count", int(e.value)))
            ], alignment=ft.MainAxisAlignment.CENTER)
        ], alignment=ft.MainAxisAlignment.CENTER, horizontal_alignment=ft.CrossAxisAlignment.CENTER, expand=True)
        
        file_picker.on_result = on_video_picked
        page.add(welcome_content)

    # --- SCREEN 2: SELECTION & LOOP ---
    def render_selection():
        loop_img = ft.Image(src="", width=400, height=400, fit=ft.ImageFit.CONTAIN)
        reel_row = ft.Row(wrap=False, scroll=ft.ScrollMode.ALWAYS, spacing=10)
        status = ft.Text("Processing...", color=ft.Colors.CYAN_200)

        page.add(ft.Column([
            ft.Container(loop_img, height=450, bgcolor=ft.Colors.BLACK, alignment=ft.alignment.center),
            ft.Container(reel_row, height=140),
            ft.Row([
                status,
                ft.ElevatedButton("Proceed to Cleanup", icon=ft.icons.AUTO_FIX_HIGH, on_click=lambda _: navigate_to("editor")),
                ft.TextButton("Back", on_click=lambda _: navigate_to("welcome"))
            ], alignment=ft.MainAxisAlignment.END)
        ], expand=True))

        async def loop_timer():
            state.loop_active = True
            while state.loop_active:
                active = [f for f in state.frames if f["active"]]
                if active:
                    idx = state.current_loop_frame % len(active)
                    loop_img.src = active[idx]["path"]
                    state.current_loop_frame += 1
                page.update()
                await asyncio.sleep(0.1)

        def start_processing():
            vid_out = state.output_dir / state.video_path.stem
            if vid_out.exists(): shutil.rmtree(vid_out)
            frames_info = extract_keyframes(state.video_path, vid_out, count=state.target_count)
            state.frames = [{"path": f["path"], "active": True, "video_idx": f["video_idx"]} for f in frames_info]
            status.value = f"Extracted {len(state.frames)} frames."
            build_reel()
            page.run_task(loop_timer)

        def build_reel():
            reel_row.controls.clear()
            for f in state.frames:
                c = ft.Container(content=ft.Image(src=f["path"], width=100, height=100),
                                 border=ft.border.all(2, ft.Colors.CYAN), border_radius=8,
                                 on_click=lambda e, data=f: toggle(data, e.control))
                reel_row.controls.append(c)
            page.update()

        def toggle(data, ctrl):
            data["active"] = not data["active"]
            ctrl.opacity = 1.0 if data["active"] else 0.3
            page.update()

        Thread(target=start_processing).start()

    # --- SCREEN 3: INTERACTIVE EDITOR ---
    def render_editor():
        state.loop_active = False
        active_frames = [f for f in state.frames if f["active"]]
        if not active_frames:
            navigate_to("selection")
            return

        canvas_img = ft.Image(src="", width=512, height=512, fit=ft.ImageFit.CONTAIN)
        reel_row = ft.Row(wrap=False, scroll=ft.ScrollMode.ALWAYS, spacing=10)
        status = ft.Text("Initializing Background Removal...", color=ft.Colors.CYAN_200)
        
        def save_state():
            f = active_frames[state.selected_edit_idx]
            state.undo_stack.append(f["clean_img"].copy())
            if len(state.undo_stack) > 20: state.undo_stack.pop(0)
            state.redo_stack.clear()

        def update_canvas():
            f = active_frames[state.selected_edit_idx]
            canvas_img.src_base64 = pil_to_base64(f["clean_img"])
            page.update()

        def on_paint(e: ft.DragUpdateEvent):
            f = active_frames[state.selected_edit_idx]
            img = f["clean_img"]
            # Fixed scale mapping: Canvas is 512x512
            # Map event coords (0-512) to Image size (W, H)
            img_w, img_h = img.size
            scale_x = img_w / 512
            scale_y = img_h / 512
            
            draw = ImageDraw.Draw(img)
            x, y = e.local_x * scale_x, e.local_y * scale_y
            r = (state.brush_size * scale_x) / 2
            
            # Eraser sets alpha to 0, Brush restores? 
            # For now, let's implement true Eraser (Alpha 0)
            if state.is_eraser:
                draw.ellipse([x-r, y-r, x+r, y+r], fill=(0,0,0,0))
            else:
                # Simple restore would need the original image, let's just draw white for now
                # Or better: just keep it as eraser for now as that's the primary "cleanup" need
                draw.ellipse([x-r, y-r, x+r, y+r], fill=(255,255,255,255))
            update_canvas()

        def on_drag_start(e):
            save_state()

        def undo(e):
            if state.undo_stack:
                f = active_frames[state.selected_edit_idx]
                state.redo_stack.append(f["clean_img"].copy())
                f["clean_img"] = state.undo_stack.pop()
                update_canvas()

        def redo(e):
            if state.redo_stack:
                f = active_frames[state.selected_edit_idx]
                state.undo_stack.append(f["clean_img"].copy())
                f["clean_img"] = state.redo_stack.pop()
                update_canvas()

        editor_controls = ft.Column([
            ft.Text("Manual Cleanup", size=24, weight=ft.FontWeight.BOLD),
            ft.Row([
                ft.IconButton(ft.icons.UNDO, on_click=undo),
                ft.IconButton(ft.icons.REDO, on_click=redo),
                ft.VerticalDivider(),
                ft.SegmentedButton(
                    selected={"eraser"},
                    segments=[
                        ft.Segment(value="brush", label=ft.Text("Brush"), icon=ft.Icon(ft.icons.BRUSH)),
                        ft.Segment(value="eraser", label=ft.Text("Eraser"), icon=ft.Icon(ft.icons.DELETE_OUTLINE)),
                    ],
                    on_change=lambda e: setattr(state, "is_eraser", "eraser" in e.selection)
                ),
            ]),
            ft.Text("Brush Size"),
            ft.Slider(min=5, max=100, value=20, on_change=lambda e: setattr(state, "brush_size", e.value)),
            ft.Divider(),
            ft.ElevatedButton("Generate Spritesheet", icon=ft.icons.GRID_VIEW, on_click=lambda _: navigate_to("export"), bgcolor=ft.Colors.CYAN_700)
        ], width=300)

        canvas_container = ft.GestureDetector(
            content=ft.Container(canvas_img, border=ft.border.all(1, ft.Colors.GREY_800), bgcolor=ft.Colors.BLACK12),
            on_pan_update=on_paint,
            on_pan_start=on_drag_start
        )

        page.add(ft.Row([
            ft.Column([
                ft.Container(canvas_container, expand=True),
                ft.Container(reel_row, height=120)
            ], expand=True),
            editor_controls
        ], expand=True))

        def start_bg_removal():
            for i, f in enumerate(active_frames):
                status.value = f"Removing background: frame {i+1}/{len(active_frames)}"
                page.update()
                clean_pil = remove_background(f["path"])
                f["clean_img"] = clean_pil
                # Save a local cache of the clean version
                clean_path = Path(f["path"]).parent / "clean" / Path(f["path"]).name
                clean_path.parent.mkdir(exist_ok=True)
                clean_pil.save(clean_path)
                f["clean_path"] = str(clean_path)
            
            status.value = "Background removal complete."
            build_editor_reel()
            update_canvas()

        def build_editor_reel():
            reel_row.controls.clear()
            for i, f in enumerate(active_frames):
                c = ft.Container(content=ft.Image(src=f["path"], width=80, height=80),
                                 border=ft.border.all(2, ft.Colors.CYAN if i == state.selected_edit_idx else ft.Colors.GREY_800),
                                 on_click=lambda e, idx=i: select_frame(idx))
                reel_row.controls.append(c)
            page.update()

        def select_frame(idx):
            state.selected_edit_idx = idx
            state.undo_stack.clear()
            state.redo_stack.clear()
            build_editor_reel()
            update_canvas()

        Thread(target=start_bg_removal).start()

    # --- SCREEN 4: EXPORT ---
    def render_export():
        out_path = state.output_dir / state.video_path.stem / "spritesheet.png"
        active_clean_paths = [f["clean_path"] for f in state.frames if f["active"]]
        
        status = ft.Text("Packing Spritesheet...", color=ft.Colors.CYAN_200)
        sheet_img = ft.Image(src="", width=600, height=600, fit=ft.ImageFit.CONTAIN)

        page.add(ft.Column([
            ft.Text("Final Spritesheet", size=32, weight=ft.FontWeight.BOLD),
            ft.Container(sheet_img, expand=True, alignment=ft.alignment.center),
            ft.Row([
                status,
                ft.ElevatedButton("Expose Folder", icon=ft.icons.FOLDER_OPEN, 
                                  on_click=lambda _: os.startfile(out_path.parent)),
                ft.ElevatedButton("Done", on_click=lambda _: navigate_to("welcome"))
            ], alignment=ft.MainAxisAlignment.END)
        ], expand=True))

        def do_pack():
            # Update clean paths with edited images
            for f in state.frames:
                if f["active"] and "clean_img" in f:
                    f["clean_img"].save(f["clean_path"])
            
            pack_spritesheet(active_clean_paths, out_path)
            sheet_img.src_base64 = pil_to_base64(Image.open(out_path))
            status.value = f"Spritesheet saved to {out_path}"
            page.update()

        Thread(target=do_pack).start()

    navigate_to("welcome")

if __name__ == "__main__":
    # Ensure assets dir is correct for local testing
    ft.app(main)
