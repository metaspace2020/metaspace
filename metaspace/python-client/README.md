# METASPACE python-client

Python module that provides programmatic access to a running instance of [`METASPACE`](https://github.com/metaspace2020/) platform

## Applications

* Running batch jobs
* Exploratory analysis of submitted data
* Quick access to things hidden from web interface (such as location of files on S3 and other metadata)

## Installation

You need Python 3 to use this library.

`pip install git+https://github.com/metaspace2020/metaspace#subdirectory=metaspace/python-client`

## Which branch to use
If you are trying to access annotations from the main public metaspace instance
then make sure you include the branch name of the latest release branch, e.g.

`pip install git+https://github.com/metaspace2020/metaspace@release/v0.11-rc#subdirectory=metaspace/python-client`

## Jupyter Playbooks
There are several playbooks available to retrieve dataset information as well as to upload it on Metaspace.

| Playbook | Description |
| :--- | :--- |
| **access_change_PI_names**| Allows to quickly access PI names and update their values in metadata|
| **api_examples**| Illustrates how to access all the information about a dataset that is visible on the [METASPACE](metaspace2020.eu) platform |
| **compare-reference-engine-results**| Allows to compare engine results against pySM reference implementation |
| **iso_img_retrieval**| Retrieves isotopic images for the provided dataset |
| **simple_database_queries**| A few queries to get annotations for a dataset, show stats on the annotations, and compare annotations between two datasets |
| **top_hits**| Allows to get ions with top average MSM score across all datasets |
| **update_DBs_dataset_api**| Allows to update a dataset against of provided list of databases |
| **upload_dataset_api**| Allows to upload a new dataset with the provided metadata through Metaspace API |

## Funding

This project is funded from the [European Horizon2020](https://ec.europa.eu/programmes/horizon2020/)
project [METASPACE](http://project.metaspace2020.eu/) (no. 634402),
[NIH NIDDK project KPMP](https://www.niddk.nih.gov/research-funding/research-programs/kidney-precision-medicine-project-kpmp)
and internal funds of the [European Molecular Biology Laboratory](https://www.embl.org/).

## License

Unless specified otherwise in file headers, all files are licensed under the [Apache 2.0 license](LICENSE).
