# METASPACE

[![Build Status](https://circleci.com/gh/metaspace2020/metaspace.svg?style=svg)](https://circleci.com/gh/metaspace2020/metaspace) [![Documentation Status](https://readthedocs.org/projects/sm-distributed/badge/?version=latest)](http://sm-distributed.readthedocs.org/en/latest/?badge=latest) [![codecov](https://codecov.io/gh/metaspace2020/metaspace/branch/master/graph/badge.svg)](https://codecov.io/gh/metaspace2020/metaspace)

[The METASPACE platform](http://metaspace2020.eu/) hosts an engine for
 metabolite annotation of imaging mass spectrometry data as well as a
 spatial metabolite knowledgebase of the metabolites from thousands of
 public datasets provided by the community.

The METASPACE platform is developed by software engineers, data scientists and
 mass spectrometrists from the [Alexandrov team at EMBL](http://www.embl.de/research/units/scb/alexandrov/).
 This work is a part of the [European project METASPACE](https://cordis.europa.eu/project/id/634402).

## Projects

| Project | Description |
| :--- | :--- |
| [engine](metaspace/engine) | Contains a daemon that runs the metabolite annotation engine, and a REST API for sending jobs to the daemon |
| [graphql](metaspace/graphql) | A GraphQL API for accessing the annotations database and metabolite annotation engine |
| [webapp](metaspace/webapp) | A web application for submitting datasets and browsing results |
| [python-client](metaspace/python-client) | A Python library and set of example Jupyter notebooks for performing data analysis on the annotations database |
| [ansible](ansible) | Ansible playbooks for deploying to AWS |
| [docker](docker) | Docker Compose configuration for making development and testing environments |

Development documentation for each of these projects is available in the [wiki](https://github.com/metaspace2020/metaspace/wiki)

## Installation
Please check the [ansible](https://github.com/metaspace2020/metaspace/wiki/Ansible-server-provisioning-and-deployment)
documentation for production installations on AWS,
and the [docker](https://github.com/metaspace2020/metaspace/wiki/Docker-dev-environments)
documentation for development installations with Docker.

## Uploading Dataset and Browsing Results
Please visit the help page of our web application running on AWS:

[https://metaspace2020.eu/help](https://metaspace2020.eu/help)

## Acknowledgements
[<img src="https://user-images.githubusercontent.com/26366936/42039120-f008e4c6-7aec-11e8-97ea-87e48bf7bc1c.png" alt="BrowserStack" width="200">](https://www.browserstack.com)

METASPACE is tested with [BrowserStack](https://www.browserstack.com) to ensure cross-browser compatibility.
This service is provided for free under [BrowserStack's Open Source plan](https://www.browserstack.com/open-source).

[![Amazon Web Services and the “Powered by AWS” logo are trademarks of Amazon.com, Inc. or its affiliates in the United States and/or other countries.](https://d0.awsstatic.com/logos/powered-by-aws.png)](https://aws.amazon.com)

METASPACE is hosted on [Amazon Web Services](https://aws.amazon.com) with the support of [AWS Cloud Credits for Research](https://aws.amazon.com/research-credits/).

## Funding
We acknowledge funding from the following sources:

| | Funder / project(s) |
| :--- | :--- |
| <img src="https://metaspace2020.eu/img/Flag_of_Europe.80a3ee9f.svg" alt="EU" height="48" width="72"> | **European Union Horizon 2020 Programme** <br/> under grant agreements [634402](https://cordis.europa.eu/project/id/634402) / [773089](https://cordis.europa.eu/project/id/773089) / [825184](https://cordis.europa.eu/project/id/825184) |
| <img src="https://metaspace2020.eu/img/NIDDK.581b923e.svg" alt="EU" height="48" width="72"> | **National Institutes of Health NIDDK** <br/> Kidney Precision Medicine Project ([kpmp.org](https://kpmp.org/)) |
| <img src="https://metaspace2020.eu/img/NHLBI.6dbcd9a0.svg" alt="EU" height="48" width="72"> | **National Institutes of Health NHLBI** <br/> LungMAP Phase 2 ([lungmap.net](https://www.lungmap.net/)) |

and internal funds from the [European Molecular Biology Laboratory](https://www.embl.org/).

## License

Unless specified otherwise in file headers or LICENSE files present in subdirectories,
all files are licensed under the [Apache 2.0 license](LICENSE).
