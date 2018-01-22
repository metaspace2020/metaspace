# Spatial Metabolomics Engine [![Build Status](https://circleci.com/gh/METASPACE2020/sm-engine.svg?style=svg)](https://circleci.com/gh/METASPACE2020/sm-engine) [![Documentation Status](https://readthedocs.org/projects/sm-distributed/badge/?version=latest)](http://sm-distributed.readthedocs.org/en/latest/?badge=latest) [![Coverage Status](https://img.shields.io/coveralls/METASPACE2020/sm-engine.svg)](https://coveralls.io/github/METASPACE2020/sm-engine?branch=master)
High throughput molecular annotation for imaging mass spectrometry datasets

## Main Features
- Centroided imzML files as input dataset files
- Apache Spark based implementation for easy scaling from one machine to a cluster
- Can be run in both local and distributed modes
- Comes with unit, regression and scientific tests
- [Web application](https://github.com/METASPACE2020/sm-webapp) for upload and browsing search results
- [Ansible project](https://github.com/METASPACE2020/sm-engine-ansible) for easy deployment to AWS

## Installation
Please check the [sm-engine-ansible](https://github.com/METASPACE2020/sm-engine-ansible) project

## Uploading Dataset and Browsing Results
Please visit the help page of our web application running on AWS:

[http://metasp.eu/#/help](http://metasp.eu/#/help) 

## Running sm-engine tests

Install [CircleCI CLI tool](https://circleci.com/docs/2.0/local-jobs/) and run `circleci build` from the project root.

## License

This project is licensed under the Apache 2.0 license.
