# METASPACE

[![Build Status](https://circleci.com/gh/metaspace2020/metaspace.svg?style=svg)](https://circleci.com/gh/metaspace2020/metaspace) [![Documentation Status](https://readthedocs.org/projects/sm-distributed/badge/?version=latest)](http://sm-distributed.readthedocs.org/en/latest/?badge=latest) [![codecov](https://codecov.io/gh/metaspace2020/metaspace/branch/master/graph/badge.svg)](https://codecov.io/gh/metaspace2020/metaspace)

[The METASPACE platform](http://metaspace2020.eu/) hosts an engine for
 metabolite annotation of imaging mass spectrometry data as well as a
 spatial metabolite knowledgebase of the metabolites from thousands of
 public datasets provided by the community.

The METASPACE platform is developed by software engineers, data scientists and
 mass spectrometrists from the [Alexandrov team at EMBL](http://www.embl.de/research/units/scb/alexandrov/).
 This work is a part of the [European project METASPACE](http://project.metaspace2020.eu/).

## Projects

| Project | Description |
| --- | :--- |
| [engine](metaspace/engine) | Contains a daemon that runs the metabolite annotation engine, and a REST API for sending jobs to the daemon |
| [graphql](metaspace/graphql) | A GraphQL API for accessing the annotations database and metabolite annotation engine |
| [webapp](metaspace/webapp) | A web application for submitting datasets and browsing results |
| [mol-db](metaspace/mol-db) | A service for importing and serving molecular databases |
| [python-client](metaspace/python-client) | A Python library and set of example Jupyter notebooks for performing data analysis on the annotations database |
| [ansible](ansible) | Ansible playbooks for deploying to AWS and Vagrant |
| [docker](docker) | Docker Compose configuration for making development and testing environments |

## Installation
Please check the [ansible](ansible) project for production installations on AWS,
 and the [docker](docker) project for development installations with Docker.

## Uploading Dataset and Browsing Results
Please visit the help page of our web application running on AWS:

[http://metasp.eu/#/help](http://metasp.eu/#/help)

## Funding

This project is funded from the [European Horizon2020](https://ec.europa.eu/programmes/horizon2020/)
project [METASPACE](http://project.metaspace2020.eu/) (no. 634402),
[NIH NIDDK project KPMP](http://kpmp.org/)
and internal funds of the [European Molecular Biology Laboratory](https://www.embl.org/).

## License

This project is licensed under the [Apache 2.0 license](LICENSE).
