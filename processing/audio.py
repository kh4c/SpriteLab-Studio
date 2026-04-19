import torch
import torchaudio
from audiocraft.models import AudioGen
from audiocraft.data.audio import audio_write
from pathlib import Path
import os
import soundfile as sf

class AudioGenerator:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(AudioGenerator, cls).__new__(cls)
            cls._instance.model = None
        return cls._instance
    
    def load_model(self):
        """Loads AudioGen medium model. get_pretrained automatically handles device placement."""
        if self.model is None:
            print("Loading AudioGen (Medium)...")
            # Automatically uses CUDA if available
            self.model = AudioGen.get_pretrained('facebook/audiogen-medium')
            print(f"Model loaded on device: {self.model.device}")
            
    def generate(self, prompt, duration=5, guidance_scale=4.0, output_dir="output/sfx", filename="generated_sfx"):
        """Generates a sound effect from a prompt with guidance scale."""
        self.load_model()
        
        # Set params
        self.model.set_generation_params(duration=duration, cfg_coef=guidance_scale)
        
        # Generate
        print(f"Generating SFX: '{prompt}' ({duration}s)...")
        wav = self.model.generate([prompt]) # returns [B, C, T]
        
        # Ensure output directory exists
        out_path = Path(output_dir)
        out_path.mkdir(parents=True, exist_ok=True)
        
        # Full path for audio_write (it adds .wav automatically)
        target_base = out_path / filename
        
        # Save using soundfile to avoid ffmpeg dependency
        # wav[0] is [C, T], soundfile expects [T, C]
        audio_data = wav[0].cpu().numpy().T
        full_path = f"{target_base}.wav"
        sf.write(full_path, audio_data, self.model.sample_rate)
        
        print(f"SFX saved to: {full_path}")
        return str(full_path)

    def process_sfx(self, input_path, volume=1.0, pitch=1.0, trim_start=0.0):
        """Processes an existing SFX file with adjustments."""
        print(f"Processing SFX: {input_path} (Vol:{volume}, Pitch:{pitch}, Trim:{trim_start}s)")
        
        # Load
        data, samplerate = sf.read(input_path)
        
        # Trim
        start_sample = int(trim_start * samplerate)
        if start_sample < len(data):
            data = data[start_sample:]
        
        # Volume
        data = data * float(volume)
        
        # Pitch / Speed (Simplified as resampling)
        # Note: True pitch shifting without speed change is complex (STFT).
        # Linear resampling changes both.
        if float(pitch) != 1.0:
            import numpy as np
            from scipy import interpolate
            
            old_len = len(data)
            new_len = int(old_len / float(pitch))
            
            old_indices = np.arange(old_len)
            new_indices = np.linspace(0, old_len - 1, new_len)
            
            # Interpolate per channel
            if len(data.shape) > 1: # Stereo
                new_data = np.zeros((new_len, data.shape[1]))
                for i in range(data.shape[1]):
                    f = interpolate.interp1d(old_indices, data[:, i])
                    new_data[:, i] = f(new_indices)
                data = new_data
            else: # Mono
                f = interpolate.interp1d(old_indices, data)
                data = f(new_indices)

        # Save as new file
        output_dir = os.path.dirname(input_path)
        base_name = os.path.basename(input_path).replace(".wav", "")
        new_filename = f"{base_name}_edited_{int(os.path.getmtime(input_path))}.wav"
        output_path = os.path.join(output_dir, new_filename)
        
        sf.write(output_path, data, samplerate)
        print(f"Processed SFX saved to: {output_path}")
        return output_path

# Example usage:
# gen = AudioGenerator()
# gen.generate("dog barking", duration=2)
