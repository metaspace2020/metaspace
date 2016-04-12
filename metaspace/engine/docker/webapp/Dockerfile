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
COPY environment.yml /root/environment.yml
RUN conda env create