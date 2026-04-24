# Your METASPACE Journey

This page maps the full path through METASPACE — from raw data to published results. Each stage is collapsible so you can jump to wherever you are in your workflow.

<details>
<summary><strong>Stage 1 — Getting Organized</strong> &nbsp;·&nbsp; Account, groups, and projects</summary>

Before uploading any data, it helps to understand how METASPACE organizes users and data.

- **[Account Settings](/getting-started/dataset-organization/account-settings)** — create an account, update your profile, and find your API key for programmatic access.
- **[Groups & Members](/getting-started/dataset-organization/groups-and-members)** — a group represents a lab or team. Members share access to private datasets. The group admin controls membership.
- **[Projects](/getting-started/dataset-organization/projects)** — a project collects related datasets together, typically corresponding to a publication or study. Create a project before uploading so your datasets are organized from the start.

> **Tip:** The recommended order is: create a group → create a project → upload datasets linked to that project.

</details>

<details>
<summary><strong>Stage 2 — Preparing Your Data</strong> &nbsp;·&nbsp; Getting into the right format</summary>

METASPACE accepts imaging MS data as **centroided imzML + ibd** files. Both files must be present for upload.

### Don't have imzML yet?

See **[Exporting to imzML Format](/guides/before-submission/exporting-to-imzml)** for instructions on converting from common vendor formats. Make sure your data is centroided before proceeding — profile-mode data is not supported.

### Want to know what's detectable before you run?

The **[Detectability App](/features/tools-and-integrations/detectability-app)** lets you explore which metabolites and adducts are likely to be detected under your specific imaging MS protocol and technology. Useful for choosing databases and setting expectations before annotation.

</details>

<details>
<summary><strong>Stage 3 — Uploading Your Dataset</strong> &nbsp;·&nbsp; Submission, metadata, and annotation settings</summary>

### Upload

The **[Upload Page](/guides/before-submission/the-upload-page)** guide covers the full submission form: linking to a project, selecting your instrument and ion source, choosing databases, and setting annotation parameters.

### Metadata

Read **[Metadata Recommendations](/guides/before-submission/metadata-recommendations)** alongside the upload guide — good metadata makes your dataset discoverable and reproducible. Fill it in while the context is fresh.

### Custom databases

If the molecules you care about aren't in any standard database, you can upload your own list. See **[Custom Databases](/features/tools-and-integrations/custom-databases)** — the database must be attached to a group before it appears in the upload selector.

### Uploading programmatically?

The **[Python Client](/features/tools-and-integrations/python-client)** supports automated dataset submission as part of a larger pipeline.

> Annotation runs automatically after submission. Processing time depends on dataset size.

</details>

<details>
<summary><strong>Stage 4 — Interpreting Your Results</strong> &nbsp;·&nbsp; Understanding what was computed</summary>

Once annotation is complete, start here before exploring individual features.

### Start here

**[Understanding the Annotation Page](/guides/interpreting-results/understanding-annotation-page)** explains what METASPACE computed, how to read the annotation table, what the FDR and scores mean, and where to go next.

### Go deeper (optional)

METASPACE runs two analyses automatically alongside annotation. These guides explain them in detail:

- **[Co-localization](/guides/interpreting-results/colocalization)** — which ion images share similar spatial patterns across your dataset, and how to use this to assess annotation quality.
- **[Off-Sample Filtering](/guides/interpreting-results/off-sample-filtering)** — how METASPACE identifies annotations that fall outside the tissue and suppresses them from results.

</details>

<details>
<summary><strong>Stage 5 — Exploring Your Results</strong> &nbsp;·&nbsp; Visualization and spectral inspection</summary>

### Ion image visualization

- **[Ion Image Visualization](/features/visualization/ion-image-visualization)** — the core viewer for exploring annotated ion images, applying color maps, and adjusting intensity.
- **[Multi-Channel Ion Image Viewer](/features/visualization/multi-channel-viewer)** — overlay multiple ion images in separate color channels to compare spatial distributions side by side.
- **[Optical Image Overlay](/features/visualization/optical-image-overlay)** — align an H&E or fluorescence image with ion images to correlate molecular distributions with histology.
- **[Multi-Dataset Comparison](/features/visualization/multi-dataset-comparison)** — compare ion images for the same metabolite across multiple datasets.

### Per-pixel spectra and normalization

If you want to inspect the raw spectral data behind annotations, or explore intensity normalization options:

- **[Spectral Visualization](/features/imzml-browser/spectral-visualization)** — browse per-pixel spectra directly from your imzML file in the imzML browser.
- **[Reference Peak Normalization](/features/imzml-browser/reference-peak-normalization)** — normalize ion images to a reference peak of your choice instead of TIC normalization.

</details>

<details>
<summary><strong>Stage 6 — Downstream Analysis</strong> &nbsp;·&nbsp; Spatial analysis and export</summary>

### Spatial pattern analysis

Draw regions of interest directly on your ion images and use them for focused exploration or comparison:

- **[ROI Selection](/features/spatial-pattern-analysis/roi-selection)** — define regions based on histology, anatomy, or any visible spatial structure.

### Export for external tools

To take your annotation results into external analysis environments:

- **[METASPACE Converter](/features/tools-and-integrations/metaspace-converter)** — download and convert annotation results into AnnData or SpatialData format for use with Python-based spatial omics tools like scanpy and squidpy.
- **[Python Client](/features/tools-and-integrations/python-client)** — retrieve annotation tables, ion images, and metadata programmatically for custom pipelines.

</details>

<details>
<summary><strong>Stage 7 — Sharing & Publishing</strong> &nbsp;·&nbsp; Making your data available</summary>

### Share with collaborators

**[Sharing Annotations & Datasets](/features/sharing-and-publishing/sharing-annotations-and-datasets)** — control visibility and access for your datasets, and share specific annotation views with collaborators.

### Publish alongside a paper

**[Publishing Projects](/features/sharing-and-publishing/publishing-projects)** — link a project to a publication DOI and make your datasets publicly available. This is the standard route for data availability statements in imaging MS papers.

</details>
