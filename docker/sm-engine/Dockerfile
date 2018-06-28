FROM jupyter/pyspark-notebook

USER root

RUN apt-get update && apt-get install -y git curl postgresql-client && apt-get clean

RUN mkdir -p /opt/sm-engine /opt/data ; chown $NB_UID:$NB_GID /opt /opt/*

USER $NB_UID

RUN conda update -n base conda

# Prefetch dependencies before getting the full source code so Docker's image cache
# reduces the amount that needs to be downloaded to rebuild an image after a code change
RUN curl https://raw.githubusercontent.com/METASPACE2020/sm-engine/master/environment.yml -o /opt/last-environment.yml
RUN conda env create -f /opt/last-environment.yml

WORKDIR /opt/sm-engine

ARG SM_ENGINE_REPO=https://github.com/METASPACE2020/sm-engine.git
ARG SM_ENGINE_BRANCH=master

RUN git clone --recurse-submodules --branch "$SM_ENGINE_BRANCH" "$SM_ENGINE_REPO" .

RUN conda env update

COPY *.sh /

ENTRYPOINT [ ]
CMD [ "/start-api.sh" ]
