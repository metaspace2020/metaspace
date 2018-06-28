FROM continuumio/miniconda

RUN apt-get update && apt-get install -y git curl postgresql-client openbabel netcat && apt-get clean

RUN conda update -n base conda

# Prefetch dependencies before getting the full source code so Docker's image cache
# reduces the amount that needs to be downloaded to rebuild an image after a code change
RUN curl https://raw.githubusercontent.com/metaspace2020/metaspace/master/metaspace/mol-db/environment.yml -o /opt/last-environment.yml
RUN conda env create -f /opt/last-environment.yml

ARG METASPACE_REPO=https://github.com/metaspace2020/metaspace.git
ARG METASPACE_BRANCH=master
RUN git clone --branch "$METASPACE_BRANCH" "$METASPACE_REPO" /opt/metaspace

WORKDIR /opt/metaspace/metaspace/mol-db

RUN conda env update

COPY *.sh /

ENTRYPOINT [ ]
CMD [ "/docker-entrypoint.sh" ]
