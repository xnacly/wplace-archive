# make_rgba_vrt.py
import os, xml.etree.ElementTree as ET

BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
TILES_DIR = os.path.join(BASE_DIR, "..", "tiles")   # tiles/YYYY/XXXX.png (4-digit padded)
TILE      = 1000
N_X, N_Y  = 2048, 2048
W, H      = N_X * TILE, N_Y * TILE

vrt = ET.Element("VRTDataset", rasterXSize=str(W), rasterYSize=str(H))
ET.SubElement(vrt, "GeoTransform").text = "0,1,0,0,0,1"  # pixel space

# Declare 4 bands (RGBA) so empty areas default to alpha=0 (transparent)
names = ["Red", "Green", "Blue", "Alpha"]
bands = []
for i, name in enumerate(names, 1):
    b = ET.SubElement(vrt, "VRTRasterBand", dataType="Byte", band=str(i))
    ci = ET.SubElement(b, "ColorInterp")
    ci.text = name
    bands.append(b)

for y in range(N_Y):
    rowdir = os.path.join(TILES_DIR, f"{y}")
    if not os.path.isdir(rowdir):
        continue
    for x in range(N_X):
        fn = os.path.join(rowdir, f"{x}.png")
        if not os.path.exists(fn):
            continue
        rel = os.path.relpath(fn, start=os.path.dirname(os.path.abspath("mosaic.vrt")))
        # Expand palette -> RGBA on-the-fly
        src = f"vrt://{rel}?expand=rgba"
        for bi in range(4):
            ss = ET.SubElement(bands[bi], "SimpleSource")
            ET.SubElement(ss, "SourceFilename", relativeToVRT="1").text = src
            ET.SubElement(ss, "SourceBand").text = str(bi + 1)
            ET.SubElement(ss, "SrcRect", xOff="0", yOff="0", xSize=str(TILE), ySize=str(TILE))
            ET.SubElement(ss, "DstRect",
                          xOff=str(x * TILE), yOff=str(y * TILE),
                          xSize=str(TILE), ySize=str(TILE))

ET.ElementTree(vrt).write("mosaic.vrt")
print("wrote mosaic.vrt")
