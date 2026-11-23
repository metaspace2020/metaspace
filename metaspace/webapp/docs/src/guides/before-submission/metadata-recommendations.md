# Metadata Recommendations

Metadata describes the biological and technical context of your dataset. Filling it in accurately benefits you and the wider community: it enables cross-dataset comparisons, supports reproducibility, and makes your data reusable — including by your own future self. Datasets with complete metadata are also more discoverable when made public on METASPACE.

Most biological and technical fields in the upload form are now filled by picking a term from a standard ontology ([NCBI Taxonomy](https://www.ncbi.nlm.nih.gov/taxonomy), [UBERON](https://obofoundry.org/ontology/uberon.html), [MONDO](https://mondo.monarchinitiative.org/), [ChEBI](https://www.ebi.ac.uk/chebi/), [PSI-MS](https://www.ebi.ac.uk/ols4/ontologies/ms) and others) rather than typing free text. Standard terms make your datasets searchable and comparable regardless of how a term is spelled, and they are what the dataset filters use. See the [upload page guide](./the-upload-page) for the full list of fields.

This guide focuses on the fields that have the greatest impact on reproducibility and are most commonly incomplete: **sample information**, **sample preparation**, and **dataset description**.

## General rules

- Complete as many fields as possible, even optional ones.
- Fields that do not apply to your sample type are hidden. For an optional field that is shown but does not apply, leave it empty.
- Be specific. Vague entries are harder to interpret and impossible to use
  for grouping or comparison.
- Pick a suggested term whenever one fits instead of typing your own. If nothing matches, you can type a value; it is marked **pending curation** and reviewed by the METASPACE team. See [Terms with no ontology match](./the-upload-page#terms-with-no-ontology-match).
- Details that have no field of their own belong in the protocol description and the dataset description.

## Sample information

### Organism

Search for the species and pick the matching [NCBI Taxonomy](https://www.ncbi.nlm.nih.gov/taxonomy) term (e.g., _Mus musculus_,
_Homo sapiens_, _Arabidopsis thaliana_). Search by scientific name rather than common name —
"mouse" is ambiguous across species and strains; _Mus musculus_ is not. Refer to
[NCBI Taxonomy](https://www.ncbi.nlm.nih.gov/taxonomy) if you are unsure
of the correct name.

### Anatomical site

For tissue samples, **anatomical site (coarse)** is the organ or tissue and is required; **anatomical site (fine)** is optional. Terms come from [UBERON](https://obofoundry.org/ontology/uberon.html). Use the coarse field for the whole organ and the fine field for the region that was targeted — for example, "brain" as the coarse site and "hippocampus" or "cortex" as the fine site. Leave the fine site empty if the whole organ was sectioned.

### Health status, genetic background and disease

::: warning Common mistake
These fields are frequently left vague or inconsistent, which makes it
impossible to group or compare datasets later.
:::

The old single **Condition** field is split into three fields, so describe each part where it belongs:

- **Health status:** control, disease, disease model, treated or other.
- **Genetic background:** the strain or genotype (e.g., C57BL/6J, wild type, knockout).
- **Disease:** the disease studied, picked from [MONDO](https://mondo.monarchinitiative.org/).

Use the same labels across all datasets you plan to compare, including capitalization and spacing. For treatments, doses and durations, which have no field of their own, use the protocol description.

| ❌ Avoid                                 | ✅ Better                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Genetic background: KO                   | Genetic background: knockout, with the gene named in the protocol description        |
| Genetic background: mouse                | Genetic background: C57BL/6J                                                         |
| Health status: other (nothing else said) | Health status: treated, with the drug, dose and duration in the protocol description |
| Protocol description: treated            | Protocol description: treated with 10 µM tamoxifen, 48h                              |

### Protocol description

::: warning Common mistake
This field is often skipped entirely, even when culture or housing
conditions are a key experimental variable.
:::

Describe how the sample was grown, housed, treated or maintained prior to
collection. This field replaces the old **Sample Growth Conditions** field.
Examples by sample type:

- **Cell culture:** growth medium, serum percentage, CO₂ level, confluency at harvest. Enter the cell line and passage number in their own fields.
- **Animal model:** housing conditions, diet, light/dark cycle, age and
  sex at time of collection
- **Plant:** growth medium, light cycle, temperature, developmental stage

This field is especially important for in vitro experiments, where culture
conditions can substantially affect the metabolome.

## Sample preparation

These fields are primarily relevant for MALDI-based tissue experiments.
Sample stabilisation and tissue modification are required for tissue samples; the MALDI fields are optional. Even so,
do not skip them without consideration — incomplete sample preparation
metadata is one of the main barriers to reproducing IMS experiments.

The short fields below offer a list of common options. Choose one if it fits and put the details of your protocol in the protocol description or the dataset description.

### Sample stabilisation

::: warning Common mistake
Users often skip this field or enter the tissue type rather than the
preservation method.
:::

Choose how the tissue was preserved after collection. Common options include:

- Fresh frozen
- Flash frozen (liquid nitrogen)
- Snap frozen
- Formalin-fixed paraffin-embedded (FFPE)
- OCT embedded

The preservation method directly affects metabolite integrity and is
essential information for anyone attempting to replicate your experiment.
Add details such as timing and storage temperature (e.g., stored at −80°C) to the protocol description.

### Tissue modification

Choose any physical or chemical alteration made to the tissue before
matrix application. Common options include:

- None
- Washed
- Fixed
- Derivatised
- Enzymatically digested

Describe the specifics — such as on-tissue trypsin digestion conditions, deparaffinization of FFPE sections, or cryosectioning thickness and slide type (e.g., 12 µm, thaw-mounted on ITO-coated glass slides) — in the protocol description.

### MALDI matrix

Search for the matrix compound; terms come from [ChEBI](https://www.ebi.ac.uk/chebi/) (e.g., 2,5-dihydroxybenzoic acid for DHB, 9-aminoacridine for 9AA,
1,5-diaminonaphthalene for DAN). Matrix choice is a key determinant of which
compound classes are detected.

### MALDI matrix application

Choose the method of matrix deposition (e.g., spraying, sublimation, airbrush) and put the device name and key parameters in the protocol description or the dataset description. Examples:

- Automated pneumatic sprayer (HTX TM-Sprayer), 8 passes, 40°C
- Sublimation at 160°C, 15 min
- Manual spray using a TLC sprayer, 6 passes

### Solvent

Search for the main solvent; terms come from [ChEBI](https://www.ebi.ac.uk/chebi/) (e.g., acetonitrile). The field takes a single term, so give the full solvent composition used to prepare the matrix solution,
including concentrations and any additives (e.g., 30 mM DHB in 70%
methanol / 30% water with 0.1% TFA), in the dataset description. Solvent composition affects matrix
crystallization and ionization efficiency and is necessary for replication.

## How your metadata is used for filtering

The filters on the datasets and annotations pages use the fields described above, so the values you choose decide how easily others can find your dataset:

- **Organism** and **Organism part** match both the standard term and the value stored in the original metadata format. The organism part filter uses the coarse anatomical site.
- **Disease** matches the standard disease term chosen in the form.
- **Sample type**, **Health status** and **Sex** are selected from a fixed list of options.

::: warning Only datasets with the new metadata appear under Disease, Sample type, Health status and Sex
These four filters only match datasets whose metadata was entered in the current form. Datasets submitted earlier are not included until their owner opens them for editing, reviews the converted values and saves. Because **Disease** matches the standard term, a disease you typed as free text is not found by this filter until a reviewer matches it to a term.
:::

## Dataset description

::: tip
The description field is the most flexible and most underused field in the
upload form. Use it to include your full sample preparation protocol.
:::

A thorough dataset description makes your data independently interpretable
without requiring contact with you or your lab. At a minimum, include:

- **Experimental aim** — what biological question the dataset addresses
- **Sample collection** — when and how the tissue or cells were collected,
  including any animal model details or cell line information
- **Full preparation protocol** — step-by-step, from tissue collection to
  matrix application, including reagents, equipment, and timings
- **Acquisition parameters** — instrument settings not captured elsewhere,
  such as laser frequency, mass range, and number of laser shots per pixel
- **Any deviations** from standard protocols or known issues with the
  dataset

### Example description

> Mouse liver tissue was collected from 16-week-old male C57BL/6J mice
> fed a high-fat diet (60% kcal from fat) ad libitum from 8 weeks of age.
> Tissue was snap-frozen in liquid nitrogen immediately after dissection
> and stored at −80°C. Cryosections (10 µm) were thaw-mounted onto
> ITO-coated glass slides and dried in a vacuum desiccator for 30 min.
> DHB matrix (30 mM in 70% MeOH / 30% H₂O + 0.1% TFA) was applied using
> an HTX TM-Sprayer (8 passes, 40°C, 0.1 mL/min flow rate). Data were
> acquired on a Thermo Orbitrap Elite in positive ion mode at 140,000
> resolving power (m/z 200), mass range m/z 200–1000, 50 µm pixel size,
> 10 laser shots per pixel.

This level of detail is achievable in a few sentences and makes a
substantial difference to reproducibility. If your lab maintains a standard
operating procedure (SOP) for sample preparation, paste the relevant
sections here directly.
