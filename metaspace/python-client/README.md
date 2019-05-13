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


## Funding

This project is funded from the [European Horizon2020](https://ec.europa.eu/programmes/horizon2020/)
project [METASPACE](http://project.metaspace2020.eu/) (no. 634402),
[NIH NIDDK project KPMP](https://www.niddk.nih.gov/research-funding/research-programs/kidney-precision-medicine-project-kpmp)
and internal funds of the [European Molecular Biology Laboratory](https://www.embl.org/).

## License

Unless specified otherwise in file headers, all files are licensed under the [Apache 2.0 license](LICENSE).
