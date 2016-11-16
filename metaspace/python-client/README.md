# sm-analytics-python

Python module that provides high-level interface to [`sm-engine`](https://github.com/SpatialMetabolomics/sm-engine) installation

## Objectives

`sm-engine` has grown into a considerable set of services, which are at the moment:
* PostgreSQL database
* Elasticsearch server
* RabbitMQ for task queueing
* ...

This package attempts to:
* provide a layer of abstraction on top of these;
* make this layer convenient enough to be used interactively in Jupyter notebooks

It's recommended to use it in the same network where the database and ES are located, as the package is not optimized for high latency.

## Applications

* Running batch jobs
* Exploratory analysis of submitted data
* Quick access to things hidden from web interface (such as location of files on S3 and other metadata)
