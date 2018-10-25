FROM jupyter/pyspark-notebook:137a295ff71b

USER root

RUN apt-get update && apt-get install -y git curl postgresql-client && apt-get clean

RUN mkdir -p /opt/metaspace /opt/data ; chown $NB_UID:$NB_GID /opt /opt/*

USER $NB_UID

RUN conda update -n base conda

# Prefetch dependencies before getting the full source code so Docker's image cache
# reduces the amount that needs to be downloaded to rebuild an image after a code change
RUN curl https://raw.githubusercontent.com/metaspace2020/metaspace/master/metaspace/engine/environment.yml -o /opt/last-environment.yml
RUN conda env create -f /opt/last-environment.yml

# The non-dev copy is not used anymore, so don't install it
# ARG METASPACE_REPO=https://github.com/metaspace2020/metaspace.git
# ARG METASPACE_BRANCH=master
# RUN git clone --branch "$METASPACE_BRANCH" "$METASPACE_REPO" /opt/metaspace

WORKDIR /opt/dev/metaspace/metaspace/engine

# RUN conda env update

COPY *.sh /

ENTRYPOINT [ ]
CMD [ "/start-api.sh" ]
