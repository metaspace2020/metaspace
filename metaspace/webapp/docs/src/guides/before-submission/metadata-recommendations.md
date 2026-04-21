# Metadata Recommendations

Metadata describes the biological and technical context of your dataset. Filling it in accurately benefits you and the wider community: it enables cross-dataset comparisons, supports reproducibility, and makes your data reusable — including by your own future self. Datasets with complete metadata are also more discoverable when made public on METASPACE.

The METASPACE team is actively working on metadata standardization to align with community standards and improve interoperability across datasets. The more specific and complete your metadata is now, the easier the transition will be — and the more valuable your datasets will be to others.

This guide focuses on the fields that have the greatest impact on reproducibility and are most commonly incomplete: **Sample Information**, **Sample Preparation**, and **Dataset Description**.

## General Rules

- Complete as many fields as possible, even optional ones.
- If a field genuinely does not apply, enter **N/A** — do not leave it blank.
- Be specific. Vague entries are harder to interpret and impossible to use
  for grouping or comparison.
- For inspiration on standardized terminology, consult the [Experimental Factor Ontology (EFO)](https://www.ebi.ac.uk/efo/),[BRENDA Tissue Ontology (BTO)](https://www.ebi.ac.uk/ols/ontologies/bto)  or [NCBI Taxonomy](https://www.ncbi.nlm.nih.gov/taxonomy) when filling in organism, tissue, and condition fields. Using controlled vocabulary makes your data easier to find and compare.

## Sample Information

### Organism

Enter the full scientific name of the species (e.g., *Mus musculus*,
*Homo sapiens*, *Arabidopsis thaliana*). Avoid common names — "mouse" is
ambiguous across species and strains; *Mus musculus* is not. Refer to
[NCBI Taxonomy](https://www.ncbi.nlm.nih.gov/taxonomy) if you are unsure
of the correct name.

### Organism Part

Specify the tissue or organ. Be as specific as the experiment requires —
"brain" is acceptable if the whole brain was sectioned, but "hippocampus"
or "cortex" is more informative if a specific region was targeted. For
reference, the [BRENDA Tissue Ontology (BTO)](https://www.ebi.ac.uk/ols/ontologies/bto)
provides standardized tissue terms across a wide range of species.

### Condition

::: warning Common mistake
This field is frequently left vague or inconsistent, which makes it
impossible to group or compare datasets later. It is also used as a
grouping variable in differential analyses — inconsistent labels will
produce incorrect groupings.
:::

Describe the experimental condition or treatment the sample underwent.
If you plan to compare multiple datasets, decide on condition labels before
uploading and use them exactly — including capitalization and spacing.

| ❌ Avoid | ✅ Better |
|---|---|
| treated | treated with 10 µM tamoxifen, 48h |
| sick | high-fat diet, 12 weeks |
| control | untreated, wild-type |
| KO | PTEN knockout, C57BL/6 background |

For standardized condition terminology, refer to the
[Experimental Factor Ontology (EFO)](https://www.ebi.ac.uk/efo/), which
covers diseases, treatments, cell lines, and experimental variables across
biomedical research.

### Sample Growth Conditions *(optional)*

::: warning Common mistake
This field is often skipped entirely, even when culture or housing
conditions are a key experimental variable.
:::

Describe how the sample was grown, housed, or maintained prior to
collection. Examples by sample type:

- **Cell culture:** growth medium, serum percentage, CO₂ level, passage
  number, confluency at harvest
- **Animal model:** housing conditions, diet, light/dark cycle, age and
  sex at time of collection
- **Plant:** growth medium, light cycle, temperature, developmental stage

This field is especially important for in vitro experiments, where culture
conditions can substantially affect the metabolome.

## Sample Preparation

These fields are primarily relevant for MALDI-based tissue experiments.
Enter **N/A** for any field that does not apply to your setup. Even so,
do not skip them without consideration — incomplete sample preparation
metadata is one of the main barriers to reproducing IMS experiments.

### Sample Stabilization

::: warning Common mistake
Users often skip this field or enter the tissue type rather than the
preservation method.
:::

Describe how the tissue was preserved after collection. Common entries:

- Snap-frozen in liquid nitrogen immediately after dissection
- Fresh-frozen without fixation, stored at −80°C
- Formalin-fixed paraffin-embedded (FFPE)
- OCT-embedded, snap-frozen

The preservation method directly affects metabolite integrity and is
essential information for anyone attempting to replicate your experiment.

### Tissue Modification

Describe any physical or chemical alterations made to the tissue before
matrix application. Examples:

- Cryosectioned at 12 µm, thaw-mounted on ITO-coated glass slides
- Deparaffinized prior to analysis (for FFPE sections)
- On-tissue trypsin digestion prior to matrix application
- No modification

### MALDI Matrix

Enter the matrix compound using its common abbreviation and full name
(e.g., DHB (2,5-dihydroxybenzoic acid), 9AA (9-aminoacridine), DAN
(1,5-diaminonaphthalene)). Matrix choice is a key determinant of which
compound classes are detected.

### MALDI Matrix Application

Describe the method and key parameters of matrix deposition. Include the
device name and relevant settings where known. Examples:

- Automated pneumatic sprayer (HTX TM-Sprayer), 8 passes, 40°C
- Sublimation at 160°C, 15 min
- Manual spray using a TLC sprayer, 6 passes

### Solvent

Enter the full solvent composition used to prepare the matrix solution,
including concentrations and any additives (e.g., 30 mM DHB in 70%
methanol / 30% water with 0.1% TFA). Solvent composition affects matrix
crystallization and ionization efficiency and is necessary for replication.

## Dataset Description

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

### Example Description

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