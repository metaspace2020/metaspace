# Spatial Segmentation

::: tip METASPACE Pro
Only available for METASPACE Pro users.
:::

## What it is

Spatial Segmentation automatically partitions every pixel in your dataset into chemically coherent tissue regions, without requiring manual ROI drawing or prior knowledge of how many regions exist. The algorithm identifies groups of pixels that share similar molecular profiles across all annotated ions.

## When to use it

- When you want to explore an unfamiliar tissue without prior knowledge of its molecular landscape.
- When you want to identify tissue regions (such as tumor margins, infiltration zones, or tissue layers) based on metabolite co-localization rather than histology.
- When you want to generate data-driven ROIs as the starting point for downstream differential analysis.
- When you want to validate or challenge histology-based tissue boundaries using molecular evidence.
- When you want a rapid molecular summary of a dataset, particularly during quality assessment of a new sample batch.

## How to use it

Follow the steps in this video:

<YouTubeEmbed id="DBaTpDQmJtM" />

## What results look like

Once processing completes, the results open on a dedicated results page. Each color in the segmentation map represents a distinct molecular region identified from the data.

![Spatial segmentation results page](/screenshots/spatial-seg-results-page.png)
_Spatial segmentation results page, with each color representing a distinct molecular region. Source: [dataset](https://metaspace2020.org/dataset/2021-12-10_00h52m21s)_

The cluster markers panel lets you choose any cluster using the cluster selector and displays its top marker ions, ranked by how strongly each is enriched in that region, along with their ion images.

A heatmap provides a side-by-side view of the top marker ions across all clusters, making it easy to spot which ions are specific to one cluster and which appear across several.

The diagnostics panel shows a confidence score histogram reflecting how clearly each pixel belongs to its cluster. When you let the algorithm choose the number of clusters automatically, it also shows the BIC curve used to make that selection. For a detailed explanation of both, see the [interpretation guide](/guides/interpreting-results/understanding-spatial-segmentation).
