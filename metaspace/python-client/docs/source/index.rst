.. metaspace2020 documentation master file, created by
   sphinx-quickstart on Wed Nov 18 21:52:06 2020.
   You can adapt this file completely to your liking, but it should at least
   contain the root `toctree` directive.

metaspace2020: Python client for connecting to METASPACE
========================================================

Welcome to the metaspace2020 documentation!

This Python package provides programmatic access to the `METASPACE <https://metaspace2020.eu>`_ platform.

Applications:
    * Running batch jobs
    * Exploratory analysis of submitted data
    * Quick access to things hidden from web interface (such as location of files on S3 and other metadata)

.. toctree::
   :maxdepth: 1
   :caption: Examples

   content/examples/fetch-dataset-annotations
   content/examples/fetch-isotopic-images
   content/examples/colocalized-annotations
   content/examples/explore-off-sample-results
   content/examples/manage-custom-molecular-databases
   content/examples/update-dataset-databases
   content/examples/fetch-dataset-metadata
   content/examples/submit-dataset

.. toctree::
   :maxdepth: 1
   :caption: API reference:

   content/apireference/sm_annotation_utils
   content/apireference/image_processing
   content/apireference/projects_client
   content/apireference/types

Indices and tables
------------------

* :ref:`genindex`
* :ref:`modindex`
* :ref:`search`
