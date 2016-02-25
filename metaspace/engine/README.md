# Spatial Metabolomics Engine [![Build Status](https://travis-ci.org/SpatialMetabolomics/SM_distributed.svg?branch=master)](https://travis-ci.org/SpatialMetabolomics/SM_distributed) [![Documentation Status](https://readthedocs.org/projects/sm-distributed/badge/?version=latest)](http://sm-distributed.readthedocs.org/en/latest/?badge=latest)
High throughput molecules annotation for imaging mass spectrometry datasets.

## Main Features
- centroided imzML files as input dataset files
- Apache Spark based implementation for easy scaling from one machine to a cluster
- Can be run in both local and distributed modes
- Comes with unit, regression and scientific tests
- Web application for browsing the search results
- Fabric script for easy deploy and an AWS cluster start

## Installation Manual
### Spark Installation and Setup

Install Oracle Java 7

    sudo apt-add-repository ppa:webupd8team/java
	sudo apt-get update
	sudo apt-get install oracle-java7-installer
	java -version  # should work now

Add an env variable to .bashrc
    
    echo -e '\nexport JAVA_HOME=/usr/lib/jvm/java-7-oracle' >> ~/.bashrc

Download Spark 1.5 with pre-build for Hadoop 2.6 and higher (http://spark.apache.org/downloads.html)
Don't forget to replace **USER:GROUP** with your linux user and group 
    
    sudo mkdir /opt/dev
    id -un  # your user
    id -gn  # your group
	sudo chown USER:GROUP /opt/dev
	cd /opt/dev
	wget -O - http://apache.lauf-forum.at/spark/spark-1.5.2/spark-1.5.2-bin-hadoop2.6.tgz | tar xz -C /opt/dev

Install ssh daemon and create a public/private key pair

    sudo apt-get install ssh
    mkdir -p ~/.ssh  # create if not exists
    chmod 700 ~/.ssh  # set proper permissions
    cd ~/.ssh/
	ssh-keygen -t rsa
	cat id_rsa.pub >> authorized_keys
	ssh localhost  # should work now
	exit
    
### Postgres Installation and Setup
More details can be found here https://help.ubuntu.com/community/PostgreSQL

Server installation from a repository

    sudo apt-get install postgresql postgresql-contrib libpq-dev
	sudo service postgresql status  # if everything is fine should return 9.3/main (port 5432): online
	
Make local ipv4 connections password free. Put **trust** instead of **md5**
    
    sudo nano /etc/postgresql/9.3/main/pg_hba.conf
    ...
    # # IPv4 local connections:
    # host    all             all             127.0.0.1/32            md5

Don't forget to restart the database server

    sudo service postgresql restart
	
### SM Engine Installation and Setup

Install git and pip

	sudo apt-get install git python-pip
	
Download the latest "stable" release of **SM_distributed** repository into the home directory and rename it to **sm**
	
	wget -qO- https://github.com/SpatialMetabolomics/SM_distributed/archive/v0.2.0.tar.gz | tar xvz -C ~
	mv SM_distributed-0.2.0/ sm
	rm -R sm/pyMS sm/pyIMS
	
Download the latest versions of pyMS and pyIMS libraries
    
    wget -qO- https://github.com/alexandrovteam/pyMS/archive/v0.1.tar.gz | tar xvz -C ~/sm; mv ~/sm/pyMS-0.1 ~/sm/pyMS
    wget -qO- https://github.com/alexandrovteam/pyIMS/archive/v0.1.tar.gz | tar xvz -C ~/sm; mv ~/sm/pyIMS-0.1 ~/sm/pyIMS
	
Install numpy, scipy, matplotlib dependencies

	sudo apt-get install python-dev libfreetype6-dev
	sudo apt-get install libblas-dev liblapack-dev libatlas-base-dev gfortran	

Install SM engine python dependencies

	sudo pip install numpy==1.10.4
	sudo pip install scipy==0.16.0 Fabric==1.10.2 lxml==3.3.3 pypng==0.0.18 matplotlib==1.5.0 mock==1.3.0 psycopg2==2.6.1 py4j==0.9 pytest==2.8.2 tornado==4.2.1 tornpsql==1.1.0
	sudo pip install --no-deps pyimzML==1.0.1

Postgres server setup for local use only

	sudo -u postgres psql
	
	CREATE ROLE sm LOGIN CREATEDB NOSUPERUSER PASSWORD 'simple_pass';
	CREATE DATABASE sm WITH OWNER sm;
	\q  # exit
	
SM engine schema creation

	cd sm
	psql -h localhost -U sm sm < scripts/create_schema.sql

Create data directory for SM engine. Don't forget to replace **USER:GROUP** with your linux user and group (id -un and id -gn)

	sudo mkdir /opt/data && sudo chown USER:GROUP /opt/data

Create config files. For **conf/config.json** put values for needed parameters

	cd sm/conf
	cp sm_log.cfg.template sm_log.cfg
	cp config.json.template config.json
	nano config.json
	# replace **fs.data_dir** with path to the data directory (/opt/data)

Add environment variables to .bashrc

    echo -e '\nexport SPARK_HOME=/opt/dev/spark-1.5.2-bin-hadoop2.6' >> ~/.bashrc
    echo 'export PYTHONPATH=$HOME/sm:/opt/dev/spark-1.5.2-bin-hadoop2.6/python:/opt/dev/spark-1.5.2-bin-hadoop2.6/python/build:$PYTHONPATH' >> ~/.bashrc
    source ~/.bashrc
    
### Run Tests
Run the engine unit tests

	cd ~/sm
    ./test_runner.py --unit

Run the regression tests

    ./test_runner.py --regr

Download and import molecule database (HMDB) first

    wget https://s3-eu-west-1.amazonaws.com/sm-engine/hmdb.csv
    python scripts/import_molecule_formula.py HMDB hmdb.csv

Run the scientific test
    
    ./test_runner.py --sci
		
When run the first time it will work pretty long time as the engine will be generating and saving to the DB theoretical spectra
for all HMDB molecules. In the end it should print
**ALL TESTS FINISHED SUCCESSFULLY**
If not something went wrong.

## Run Molecule Annotation Job
Once you have successfully installed SM engine and its dependencies you can start a molecule annotation job with the command
    
    cd ~/sm
    python scripts/run_molecule_search.py dataset_name /path/to/dataset/folder

**/path/to/dataset/folder** should contain three files: **.imzML**, **.ibd**, **config.json**. Names for **.imzML** and **.ibd** files
should be identical. Where **config.json** is a file with parameters for the molecule annotation job of the form
 
    {
      "inputs": {
        "data_file": "12hour_5_210_centroid.imzML",
        "database": "HMDB"
      },
      "isotope_generation": {
        "adducts": ["+H","+Na","+K"],
        "charge": {
            "polarity": "+",
            "n_charges": 1
        },
        "isocalc_sigma": 0.01,
        "isocalc_pts_per_mz": 10000
      },
      "image_generation": {
        "ppm": 2.0,
        "nlevels": 30,
        "q": 99,
        "do_preprocessing": false
      },
      "molecules_num": null
    }

**database** is a specific name of a database that you would like to search through. Default one is HMDB.
If you want to add your own one please refer to the next section.

**isotope_generation** is a section specific for [pyMS](https://github.com/alexandrovteam/pyMS) library.

**image_generation** is a section specific for [pyIMS](https://github.com/alexandrovteam/pyIMS) library.

**molecules_num** is a maximum number of annotated molecules to store.

To explore the results of a job start the web application
 
    cd ~/sm
	python webapp/webserver.py --config conf/config.json --port 8090
	
Open [http://localhost:8090](http://localhost:8090) url address in a browser
