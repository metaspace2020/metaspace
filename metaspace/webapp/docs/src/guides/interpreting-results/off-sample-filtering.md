# Off-Sample Filtering

## What Was Computed

During the annotation pipeline, METASPACE automatically classifies each ion image as either on-sample or off-sample using a deep residual learning model (OffsampleAI). Off-sample ions are those whose signal is predominantly detected outside the tissue area — a pattern caused by the MALDI matrix application, which deposits ionizable matrix molecules across the entire slide surface, including areas with no tissue. Because matrix ions can be isobaric or isomeric with real sample analytes, filtering them out is important for any downstream analysis. The classifier was trained and validated on a gold standard of 23,238 expert-tagged ion images from 87 public datasets, achieving an F1 score of 0.97. For full methodological details, see [Ovchinnikova et al., BMC Bioinformatics, 2020](https://doi.org/10.1186/s12859-020-3425-x).

## Where to Find It

Off-sample annotations are not shown by default in the annotation table. They can be revealed using the **Show/hide off-sample annotations** toggle in the filters panel at the top of the annotation page. When visible, off-sample annotations appear alongside on-sample ones in the table and can be identified by their off-sample label.

![Off-sample toggle in filters panel](/screenshots/off-sample-toggle.png)
_The filters panel with the show/hide off-sample annotations toggle highlighted. Source: [dataset](https://metaspace2020.org/dataset/2025-04-24_17h31m12s/annotations?ds=2025-04-24_17h31m12s&offs=0&page=3&row=6)_

## How to Read It

An off-sample ion image typically shows high signal intensity in the area surrounding the tissue section and low intensity within it — the inverse of what you'd expect from a biologically relevant ion. This pattern arises from the ion suppression effect: the presence of tissue suppresses ionization of matrix molecules within the sample area, pushing their signal to the periphery.

![Typical off-sample ion image](/screenshots/off-sample-example.png)
_A typical off-sample ion image: ① high-intensity signal outside the tissue, ② low intensity within the tissue area. Source: [dataset](https://metaspace2020.org/dataset/2025-04-24_17h31m12s/annotations?ds=2025-04-24_17h31m12s&sort=-off_sample)_

Off-sample patterns are not always uniform. Depending on the matrix, sample preparation, and acquisition setup, you may encounter several variants:

- **Indicative pattern** — the most recognizable: high intensity clearly outside the tissue, low inside
- **Gradual pattern** — intensity fades gradually from outside to inside, with no sharp boundary
- **Everywhere pattern** — high intensity across the full image, making it harder to distinguish from an on-sample ion
- **Spotty pattern** — irregular spots of high intensity throughout the image, often seen with certain matrix application methods (e.g. DHB)

The classifier handles all these variants, but the "everywhere" and "spotty" patterns can be more ambiguous. When in doubt, visually inspect the ion image alongside the tissue boundary.

## Common Patterns and Pitfalls

- **Off-sample ions may still be annotated at low FDR** — the FDR filter and the off-sample classifier operate independently. A matrix ion can have a good MSM score and low FDR if its isotope pattern happens to match a molecular formula in the database. Always check both.
- **Skin-localized ions can be misclassified** — ions that localize specifically to the perimeter of a tissue section (e.g. skin in whole-body mouse sections) can resemble off-sample patterns and may be incorrectly flagged. Inspect these manually before excluding them.
- **Off-sample ions can be isobaric with real ions** — if an off-sample ion shares an m/z with a biologically relevant molecule, hiding it will also hide that annotation. Use the isobaric column in the annotation table to check for this before filtering.
