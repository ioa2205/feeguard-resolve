"""The site's icons, drawn from the FeeGuard mark (D-054): two debits, the second one red.

    python scripts/make_icons.py

Writes frontend/public/favicon.svg, favicon.ico (16, 32 and 48 px) and apple-touch-icon.png
(180 px, square: the phone rounds the corners itself). The drawing is on a 64 x 64 grid.
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "frontend" / "public"
BLACK, WHITE, RED = (0, 0, 0), (255, 255, 255), (0xE7, 0x13, 0x36)  # RED is --red, the one red of the site
LINE = (115, 115, 115)  # white at 45 % on black, as the line of the mark in the nav bar

# The mark on the 64 x 64 grid: the first debit (white), the line between, the second debit (red).
FIRST, SECOND, Y, R, LINE_WIDTH, CORNER = 19, 45, 32, 9.5, 3.5, 15

SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="{CORNER}" fill="#000"/>
  <line x1="{FIRST}" y1="{Y}" x2="{SECOND}" y2="{Y}" stroke="#fff" stroke-opacity=".45" stroke-width="{LINE_WIDTH}"/>
  <circle cx="{SECOND}" cy="{Y}" r="{R}" fill="#e71336"/>
  <circle cx="{FIRST}" cy="{Y}" r="{R}" fill="#fff"/>
</svg>
"""


def draw(size: int, rounded: bool) -> Image.Image:
    """Draws the mark 8 times larger than asked, then shrinks it, for smooth edges."""
    big = size * 8
    unit = big / 64
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    pen = ImageDraw.Draw(image)
    if rounded:
        pen.rounded_rectangle((0, 0, big - 1, big - 1), radius=CORNER * unit, fill=BLACK)
    else:
        pen.rectangle((0, 0, big - 1, big - 1), fill=BLACK)
    half = LINE_WIDTH / 2
    pen.rectangle((FIRST * unit, (Y - half) * unit, SECOND * unit, (Y + half) * unit), fill=LINE)
    for x, colour in ((SECOND, RED), (FIRST, WHITE)):
        pen.ellipse(((x - R) * unit, (Y - R) * unit, (x + R) * unit, (Y + R) * unit), fill=colour)
    return image.resize((size, size), Image.Resampling.LANCZOS)


(OUT / "favicon.svg").write_text(SVG, encoding="utf-8")
icons = [draw(size, rounded=True) for size in (48, 32, 16)]
icons[0].save(OUT / "favicon.ico", sizes=[(48, 48), (32, 32), (16, 16)], append_images=icons[1:])
draw(180, rounded=False).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
print("wrote favicon.svg, favicon.ico and apple-touch-icon.png in", OUT)
