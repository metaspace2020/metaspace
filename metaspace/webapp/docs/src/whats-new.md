---
sidebar: false
---

# What's new

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
