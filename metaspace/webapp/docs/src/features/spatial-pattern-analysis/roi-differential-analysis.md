# ROI Differential Analysis

## What it is

ROI Differential Analysis compares annotated ion intensities between two or more user-defined regions of interest, identifying which metabolites and lipids are enriched or depleted in one region relative to another.

For each annotated ion, the analysis computes two effect-size metrics: **log₂ fold change**, which quantifies the magnitude of the intensity difference, and **AUC** (area under the ROC curve), which reflects how well the ion discriminates between the two regions. Formal p-values are intentionally omitted: the spatial autocorrelation inherent in imaging MS data inflates false-positive rates when standard statistical tests are applied at the pixel level.

## When to use it

- When you want to compare the molecular composition of two tissue regions — for example, tumor core vs. surrounding stroma.
- When you want to find the marker ions that best distinguish one region from all others (one-vs-all mode).
- When you want to directly compare any two specific regions (pairwise mode).
- When you want to generate a ranked shortlist of candidate biomarkers for a region of interest.

## How to use it

Follow the steps in this video:

<YouTubeEmbed id="VIDEO_ID" />

## What results look like

Once the analysis is complete, you are taken to the results page. The ranked results table lists all annotated ions sorted by log₂ fold change and AUC.

<!-- Screenshots will be added when the feature is fully implemented -->
<!-- ! ![Ranked results table](/screenshots/roi-diff-results-table.png) -->
<!-- _Ions ranked by log₂ fold change and AUC between the selected ROIs. Source: [dataset](#)_
-->

The scatter plot shows log₂ fold change on the x-axis and AUC on the y-axis for each ROI. Ions in the top-right quadrant are both strongly enriched and highly discriminative. Clicking any point highlights the corresponding row in the results table.

<!-- Screenshots will be added when the feature is fully implemented -->
<!-- ![Fold change vs. AUC scatter plot](/screenshots/roi-diff-scatter-plot.png) -->
<!-- _Scatter plot of log₂ fold change (x-axis) against AUC (y-axis). Ions in the top-right quadrant are both strongly enriched and highly discriminative. Source: [dataset](#)_
-->

The heatmap shows the top differentially abundant ions across all ROIs simultaneously, making it easy to spot co-regulated ion groups and compare enrichment patterns across regions at a glance.

<!-- Screenshots will be added when the feature is fully implemented -->
<!-- ![Heatmap of top ions](/screenshots/roi-diff-heatmap.png) -->
<!-- _Heatmap showing relative intensity of the top-ranked ions across all defined ROIs simultaneously. Source: [dataset](#)_
-->

Selecting any ion from the table, scatter plot, or heatmap loads its ion image in the viewer with ROI boundaries superimposed, so you can visually confirm the spatial pattern behind the numbers.

<!-- Screenshots will be added when the feature is fully implemented -->
<!-- ![Ion image with ROI overlay](/screenshots/roi-diff-ion-image-overlay.png) -->
<!-- _Ion image viewer with ROI boundaries overlaid, allowing direct visual confirmation of the spatial pattern behind the results. Source: [dataset](#)_
-->

<!-- For an in-depth understanding of the results, see the [interpretation guide](link). -->
