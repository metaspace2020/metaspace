FROM ubuntu:16.04

MAINTAINER Artem Tarasov <artem.tarasov@embl.de>
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
    && apt-get clean
ENV JAVA_HOME /usr/lib/jvm/java-8-openjdk-amd64

# install Spark
ENV SPARK_DIR spark-2.1.1-bin-hadoop2.7
RUN wget -qO - http://s3-eu-west-1.amazonaws.com/sm-engine/dev/$SPARK_DIR.tar.gz | tar xz
ENV SPARK_HOME /root/$SPARK_DIR

# install Conda (sci-oriented package manager for Python)
RUN wget -q http://repo.continuum.io/miniconda/Miniconda3-latest-Linux-x86_64.sh &&\
    bash Miniconda3-latest-Linux-x86_64.sh -b -p /miniconda &&\
    rm Miniconda3-latest-Linux-x86_64.sh
ENV PATH /miniconda/bin:$PATH

# install necessary Python packages
COPY environment.yml /root/environment.yml
RUN conda install -y nomkl && conda env create && conda clean -y --all

# install environment for MolecularDB
RUN git clone https://github.com/metaspace2020/sm-molecular-db -b rel-v0.7 && \
    cd sm-molecular-db && conda env create && conda clean -y --all
