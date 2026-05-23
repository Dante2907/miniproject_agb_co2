from PIL import Image
import os, glob

Image.MAX_IMAGE_PIXELS = None

def optimize(path):
    img = Image.open(path)
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    alpha = img.split()[-1]
    rgb = img.convert("RGB").convert("P", palette=Image.ADAPTIVE, colors=255)
    mask = Image.eval(alpha, lambda a: 255 if a <= 128 else 0)
    rgb.paste(255, mask)
    rgb.info["transparency"] = 255
    rgb.save(path, "PNG", optimize=True)
    size_kb = os.path.getsize(path) / 1024
    print(f"  {os.path.basename(path)}: {size_kb:.0f} KB")

png_files = [f for f in glob.glob("*.png") if "backup" not in f]
print(f"Optimizing {len(png_files)} PNGs...")
print()
for f in png_files:
    optimize(f)
print()
print("Done!")
