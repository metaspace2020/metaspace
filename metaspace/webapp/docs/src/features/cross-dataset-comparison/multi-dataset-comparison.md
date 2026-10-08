# Multi-Dataset Comparison

## What it is

Multi-Dataset Comparison transforms the annotation page viewer into a grid where each panel represents a different dataset. For any selected annotation, you can view its ion image across all datasets simultaneously, alongside FDR values and links to the original annotation in each dataset.

## When to use it

In METASPACE, each dataset typically represents one sample or tissue section. Multi-Dataset Comparison is most useful when you have a project with multiple datasets and want to assess them together. Common use cases include:

- **Quality control:** Checking annotation coverage and FDR consistency across technical replicates. Large variation in FDR for the same ion across replicates may indicate a data quality issue in one or more datasets.

- **Biological comparison:** Comparing ion abundance and spatial distribution across experimental conditions (e.g., tumor vs. healthy, wild-type vs. mutant).

- **Public data exploration:** Comparing one of your datasets against a similar publicly available dataset from the METASPACE knowledgebase. Note that batch effects and other confounders can complicate direct quantitative comparisons between datasets from different studies.

## How to use it

Here's a step-by-step video showing how to use Multi-Dataset Comparison:
<YouTubeEmbed id="OMrlWUARPy8" />

## What results look like

The viewer displays a grid of panels, one per dataset, each showing the ion image for the currently selected annotation. If an annotation is not present in a given dataset at the selected FDR threshold, that panel appears empty. Above each ion image, the FDR value and a link to the original annotation page for that dataset are shown.

![Multi-dataset grid view](/screenshots/multi-dataset-grid.png)
_Grid view showing the same ion across all compared datasets, with FDR values and links above each panel. Source: [dataset](https://metaspace2020.org/datasets/2021-12-09_20h48m20s/comparison?db_id=19&viewId=gJRjfA14)_

The annotation table on the left includes additional columns summarizing results across all datasets, including the number of datasets the annotation was found in and the best FDR value observed across the comparison.

![Cross-dataset annotation table](/screenshots/multi-dataset-table.png)
_Annotation table with added columns summarizing the number of datasets the annotation was found in and the best FDR observed. Source: [dataset](https://metaspace2020.org/datasets/2021-12-09_20h48m20s/comparison?db_id=19&viewId=gJRjfA14)_