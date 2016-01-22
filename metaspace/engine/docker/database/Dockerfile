FROM postgres:latest

MAINTAINER Artem Tarasov <artem.tarasov@embl.de>

# config file 'db' section
ENV POSTGRES_DB sm
ENV POSTGRES_USER sm
ENV POSTGRES_PASSWORD securepassword

ADD create_schema.sql /docker-entrypoint-initdb.d/01-create_schema.sql
ADD https://s3-eu-west-1.amazonaws.com/sm-engine/hmdb_agg_formula.sql /docker-entrypoint-initdb.d/02-hmdb.sql
RUN chmod 664 /docker-entrypoint-initdb.d/*.sql
