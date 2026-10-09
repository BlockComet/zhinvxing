"""Convert approved Vega artwork to renderer and desktop packaging formats.

Source artwork lives in build/brand. This script only resizes and converts it;
the illustration itself is authored separately, not reconstructed in code.
Run with Python 3 and Pillow installed.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "build/brand"
ASSETS = ROOT / "src/shared/assets"

def export_png(source: Path, destination: Path, size: int) -> Image.Image:
    with Image.open(source) as original:
        image = original.convert("RGBA")
        if image.width != image.height:
            raise ValueError(f"Expected square source artwork: {source}")
        image = image.resize((size, size), Image.Resampling.LANCZOS)
        image.save(destination, optimize=True)
    return image

icon = export_png(SOURCES / "vega-icon-source.png", ROOT / "build/icon.png", 1024)
icon.save(ROOT / "build/icon.ico", sizes=[(n, n) for n in (16, 20, 24, 32, 40, 48, 64, 128, 256)])
icon.save(ROOT / "build/icon.icns")
export_png(SOURCES / "vega-icon-source.png", ASSETS / "vega-mark.png", 256)
export_png(SOURCES / "vega-emblem-source.png", ASSETS / "vega-emblem.png", 512)
export_png(SOURCES / "vega-emblem-dark-source.png", ASSETS / "vega-emblem-dark.png", 512)
print("Vega renderer PNGs, desktop PNG, ICO and ICNS generated from approved artwork")
