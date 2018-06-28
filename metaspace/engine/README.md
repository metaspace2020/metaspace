# Spatial Metabolomics Engine
High throughput molecular annotation for imaging mass spectrometry datasets

## Main Features
- Centroided imzML files as input dataset files
- Apache Spark based implementation for easy scaling from one machine to a cluster
- Can be run in both local and distributed modes
- Comes with unit, regression and scientific tests
- [Web application](../webapp) for upload and browsing search results
- [Ansible project](../../ansible) for easy deployment to AWS

## Installation
Please check the [sm-engine-ansible](https://github.com/metaspace2020/sm-engine-ansible) project

## Uploading Dataset and Browsing Results
Please visit the help page of our web application running on AWS:

[http://metaspace2020.eu/#/help](http://metaspace2020.eu/#/help)

## Running sm-engine tests

Install [CircleCI CLI tool](https://circleci.com/docs/2.0/local-jobs/) and run `circleci build` from the project root.

## Funding

This project is funded from the [European Horizon2020](https://ec.europa.eu/programmes/horizon2020/)
project [METASPACE](http://project.metaspace2020.eu/) (no. 634402),
[NIH NIDDK project KPMP](http://kpmp.org/)
and internal funds of the [European Molecular Biology Laboratory](https://www.embl.org/).

## License

This project is licensed under the [Apache 2.0 license](LICENSE).
