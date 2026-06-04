"""Generate FieldCore icons with navy squircle background."""
from PIL import Image, ImageDraw
import os

NAVY  = (28, 35, 51, 255)     # #1C2333
CREAM = (237, 235, 231, 255)  # #EDEBE7
TAN   = (214, 181, 138, 255)  # #D6B58A

# Mark layout in inner SVG coordinate space (viewBox 100×100 inner).
# Bounding box: x 9→91 (82 wide), y 4→96 (92 tall), centered at (50,50).
# Transform: translate(8.695 8.695) scale(0.8261)
#   → ~12 % padding top/bottom, ~16 % padding left/right
#   → mark fills ~70-76 % of the icon area
TRANSLATE    = 8.695
INNER_SCALE  = 0.8261
INNER_CORNER = 6  # rx/ry of each small square in inner coords

SQUARES = [
    (37, 14, 26, 26, CREAM),  # top-centre
    (65,  4, 26, 26, TAN),    # top-right (tan accent)
    ( 9, 42, 26, 26, CREAM),  # mid-left
    (65, 42, 26, 26, CREAM),  # mid-right
    (37, 70, 26, 26, CREAM),  # bottom-centre
]


def _draw_mark(draw: ImageDraw.ImageDraw, size: int) -> None:
    sf   = size / 100.0
    sq_r = max(1, int(INNER_CORNER * INNER_SCALE * sf))

    def px(c: float) -> float:
        return (TRANSLATE + c * INNER_SCALE) * sf

    for (x, y, w, h, color) in SQUARES:
        x0, y0 = px(x), px(y)
        draw.rounded_rectangle(
            [(x0, y0), (x0 + w * INNER_SCALE * sf, y0 + h * INNER_SCALE * sf)],
            radius=sq_r, fill=color,
        )


def solid_icon(size: int) -> Image.Image:
    """Fully opaque icon (RGB, no alpha). Use for browser favicons."""
    img  = Image.new("RGB", (size, size), (28, 35, 51))
    draw = ImageDraw.Draw(img)
    _draw_mark(draw, size)
    return img


def squircle_icon(size: int) -> Image.Image:
    """Squircle icon with transparent corners. Use for OS-masked app icons."""
    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([(0, 0), (size - 1, size - 1)],
                            radius=max(1, int(size * 0.20)), fill=NAVY)
    _draw_mark(draw, size)
    return img


def splash_screen(width: int, height: int, icon_fraction: float = 0.30) -> Image.Image:
    """Cream background with a centred squircle icon."""
    img  = Image.new("RGBA", (width, height), CREAM)
    isz  = int(min(width, height) * icon_fraction)
    icon = squircle_icon(isz)
    img.paste(icon, ((width - isz) // 2, (height - isz) // 2), icon)
    return img


# ── Web client ────────────────────────────────────────────────────────────────
web = "client/public"

# Browser favicons — solid RGB (zero transparency)
for size, name in [(16, "favicon-16x16.png"), (32, "favicon-32x32.png")]:
    solid_icon(size).save(f"{web}/{name}", format="PNG")
    print(f"  {web}/{name}  ({size}×{size}, solid)")

def _to_rgba(img: Image.Image) -> Image.Image:
    r = Image.new("RGBA", img.size)
    r.paste(img)
    return r

ico_imgs = [_to_rgba(solid_icon(s)) for s in (16, 32, 48)]
ico_imgs[0].save(f"{web}/favicon.ico", format="ICO",
                 sizes=[(16,16),(32,32),(48,48)], append_images=ico_imgs[1:])
print(f"  {web}/favicon.ico  (16/32/48, solid)")

# App icons — squircle RGBA (OS applies masking)
for size, name in [(180, "apple-touch-icon.png"),
                   (192, "android-chrome-192x192.png"),
                   (512, "android-chrome-512x512.png")]:
    squircle_icon(size).save(f"{web}/{name}", format="PNG")
    print(f"  {web}/{name}  ({size}×{size}, squircle)")

# ── Mobile (Expo) ─────────────────────────────────────────────────────────────
mob = "mobile/assets"
os.makedirs(mob, exist_ok=True)

squircle_icon(1024).save(f"{mob}/icon.png",          format="PNG"); print(f"  {mob}/icon.png  (1024×1024)")
squircle_icon(1024).save(f"{mob}/adaptive-icon.png", format="PNG"); print(f"  {mob}/adaptive-icon.png  (1024×1024)")
squircle_icon(196) .save(f"{mob}/favicon.png",       format="PNG"); print(f"  {mob}/favicon.png  (196×196)")
splash_screen(1284, 2778).save(f"{mob}/splash-icon.png", format="PNG")
print(f"  {mob}/splash-icon.png  (1284×2778)")

print("\nAll icons generated.")
