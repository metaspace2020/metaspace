# Custom Databases

## What it is

Custom Databases allow you to upload your own list of molecules for METASPACE to annotate against, in addition to or instead of the publicly available databases. This is useful when working with compounds not covered by existing databases, such as custom lipid libraries, drug metabolites, or internal reference compounds.

## When to use it

- When the molecules you are looking for are not present in any of the available public databases.
- When you want to annotate against a targeted list of compounds specific to your experiment.
- When you are working with novel or proprietary compounds.

## How to use it

> **Note:** A custom database must be associated with a group. If you do not have a group yet, create one first from your account page before uploading.

### 1. Prepare your TSV file

Your database file must be a tab-separated values (TSV) file with exactly three columns:

| Column | Description |
|--------|-------------|
| `id` | A unique identifier for each molecule (e.g. a HMDB or ChEBI accession) |
| `name` | The molecule name |
| `formula` | The neutral molecular formula (e.g. `C6H12O6`) |

The first line must be the header row (`id`, `name`, `formula`). For example:

```
id	name	formula
HMDB0000122	Glucose	C6H12O6
HMDB0000169	Mannose	C6H12O6
HMDB0000094	Citric acid	C6H8O7
```

If you are preparing the file in a spreadsheet application, go to **File > Save As** and select **Text (Tab delimited) (\*.tsv)**. Open the saved file in a text editor to confirm that columns are separated by tabs and not spaces.

### 2. Upload the database

Follow the steps in this video to upload your custom database:

<YouTubeEmbed id="L43lYp10vNg" />

## Isotope-labeled compounds

If your experiment uses stable-isotope labeling (e.g. ¹³C metabolic tracing or ¹⁵N amino-acid labeling), you can encode labeled atoms directly in the `formula` column using the pseudo-element symbols below. METASPACE will compute the correct m/z by treating each labeled atom as a delta-function at its exact isotopic mass and convolving that with the natural-isotope pattern of the remaining atoms — mathematically equivalent to a rigid m/z shift.

### Supported isotope labels

| Symbol | Isotope | Monoisotopic mass (Da) | Typical use                                        |
|--------|---------|------------------------|----------------------------------------------------|
| `Cx`   | ¹³C     | 13.00335484            | Carbon tracing — glucose, glutamine, acetate, etc. |
| `Nx`   | ¹⁵N     | 15.00010889            | Nitrogen labeling — amino acids, nucleotides       |
| `Hx`   | ²H      | 2.014101778            | Lipid and drug metabolism, kinetic isotope studies |
| `Ox`   | ¹⁸O     | 17.99915961            | Water labeling, proteomics                         |
| `Sx`   | ³⁴S     | 33.96786700            | Cysteine / methionine tracing                      |

### How to write labeled formulas

Use the symbol exactly like any other element in the `formula` column. Replace only the labeled atoms; leave all remaining atoms as their natural-element symbols.

```tsv
id  name                        formula
1   [U-¹³C₆]-glucose            Cx6H12O6
2   [1,2-¹³C₂]-acetate          Cx2H3O2
3   [U-¹³C₅,¹⁵N₂]-glutamine    Cx5H8Nx2O3
4   d7-cholesterol (7 × ²H)     C27H38Hx7O
5   [¹⁸O₁]-palmitate            C16H31OxO
6   [³⁴S]-methionine            C5H11NHxSxO2
```

> **Tip:** Only the labeled atoms need the `x` suffix. Natural-abundance atoms of the same element use their normal symbol alongside the labeled ones (e.g. `Cx2C4H12O6` for [1,2-¹³C₂]-glucose where only 2 of the 6 carbons are labeled).

### What the isotope pattern looks like

The M+1 and M+2 peaks visible in the diagnostic plot come from the **natural-abundance isotopes of the unlabeled atoms** (hydrogens, oxygens, etc.). For example, fully ¹³C-labeled glucose (`Cx6H12O6`) shows a much flatter isotope envelope than natural glucose, because the ¹³C contribution to M+1 is absent — only H and O contribute.

## What results look like

Once uploaded, your custom database appears alongside the public databases in the database selector on the upload page. Annotation results against your custom database are displayed in the same way as any other database, with ion images, FDR-filtered hits, and molecule matches in the dataset viewer.
