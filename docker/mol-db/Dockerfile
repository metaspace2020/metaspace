FROM continuumio/miniconda

RUN apt-get update && apt-get install -y git curl postgresql-client openbabel netcat && apt-get clean

RUN conda update -n base conda

WORKDIR /opt/mol-db

ARG sm_branch=master

RUN git clone --recurse-submodules --branch "$sm_branch" https://github.com/METASPACE2020/sm-molecular-db.git .

RUN conda env create

COPY *.sh /

ENTRYPOINT [ ]
CMD [ "/docker-entrypoint.sh" ]
