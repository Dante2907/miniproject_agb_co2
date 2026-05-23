from PIL import Image
import numpy as np
import os, glob

Image.MAX_IMAGE_PIXELS = None
TOLERANCE = 10
MAX_WIDTH = 2500

def process(path):
    print(f"  loading...", flush=True)
    img = Image.open(path).convert("RGBA")
    print(f"  original size: {img.size}", flush=True)
    
    if img.width > MAX_WIDTH:
        ratio = MAX_WIDTH / img.width
        new_size = (MAX_WIDTH, int(img.height * ratio))
        print(f"  resizing to {new_size}...", flush=True)
        img = img.resize(new_size, Image.LANCZOS)
    
    print(f"  removing background...", flush=True)
    arr = np.array(img)
    r, g, b, a = arr[:,:,0], arr[:,:,1], arr[:,:,2], arr[:,:,3]
    mask = (np.abs(r.astype(int) - 255) <= TOLERANCE) & \
           (np.abs(g.astype(int) - 255) <= TOLERANCE) & \
           (np.abs(b.astype(int) - 255) <= TOLERANCE)
    arr[mask, 3] = 0
    
    print(f"  saving...", flush=True)
    Image.fromarray(arr).save(path, "PNG", optimize=True)
    size_kb = os.path.getsize(path) / 1024
    print(f"  done ({size_kb:.0f} KB)", flush=True)

png_files = [f for f in glob.glob("*.png") if "backup" not in f]
print(f"Found {len(png_files)} PNG files", flush=True)
print()

for i, f in enumerate(png_files, 1):
    print(f"[{i}/{len(png_files)}] {f}", flush=True)
    process(f)
    print()

print("All done!")
