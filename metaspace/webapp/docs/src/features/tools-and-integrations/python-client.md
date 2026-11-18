# Python Client

## What it is

The METASPACE Python Client is a Python library for programmatic interaction
with METASPACE — submitting datasets, retrieving annotation results, and
managing your data without using the web interface.

## When to use it

- When you want to automate dataset submission or retrieval as part of a
  larger pipeline.
- When you need to access or download annotation results programmatically.
- When you are building custom workflows that integrate METASPACE with other tools or methods.

## How to use it

Full installation instructions, API reference, and usage examples are
available in the
[METASPACE Python Client documentation](https://metaspace2020.readthedocs.io/en/latest/).

### Submitting metadata

`submit_dataset` and `update_dataset` keep accepting the `metadata` argument
in the original format, so existing scripts work unchanged. METASPACE converts
that metadata to the current metadata fields when it saves the dataset.
Converted values that don't match a standard term exactly are marked
**pending curation**, as described in the
[upload page guide](/guides/before-submission/the-upload-page#terms-with-no-ontology-match).

From version 2.1.1 both functions also take an optional `metadata_v2`
argument, a Python dict or JSON string holding a record in the current
metadata format. When you pass it, METASPACE uses it instead of converting
`metadata`. `submit_dataset` still requires `metadata`. Update to the latest
version with `pip install --upgrade metaspace2020` to use `metadata_v2`.

When you update only `metadata` on a dataset that already has a record in the
current format, only the fields you changed are converted. The others keep
their existing values.
