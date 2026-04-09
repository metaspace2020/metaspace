# Understanding Spatial Segmentation

## What Was Computed

Spatial segmentation partitions the tissue section into molecularly distinct regions by applying PCA followed by a Gaussian Mixture Model (GMM) to the annotated ion intensity matrix. PCA reduces the high-dimensional feature space to a manageable number of components, and GMM identifies clusters of pixels whose chemical profiles are best explained by a set of Gaussian distributions. The optimal number of segments is selected automatically using the Bayesian Information Criterion (BIC). Each pixel is then assigned to a segment along with a confidence score reflecting the certainty of that assignment. The method accounts for the fact that annotations — not raw spectra — are used as features, which keeps the signal biologically interpretable.

## Where to Find It

Segmentation results are displayed as an interactive overlay directly on the dataset viewer, replacing the standard ion image view. The segment map appears once processing completes, with each colour representing a distinct molecular region.

![Segment map on tissue](/screenshots/segmentation-map-tissue.png)
_Segment map overlaid on the tissue section, with a color legend identifying each molecular region. Source: [dataset](#)_

## How to Read It

### The Segment Map

Each colour on the map corresponds to one molecularly distinct region. The boundaries between colours reflect where the chemical composition of the tissue shifts meaningfully — not where it merely looks different visually. Clicking any segment on the map selects it and updates the collapsible panel below.

![Selected segment with marker ions](/screenshots/segmentation-selected-segment.png)
_A selected segment with the marker ion panel open, showing the top ions that define that region. Source: [dataset](#)_

The collapsible panel shows the top marker ions for the selected segment — the annotated metabolites and lipids most strongly associated with that region. These are the ions whose intensities best distinguish this segment from the rest of the tissue. Browsing the marker ions is the primary way to assign biological meaning to each segment.

### The BIC Curve

The BIC curve is only shown in the diagnostics panel when the number of segments was determined automatically. If you specified k explicitly when running the segmentation, this panel is not displayed.

When shown, the BIC curve scores each candidate k by balancing model fit against complexity — lower BIC is better.

![BIC curve with callouts](/screenshots/segmentation-bic-curve.png)
_BIC curve: ① the selected k at the lowest BIC, ② the point where the curve levels off. Source: [dataset](#)_

A curve that drops sharply and then levels off indicates a clean separation. A curve that continues declining gradually suggests more subtle sub-regional chemistry. The selected k is the best automatic estimate, but you can override it on re-run if the biology suggests otherwise.

### The Confidence Score Distribution

Each pixel is assigned a confidence score reflecting how clearly it belongs to its assigned segment versus neighbouring ones. Rather than displaying this per pixel, the diagnostics panel shows a **histogram of confidence scores across all pixels** in the dataset.

![Confidence score histogram](/screenshots/segmentation-confidence-histogram.png)
_Confidence score histogram: ① high-confidence peak near 1.0, ② low-confidence tail near 0. Source: [dataset](#)_

A histogram skewed toward 1 indicates that most pixels sit clearly within a single segment — the segmentation has found well-separated regions. A broad or bimodal distribution suggests many pixels near boundaries between segments, which is expected in tissues with gradual chemical transitions rather than sharp anatomical boundaries.

## Common Patterns and Pitfalls

- **More segments than expected** — this often reflects genuine sub-regional chemistry rather than over-fitting. Before concluding the result is too detailed, inspect the marker ions for each segment. Metabolically distinct sub-regions may not be visually distinguishable by morphology.
- **Very small segments (a handful of pixels)** — can indicate outlier pixels in feature space rather than a true biological region. Check whether these pixels form a spatially coherent cluster or are scattered across the tissue.
- **Low confidence across most of the tissue** — suggests the chemical differences between regions are gradual rather than sharp. The segment map is still informative, but boundaries should be interpreted as approximate.
- **Marker ions that don't make biological sense** — the algorithm finds structure in whatever features are present. If low-quality annotations (high FDR) were included, they can drive spurious segments. Consider re-running with a stricter FDR filter.
- **BIC curve with no clear elbow** — some tissues have a continuum of chemical variation rather than discrete zones. A flat BIC curve is informative in itself — it tells you that no single k captures the structure cleanly.