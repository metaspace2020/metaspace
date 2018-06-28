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
| :--- | :--- |
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

[http://metaspace2020.eu/#/help](http://metaspace2020.eu/#/help)

## Acknowledgements

<img src="https://user-images.githubusercontent.com/26366936/42041116-818a0048-7af1-11e8-82d7-15c9d7ab0441.png" width="98" height="65"><img src="https://user-images.githubusercontent.com/26366936/42041125-845b691a-7af1-11e8-9c43-bfbf2152d6e4.png" width="102" height="65">

This project is funded from the [European Horizon2020](https://ec.europa.eu/programmes/horizon2020/)
project [METASPACE](http://project.metaspace2020.eu/) (no. 634402),
[NIH NIDDK project KPMP](http://kpmp.org/)
and internal funds of the [European Molecular Biology Laboratory](https://www.embl.org/).

[<img src="https://user-images.githubusercontent.com/26366936/42039120-f008e4c6-7aec-11e8-97ea-87e48bf7bc1c.png" alt="BrowserStack" width="200">](https://www.browserstack.com)

METASPACE is tested with [BrowserStack](https://www.browserstack.com) to ensure cross-browser compatibility.
This service is provided for free under [BrowserStack's Open Source plan](https://www.browserstack.com/open-source).

[![Amazon Web Services and the “Powered by AWS” logo are trademarks of Amazon.com, Inc. or its affiliates in the United States and/or other countries.](https://d0.awsstatic.com/logos/powered-by-aws.png)](https://aws.amazon.com)

METASPACE is hosted on [Amazon Web Services](https://aws.amazon.com) with the support of [AWS Cloud Credits for Research](https://aws.amazon.com/research-credits/).

## License

Unless specified otherwise in file headers or LICENSE files present in subdirectories,
all files are licensed under the [Apache 2.0 license](LICENSE).
