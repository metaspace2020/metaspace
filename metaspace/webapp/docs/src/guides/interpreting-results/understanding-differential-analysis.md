# Understanding ROI Differential Analysis

## What Was Computed

For each annotated ion, METASPACE computes two metrics that together quantify how its spatial distribution differs between your focal ROI and the comparison region: **log₂ fold change** (the ratio of mean intensities between regions) and **AUC** (the area under the ROC curve, measuring how consistently the ion is higher in the focal ROI across all pixel pairs). These metrics are used instead of p-values because pixels in imaging MS data are spatially autocorrelated — neighbouring pixels share signal and are not independent observations — making standard statistical tests unreliable. The AUC metric was inspired by the effect size approach for pairwise comparisons described in the [OSCA single-cell analysis book](https://bioconductor.org/books/3.13/OSCA.basic/marker-detection.html#effect-sizes-for-pairwise-comparisons), adapted from the scran R package.

## Where to Find It

Once the analysis completes, you are redirected to a dedicated results page. The page contains four interconnected components: a ranked results table, a scatter plot, a heatmap, and an ion image viewer.

![Differential analysis results layout](/screenshots/diff-analysis-layout.png)
_Results page layout: ① ranked table, ② scatter plot, ③ heatmap, ④ ion image viewer. Source: [dataset](#)_

## How to Read It

### The Ranked Results Table

The table lists all annotated ions sorted by log₂ fold change and AUC by default. Each row shows the ion's formula, adduct, and both metrics for each ROI.

![Results table](/screenshots/diff-analysis-table.png)
_Results table with ① the log₂ fold change column and ② the AUC column highlighted. Source: [dataset](#)_

The two metrics measure different things and can sometimes point in different directions:

- **Log₂ fold change** answers: _how much higher is the mean intensity?_ A value of 1 means twice as high; 2 means four times as high. Negative values indicate depletion in the focal ROI relative to the comparison.
- **AUC** answers: _how consistently higher is it?_ An AUC of 1 means every pixel in the focal ROI outranks every pixel in the comparison. AUC of 0.5 means no discriminative power. Values below 0.5 indicate the ion is consistently lower in the focal ROI.

For a confident hit, you want both to agree — high fold change and high AUC. When they disagree, read the combination: a high fold change with low AUC often means a few bright pixels in the ROI are driving the average rather than a genuine region-wide enrichment. A high AUC with modest fold change suggests a consistent but subtle enrichment spread across many pixels.

### The Scatter Plot

The scatter plot shows log₂ fold change on the x-axis and AUC on the y-axis, with one point per ion per ROI. Ions in the top-right quadrant are both strongly enriched and highly discriminative — these are your strongest candidates for region-specific markers.

![Fold change vs. AUC scatter plot](/screenshots/diff-analysis-scatter.png)
_Scatter plot: ① top-right quadrant (strong enrichment, high AUC), ② ions near the x-axis (fold change without consistent discriminability), ③ selected ion highlighted. Source: [dataset](#)_

Clicking any point in the scatter plot highlights the corresponding ion in the results table and loads its ion image in the viewer.

### The Heatmap

The heatmap shows the top differentially abundant ions across all ROIs simultaneously. Each row is an ion, each column is an ROI, and the colour encodes the metric value. This view is most useful when you have three or more ROIs and want to see which ions are co-regulated across regions and which are specific to just one.

![Differential analysis heatmap](/screenshots/diff-analysis-heatmap.png)
_Heatmap: ① ions specific to one ROI, ② ions enriched across multiple ROIs, ③ depleted ions. Source: [dataset](#)_

### The Ion Image Viewer

Selecting any ion from the table, scatter plot, or heatmap loads its ion image in the viewer with the ROI boundaries superimposed. This is the ground truth check — always visually confirm that the spatial pattern behind the numbers matches what you expect biologically before drawing conclusions.

![Ion image with ROI boundaries](/screenshots/diff-analysis-ion-image.png)
_Ion image viewer with ROI boundaries overlaid on the selected ion — the ground truth check before drawing conclusions. Source: [dataset](#)_

## Common Patterns and Pitfalls

- **High fold change, low AUC** — a few pixels with very high intensity inside the ROI are inflating the mean. Look at the ion image to check whether this is a genuine biological hotspot or a noise artifact.
- **High AUC, modest fold change** — the ion is consistently enriched across pixels but the magnitude is small. These ions can still be biologically meaningful, particularly for subtle tissue differences.
- **All ions showing high fold change in one ROI** — check whether that ROI is very small. Very small ROIs can produce inflated fold changes driven by sparse but high-intensity pixels rather than true region-wide enrichment.
- **Heatmap with no clear pattern** — if no ions cluster by ROI in the heatmap, the molecular differences between your ROIs may be subtle. Consider whether the ROI boundaries were drawn in biologically meaningful locations, or whether the FDR threshold is too strict and is excluding relevant annotations.
- **Fold change without biological meaning** — fold change is computed on raw annotation intensities, which are not normalized across the whole tissue. An ion that appears enriched in one ROI may partly reflect local ionization efficiency differences rather than true biological variation. Always interpret results in the context of the ion image.