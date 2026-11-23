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

## Step 2 — Fill out sample information

These fields capture the biological context of your sample. They are essential
for cross-dataset comparisons and downstream analyses such as differential
analysis.

Start by choosing the **Sample type** (tissue, cell culture, plant or
environmental). The form then shows only the fields that apply to that type.
Required fields must be filled before you can submit, and the form tracks how
many are still missing.

Where a field says **Search**, start typing and pick a term from the
suggestions. Each suggestion is a term from a standard ontology, so your
dataset can be found and compared by the term rather than by how it was
spelled. If you can't find your term, see
[Terms with no ontology match](#terms-with-no-ontology-match).

The fields use these ontologies, and the tables below name the one behind each field:

- [NCBI Taxonomy](https://www.ncbi.nlm.nih.gov/taxonomy) — organisms
- [UBERON](https://obofoundry.org/ontology/uberon.html) — anatomical sites
- [MONDO](https://mondo.monarchinitiative.org/) — diseases
- [EFO (Experimental Factor Ontology)](https://www.ebi.ac.uk/efo/) — developmental stages
- [Cell Ontology (CL)](https://obofoundry.org/ontology/cl.html) — cell lines
- [ChEBI](https://www.ebi.ac.uk/chebi/) — chemical compounds, for the matrix and solvent
- [PSI-MS](https://www.ebi.ac.uk/ols4/ontologies/ms) — ionisation sources and instrument models

| Field                                     | Applies to   | What to enter                                                                                                                                 |
| ----------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sample type** _(required)_              | All          | Tissue, cell culture, plant or environmental. You can also type another type, which is reviewed like any other typed value.                   |
| **Organism** _(required)_                 | All          | Species the sample was derived from (e.g., _Homo sapiens_, _Mus musculus_). Ontology: [NCBI Taxonomy](https://www.ncbi.nlm.nih.gov/taxonomy). |
| **Anatomical site (coarse)** _(required)_ | Tissue       | Organ or tissue (e.g., liver, brain). Ontology: [UBERON](https://obofoundry.org/ontology/uberon.html).                                        |
| **Cell line** _(required)_                | Cell culture | The cell line used (e.g., HeLa). Ontology: [Cell Ontology](https://obofoundry.org/ontology/cl.html).                                          |
| **Sample stabilisation** _(required)_     | Tissue       | How the tissue was preserved (e.g., fresh frozen, FFPE)                                                                                       |
| **Tissue modification** _(required)_      | Tissue       | Any treatment of the tissue before analysis (e.g., none, washed)                                                                              |
| **Anatomical site (fine)**                | Tissue       | A more specific region (e.g., hippocampus, cortex). Ontology: [UBERON](https://obofoundry.org/ontology/uberon.html).                          |
| **Developmental stage**                   | Tissue       | Life stage of the sample (e.g., adult, embryo). Ontology: [EFO](https://www.ebi.ac.uk/efo/).                                                  |
| **Sex**                                   | Tissue       | Female, male, mixed or unknown                                                                                                                |
| **Health status**                         | All          | Control, disease, disease model, treated or other                                                                                             |
| **Genetic background**                    | All          | Strain or genotype (e.g., C57BL/6J, wild type)                                                                                                |
| **Disease**                               | All          | The disease studied, if any. Ontology: [MONDO](https://mondo.monarchinitiative.org/).                                                         |
| **Passage number**                        | Cell culture | Passage of the cells at harvest                                                                                                               |
| **Protocol description**                  | All          | Further preparation, treatment or growth-condition details, such as growth media, temperature or incubation period                            |

::: tip Replaces the Condition field
Earlier versions of the form had a single free-text **Condition** field. It
is now split into **Health status**, **Genetic background** and **Disease**,
so each part can be used for filtering on its own.
:::

## Step 3 — Fill out sample preparation

These fields describe how the matrix was prepared and applied. They are
primarily relevant for MALDI-based experiments. None of them is required, but
fill in every one that applies to your setup. Sample stabilisation and tissue
modification, which also describe preparation, are part of Step 2.

| Field                        | What to enter                                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MALDI matrix**             | Chemical compound used for ionization (e.g., DHB, 9AA, DAN). Ontology: [ChEBI](https://www.ebi.ac.uk/chebi/).                                                         |
| **MALDI matrix application** | Method of matrix application (e.g., spraying, sublimation)                                                                                                            |
| **Solvent**                  | Solvent used to prepare or apply the matrix (e.g., acetonitrile). Ontology: [ChEBI](https://www.ebi.ac.uk/chebi/). Listed under the **Advanced** heading of the form. |

## Step 4 — Fill out MS analysis parameters

These fields describe key instrument settings. All of them are required for
accurate annotation.

| Field                        | What to enter                                                                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Polarity**                 | **Positive** mode detects positively charged ions; **Negative** mode detects negatively charged ions. Your choice directly determines which adducts are relevant.                  |
| **Ionisation source**        | Method used to ionize the sample (e.g., MALDI, DESI, SIMS). Ontology: [PSI-MS](https://www.ebi.ac.uk/ols4/ontologies/ms).                                                          |
| **Instrument model**         | The instrument used (e.g., Q Exactive, timsTOF). Ontology: [PSI-MS](https://www.ebi.ac.uk/ols4/ontologies/ms). METASPACE derives the analyzer type from the instrument you choose. |
| **Detector resolving power** | The instrument's ability to distinguish ions with similar m/z values. Defaults to 140,000 at 200 m/z unless otherwise specified.                                                   |
| **Pixel size (µm)**          | Spatial resolution of the acquisition — the physical size each pixel represents in the image                                                                                       |

## Terms with no ontology match

Prefer a suggested term whenever one fits. If nothing matches, you can type
your own value: choose **Add "your text"** in the suggestion list, or press
Enter.

- The value is marked **pending curation** next to the field, and the
  dataset can still be submitted.
- The METASPACE team reviews typed values. A value can be matched to an
  existing ontology term, accepted as a new standard option, or rejected.
  The text you typed is always kept.
- If your text exactly matches an ontology term or synonym, or the same text
  has already been reviewed, it is resolved automatically when you save.
- If a reviewer rejected your text, saving shows the reviewer's note and asks
  you to change the value.

Four fields have no ontology: **Sample stabilisation**, **Tissue
modification**, **Genetic background** and **MALDI matrix application**. They
offer a list of common options plus values other users have entered. You can
still type something else, and it is reviewed in the same way. **Instrument
model** and **Polarity** are not part of this review.

## Editing datasets submitted earlier

Datasets uploaded before this form existed have only the original metadata.
When you open one for editing, the form converts the old values to the new
fields and shows a banner with how many values were migrated and how many
required fields are filled. Values that match a standard term exactly are
converted to that term; the rest are kept as typed and marked
**pending curation**. Review the converted fields, fill any required
ones that are empty, and save.

Use the switch above the form to look at the original record, which is
read-only. After you save, the original-format metadata is generated from the
new fields, so existing filters, downloads and Python client calls keep
working.

## Step 5 — Configure Annotation Settings

These fields directly control what METASPACE searches for and how it scores
annotations. Review them carefully, as they have the largest impact on your
results.

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

| Version                  | Description                                                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **V1 (Original MSM)**    | Rule-based model. Suitable for all sample types. Use when comparing datasets processed before ML models were available, or when cross-dataset consistency is required.                                |
| **Animal_v2.2023-12-14** | ML-based model trained on animal datasets. Also recommended for samples from non-animal, non-plant kingdoms (e.g., Bacteria, Fungi), as it is designed to be indifferent to sample-specific metadata. |
| **Plant_v2.2023-12-14**  | ML-based model trained on plant datasets.                                                                                                                                                             |

When comparing multiple datasets, process all of them with the same analysis
version to ensure consistent scoring. Check out the [METASPACE-ML paper](https://www.nature.com/articles/s41467-024-52213-9) for more detailed information on the ML models.

### m/z Tolerance (ppm)

This controls how much mass deviation is allowed when matching detected ions to
database entries.

- For resolving power **≥ 70,000**: use the default (typically 3 ppm)
- For resolving power **< 70,000**: use **5–10 ppm**

Increasing tolerance reduces annotation specificity, often lowers the number of
annotations at a fixed FDR, and increases isobaric ambiguity.

### Neutral Losses _(optional)_

Search for ions that have lost a specific neutral fragment during ionization.
Enter the molecular formula of the loss preceded by a minus sign (e.g., `-H2O`
to find ions with a water loss).

### Chemical Modifications _(optional)_

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

<!-- ### Enrichment Ontology *(optional)*

Select a metabolite set to enable enrichment analysis after annotation.
METASPACE currently supports the **LION ontology** for lipid class enrichment.
Compatible databases include HMDB, CoreMetabolome, SwissLipids, and LipidMaps. -->

<!-- For more information, see [Enrichment (LION)](../features/enrichment-lion). -->
