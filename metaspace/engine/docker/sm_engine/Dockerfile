FROM ubuntu:16.04

MAINTAINER Vitaly Kovalev <kovalev@embl.de>
WORKDIR /root

# use bash as default shell
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

# install Java, wget, and postgres client;
# also: bzip2 to unpack miniconda; git to run coveralls
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      openjdk-8-jre-headless \
      wget \
      bzip2 \
      git \
      postgresql-client \
      libglib2.0-0 \
    && apt-get clean
ENV JAVA_HOME /usr/lib/jvm/java-8-openjdk-amd64

# install Spark
ENV SPARK_DIR spark-2.3.0-bin-hadoop2.7
RUN wget -qO - http://s3-eu-west-1.amazonaws.com/sm-engine/dev/$SPARK_DIR.tar.gz | tar xz
ENV SPARK_HOME /root/$SPARK_DIR

# install Conda (sci-oriented package manager for Python)
RUN wget -q http://repo.continuum.io/miniconda/Miniconda3-latest-Linux-x86_64.sh &&\
    bash Miniconda3-latest-Linux-x86_64.sh -b -p /miniconda &&\
    rm Miniconda3-latest-Linux-x86_64.sh
ENV PATH /miniconda/bin:$PATH

# install necessary Python packages
COPY environment.yml /root/environment.yml
RUN conda update -n base conda &&\
    conda install -y nomkl pip &&\
    conda env create &&\
    conda clean -y --all

# install environment for MolecularDB
RUN cd /tmp &&\
    wget -q https://raw.githubusercontent.com/metaspace2020/metaspace/master/metaspace/mol-db/environment.yml &&\
    conda env create &&\
    conda clean -y --all &&\
    rm environment.yml