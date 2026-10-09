"""Build the original Vega vector mark and desktop icon sizes from one geometry."""
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[1]
STAR = [(46,18),(55,41),(78,50),(55,59),(46,82),(37,59),(14,50),(37,41)]
SPARK = [(77,13),(80,21),(88,24),(80,27),(77,35),(74,27),(66,24),(74,21)]
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="24" fill="#4940A6"/>
  <polygon points="{' '.join(f'{x},{y}' for x,y in STAR)}" fill="#FFFFFF"/>
  <polygon points="{' '.join(f'{x},{y}' for x,y in SPARK)}" fill="#CEC9FF"/>
</svg>\n'''
for dest in ['src/shared/assets/vega-mark.svg','build/logo.svg','build/icon-macos.svg']:
    (ROOT/dest).write_text(svg, encoding='utf-8')
scale=16
im=Image.new('RGBA',(96*scale,96*scale))
draw=ImageDraw.Draw(im)
draw.rounded_rectangle((0,0,96*scale-1,96*scale-1),radius=24*scale,fill='#4940A6')
draw.polygon([(x*scale,y*scale) for x,y in STAR],fill='white')
draw.polygon([(x*scale,y*scale) for x,y in SPARK],fill='#CEC9FF')
im=im.resize((1024,1024),Image.Resampling.LANCZOS)
im.save(ROOT/'build/icon.png')
im.save(ROOT/'build/icon.ico',sizes=[(n,n) for n in (16,20,24,32,40,48,64,128,256)])
im.save(ROOT/'build/icon.icns')
print('Vega SVG, PNG, ICO and ICNS generated')
