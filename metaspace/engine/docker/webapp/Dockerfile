FROM ubuntu:14.04

MAINTAINER Artem Tarasov <artem.tarasov@embl.de>
WORKDIR /root

# use bash as default shell
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

# install Java and wget
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-7-jre-headless wget && apt-get clean
ENV JAVA_HOME /usr/lib/jvm/java-7-openjdk-amd64

# install Spark
ENV SPARK_DIR spark-1.6.0-bin-hadoop2.6
RUN wget -qO - http://apache.lauf-forum.at/spark/spark-1.6.0/$SPARK_DIR.tgz | tar xz
ENV SPARK_HOME /root/$SPARK_DIR

# install Conda (sci-oriented package manager for Python)
RUN wget -q http://repo.continuum.io/miniconda/Miniconda-latest-Linux-x86_64.sh &&\
    bash Miniconda-latest-Linux-x86_64.sh -b -p /miniconda &&\
    rm Miniconda-latest-Linux-x86_64.sh
ENV PATH /miniconda/bin:$PATH

# install necessary Python packages
RUN conda create -y -n sm_distributed -c https://conda.binstar.org/menpo -c salford_systems nomkl matplotlib-nogui scipy numba==0.22.1 pytest mock Fabric lxml psycopg2 opencv3 pandas cffi
ENV CONDA_ACTIVATE "source /miniconda/bin/activate sm_distributed"
RUN $CONDA_ACTIVATE && pip install py4j==0.9 tornado==4.2.1 pypng && pip install --no-deps pyimzML==1.0.1 tornpsql==1.1.0 requests && easy_install cpyMSpec==0.0.8
