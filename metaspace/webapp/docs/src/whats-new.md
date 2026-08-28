---
sidebar: false
---

# What's new
## August 2026

### Cross-dataset statistical analysis (Pro)

A new Pro feature for comparing molecular abundance across datasets is now documented, alongside a reorganized sidebar section for it.

**Features**
- [Cross-Dataset Statistical Analysis](/features/cross-dataset-comparison/cross-dataset-statistical-analysis) — builds an Experiment from regions (ROIs, segmentation clusters, or whole datasets) across multiple datasets, tagged with sample metadata, and tests differential ion abundance between conditions using a limma-based moderated statistical model — robust even with as few as 3 replicates per condition
- Existing [Multi-Dataset Comparison](/features/cross-dataset-comparison/multi-dataset-comparison) page moved from Visualization into a new **Cross-Dataset Comparison** category, alongside the new feature

**Interpretation guide**
- [Understanding Cross-Dataset Statistical Results](/guides/interpreting-results/understanding-cross-dataset-statistical-results) — explains why limma is used instead of a plain t-test or Wilcoxon test, how empirical Bayes moderation and replicate correlation work conceptually, how to read omnibus vs. pairwise results, and what each design warning means

### RMS and median normalization

The TIC normalization checkbox in the ion image viewer has been replaced by a **Normalization** dropdown offering three per-pixel methods. TIC remains the most commonly used option and the recommended starting point.

**Features**
- RMS and median normalization added alongside TIC, selectable from the normalization dropdown on the annotation page
- Normalization is also available on the multi-dataset comparison page
- Datasets processed before this release need to be reprocessed for RMS and median to become available

**Documentation**
- [Ion image visualization](/features/visualization/ion-image-visualization) updated to describe the normalization dropdown and each method

## June 2026

### Spatial pattern analysis (Pro)

Two new Pro features for spatial pattern analysis are now documented.

**Features**
- [Spatial Segmentation](/features/spatial-pattern-analysis/spatial-segmentation) — automatically partitions dataset pixels into chemically coherent tissue regions without manual ROI drawing; includes cluster markers panel, heatmap, and diagnostics
- [ROI Differential Analysis](/features/spatial-pattern-analysis/roi-differential-analysis) — identifies metabolites enriched or depleted in a selected ROI vs. all other regions, using log₂ fold change and AUC as effect-size metrics

**Interpretation guides**
- [Understanding Spatial Segmentation](/guides/interpreting-results/understanding-spatial-segmentation) — explains BIC-based cluster selection, confidence scores, and how to read the diagnostics panel
- [Understanding Differential Analysis](/guides/interpreting-results/understanding-differential-analysis) — explains the ranked results table, LogFC × AUC plot, and heatmap; covers why p-values are omitted in favor of AUC

## May 2026

### Stable-isotope labeling in custom databases

**Features**
- [Custom Databases](/features/tools-and-integrations/custom-databases#isotope-labeled-compounds) — custom databases now support stable-isotope labeled compounds; encode labeled atoms with pseudo-element symbols (`Cx`, `Nx`, `Hx`, `Ox`, `Sx`) directly in the `formula` column for ¹³C, ¹⁵N, ²H, ¹⁸O, and ³⁴S tracing experiments


## April 2026

### Documentation site launch

This is the first release of the METASPACE documentation site. It covers the core platform features, interpretation guides, and submission workflows.

**Getting started**
- Overview of the platform and a typical METASPACE workflow
- Dataset organization with groups, members, and projects

**Features**
- Ion image visualization, multi-channel viewer, and optical image overlay
- Multi-dataset comparison
- ROI selection for spatial pattern analysis
- Sharing and publishing datasets and projects
- Custom databases, METASPACE Converter, Detectability App, and Python Client
- imzML Browser: spectral visualization and reference peak normalization

**Interpretation guides**
- Understanding the annotation page, MSM scoring, and FDR
- Off-sample filtering
- Colocalization

**Submission guides**
- Exporting data to imzML format
- The upload page walkthrough
- Metadata recommendations
