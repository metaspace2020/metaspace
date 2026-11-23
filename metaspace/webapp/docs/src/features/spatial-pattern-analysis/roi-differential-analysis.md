# ROI Differential Analysis

::: tip METASPACE Pro
Only available for METASPACE Pro users.
:::

## What it is

ROI Differential Analysis identifies which metabolites and lipids are enriched or depleted in each of your defined regions of interest relative to all other regions combined.

For each annotated ion, the analysis computes two effect-size metrics: **log₂ fold change**, which quantifies the magnitude of the intensity difference, and **AUC** (area under the ROC curve), which reflects how well the ion discriminates between the focal ROI and all other regions. Formal p-values are intentionally omitted: the spatial autocorrelation inherent in imaging MS data inflates false-positive rates when standard statistical tests are applied at the pixel level.

## Grouping ROIs

By default every ROI is compared against all the other ROIs combined. To compare groups of ROIs instead, click the **group** button in the ROI panel header (next to the download icon) to show the group view.

- **Create groups:** in the group view, add a group, then pick each ROI's group from its dropdown. Choose **No group** to take an ROI out of its group. You can rename, recolour, hide or remove a group.
- **Group view on:** ROIs in the same group are pooled into one region (for example, all infiltrated tumor regions) and drawn in the group's colour on the ion image. Each group is compared against all other groups combined. An ROI with no group is left out of the analysis, so you can exclude an ROI without deleting it.
- **Exactly two groups:** you get a single comparison, "first vs second", where positive values mean higher in the first group. The first group is the one that comes first alphabetically.
- **Group view off:** every ROI is compared against all other ROIs combined, as described above.

At least two groups with ROIs must exist to run the analysis in the group view (at least two ROIs when it is off). To compare two groups out of three or more, move the ROIs of the other groups to **No group** and run the analysis again. Only the latest run is kept.

The list of ROIs and each section of the group view (the group of each ROI, and the list of groups) can be collapsed with the arrows in the panel, to leave more of the ion image visible.

Groups are saved with the ROIs. They are written to the GeoJSON export when the group view is on, and are not restored when a GeoJSON file is imported: imported ROIs have no group.

## When to use it

- When you want to identify the molecular signature of a tissue region relative to its surroundings (for example, tumor core vs. the rest of the tissue).
- When you want to find the marker ions that best distinguish one region from all others.
- When you want to generate a ranked shortlist of candidate biomarkers for a region of interest.

## How to use it

Follow the steps in this video:

<YouTubeEmbed id="Y_NukUznWYQ" />

## What results look like

Once the analysis is complete, you are taken to the results page. It contains four interconnected components: a ranked results table, an ion image viewer, a LogFC x AUC plot, and a heatmap.

![Results page layout](/screenshots/diff-analysis-layout.png)
_Results page layout showing the ranked table, ion image viewer, LogFC x AUC plot, and heatmap._

For a detailed explanation of each component, see the [interpretation guide](/guides/interpreting-results/understanding-differential-analysis).
