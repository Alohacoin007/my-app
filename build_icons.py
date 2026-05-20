"""Build PWA icon set + manifest.

Produces a stylized 'A' app icon (dark, modern, ALPEXA-ish) at the
sizes a PWA needs, plus manifest.json. The 'A' uses a slight curved
sweep through the middle to echo the style the user picked.
"""
import os
import cairosvg
from PIL import Image

OUT = "/home/user/my-app"

# Stylized A: black bg, slightly lighter A with a swoosh curve through it.
# Designed at 1024x1024 viewBox.
ICON_SVG = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <!-- Background -->
  <rect width="1024" height="1024" fill="#0a0a0a"/>

  <!-- Subtle vignette for depth -->
  <radialGradient id="vg" cx="50%" cy="50%" r="65%">
    <stop offset="0%" stop-color="#1a1a1a"/>
    <stop offset="100%" stop-color="#000000"/>
  </radialGradient>
  <rect width="1024" height="1024" fill="url(#vg)"/>

  <!-- Stylized A shape (left + right legs joined at apex, with curved sweep) -->
  <g fill="#e8e8e8">
    <!-- Main A body: outline polygon with two triangular cutouts -->
    <path d="
      M 250 820
      L 470 180
      L 554 180
      L 774 820
      L 678 820
      L 626 660
      L 398 660
      L 346 820
      Z
      M 430 560
      L 594 560
      L 512 320
      Z
    " fill-rule="evenodd"/>

    <!-- Curved sweep that splits the right leg, giving the design its signature look -->
    <path d="
      M 398 660
      Q 480 540 612 620
      L 626 660
      Z
    "/>
  </g>

  <!-- Right-leg highlight strip (vertical slice that gives it the split look) -->
  <rect x="640" y="600" width="48" height="220" fill="#e8e8e8" transform="skewX(-6)"/>
</svg>
"""

# Maskable version: same icon but with safe padding so OS-applied masks
# (Android adaptive icons) don't crop the A.
MASKABLE_SVG = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#0a0a0a"/>
  <radialGradient id="vg" cx="50%" cy="50%" r="65%">
    <stop offset="0%" stop-color="#1a1a1a"/>
    <stop offset="100%" stop-color="#000000"/>
  </radialGradient>
  <rect width="1024" height="1024" fill="url(#vg)"/>
  <g transform="translate(102 102) scale(0.8)" fill="#e8e8e8">
    <path d="
      M 250 820
      L 470 180
      L 554 180
      L 774 820
      L 678 820
      L 626 660
      L 398 660
      L 346 820
      Z
      M 430 560
      L 594 560
      L 512 320
      Z
    " fill-rule="evenodd"/>
    <path d="M 398 660 Q 480 540 612 620 L 626 660 Z"/>
  </g>
</svg>
"""

with open(os.path.join(OUT, "icon.svg"), "w") as f:
    f.write(ICON_SVG)
with open(os.path.join(OUT, "icon-maskable.svg"), "w") as f:
    f.write(MASKABLE_SVG)

# PNG sizes needed for PWA + iOS
SIZES = {
    "icon-192.png": (192, ICON_SVG),
    "icon-512.png": (512, ICON_SVG),
    "icon-maskable-512.png": (512, MASKABLE_SVG),
    "apple-touch-icon.png": (180, ICON_SVG),
    "favicon-32.png": (32, ICON_SVG),
}

for filename, (size, svg) in SIZES.items():
    out_path = os.path.join(OUT, filename)
    cairosvg.svg2png(bytestring=svg.encode("utf-8"),
                     output_width=size, output_height=size,
                     write_to=out_path)
    print(f"  {filename}  {size}x{size}")

# favicon.ico (multi-size)
img32 = Image.open(os.path.join(OUT, "favicon-32.png"))
img32.save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32)])
print("  favicon.ico")

# Web app manifest
MANIFEST = """{
  "name": "Alpexa Suisse",
  "short_name": "Alpexa Suisse",
  "description": "ALPEXA SUISSE Trading App",
  "start_url": "./login.html",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#0a0a0a",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
"""
with open(os.path.join(OUT, "manifest.json"), "w") as f:
    f.write(MANIFEST)
print("  manifest.json")

print("Done.")
