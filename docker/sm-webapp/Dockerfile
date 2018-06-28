#sqlite3 isn't compatible with node 10 yet
FROM node:8

RUN apt-get update && apt-get install -y netcat && apt-get clean
RUN yarn global add nodemon

# Prefetch dependencies before getting the full source code so Docker's image cache
# reduces the amount that needs to be downloaded to rebuild an image after a code change
WORKDIR /opt/pkgcache
RUN curl https://raw.githubusercontent.com/metaspace2020/metaspace/master/metaspace/webapp/package.json -o package.json
RUN curl https://raw.githubusercontent.com/metaspace2020/metaspace/master/metaspace/webapp/yarn.lock -o yarn.lock
RUN yarn install

ARG METASPACE_REPO=https://github.com/metaspace2020/metaspace.git
ARG METASPACE_BRANCH=master
RUN git clone --branch "$METASPACE_BRANCH" "$METASPACE_REPO" /opt/metaspace

WORKDIR /opt/metaspace/metaspace/webapp

RUN mv /opt/pkgcache/node_modules .
RUN yarn install

COPY docker-entrypoint.sh /
COPY config/conf.js conf.js
COPY config/clientConfig.json src/clientConfig.json

RUN yarn run build


ENTRYPOINT [ ]
CMD [ "/docker-entrypoint.sh" ]
