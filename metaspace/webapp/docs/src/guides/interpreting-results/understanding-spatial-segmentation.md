# Understanding Spatial Segmentation

::: tip METASPACE Pro
Only available for METASPACE Pro users.
:::

## How it works

Spatial segmentation partitions the tissue section into molecularly distinct regions. It works in three steps. First, PCA reduces the ion intensity matrix to its principal patterns, summarising the molecular variation across all annotated ions into a compact set of axes. Second, a spatial structure filter discards any axes where neighbouring pixels do not tend to share similar values, removing patterns driven by technical acquisition variation rather than tissue biology. Third, a Gaussian Mixture Model (GMM) clusters pixels based on their chemical profiles in the remaining spatially coherent axes. The optimal number of segments is selected automatically using the Bayesian Information Criterion (BIC), and each pixel is assigned a confidence score reflecting how clearly it belongs to its segment. The method uses annotations rather than raw spectra as its features, which keeps the signal biologically interpretable.

## Where to find it

Segmentation results are displayed as an interactive overlay directly on the dataset viewer, replacing the standard ion image view. The segment map appears once processing completes, with each colour representing a distinct molecular region.

## How to read it

### The segment map

Each colour on the map corresponds to one molecularly distinct region. The boundaries between colours reflect where the chemical composition of the tissue shifts meaningfully, not where it merely looks different visually. Clicking any segment on the map selects it and updates the collapsible panel below.

<!-- ![Selected segment with marker ions](/screenshots/segmentation-selected-segment.png) -->
<!-- _A selected segment with the marker ion panel open, showing the top ions that define that region. Source: [dataset](#)_ -->

The collapsible panel shows the top marker ions for the selected segment, ranked by how strongly each ion is enriched in that segment relative to the rest of the tissue. Browsing the marker ions is the primary way to assign biological meaning to each segment.

### The BIC curve

The BIC curve is only shown in the diagnostics panel when the number of segments was determined automatically. If you specified k explicitly when running the segmentation, this panel is not displayed.

When shown, the BIC curve scores each candidate k: lower values indicate a better balance between fit and complexity. The selected k is the point of diminishing returns on the curve, where adding one more segment stops meaningfully improving the fit. The curve typically continues declining past the selected k, so the selection is not the lowest point on the curve.

<!-- ![BIC curve with callouts](/screenshots/segmentation-bic-curve.png) -->
<!-- _BIC curve: ① the selected k at the elbow of the curve, ② the point where the curve levels off. Source: [dataset](#)_ -->

A curve that drops sharply and then levels off indicates a clean separation between tissue regions. A curve that continues declining gradually suggests more subtle molecular differences across the tissue. The selected k is the best automatic estimate, but you can override it on re-run if the biology suggests otherwise.

### The confidence score distribution

Each pixel is assigned a confidence score reflecting how clearly it belongs to its assigned segment versus neighbouring ones. Rather than displaying this per pixel, the diagnostics panel shows a **histogram of confidence scores across all pixels** in the dataset.

<!-- ![Confidence score histogram](/screenshots/segmentation-confidence-histogram.png)
_Confidence score histogram: ① high-confidence peak near 1.0, ② low-confidence tail near 0. Source: [dataset](#)_ -->

A histogram skewed toward 1 indicates that most pixels sit clearly within a single segment. A broad or bimodal distribution suggests many pixels near boundaries between segments, which is expected in tissues with gradual chemical transitions rather than sharp anatomical boundaries.

### The heatmap

The heatmap shows the top marker ions for each segment side by side. Each row is an ion and each column is a segment. The colour in each cell reflects how strongly that ion is associated with the segment relative to the other marker ions shown for that same segment. This makes it easy to spot ions that are highly specific to one segment versus those shared across several.

## Common patterns and pitfalls

- **More segments than expected**: this often reflects genuine sub-regional chemistry rather than over-fitting. Before concluding the result is too detailed, inspect the marker ions for each segment. Metabolically distinct sub-regions may not be visually distinguishable by morphology.
- **Very small segments (a handful of pixels)**: can indicate outlier pixels rather than a true biological region. Check whether these pixels form a spatially coherent cluster or are scattered across the tissue.
- **Low confidence across most of the tissue**: suggests the chemical differences between regions are gradual rather than sharp. The segment map is still informative, but boundaries should be interpreted as approximate.
- **Marker ions that don't make biological sense**: the algorithm finds structure in whatever features are present. If low-quality annotations (high FDR) were included, they can drive spurious segments. Consider re-running with a stricter FDR filter.
- **BIC curve with no clear elbow**: some tissues have a continuum of chemical variation rather than discrete zones. A flat BIC curve is informative in itself: it tells you that no single k captures the structure cleanly.