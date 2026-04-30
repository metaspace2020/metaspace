# Ion Image Visualization

## What it is

The ion image viewer on the annotation page includes a set of built-in tools for transforming and displaying ion image intensities. These tools allow you to adjust intensity scaling, apply TIC normalization, change the color map, and add a scale bar to the image.

Three scaling methods are available: **linear**, **logarithmic**, and **equalized histogram**. Each can be combined with hotspot removal, which clips outlier pixels to prevent a small number of high-intensity pixels from dominating the global intensity scale.

## When to use it

**TIC normalization** is the most commonly used and should be enabled by default for most datasets, as it corrects for pixel-to-pixel variation in total ion count.

**Intensity scaling** should be used with caution. Unless there is a specific reason to apply *logarithmic* or *equalized histogram* scaling, it is recommended to keep *linear scaling* and *enable hotspot clipping* instead. Aggressive scaling can obscure real intensity differences across the tissue.

**Color maps** can be changed freely based on preference or to improve contrast for a specific ion image.

## How to use it

Here's a short video showing how to access the ion image viewer settings:

<YouTubeEmbed id="rN2xaX6TsvI" />

Here's a short video showing how the interactive intensity slider works:

<YouTubeEmbed id="N0SlnDQMX50" />

## What results look like

After applying a transformation, the pixel intensity values update and the range displayed on the intensity slider (min/max) changes to reflect the chosen scaling method and normalization settings. You can drag the slider handles to manually adjust the minimum and maximum intensity thresholds displayed in the image.

Below are side-by-side examples of the same ion image before and after TIC normalization for a [mouse brain dataset](https://metaspace2020.org/annotations?ds=2025-04-27_13h26m30s&viewId=0jl7cQOg):

<SideBySide
  left="/screenshots/tic-normalization-before.png"
  leftCaption="Before TIC normalization"
  right="/screenshots/tic-normalization-after.png"
  rightCaption="After TIC normalization"
/>