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

## Lithops setup

The main implementation of the METASPACE engine uses Lithops to run code in Serverless Cloud Functions. 
See [Lithops.md](./docs/Lithops.md) for setup instructions.

## Uploading Dataset and Browsing Results
Please visit the help page of our web application running on AWS:

[https://metaspace2020.eu/help](https://metaspace2020.eu/help)

## Running sm-engine tests

There are two modules of pytest tests:
* `sm.engine.tests` - unit tests that don't involve the DB, etc.
* `tests` - integration tests

It's recommended to use the `-vv -n auto` command line options when calling pytest to get sufficient debug information
and utilize all available CPU cores.

## Troubleshooting/testing sm-engine CI

Install [CircleCI CLI tool](https://circleci.com/docs/2.0/local-jobs/) and run `circleci build` from the project root.

## Acknowledgements and license

[See the top-level README](../../README.md#acknowledgements)

