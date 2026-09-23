# ROI Selection

## What it is

ROI Selection lets you draw and label regions of interest directly on the ion image viewer. Each ROI defines a spatial boundary around a tissue area you want to isolate for exploration, comparison, or use as input for downstream differential analysis.

## When to use it

- When you have prior knowledge of tissue structure and want to define regions based on histology or an overlaid optical image.
- When you want to isolate a specific area, such as a tumor core, a tissue layer, or an anatomical structure — for focused exploration.
- When you want to compare regions you have defined yourself, rather than relying on data-driven segmentation.

## How to use it

Here's a short video showing how to manually select and define ROIs:

<YouTubeEmbed id="DhvorRuxqC4" />

## What results look like

Drawn ROIs appear as labeled boundary overlays on the ion image viewer, each outlined in a distinct color. All defined ROIs are listed in the ROI panel alongside the viewer, where each region can be renamed, recolored, or removed.

![ROI boundaries on ion image](/screenshots/roi-selection-boundaries.png)
_Ion image viewer with multiple ROI boundaries drawn and color-coded, and the ROI panel listing each region with its label and edit controls. Source: [dataset](https://metaspace2020.org/dataset/2021-12-10_00h52m21s/)_

## Exporting and importing ROIs

Alongside Save, the ROI panel has two more icons for moving ROI shapes in and out of METASPACE as GeoJSON files.

- **Export** downloads all currently listed ROIs as a single `.geojson` file. Coordinates are in ion-image pixel space (column, row), not a geographic coordinate system — the file is meant for re-importing into METASPACE or for use in tools that work with raw pixel polygons, not for viewing on a map.
- **Import** reads a `.geojson` file and adds its regions to the ROI panel alongside any existing ROIs — it never replaces or removes what's already there. Before anything is added, METASPACE checks the file against the dataset: every ROI must fit inside this dataset's ion-image pixel grid, and if the file was exported from METASPACE, its recorded image size must match the current dataset's exactly. A file that doesn't line up is rejected with an explanation instead of being partially imported, since a mismatched region would be showing the wrong tissue area. Imported ROIs behave exactly like hand-drawn ones — rename, recolor, hide, or remove them the same way.

This also means ROIs can be shared between people or moved between two processing runs of the *same* dataset, as long as the ion-image dimensions haven't changed.
