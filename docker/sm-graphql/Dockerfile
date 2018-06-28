FROM node:8

RUN apt-get update && apt-get install -y netcat && apt-get clean
RUN yarn global add nodemon

# Prefetch dependencies before getting the full source code so Docker's image cache
# reduces the amount that needs to be downloaded to rebuild an image after a code change
WORKDIR /opt/pkgcache
RUN curl https://raw.githubusercontent.com/metaspace2020/metaspace/master/metaspace/graphql/package.json -o package.json
RUN curl https://raw.githubusercontent.com/metaspace2020/metaspace/master/metaspace/graphql/yarn.lock -o yarn.lock
RUN yarn install

ARG METASPACE_REPO=https://github.com/metaspace2020/metaspace.git
ARG METASPACE_BRANCH=master
RUN git clone --branch "$METASPACE_BRANCH" "$METASPACE_REPO" /opt/metaspace

WORKDIR /opt/metaspace/metaspace/graphql

RUN mv /opt/pkgcache/node_modules .
RUN yarn install

RUN node deref_schema.js > metadata_schema.json

COPY docker-entrypoint.sh /

ENTRYPOINT [ ]
CMD [ "/docker-entrypoint.sh" ]
