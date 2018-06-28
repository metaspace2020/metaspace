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

`pip install git+https://github.com/metaspace2020/metaspace@rel-v0.10#subdirectory=metaspace/python-client`

The list of branches can be found [here](https://github.com/metaspace2020/metaspace/branches/all?&query=rel-v).

## Funding

This project is funded from the [European Horizon2020](https://ec.europa.eu/programmes/horizon2020/)
project [METASPACE](http://project.metaspace2020.eu/) (no. 634402),
[NIH NIDDK project KPMP](https://www.niddk.nih.gov/research-funding/research-programs/kidney-precision-medicine-project-kpmp)
and internal funds of the [European Molecular Biology Laboratory](https://www.embl.org/).

## License

Unless specified otherwise in file headers, all files are licensed under the [Apache 2.0 license](LICENSE).
