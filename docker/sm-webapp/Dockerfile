#sqlite3 isn't compatible with node 10 yet
FROM node:8

ARG sm_branch=master

WORKDIR /opt/sm-webapp

RUN git clone --recurse-submodules --branch "$sm_branch" https://github.com/METASPACE2020/sm-webapp.git .

RUN yarn install

RUN yarn global add nodemon

COPY docker-entrypoint.sh /
COPY config/conf.js conf.js
COPY config/clientConfig.json src/clientConfig.json

RUN yarn run build


ENTRYPOINT [ "/docker-entrypoint.sh" ]