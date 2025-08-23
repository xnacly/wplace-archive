import os, re, glob
import pyvips

# ---- Konfiguration ----
BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
TILES_DIR = os.path.join(BASE_DIR, "..", "tiles")  # Struktur: tiles/YYYY/XXXX.png (4-stellig gepadded)
TILE_SIZE = 1000
OUT_DIR   = os.path.join(BASE_DIR, "google_tiles")

# VIPS zügeln: Cache + Threads
# pyvips.voperation.cache_set_max(0)                # kein wachsender Op-Cache
# pyvips.voperation.cache_set_max_mem(200*1024*1024)  # ~200MB
# pyvips.voperation.cache_set_max_files(4096)
# pyvips.concurrency_set(max(1, os.cpu_count() // 2))

# ---- vorhandene Tiles einsammeln ----
# files = glob.glob(os.path.join(TILES_DIR, "[0-9][0-9][0-9][0-9]", "[0-9][0-9][0-9][0-9].png"))
# files = glob.glob(os.path.join(TILES_DIR, "0001", "[0-9][0-9][0-9][0-9].png"))
files = glob.glob(os.path.join(TILES_DIR, "0000", "000[0-9].png"))
coords = []
rx = re.compile(r"([0-9]{4})/([0-9]{4})\.png$")
for p in files:
    m = rx.search(p.replace("\\", "/"))
    if not m: 
        continue
    y = int(m.group(1))
    x = int(m.group(2))
    coords.append((x, y, p))

if not coords:
    raise SystemExit("Keine Tiles gefunden.")

# Bounding Box (nur der belegte Bereich)
min_x = min(x for x,_,_ in coords)
max_x = max(x for x,_,_ in coords)
min_y = min(y for _,y,_ in coords)
max_y = max(y for _,y,_ in coords)

width  = (max_x - min_x + 1) * TILE_SIZE
height = (max_y - min_y + 1) * TILE_SIZE

print(f"Erstelle Weltkarte {width}x{height} Pixel, {len(coords)} Tiles")

# Leere, transparente Leinwand (RGBA)
canvas = pyvips.Image.black(width, height, bands=4)

print("Tiles werden eingefügt...")

# Tiles einfügen (streamend, ohne Expand)
for x, y, path in coords:
    left = (x - min_x) * TILE_SIZE
    top  = (y - min_y) * TILE_SIZE

    tile = pyvips.Image.new_from_file(path, access='sequential')

    # Auf RGBA normalisieren (Alpha=255, falls nicht vorhanden)
    if not tile.hasalpha():
        tile = tile.addalpha()

    # Falls die PNGs nicht exakt TILE_SIZE sind (z.B. Randkacheln), sicherheitshalber einbetten
    if tile.width != TILE_SIZE or tile.height != TILE_SIZE:
        tile = tile.embed(0, 0, TILE_SIZE, TILE_SIZE)

    canvas = canvas.insert(tile, left, top, expand=False)

    if x == 0:
        print(f"  {y:04d} {x:04d} {path}")

print("Canvas speichern...")

# DeepZoom/Google Tiles schreiben (leere Kacheln auslassen)
# skip_blanks: 0 = nur exakt Hintergrund; default in 'google' ist 5
canvas.dzsave(
    OUT_DIR,
    layout="google",
    tile_size=TILE_SIZE,
    overlap=0,
    suffix=".png",
    background=[0, 0, 0, 0],
    skip_blanks=0
)
