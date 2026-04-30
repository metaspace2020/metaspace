# Spatial Segmentation

## What it is

Spatial Segmentation automatically partitions every pixel in your dataset into chemically coherent tissue regions, without requiring manual ROI drawing or prior knowledge of how many regions exist. The algorithm identifies groups of pixels that share similar molecular profiles across all annotated ions.

## When to use it

- When you want to explore an unfamiliar tissue without prior knowledge of its molecular landscape.
- When you want to identify tissue regions — such as tumor margins, infiltration zones, or tissue layers — based on metabolite co-localization rather than histology.
- When you want to generate data-driven ROIs as the starting point for downstream differential analysis.
- When you want to validate or challenge histology-based tissue boundaries using molecular evidence.
- When you want a rapid molecular summary of a dataset, particularly during quality assessment of a new sample batch.

## How to use it

Follow the steps in this video:

<YouTubeEmbed id="VIDEO_ID" />

## What results look like

Once processing completes, the results are displayed as an interactive overlay on the dataset viewer. Each color in the segment map represents a distinct molecular region identified from the data.

<!-- ![Segment map overlay](/screenshots/spatial-seg-map-overlay.png) -->
<!-- _Spatial segmentation map overlaid on the tissue section, with each color representing a distinct molecular region. Source: [dataset](#)_ -->

Clicking any segment on the map opens a collapsible panel listing the top marker ions for that segment — the annotated metabolites and lipids most strongly associated with that region — along with their ion images.

<!-- ![Marker ion images panel](/screenshots/spatial-seg-marker-ions.png) -->
<!-- _Collapsible panel showing the top marker ion images for the selected segment. Source: [dataset](#)_ -->

The diagnostics panel shows the BIC curve used to determine the optimal number of segments. The curve drops steeply and then levels off, with the optimal segment count selected at the point of diminishing returns.

<!-- ![BIC curve](/screenshots/spatial-seg-bic-curve.png) -->
<!-- _BIC curve used to determine the optimal number of segments (k), with the selected value at the point of diminishing returns. Source: [dataset](#)_ -->

Each pixel is assigned a confidence score reflecting how clearly it belongs to its segment versus neighboring ones. The confidence map highlights well-defined regions in stronger colors and ambiguous boundary pixels in lighter tones.

<!-- ![Confidence map overlay](/screenshots/spatial-seg-confidence-map.png) -->
<!-- _Confidence map overlay showing per-pixel assignment certainty — stronger colors for well-defined regions, lighter tones near segment boundaries. Source: [dataset](#)_ -->

<!-- For an in-depth understanding of the results, see the [interpretation guide](link). -->
