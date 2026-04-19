import json
import requests
import uuid
import time
import os
from pathlib import Path

class ComfyBridge:
    def __init__(self, base_url="http://127.0.0.1:8188"):
        self.base_url = base_url
        self.client_id = str(uuid.uuid4())
        self.workflow_path = Path("run.json")

    def _load_workflow(self):
        if not self.workflow_path.exists():
            raise FileNotFoundError(f"Workflow file {self.workflow_path} not found.")
        with open(self.workflow_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def upload_image(self, image_path: Path):
        with open(image_path, "rb") as f:
            files = {"image": f}
            data = {"overwrite": "true"}
            response = requests.post(f"{self.base_url}/upload/image", files=files, data=data)
            return response.json()

    def generate(self, start_image_path: Path, end_image_path: Path, positive_prompt: str, negative_prompt: str):
        # 1. Upload images
        start_result = self.upload_image(start_image_path)
        end_result = self.upload_image(end_image_path)
        
        start_name = start_result['name']
        end_name = end_result['name']

        # 2. Modify workflow
        workflow = self._load_workflow()
        nodes = {node['id']: node for node in workflow['nodes']}

        # Node 75: LoadImage (Start)
        if "75" in nodes:
            nodes["75"]["widgets_values"][0] = start_name
        
        # Node 77: LoadImage (End)
        if "77" in nodes:
            nodes["77"]["widgets_values"][0] = end_name

        # Node 6: CLIPTextEncode (Positive)
        if "6" in nodes:
            nodes["6"]["widgets_values"][0] = positive_prompt
        
        # Node 7: CLIPTextEncode (Negative)
        if "7" in nodes:
            nodes["7"]["widgets_values"][0] = negative_prompt

        # 3. Queue Prompt
        prompt_data = {
            "prompt": workflow,
            "client_id": self.client_id
        }
        
        response = requests.post(f"{self.base_url}/prompt", json=prompt_data)
        if response.status_code != 200:
            raise Exception(f"ComfyUI Error: {response.text}")
        
        prompt_id = response.json()['prompt_id']
        return prompt_id

    def wait_for_result(self, prompt_id, timeout=300):
        start_time = time.time()
        while time.time() - start_time < timeout:
            # Check history
            response = requests.get(f"{self.base_url}/history/{prompt_id}")
            history = response.json()
            
            if prompt_id in history:
                outputs = history[prompt_id].get('outputs', {})
                # Look for video combine output (Node 91 in run.json)
                video_node = outputs.get('91', {})
                if 'gifs' in video_node: # VHS_VideoCombine uses 'gifs' even for mp4
                    video_info = video_node['gifs'][0]
                    return video_info
                
            time.sleep(2)
        raise TimeoutError("Animation generation timed out.")

    def download_video(self, video_info):
        filename = video_info['filename']
        subfolder = video_info['subfolder']
        type_ = video_info['type']
        
        url = f"{self.base_url}/view?filename={filename}&subfolder={subfolder}&type={type_}"
        response = requests.get(url)
        
        out_path = Path("output/global/animations")
        out_path.mkdir(parents=True, exist_ok=True)
        
        target_file = out_path / f"anim_{int(time.time())}.mp4"
        with open(target_file, "wb") as f:
            f.write(response.content)
            
        return target_file
