FROM jupyter/pyspark-notebook

USER root

RUN apt-get update && apt-get install -y git curl postgresql-client

RUN mkdir -p /opt/sm-engine /opt/data ; chown $NB_UID:$NB_GID /opt/sm-engine /opt/data

USER $NB_UID

WORKDIR /opt/sm-engine

ARG sm_branch=master

RUN git clone --recurse-submodules --branch "$sm_branch" https://github.com/METASPACE2020/sm-engine.git .

RUN conda env create

COPY *.sh /

ENTRYPOINT [ ]
CMD [ "/start-api.sh" ]
