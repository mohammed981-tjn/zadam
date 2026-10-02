"""
ظلال التضاريس لخرائط السودان — صورةٌ واحدة تُرسم فوق الطبقات.

The owner, 25 September (backlog 45): the maps lacked «احترافية وجمالية»,
and the brief included relief shading. The maps are drawn from vectors —
borders, rivers, smooth data bands — and the interior of Sudan was flat white:
Jebel Marra, the Red Sea Hills and the Nuba Mountains were invisible.

This builds public/maps/sudan-relief.webp: a grey hillshade of the whole map
frame (21–39.5°E, 8–24°N) in the maps' own projection (plate carrée with the
x axis shrunk by cos 16°, as in src/components/RainMap.tsx), white where the
ground is flat or lit and darker on the slopes facing away from a light in the
north-west. The maps lay it over their colours with `mix-blend-mode:
multiply`, so white changes nothing and the shading darkens whatever is under
it — the standard way relief goes under thematic colour without hiding it.

Elevation: the AWS Terrain Tiles (Terrarium encoding), open data assembled by
Mapzen from SRTM, GMTED2010, ETOPO1 and others, read at zoom 7 (about 1.1 km a
pixel at 15°N) — finer than a 1000-pixel image of the country can show. The
sea is left white.

Run once; the image is committed. Re-run only if the frame changes:
    python3 scripts/build-sudan-relief.py
"""
import io
import math
import urllib.request

import numpy as np
from PIL import Image

WEST, SOUTH, EAST, NORTH = 21.0, 8.0, 39.5, 24.0
KX = math.cos(math.radians(16))
OUT_W = 1000
OUT_H = round(OUT_W * (NORTH - SOUTH) / ((EAST - WEST) * KX))
Z = 7
TILE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
OUT = "public/maps/sudan-relief.webp"

# Light from the north-west, 45° up; relief exaggerated because at this scale
# Sudan's hills are a few pixels wide and would barely register at 1× (tried:
# at 6× only the Ethiopian highlands showed).
AZIMUTH, ALTITUDE, EXAGGERATION = 315.0, 45.0, 22.0


def tile_xy(lon, lat):
    n = 2 ** Z
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n


def mosaic():
    x0, y0 = (int(v) for v in tile_xy(WEST, NORTH))
    x1, y1 = (int(v) for v in tile_xy(EAST, SOUTH))
    rows = []
    for ty in range(y0, y1 + 1):
        row = []
        for tx in range(x0, x1 + 1):
            with urllib.request.urlopen(TILE.format(z=Z, x=tx, y=ty), timeout=60) as r:
                a = np.asarray(Image.open(io.BytesIO(r.read())).convert("RGB")).astype(np.float64)
            row.append(a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768)
        rows.append(np.hstack(row))
    return np.vstack(rows), x0, y0


def blur(a, sigma):
    """Separable Gaussian, edges held."""
    r = int(3 * sigma)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    a = np.pad(a, r, mode="edge")
    a = np.apply_along_axis(lambda v: np.convolve(v, k, "valid"), 1, a)
    return np.apply_along_axis(lambda v: np.convolve(v, k, "valid"), 0, a)


def main():
    dem, x0, y0 = mosaic()
    # Sample the Mercator mosaic at the centre of every output pixel (bilinear).
    lon = WEST + (np.arange(OUT_W) + 0.5) / OUT_W * (EAST - WEST)
    lat = NORTH - (np.arange(OUT_H) + 0.5) / OUT_H * (NORTH - SOUTH)
    n = 2 ** Z
    px = ((lon + 180) / 360 * n - x0) * 256 - 0.5
    py = ((1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n - y0) * 256 - 0.5
    PX, PY = np.meshgrid(px, py)
    i0 = np.clip(np.floor(PX).astype(int), 0, dem.shape[1] - 2)
    j0 = np.clip(np.floor(PY).astype(int), 0, dem.shape[0] - 2)
    fx, fy = PX - i0, PY - j0
    z = (dem[j0, i0] * (1 - fx) * (1 - fy) + dem[j0, i0 + 1] * fx * (1 - fy)
         + dem[j0 + 1, i0] * (1 - fx) * fy + dem[j0 + 1, i0 + 1] * fx * fy)

    # A light blur first: at 22× the DEM's own noise would otherwise draw as
    # grain across the flat plains.
    z = blur(z, 1.2)

    # Ground distance of one output pixel, in metres.
    dx = (EAST - WEST) / OUT_W * 111_320 * np.cos(np.radians(lat))[:, None]
    dy = (NORTH - SOUTH) / OUT_H * 110_574
    gy, gx = np.gradient(z * EXAGGERATION)
    slope = np.arctan(np.hypot(gx / dx, gy / dy))
    aspect = np.arctan2(-gx / dx, gy / dy)
    az, alt = math.radians(AZIMUTH), math.radians(ALTITUDE)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)

    # Multiply layer: flat ground is white (changes nothing), slopes darken.
    flat = math.sin(alt)
    v = np.clip(shade / flat, 0, 1)
    v = 1 - (1 - v) * 0.75
    v[z <= 0] = 1.0  # the sea
    Image.fromarray((v * 255).round().astype(np.uint8), "L").save(OUT, quality=80, method=6)  # ~57 KB
    print(OUT, OUT_W, OUT_H, f"elevation {z.min():.0f}–{z.max():.0f} m")


if __name__ == "__main__":
    main()
