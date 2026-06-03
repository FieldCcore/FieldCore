"""Generate FieldCore icons with navy squircle background."""
from PIL import Image, ImageDraw
import os

NAVY  = (28, 35, 51, 255)     # #1C2333
CREAM = (237, 235, 231, 255)  # #EDEBE7
TAN   = (214, 181, 138, 255)  # #D6B58A

# 5-square layout in inner SVG coordinate space (viewBox 100x100 inner)
# SVG group transform: translate(17.3913 17.3913) scale(0.652174)
TRANSLATE = 17.3913
INNER_SCALE = 0.652174
INNER_CORNER = 6  # rx/ry of each small square in inner coords

SQUARES = [
    (37, 14, 26, 26, CREAM),  # top-centre
    (65,  4, 26, 26, TAN),    # top-right (tan accent)
    ( 9, 42, 26, 26, CREAM),  # mid-left
    (65, 42, 26, 26, CREAM),  # mid-right
    (37, 70, 26, 26, CREAM),  # bottom-centre
]


def create_icon(size: int, bg_color=None) -> Image.Image:
    """
    Create the navy-squircle FieldCore icon at `size` x `size` pixels.
    If bg_color is given, the canvas background is that solid colour (no
    transparency), useful for splash screens.
    """
    if bg_color:
        img = Image.new("RGBA", (size, size), bg_color)
    else:
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    draw = ImageDraw.Draw(img)

    # Rounded-square background (~20 % corner radius)
    corner = max(1, int(size * 0.20))
    draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=corner, fill=NAVY)

    # Map inner SVG coords → pixel coords
    sf = size / 100.0  # outer SVG viewBox is 100×100

    def px(coord):
        return (TRANSLATE + coord * INNER_SCALE) * sf

    sq_r = max(1, int(INNER_CORNER * INNER_SCALE * sf))

    for (x, y, w, h, color) in SQUARES:
        x0, y0 = px(x), px(y)
        x1 = x0 + w * INNER_SCALE * sf
        y1 = y0 + h * INNER_SCALE * sf
        draw.rounded_rectangle([(x0, y0), (x1, y1)], radius=sq_r, fill=color)

    return img


def create_splash(width: int, height: int, icon_fraction=0.35) -> Image.Image:
    """Cream background with centred navy-squircle icon."""
    img = Image.new("RGBA", (width, height), CREAM)
    icon_size = int(min(width, height) * icon_fraction)
    icon = create_icon(icon_size)
    x = (width  - icon_size) // 2
    y = (height - icon_size) // 2
    img.paste(icon, (x, y), icon)
    return img


# ── Web client icons ──────────────────────────────────────────────────────────
web_dir = os.path.join("client", "public")

web_icons = [
    (16,  "favicon-16x16.png"),
    (32,  "favicon-32x32.png"),
    (180, "apple-touch-icon.png"),
    (192, "android-chrome-192x192.png"),
    (512, "android-chrome-512x512.png"),
]

for size, fname in web_icons:
    img = create_icon(size)
    out = os.path.join(web_dir, fname)
    img.save(out, format="PNG")
    print(f"  created  {out}  ({size}×{size})")

# favicon.ico — 16, 32, 48
ico_images = [create_icon(s).convert("RGBA") for s in (16, 32, 48)]
ico_path = os.path.join(web_dir, "favicon.ico")
ico_images[0].save(
    ico_path,
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48)],
    append_images=ico_images[1:],
)
print(f"  created  {ico_path}  (16/32/48)")

# ── Mobile (Expo) assets ──────────────────────────────────────────────────────
mobile_dir = os.path.join("mobile", "assets")
os.makedirs(mobile_dir, exist_ok=True)

# App icon — 1024×1024 is the Expo-recommended size
app_icon = create_icon(1024)
app_icon.save(os.path.join(mobile_dir, "icon.png"), format="PNG")
print(f"  created  {mobile_dir}/icon.png  (1024×1024)")

# Android adaptive icon foreground — same squircle on transparent bg
adaptive = create_icon(1024)
adaptive.save(os.path.join(mobile_dir, "adaptive-icon.png"), format="PNG")
print(f"  created  {mobile_dir}/adaptive-icon.png  (1024×1024)")

# Favicon (Expo web)
fav = create_icon(196)
fav.save(os.path.join(mobile_dir, "favicon.png"), format="PNG")
print(f"  created  {mobile_dir}/favicon.png  (196×196)")

# Splash screen — 1284×2778 (iPhone 14 Pro Max native; Expo centres it)
splash = create_splash(1284, 2778, icon_fraction=0.30)
splash.save(os.path.join(mobile_dir, "splash-icon.png"), format="PNG")
print(f"  created  {mobile_dir}/splash-icon.png  (1284×2778)")

print("\nAll icons generated successfully.")
