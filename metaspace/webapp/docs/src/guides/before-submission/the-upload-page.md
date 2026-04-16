# Uploading a Dataset and Choosing Annotation Parameters

This guide walks you through the METASPACE upload page step by step — what
each field means, how to fill it in correctly, and how your choices affect
annotation results.

## Before You Start

Make sure your dataset is ready for upload. METASPACE requires two files:

- **`.imzML`** — the metadata and coordinate file
- **`.ibd`** — the binary file containing the spectral data

Both files must be uploaded together. If you have not yet converted your data
to imzML format, see [Exporting to imzML Format](./exporting-to-imzml) before
continuing. If you are experiencing conversion issues, contact your instrument
vendor.

## Step 1 — Select Your Files

Click **Choose File** and select your `.imzML` and `.ibd` files. Both must be
present for a valid submission.

## Step 2 — Fill Out Sample Information

These fields capture the biological context of your sample. They are essential
for cross-dataset comparisons and downstream analyses such as differential
analysis. Complete as many fields as possible. If a field does not apply,
enter **N/A**.

| Field | What to enter |
|---|---|
| **Organism** | Species the sample was derived from (e.g., *Homo sapiens*, *Mus musculus*) |
| **Organism Part** | Tissue or organ used (e.g., liver, brain, muscle) |
| **Condition** | Experimental condition or treatment (e.g., healthy, diseased, drug-treated). Used for grouping datasets in differential analyses. |
| **Sample Growth Conditions** *(optional)* | Culture or preparation details such as growth media, temperature, or incubation period |

## Step 3 — Fill Out Sample Preparation

These fields describe how the sample was processed before analysis. They are
primarily relevant for MALDI-based experiments and tissue analyses. Enter
**N/A** for any field that does not apply to your setup.

| Field | What to enter |
|---|---|
| **Sample Stabilization** | Preservation method used (e.g., snap freezing, chemical fixation) |
| **Tissue Modification** | Any pre-analysis alterations such as embedding, dehydration, or enzymatic treatment |
| **MALDI Matrix** | Chemical compound used for ionization (e.g., DHB, 9AA, DAN) |
| **MALDI Matrix Application** | Method of matrix application (e.g., automated spraying, sublimation) |
| **Solvent** | Solvent used to prepare or apply the matrix (e.g., acetonitrile/water with TFA) |

## Step 4 — Fill Out MS Analysis Parameters

These fields describe key instrument settings. They are required for accurate
annotation.

| Field | What to enter |
|---|---|
| **Polarity** | **Positive** mode detects positively charged ions; **Negative** mode detects negatively charged ions. Your choice directly determines which adducts are relevant. |
| **Ionization Source** | Method used to ionize the sample (e.g., MALDI, DESI, SIMS) |
| **Analyzer** | Mass analyzer type (e.g., Orbitrap, timsTOF, QTOF) |
| **Detector Resolving Power** | The instrument's ability to distinguish ions with similar m/z values. Defaults to 140,000 at 200 m/z unless otherwise specified. |
| **Pixel Size (µm)** | Spatial resolution of the acquisition — the physical size each pixel represents in the image |

## Step 5 — Configure Annotation Settings

These fields directly control what METASPACE searches for and how it scores
annotations. Review them carefully, as they have the largest impact on your
results.

### Dataset Name

Choose a descriptive name that will help you identify the dataset later — for
example, including the sample type, date, or experimental condition.

### Metabolite Database

Select the database(s) that best match the metabolite classes expected in your
sample. Different databases vary in their compound coverage. Choosing a database
that is poorly matched to your sample type increases the risk of spurious
annotations. <!-- See the [Database Help Page](../features/annotation-databases) for a full comparison. -->

### Adducts

Adducts define the ionic forms of each molecule that METASPACE searches for.
Every selected adduct is applied to every molecule in the database, so only
select adducts that are chemically plausible for your ionization source and
matrix.

**Recommended defaults:**

- **Positive mode:** `[M+H]⁺`, `[M+Na]⁺`, `[M+K]⁺`
- **Negative mode:** `[M-H]⁻`, `[M+Cl]⁻`
- **ESI-based sources (positive mode):** add `[M+NH₄]⁺`

> **Note:** `[M]⁺` and `[M]⁻` should only be selected when annotating custom
> databases where adducts have been merged into molecular formulas, or when a
> derivatization agent renders molecules permanently charged.

Searching for improbable adducts increases the likelihood of false annotations.

### Analysis Version (Rule-Based vs. ML)

This setting determines the scoring model used to evaluate annotations.

| Version | Description |
|---|---|
| **V1 (Original MSM)** | Rule-based model. Suitable for all sample types. Use when comparing datasets processed before ML models were available, or when cross-dataset consistency is required. |
| **Animal_v2.2023-12-14** | ML-based model trained on animal datasets. Also recommended for samples from non-animal, non-plant kingdoms (e.g., Bacteria, Fungi), as it is designed to be indifferent to sample-specific metadata. |
| **Plant_v2.2023-12-14** | ML-based model trained on plant datasets. |

When comparing multiple datasets, process all of them with the same analysis
version to ensure consistent scoring.

### m/z Tolerance (ppm)

This controls how much mass deviation is allowed when matching detected ions to
database entries.

- For resolving power **≥ 70,000**: use the default (typically 3 ppm)
- For resolving power **< 70,000**: use **5–10 ppm**

Increasing tolerance reduces annotation specificity, often lowers the number of
annotations at a fixed FDR, and increases isobaric ambiguity.

### Neutral Losses *(optional)*

Search for ions that have lost a specific neutral fragment during ionization.
Enter the molecular formula of the loss preceded by a minus sign (e.g., `-H2O`
to find ions with a water loss).

### Chemical Modifications *(optional)*

Use this setting if your sample has been treated with a derivatization agent.
Modifications are defined as formulas added (`+`) or removed (`-`) from every
entry in the database. Unmodified formulas are always annotated alongside
modified ones, each with its own independent FDR ranking.

**Example:** Derivatization with Girard's Reagent T → `-O+C5H12N3O`

> **Caution:** Modified formulas are often isomeric to unmodified molecules in
> the database. Apply extra scrutiny to any annotations returned under a
> chemical modification. If the derivatization agent introduces a permanent
> charge, either select `[M]⁺` / `[M]⁻` as the adduct, or adjust the hydrogen
> count in the modification formula to ensure the correct mass is calculated.

### Enrichment Ontology *(optional)*

Select a metabolite set to enable enrichment analysis after annotation.
METASPACE currently supports the **LION ontology** for lipid class enrichment.
Compatible databases include HMDB, CoreMetabolome, SwissLipids, and LipidMaps.

<!-- For more information, see [Enrichment (LION)](../features/enrichment-lion). -->
