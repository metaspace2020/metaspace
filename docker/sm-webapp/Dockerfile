#sqlite3 isn't compatible with node 10 yet
FROM node:8

RUN yarn global add nodemon

# Prefetch dependencies before getting the full source code so Docker's image cache
# reduces the amount that needs to be downloaded to rebuild an image after a code change
WORKDIR /opt/pkgcache
RUN curl https://raw.githubusercontent.com/METASPACE2020/sm-graphql/master/package.json -o package.json
RUN curl https://raw.githubusercontent.com/METASPACE2020/sm-graphql/master/yarn.lock -o yarn.lock
RUN yarn install

WORKDIR /opt/sm-webapp

ARG SM_WEBAPP_REPO=https://github.com/METASPACE2020/sm-webapp.git
ARG SM_WEBAPP_BRANCH=master
RUN git clone --recurse-submodules --branch "$SM_WEBAPP_BRANCH" "$SM_WEBAPP_REPO" .

RUN mv /opt/pkgcache/node_modules .
RUN yarn install

COPY docker-entrypoint.sh /
COPY config/conf.js conf.js
COPY config/clientConfig.json src/clientConfig.json

RUN yarn run build


ENTRYPOINT [ ]
CMD [ "/docker-entrypoint.sh" ]
