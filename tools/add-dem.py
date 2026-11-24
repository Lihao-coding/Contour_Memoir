"""Attach a local georeferenced DEM to a Trail JSON route exported by the app."""
import argparse
import base64
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject

METRES_PER_DEGREE = math.pi * 6371008.8 / 180


def make_terrain(dem, bounds, crs, grid, attribution, coastal):
    west, south, east, north = bounds
    dx, dy = (east - west) / (grid - 1), (north - south) / (grid - 1)
    transform = from_bounds(west - dx / 2, south - dy / 2, east + dx / 2, north + dy / 2, grid, grid)
    heights = np.full((grid, grid), np.nan, dtype=np.float32)
    with rasterio.open(dem) as dataset:
        if not dataset.crs:
            raise ValueError("GeoTIFF is missing a coordinate reference system")
        reproject(rasterio.band(dataset, 1), heights, dst_transform=transform, dst_crs=crs,
                  dst_nodata=np.nan, resampling=Resampling.bilinear)
    if not np.isfinite(heights).all():
        raise ValueError("GeoTIFF does not fully cover the route terrain extent")
    if coastal:
        heights = np.maximum(heights, 0)
    low, high = float(heights.min()), float(heights.max())
    if high <= low:
        high = low + 1
    encoded = np.rint((heights - low) / (high - low) * 65535).astype("<u2").tobytes()
    return {"grid": grid, "min": low, "max": high, "heights": base64.b64encode(encoded).decode(),
            "attribution": attribution, "coastal": coastal}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("route", type=Path)
    parser.add_argument("dem", type=Path, help="Elevation GeoTIFF with heights in metres")
    parser.add_argument("output", type=Path)
    parser.add_argument("--grid", type=int, default=192)
    parser.add_argument("--attribution", required=True)
    parser.add_argument("--coastal", action="store_true", help="Enable the sea-level water material")
    args = parser.parse_args()

    if not 2 <= args.grid <= 512 or not 1 <= len(args.attribution.strip()) <= 300:
        parser.error("Grid must be between 2 and 512 and attribution must be 1–300 characters")
    route = json.loads(args.route.read_text())
    frame = route.get("frame")
    if route.get("version") != 1 or not frame:
        parser.error("Use a version 1 route exported from a GPX import with a geographic frame")
    lat, lon = frame["lat"], frame["lon"]
    width, depth = route["size"]
    dx = width / (2 * METRES_PER_DEGREE * math.cos(math.radians(lat)))
    dy = depth / (2 * METRES_PER_DEGREE)
    if not (-180 <= lon - dx < lon + dx <= 180):
        parser.error("Use a route grid that does not cross the antimeridian")
    route["terrain"] = make_terrain(args.dem, (lon - dx, lat - dy, lon + dx, lat + dy),
                                   "EPSG:4326", args.grid, args.attribution.strip(), args.coastal)
    with args.output.open("x", encoding="utf-8") as output:
        json.dump(route, output, ensure_ascii=False, separators=(",", ":"))
        output.write("\n")


if __name__ == "__main__":
    main()
