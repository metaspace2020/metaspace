FROM continuumio/miniconda

RUN apt-get update && apt-get install -y git curl postgresql-client openbabel netcat && apt-get clean

RUN conda update -n base conda

# Prefetch dependencies before getting the full source code so Docker's image cache
# reduces the amount that needs to be downloaded to rebuild an image after a code change
RUN curl https://raw.githubusercontent.com/METASPACE2020/sm-molecular-db/master/environment.yml -o /opt/last-environment.yml
RUN conda env create -f /opt/last-environment.yml

WORKDIR /opt/mol-db

ARG MOL_DB_REPO=https://github.com/METASPACE2020/sm-molecular-db.git
ARG MOL_DB_BRANCH=master

RUN git clone --recurse-submodules --branch "$MOL_DB_BRANCH" "$MOL_DB_REPO" .

RUN conda env update

COPY *.sh /

ENTRYPOINT [ ]
CMD [ "/docker-entrypoint.sh" ]
