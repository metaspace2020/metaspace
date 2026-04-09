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

## What results look like

Once uploaded, your custom database appears alongside the public databases in the database selector on the upload page. Annotation results against your custom database are displayed in the same way as any other database, with ion images, FDR-filtered hits, and molecule matches in the dataset viewer.
