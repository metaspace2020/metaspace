FROM node:14.5.0-alpine3.12

RUN apk add --no-cache git netcat-openbsd
RUN yarn global add nodemon

# Prefetch dependencies before getting the full source code so Docker's image cache
# reduces the amount that needs to be downloaded to rebuild an image after a code change
# Disabled because it's only useful for self-contained docker containers, which are no longer supported
# WORKDIR /opt/pkgcache
# RUN curl https://raw.githubusercontent.com/metaspace2020/metaspace/master/metaspace/graphql/package.json -o package.json
# RUN curl https://raw.githubusercontent.com/metaspace2020/metaspace/master/metaspace/graphql/yarn.lock -o yarn.lock
# RUN yarn install

# The non-dev copy is not used anymore, so don't install it
# ARG METASPACE_REPO=https://github.com/metaspace2020/metaspace.git
# ARG METASPACE_BRANCH=master
# RUN git clone --branch "$METASPACE_BRANCH" "$METASPACE_REPO" /opt/metaspace

WORKDIR /opt/dev/metaspace/metaspace/graphql

# RUN mv /opt/pkgcache/node_modules .
# RUN yarn install

# RUN node deref_schema.js ./metadataSchemas/

COPY docker-entrypoint.sh /

ENTRYPOINT [ ]
CMD [ "/docker-entrypoint.sh" ]
