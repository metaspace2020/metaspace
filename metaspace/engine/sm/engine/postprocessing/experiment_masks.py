"""Region-mask rasterisation helpers for experiment PREP.

Pure functions (numpy + PIL only) — no DB, no I/O. Coordinate convention
mirrors metaspace/engine/sm/rest/diff_roi_manager.py:189: ROI polygons
use ``feature.properties.coordinates`` as a list of ``{x, y}`` dicts in
ion-image pixel space; segmentation label maps store one int per pixel
where the int is the cluster ``segment_index``.
"""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

import numpy as np
from PIL import Image, ImageDraw


def rasterise_roi_mask(
    geojson: Dict[str, Any], roi_id: int, width: int, height: int
) -> Optional[np.ndarray]:
    """Return an HxW uint8 mask for ``roi_id`` from a GeoJSON object.

    Accepts either a single ``Feature`` (the production shape stored in
    ``public.roi.geojson``) or a ``FeatureCollection``. Polygon vertices
    are read from ``properties.coordinates`` (a list of ``{x, y}`` dicts,
    matching the persisted shape used by the webapp ROI editor).

    For a FeatureCollection the feature whose ``properties.id`` matches
    ``roi_id`` is selected; for a bare Feature the ``roi_id`` filter is
    not applied (caller already located the feature by primary key).

    A vertex whose ``x``/``y`` is missing or ``null`` is read as 0 (see
    ``_vertex``). Returns ``None`` if no usable feature is found.
    """
    features = _features_from_geojson(geojson, roi_id)
    if not features:
        return None
    feature = features[0]
    props = feature.get('properties') or {}
    coords = props.get('coordinates') or _coords_from_geometry(feature.get('geometry'))
    if not coords:
        return np.zeros((height, width), dtype=np.uint8)
    img = Image.new('L', (width, height), 0)
    ImageDraw.Draw(img).polygon([_vertex(c) for c in coords], fill=1)
    return np.array(img, dtype=np.uint8)


def _vertex(coord: Dict[str, Any]) -> Tuple[int, int]:
    """Read an ``{x, y}`` vertex, treating a missing/null axis as 0.

    The webapp ROI editor used to serialise vertices with ``coord.y || coord[1]``,
    so a vertex on the image edge (``y == 0``) was persisted as ``{"x": N}`` (key
    dropped by JSON.stringify) and as ``[N, null]`` in ``geometry.coordinates``.
    Such rows still exist, and the only value that can go missing that way is 0.
    """
    return int(coord.get('x') or 0), int(coord.get('y') or 0)


def _features_from_geojson(geojson: Dict[str, Any], roi_id: int) -> list:
    if geojson.get('type') == 'FeatureCollection' or 'features' in geojson:
        return [
            f
            for f in (geojson.get('features') or [])
            if (f.get('properties') or {}).get('id') == roi_id
        ]
    if geojson.get('type') == 'Feature':
        return [geojson]
    return []


def _coords_from_geometry(geometry: Optional[Dict[str, Any]]) -> list:
    """Fall back to GeoJSON ``geometry.coordinates`` when properties lack them."""
    if not geometry or geometry.get('type') != 'Polygon':
        return []
    rings = geometry.get('coordinates') or []
    if not rings:
        return []
    return [{'x': pt[0], 'y': pt[1]} for pt in rings[0]]


def rasterise_segmentation_mask(label_map: np.ndarray, segment_index: int) -> np.ndarray:
    """Return ``label_map == segment_index`` as a uint8 mask."""
    return (label_map == segment_index).astype(np.uint8)


def rasterise_whole_mask(tic_image: np.ndarray) -> np.ndarray:
    """Return the foreground (TIC > 0) mask as uint8."""
    return (tic_image > 0).astype(np.uint8)
