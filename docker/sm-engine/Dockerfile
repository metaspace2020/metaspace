FROM ubuntu:16.04

MAINTAINER Vitaly Kovalev <kovalev@embl.de>
WORKDIR /

ENV SPARK_DIR spark-2.3.3-bin-hadoop2.7
ENV SPARK_HOME /$SPARK_DIR
ENV JAVA_HOME /usr/lib/jvm/java-8-openjdk-amd64/
#ENV PY4J_ARCH py4j-0.10.7-src.zip
#ENV PYTHONPATH=.:$SPARK_HOME/python:$SPARK_HOME/python/lib/$PY4J_ARCH:$PYTHONPATH

COPY requirements.txt /requirements.txt

RUN APT_INSTALL="apt-get install -y --no-install-recommends" && \
    PIP_INSTALL="python -m pip install --upgrade" && \
    apt-get update && \
# ----- Tools -----
    DEBIAN_FRONTEND=noninteractive $APT_INSTALL \
        build-essential \
        ca-certificates \
        cmake \
        wget \
        git \
        nano \
        netcat \
        && \
# ----- Spark -----
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive $APT_INSTALL \
        openjdk-8-jre-headless ca-certificates-java wget && \
    wget -qO - http://s3-eu-west-1.amazonaws.com/sm-engine/dev/$SPARK_DIR.tar.gz | tar xz && \
# ----- Python and Pip -----
    DEBIAN_FRONTEND=noninteractive $APT_INSTALL \
        software-properties-common && \
    add-apt-repository ppa:deadsnakes/ppa && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive $APT_INSTALL \
        python3.6 \
        python3.6-dev \
        libsm6 libxrender1 libxext6 \
        && \
    wget -O ~/get-pip.py https://bootstrap.pypa.io/get-pip.py && \
    python3.6 ~/get-pip.py && \
    ln -s /usr/bin/python3.6 /usr/local/bin/python3 && \
    ln -s /usr/bin/python3.6 /usr/local/bin/python && \
    $PIP_INSTALL \
        setuptools \
        coverage \
        codecov \
        pysparkling \
        && \
# --- Engine dependencies ---
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive $APT_INSTALL \
        git curl postgresql-client libpq-dev python3-dev&& \
    apt-get clean -y && \
    apt-get autoremove -y && \
    $PIP_INSTALL \
        -r requirements.txt \
        && \
    rm -rf /var/lib/apt/lists/* /tmp/* ~/* ~/.cache/* && \
# --- MolDB dependencies ---
    wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh && \
    chmod +x Miniconda3-latest-Linux-x86_64.sh && \
    ./Miniconda3-latest-Linux-x86_64.sh -b && \
    ln -S -T /root/miniconda3/bin/conda /usr/local/bin/conda && \
    ln -S -T /root/miniconda3/bin/activate /usr/local/bin/activate

RUN mkdir -p /opt/data /root/metaspace
#WORKDIR /root/metaspace/metaspace/engine
COPY *.sh /

ENTRYPOINT [ ]
CMD [ "/start-api.sh" ]
