# Mean spectrum

## What it is

The **Mean spectrum** view in the imzML Browser shows one spectrum for a whole region instead of one pixel. It combines the peaks from every pixel in a saved ROI (or in the whole dataset) onto a single m/z axis and plots their average or summed intensity. Clicking a peak generates the ion image for that m/z, so you can go from "what is in this region?" to "where is it?" in one step.

It is a quality-control and exploration view. It does not change your dataset, and it does not feed into annotation or FDR.

## When to use it

- When you want an overview of which ions dominate a tissue region, for example before choosing an m/z to inspect.
- When you want to compare what is detected in different ROIs of the same dataset.
- When you want to find the m/z of a prominent peak that is not in your annotation results and look at its distribution.
- When you want to check a region for unexpected signals such as contaminants or matrix peaks.

## How to use it

1. Open the dataset in the imzML Browser and select the **Mean spectrum** tab above the spectrum, next to **Mass spectrum** and **Kendrick plot**.
2. Choose a **Region**. The list contains your saved [ROIs](/features/spatial-pattern-analysis/roi-selection) and **Whole dataset**. A region marked _unavailable_ has too many peaks to process and cannot be selected.
3. Choose the **Aggregation**:
   - **Mean** divides each peak's total intensity by the number of pixels in the region.
   - **Sum** shows the total intensity. Switching between the two is instant.
4. Hover a peak to see its m/z, its intensity and **Pixels**, the number of pixels the peak was detected in.
5. Click a peak to show its ion image in the image viewer. The image uses the m/z tolerance in the image filters, so change the tolerance there if you want a wider or narrower window.
6. Zoom with the scroll wheel, the sliders or the zoom tool in the toolbar. Double-click the chart to reset the zoom. The toolbar also lets you download the spectrum as a CSV or save the chart as an image.

Hover the **About this spectrum** note next to the controls for the pixel and peak counts of the selected region.

## What results look like

Each bar is one merged peak. Only pixels that were acquired are counted: pixels inside the ROI polygon that have no spectrum are ignored, so they do not lower the mean.

When you zoom in far enough to see a few hundred peaks or fewer, each peak gets a blue circle and an m/z label, as in the Mass spectrum view, which makes peaks easier to select.

![Mean spectrum view](/screenshots/imzml-mean-spectrum.png)
_Mean spectrum of an ROI, with the region and aggregation controls above the chart. Hovering the tallest peak shows its m/z, mean intensity and the number of pixels it was detected in, and clicking it shows its ion image on the right. Source: [dataset](https://metaspace2020.org/dataset/2021-12-10_00h52m21s/browser)_

### How the spectrum is built

Processed imzML data has no shared m/z axis, because every pixel has its own list of peaks. To compare pixels, METASPACE pools the peaks of all pixels in the region and merges the ones that are close enough in m/z to be the same peak. The tolerance is the mass accuracy expected from your instrument at that m/z, scaled from the dataset's ppm setting, so it widens with m/z as the instrument's peak width does. Each merged peak is placed at the intensity-weighted average of its members.

The merging tolerance is separate from the m/z tolerance used for ion images. That is why a clicked peak can look slightly different from the same peak typed into the image filters with a different ppm.

### Which peaks are shown

- **ROIs:** a peak is hidden if it is detected in fewer than half as many pixels as the region's strongest peaks. This follows each region's own detection rate, so it needs no setting: in a region where the strongest peaks are seen in nearly every pixel, peaks seen in only a few pixels are treated as noise and removed.
- **Whole dataset:** a peak must be detected in at least 1% of the pixels. A whole section contains many different tissue types, so most tissue-specific peaks are present in only part of it.
- The chart shows at most the 20,000 most intense peaks of the region. When peaks were left out, **About this spectrum** says how many.

## Good to know

- The view is for inspection. It does not recalibrate masses, correct drift, or pick peaks by signal-to-noise.
- Pixel counts show how widely a peak is distributed. A tall peak detected in only a few pixels usually comes from a small hotspot, so check **Pixels** before reading much into it.
- Closely spaced noise next to a peak can occasionally split it into two entries. If a peak you expect is missing from an ROI, check the same m/z in the **Mass spectrum** view or type it into the image filters.
- Very large regions are not available and show as _unavailable_ in the region list. Drawing a smaller ROI works around it.
- The CSV download has the columns `dataset_name`, `dataset_id`, `region`, `mz`, `mean_intensity` or `summed_intensity`, and `n_pixels_supporting`.

For per-pixel spectra and ion images of any m/z, see [Spectral visualization](/features/imzml-browser/spectral-visualization).
