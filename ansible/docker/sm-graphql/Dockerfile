FROM node

RUN apt-get update && apt-get install -y netcat && apt-get clean
RUN yarn global add nodemon

# Prefetch dependencies before getting the full source code so Docker's image cache
# reduces the amount that needs to be downloaded to rebuild an image after a code change
WORKDIR /opt/pkgcache
RUN curl https://raw.githubusercontent.com/METASPACE2020/sm-graphql/master/package.json -o package.json
RUN curl https://raw.githubusercontent.com/METASPACE2020/sm-graphql/master/yarn.lock -o yarn.lock
RUN yarn install

WORKDIR /opt/sm-graphql

ARG SM_GRAPHQL_REPO=https://github.com/METASPACE2020/sm-graphql.git
ARG SM_GRAPHQL_BRANCH=master
RUN git clone --recurse-submodules --branch "$SM_GRAPHQL_BRANCH" "$SM_GRAPHQL_REPO" .

RUN mv /opt/pkgcache/node_modules .
RUN yarn install

RUN node deref_schema.js > metadata_schema.json

COPY docker-entrypoint.sh /

ENTRYPOINT [ ]
CMD [ "/docker-entrypoint.sh" ]
