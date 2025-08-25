export GDAL_CACHEMAX=2000 # per-process cache; default is a % of RAM if not set.  [oai_citation:5‡CRAN](https://cran.r-project.org/web/packages/gdalraster/vignettes/gdal-config-quick-ref.html?utm_source=chatgpt.com)
export GDAL_NUM_THREADS=ALL_CPUS # enable multithreading where supported

# Slice tiles. Use --xyz for Google/OSM layout, choose your tile size.
# gdal2tiles --resampling=near --zoom=6-10 --profile=raster --xyz  --tilesize=1000 --processes=20  --tiledriver=PNG -x  mosaic.vrt ../public/tiles/

gdal2tiles --resampling=near --zoom=0-5 --profile=raster --xyz  --tilesize=1000 --processes=20  --tiledriver=PNG -x  mosaic.vrt ../public/tiles/
