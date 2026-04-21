# Reference Peak Normalization

## What it is

Reference Peak Normalization rescales ion intensities across all pixels relative to a selected reference peak. This corrects for pixel-to-pixel signal variation caused by factors unrelated to biology, such as matrix heterogeneity, tissue thickness variation, or ion suppression, producing a more accurate and spatially comparable ion image.

## When to use it

- When your ion images show spatial intensity patterns you suspect reflect sample preparation artifacts rather than genuine biology.
- When you have a known internal standard or a stable endogenous peak that should be uniformly distributed across the tissue and can serve as a reliable normalization reference.

## How to use it

Here's a short video showing how to apply reference peak normalization:

<YouTubeEmbed id="vL-2kyTWj2U" />

## What results look like

Once a reference peak is selected, the Image Viewer re-renders each ion image as the intensity ratio of the displayed ion relative to that of the reference peak. The reference m/z value is shown alongside the **Normalize to this peak** toggle. As you browse different m/z values or formulas, all ion images continue to render as ratios to the same reference peak.

<SideBySide
  left="/screenshots/imzml-before-normalization.png"
  leftCaption="Before reference peak normalization"
  right="/screenshots/imzml-normalized-image.png"
  rightCaption="After reference peak normalization"
  source="https://metaspace2020.org/dataset/2023-06-27_22h57m11s/browser"
/>
