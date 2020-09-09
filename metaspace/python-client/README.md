# METASPACE Python client

Python module that provides programmatic access to the [METASPACE](https://metaspace2020.eu) platform.

## Applications

* Running batch jobs
* Exploratory analysis of submitted data
* Quick access to things hidden from web interface (such as location of files on S3 and other metadata)

## Installation

You need to have **Python 3.6 or higher** to use this library.

`pip install metaspace2020`

## Jupyter Notebooks

There are several playbooks available to retrieve dataset information as well as to upload it on Metaspace.

| Notebook | Description |
| :--- | :--- |
| **access_change_PI_names**| Reads and updates PI names in dataset metadata |
| **api_examples**| Illustrates how to access all the information about a dataset that is visible on the [METASPACE](metaspace2020.eu) platform |
| **compare-reference-engine-results**| Compares engine results against the pySM reference implementation |
| **iso_img_retrieval**| Retrieves isotopic images for the provided dataset |
| **simple_database_queries**| A few queries to get annotations for a dataset, show stats on the annotations, and compare annotations between two datasets |
| **top_hits**| Retrieves ions with the highest average MSM score across all datasets |
| **update_DBs_dataset_api**| Reprocesses a dataset with a different set of databases |
| **upload_dataset_api**| Uploads a new dataset with the provided metadata |
| **create-custom-molecular-database**| Creates and manages a new custom database from a local text file |

## Acknowledgements and license

[See the top-level README](../../README.md#acknowledgements)