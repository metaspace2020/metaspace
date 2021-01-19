FROM ubuntu:18.04

MAINTAINER Vitaly Kovalev <kovalev@embl.de>
WORKDIR /

ENV SPARK_VER 3.0.1
ENV SPARK_DIR spark-$SPARK_VER-bin-hadoop2.7
ENV SPARK_HOME /$SPARK_DIR
ENV JAVA_HOME /usr/lib/jvm/java-8-openjdk-amd64/

# Use the fastest apt mirror
RUN sed -i -e 's|http://.*archive.ubuntu.com/ubuntu/|mirror://mirrors.ubuntu.com/mirrors.txt|' /etc/apt/sources.list

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
        sudo \
        && \
# ----- Spark -----
    DEBIAN_FRONTEND=noninteractive $APT_INSTALL \
        openjdk-8-jre-headless ca-certificates-java wget && \
    wget -qO - https://archive.apache.org/dist/spark/spark-$SPARK_VER/$SPARK_DIR.tgz | tar xz && \
# ----- Python and Pip -----
    DEBIAN_FRONTEND=noninteractive $APT_INSTALL \
        software-properties-common && \
    add-apt-repository ppa:deadsnakes/ppa && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive $APT_INSTALL \
        python3.8 \
        python3.8-dev \
        python3-distutils \
        libsm6 libxrender1 libxext6 \
        && \
    wget -O /tmp/get-pip.py https://bootstrap.pypa.io/get-pip.py && \
    python3.8 /tmp/get-pip.py && \
    ln -s /usr/bin/python3.8 /usr/local/bin/python3 && \
    ln -s /usr/bin/python3.8 /usr/local/bin/python && \
    $PIP_INSTALL \
        setuptools && \
    apt-get clean -y && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/* /tmp/* ~/.cache/*

# --- Engine dependencies ---
COPY metaspace/engine/requirements.txt /requirements.txt
COPY metaspace/engine/requirements-dev.txt /requirements-dev.txt
RUN APT_INSTALL="apt-get install -y --no-install-recommends" && \
    PIP_INSTALL="python -m pip install --upgrade" && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive $APT_INSTALL \
        git curl postgresql-client libpq-dev && \
    $PIP_INSTALL pip && \
    $PIP_INSTALL -r requirements.txt && \
    $PIP_INSTALL -r requirements-dev.txt && \
    apt-get clean -y && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/* /tmp/* ~/.cache/*

# Create a user (this may need to be fixed if someone has a non-1000 UID)
RUN adduser --disabled-password --uid 1000 --gecos "" sm-engine \
    && echo "sm-engine ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/sm-engine \
    && chmod 0440 /etc/sudoers.d/sm-engine

# # Silence MPL warnings about home directory not being writable
# ENV MPLCONFIGDIR=/tmp/matplotlib

ENTRYPOINT [ ]
CMD [ "/sm-engine/start-api.sh" ]
