FROM python:3.6.9

RUN apt-get update && apt-get install -y git curl postgresql-client netcat && apt-get clean

ARG METASPACE_REPO=https://github.com/metaspace2020/metaspace.git
ARG METASPACE_BRANCH=master
RUN git clone --branch "$METASPACE_BRANCH" "$METASPACE_REPO" /opt/metaspace

WORKDIR /opt/metaspace/metaspace/mol-db

RUN pip install .

COPY *.sh /

ENTRYPOINT [ ]
CMD [ "/docker-entrypoint.sh" ]
